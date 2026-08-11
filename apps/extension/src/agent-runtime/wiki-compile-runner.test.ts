import { resolveWikiCompileBudget } from "@/src/engine/wiki-compile-plan";
import type { EngineRequest } from "@/src/shared/rpc";
import type {
  WikiCompileMapInput,
  WikiCompileMapResult,
  WikiCompileReduceInput,
  WikiCompileReduceResult,
  WikiCompileRunSummary,
  WikiCompileStepRecord,
} from "@/src/shared/wiki-compile";
import { describe, expect, it, vi } from "vitest";
import type { KnowledgeBaseAiSettings } from "./knowledge-base-ai-settings";
import type { StoredProviderConfig } from "./provider-settings";
import { WikiCompileRunner } from "./wiki-compile-runner";
import { WikiCompilerError } from "./wiki-compiler";

const config: StoredProviderConfig = {
  provider: "openai",
  apiKey: "test-key",
  model: "gpt-test",
  baseUrl: "https://api.example.test/v1",
  updatedAt: "2026-08-11T00:00:00.000Z",
};

const budget = resolveWikiCompileBudget(config.model);

function runSummary(overrides: Partial<WikiCompileRunSummary> = {}): WikiCompileRunSummary {
  return {
    id: "run-1",
    sourceId: "source-1",
    inputSignature: "signature-1",
    status: "running",
    provider: config.provider,
    modelId: config.model,
    stepCount: 1,
    completedStepCount: 0,
    coveredChunkCount: 0,
    totalChunkCount: 1,
    attemptCount: 1,
    maxAttempts: 3,
    cancelRequested: false,
    createdAt: "2026-08-11T00:00:00.000Z",
    updatedAt: "2026-08-11T00:00:00.000Z",
    ...overrides,
  };
}

function stepRecord(overrides: Partial<WikiCompileStepRecord> = {}): WikiCompileStepRecord {
  return {
    id: "step-1",
    runId: "run-1",
    index: 0,
    signature: "step-signature-1",
    status: "running",
    mainChunkIds: ["chunk-1"],
    overlapChunkIds: [],
    tokenEstimate: 20,
    attemptCount: 1,
    maxAttempts: 3,
    findings: [],
    claims: [],
    coveredChunkIds: [],
    createdAt: "2026-08-11T00:00:00.000Z",
    updatedAt: "2026-08-11T00:00:00.000Z",
    ...overrides,
  };
}

const mapInput: WikiCompileMapInput = {
  runId: "run-1",
  stepId: "step-1",
  inputSignature: "signature-1",
  source: { id: "source-1", title: "Source", contentHash: "hash-1" },
  mainChunks: [{ id: "chunk-1", ord: 0, text: "Evidence", tokenCount: 2 }],
  overlapChunks: [],
  priorDigest: "",
  budget,
};

const mapResult: WikiCompileMapResult = {
  findings: [],
  claims: [],
  rollingDigest: "digest",
  coveredChunkIds: ["chunk-1"],
};

const reduceInput: WikiCompileReduceInput = {
  runId: "run-1",
  inputSignature: "signature-1",
  source: mapInput.source,
  checkpoints: [],
  manifestChunkIds: ["chunk-1"],
  budget,
};

const reduceResult: WikiCompileReduceResult = {
  digest: { title: "Source", content: "Digest", evidenceChunkIds: ["chunk-1"] },
  sections: [],
  claims: [],
  coveredChunkIds: ["chunk-1"],
};

function settings(enabled: boolean): KnowledgeBaseAiSettings {
  return { wiki: { enabled } };
}

function createRunner(
  requestEngine: (request: EngineRequest) => Promise<unknown>,
  loadSettings: () => Promise<KnowledgeBaseAiSettings>,
  compiler: NonNullable<ConstructorParameters<typeof WikiCompileRunner>[0]>["compiler"],
) {
  return new WikiCompileRunner({
    requestEngine,
    loadSettings,
    loadProviderConfig: async () => config,
    ensureProviderPermission: async () => true,
    compiler,
    runnerId: "runner-test",
  });
}

