import { resolveWikiCompileBudget } from "@/src/engine/wiki-compile-plan";
import type {
  CreateWikiCompileRunPayload,
  EngineRequest,
  WikiCompileMapInput,
  WikiCompileReduceInput,
  WikiCompileRunSummary,
  WikiCompileStepRecord,
} from "@/src/shared/rpc";
import type {
  WikiCompileClaimReduceResult,
  WikiCompileClaimStepResult,
  WikiCompileCreateResult,
} from "@/src/shared/wiki-compile";
import type { KnowledgeBaseAiSettings } from "./knowledge-base-ai-settings";
import type { StoredProviderConfig } from "./provider-settings";
import { ProviderBackedWikiCompiler, WikiCompilerError } from "./wiki-compiler";

export interface WikiCompileRunnerOptions {
  requestEngine: (request: EngineRequest) => Promise<unknown>;
  loadSettings: () => Promise<KnowledgeBaseAiSettings>;
  loadProviderConfig: () => Promise<StoredProviderConfig | undefined>;
  ensureProviderPermission: WikiCompileCompilerOptions["ensureProviderPermission"];
  compiler?: WikiCompileCompiler;
  runnerId?: string;
}

export type WikiCompileCompiler = Pick<ProviderBackedWikiCompiler, "analyzeStep" | "reduce">;
type WikiCompileCompilerOptions = ConstructorParameters<typeof ProviderBackedWikiCompiler>[0];

export class WikiCompileRunner {
  private readonly requestEngine: WikiCompileRunnerOptions["requestEngine"];
  private readonly loadSettings: WikiCompileRunnerOptions["loadSettings"];
  private readonly loadProviderConfig: WikiCompileRunnerOptions["loadProviderConfig"];
  private readonly runnerId: string;
  private readonly compiler: WikiCompileCompiler;
  private draining = false;
  private wakeQueued = false;

  constructor(options: WikiCompileRunnerOptions) {
    this.requestEngine = options.requestEngine;
    this.loadSettings = options.loadSettings;
    this.loadProviderConfig = options.loadProviderConfig;
    this.runnerId = options.runnerId ?? `offscreen-wiki-${crypto.randomUUID()}`;
    this.compiler =
      options.compiler ??
      new ProviderBackedWikiCompiler({
        loadConfig: this.loadProviderConfig,
        ensureProviderPermission: options.ensureProviderPermission,
      });
  }

  async enqueue(sourceId: string): Promise<WikiCompileCreateResult> {
    const enabled = await this.isEnabled();
    if (!enabled) throw new Error("WIKI_DISABLED: Enable Wiki compilation before enqueueing.");
    const config = await this.requireProviderConfig();
    const payload: CreateWikiCompileRunPayload = {
      sourceId,
      provider: config.provider,
      modelId: config.model,
      budget: resolveWikiCompileBudget(config.model),
    };
    const result = await this.request<"createWikiCompileRun", WikiCompileCreateResult>({
      kind: "createWikiCompileRun",
      payload,
    });
    void this.wake().catch(() => undefined);
    return result;
  }

  async retry(id: string): Promise<WikiCompileRunSummary> {
    await this.requireEnabled();
    const result = await this.request<"retryWikiCompileRun", WikiCompileRunSummary>({
      kind: "retryWikiCompileRun",
      id,
    });
    void this.wake().catch(() => undefined);
    return result;
  }

  async resume(id: string): Promise<WikiCompileRunSummary> {
    await this.requireEnabled();
    const result = await this.request<"resumeWikiCompileRun", WikiCompileRunSummary>({
      kind: "resumeWikiCompileRun",
      id,
    });
    void this.wake().catch(() => undefined);
    return result;
  }

  async wake(): Promise<void> {
    if (this.draining) {
      this.wakeQueued = true;
      return;
    }
    this.draining = true;
    try {
      do {
        this.wakeQueued = false;
        await this.drainOnce();
      } while (this.wakeQueued);
    } finally {
      this.draining = false;
    }
  }

  private async drainOnce() {
    const enabled = await this.isEnabled();
    await this.request<"recoverWikiCompileRuns", unknown>({
      kind: "recoverWikiCompileRuns",
      payload: {
        leaseOwner: this.runnerId,
        resumeWikiDisabled: enabled,
      },
    });
    if (!enabled) return;

    while (await this.isEnabled()) {
      const claimed = await this.request<"claimNextWikiCompileStep", WikiCompileClaimStepResult>({
        kind: "claimNextWikiCompileStep",
        leaseOwner: this.runnerId,
      });
      if (claimed.step !== undefined && claimed.run !== undefined) {
        await this.runMapStep(claimed.run, claimed.step);
        continue;
      }

      const reduce = await this.request<"claimWikiCompileReduce", WikiCompileClaimReduceResult>({
        kind: "claimWikiCompileReduce",
        leaseOwner: this.runnerId,
      });
      if (reduce.run === undefined) return;
      await this.runReduce(reduce.run);
      if (!(await this.isEnabled())) return;
    }
  }