describe("WikiCompileRunner", () => {
  it("merges concurrent wake calls and never runs providers concurrently", async () => {
    let taskAvailable = true;
    let releaseProvider!: () => void;
    let providerStarted!: () => void;
    const providerGate = new Promise<void>((resolve) => {
      releaseProvider = resolve;
    });
    const started = new Promise<void>((resolve) => {
      providerStarted = resolve;
    });
    let activeProviders = 0;
    let maxActiveProviders = 0;
    const compiler = {
      analyzeStep: vi.fn(async () => {
        activeProviders += 1;
        maxActiveProviders = Math.max(maxActiveProviders, activeProviders);
        providerStarted();
        await providerGate;
        activeProviders -= 1;
        return mapResult;
      }),
      reduce: vi.fn(async () => reduceResult),
    };
    const calls: EngineRequest[] = [];
    const runner = createRunner(
      async (request) => {
        calls.push(request);
        switch (request.kind) {
          case "recoverWikiCompileRuns":
            return { recoveredRunCount: 0, recoveredStepCount: 0, resumedRunCount: 0 };
          case "claimNextWikiCompileStep": {
            if (!taskAvailable) return {};
            taskAvailable = false;
            return { run: runSummary(), step: stepRecord() };
          }
          case "getWikiCompileStepInput":
            return mapInput;
          case "completeWikiCompileStep":
            return stepRecord({ status: "completed", coveredChunkIds: ["chunk-1"] });
          case "claimWikiCompileReduce":
          case "getWikiCompileReduceInput":
          case "completeWikiCompileReduce":
            return request.kind === "claimWikiCompileReduce" ? {} : reduceInput;
          default:
            return runSummary();
        }
      },
      async () => settings(true),
      compiler,
    );

    const firstWake = runner.wake();
    await started;
    const secondWake = runner.wake();
    releaseProvider();
    await Promise.all([firstWake, secondWake]);

    expect(maxActiveProviders).toBe(1);
    expect(compiler.analyzeStep).toHaveBeenCalledTimes(1);
    expect(calls.filter((request) => request.kind === "recoverWikiCompileRuns")).toHaveLength(2);
  });

  it("checkpoints a completed map step and pauses when Wiki is disabled", async () => {
    let enabled = true;
    const calls: EngineRequest[] = [];
    const compiler = {
      analyzeStep: vi.fn(async () => {
        enabled = false;
        return mapResult;
      }),
      reduce: vi.fn(async () => reduceResult),
    };
    const runner = createRunner(
      async (request) => {
        calls.push(request);
        switch (request.kind) {
          case "recoverWikiCompileRuns":
            return { recoveredRunCount: 0, recoveredStepCount: 0, resumedRunCount: 0 };
          case "claimNextWikiCompileStep":
            return { run: runSummary(), step: stepRecord() };
          case "getWikiCompileStepInput":
            return mapInput;
          case "completeWikiCompileStep":
            return stepRecord({ status: "completed", coveredChunkIds: ["chunk-1"] });
          case "pauseWikiCompileRun":
            return runSummary({ status: "paused", pauseReason: "wiki_disabled" });
          default:
            throw new Error(`Unexpected request: ${request.kind}`);
        }
      },
      async () => settings(enabled),
      compiler,
    );

    await runner.wake();

    const completeIndex = calls.findIndex((request) => request.kind === "completeWikiCompileStep");
    const pauseIndex = calls.findIndex((request) => request.kind === "pauseWikiCompileRun");
    expect(completeIndex).toBeGreaterThanOrEqual(0);
    expect(pauseIndex).toBeGreaterThan(completeIndex);
    expect(calls.some((request) => request.kind === "claimWikiCompileReduce")).toBe(false);
    expect(compiler.reduce).not.toHaveBeenCalled();
  });

  it("turns provider failures into a typed map failure transition", async () => {
    let taskAvailable = true;
    const calls: EngineRequest[] = [];
    const compiler = {
      analyzeStep: vi.fn(async () => {
        throw new WikiCompilerError("rate_limited", "provider rate limit");
      }),
      reduce: vi.fn(async () => reduceResult),
    };
    const runner = createRunner(
      async (request) => {
        calls.push(request);
        switch (request.kind) {
          case "recoverWikiCompileRuns":
            return { recoveredRunCount: 0, recoveredStepCount: 0, resumedRunCount: 0 };
          case "claimNextWikiCompileStep": {
            if (!taskAvailable) return {};
            taskAvailable = false;
            return { run: runSummary(), step: stepRecord() };
          }
          case "getWikiCompileStepInput":
            return mapInput;
          case "failWikiCompileStep":
            return runSummary({ status: "failed", errorCode: "rate_limited" });
          default:
            return {};
        }
      },
      async () => settings(true),
      compiler,
    );

    await runner.wake();

    const failure = calls.find((request) => request.kind === "failWikiCompileStep");
    expect(failure).toMatchObject({
      kind: "failWikiCompileStep",
      payload: {
        runId: "run-1",
        stepId: "step-1",
        leaseOwner: "runner-test",
        errorCode: "rate_limited",
        errorMessage: "provider rate limit",
      },
    });
  });

  it("derives the trusted provider and budget when enqueueing", async () => {
    const calls: EngineRequest[] = [];
    const runner = createRunner(
      async (request) => {
        calls.push(request);
        if (request.kind === "createWikiCompileRun") {
          return { disposition: "created", run: runSummary({ status: "queued" }) };
        }
        if (request.kind === "recoverWikiCompileRuns") {
          return { recoveredRunCount: 0, recoveredStepCount: 0, resumedRunCount: 0 };
        }
        return {};
      },
      async () => settings(true),
      { analyzeStep: vi.fn(), reduce: vi.fn() },
    );

    await runner.enqueue("source-1");

    expect(calls[0]).toMatchObject({
      kind: "createWikiCompileRun",
      payload: { sourceId: "source-1", provider: "openai", modelId: "gpt-test", budget },
    });
  });
});