  private async runMapStep(run: WikiCompileRunSummary, step: WikiCompileStepRecord) {
    const enabledBeforeCall = await this.isEnabled();
    if (!enabledBeforeCall) {
      await this.pause(run.id, "wiki_disabled");
      return;
    }
    try {
      const input = await this.request<"getWikiCompileStepInput", WikiCompileMapInput>({
        kind: "getWikiCompileStepInput",
        runId: run.id,
        stepId: step.id,
        leaseOwner: this.runnerId,
      });
      await this.assertCurrentProvider(run);
      const startedAt = performance.now();
      const result = await this.compiler.analyzeStep(input);
      const completed = await this.request<"completeWikiCompileStep", WikiCompileStepRecord>({
        kind: "completeWikiCompileStep",
        payload: {
          runId: run.id,
          stepId: step.id,
          leaseOwner: this.runnerId,
          inputSignature: run.inputSignature,
          result,
          latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
        },
      });
      if (!(await this.isEnabled()) && completed.status === "completed") {
        await this.pause(run.id, "wiki_disabled");
      }
    } catch (error) {
      await this.failMap(run.id, step.id, error);
    }
  }

  private async runReduce(run: WikiCompileRunSummary) {
    if (!(await this.isEnabled())) {
      await this.pause(run.id, "wiki_disabled");
      return;
    }
    try {
      const input = await this.request<"getWikiCompileReduceInput", WikiCompileReduceInput>({
        kind: "getWikiCompileReduceInput",
        runId: run.id,
        leaseOwner: this.runnerId,
      });
      await this.assertCurrentProvider(run);
      const result = await this.compiler.reduce(input);
      if (!(await this.isEnabled())) {
        await this.pause(run.id, "wiki_disabled");
        return;
      }
      await this.request<"completeWikiCompileReduce", WikiCompileRunSummary>({
        kind: "completeWikiCompileReduce",
        payload: {
          runId: run.id,
          leaseOwner: this.runnerId,
          inputSignature: run.inputSignature,
          result,
        },
      });
    } catch (error) {
      await this.failReduce(run.id, error);
    }
  }

  private async failMap(runId: string, stepId: string, error: unknown) {
    const failure = errorForWikiCompiler(error);
    await this.request<"failWikiCompileStep", WikiCompileRunSummary>({
      kind: "failWikiCompileStep",
      payload: {
        runId,
        stepId,
        leaseOwner: this.runnerId,
        errorCode: failure.code,
        errorMessage: failure.message,
      },
    }).catch(() => undefined);
  }

  private async failReduce(runId: string, error: unknown) {
    const failure = errorForWikiCompiler(error);
    await this.request<"failWikiCompileReduce", WikiCompileRunSummary>({
      kind: "failWikiCompileReduce",
      payload: {
        runId,
        leaseOwner: this.runnerId,
        errorCode: failure.code,
        errorMessage: failure.message,
      },
    }).catch(() => undefined);
  }

  private async pause(runId: string, reason: "wiki_disabled" | "manual") {
    await this.request<"pauseWikiCompileRun", WikiCompileRunSummary>({
      kind: "pauseWikiCompileRun",
      payload: { runId, reason, leaseOwner: this.runnerId },
    }).catch(() => undefined);
  }

  private async assertCurrentProvider(run: WikiCompileRunSummary) {
    const config = await this.requireProviderConfig();
    if (config.provider !== run.provider || config.model !== run.modelId) {
      throw new WikiCompilerError(
        "provider_error",
        "The active Main Model changed while Wiki compilation was running.",
      );
    }
  }

  private async requireProviderConfig() {
    const config = await this.loadProviderConfig();
    if (config === undefined || config.model.trim().length === 0) {
      throw new WikiCompilerError("unavailable", "Configure the Main Model before compiling Wiki.");
    }
    return config;
  }

  private async requireEnabled() {
    if (!(await this.isEnabled())) {
      throw new Error("WIKI_DISABLED: Enable Wiki compilation before this operation.");
    }
  }

  private async isEnabled() {
    return (await this.loadSettings()).wiki.enabled === true;
  }

  private async request<K extends EngineRequest["kind"], T>(
    request: Extract<EngineRequest, { kind: K }>,
  ) {
    return (await this.requestEngine(request)) as T;
  }
}

function errorForWikiCompiler(error: unknown): {
  code: WikiCompilerError["code"];
  message: string;
} {
  if (error instanceof WikiCompilerError) {
    return { code: error.code, message: error.message };
  }
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  const code = normalized.includes("timeout")
    ? "timeout"
    : normalized.includes("permission")
      ? "permission"
      : normalized.includes("abort")
        ? "aborted"
        : "provider_error";
  return { code, message: message.slice(0, 2_000) };
}
