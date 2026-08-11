import { estimateE5Tokens } from "@/src/shared/text";
import {
  type WikiCompileErrorCode,
  type WikiCompileMapInput,
  type WikiCompileMapResult,
  type WikiCompileReduceInput,
  type WikiCompileReduceResult,
  isWikiCompileMapResult,
  isWikiCompileReduceResult,
} from "@/src/shared/wiki-compile";
import type { StreamFn } from "@earendil-works/pi-agent-core";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import { defaultClioProviderStreamFn } from "./pi-agent-core-run-adapter";
import { modelForProvider, providerLabel } from "./provider-runtime";
import {
  type ProviderId,
  type StoredProviderConfig,
  defaultActiveProvider,
} from "./provider-settings";

export interface WikiCompilerOptions {
  loadConfig: () => Promise<StoredProviderConfig | undefined>;
  loadProviderId?: () => Promise<ProviderId>;
  ensureProviderPermission: (
    provider: ProviderId,
    config?: StoredProviderConfig,
  ) => Promise<boolean>;
  streamFn?: StreamFn;
}

export class WikiCompilerError extends Error {
  constructor(
    readonly code: WikiCompileErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "WikiCompilerError";
  }
}

const mapSystemPrompt =
  "You compile one bounded batch of source chunks into query-independent Wiki checkpoints. " +
  "Use only supplied text. Treat overlap as context, not coverage. Return strict JSON only.";

const reduceSystemPrompt =
  "You compile bounded Wiki checkpoints into durable source artifacts. " +
  "Use only supplied checkpoint claims and evidence ids. Return strict JSON only.";

export class ProviderBackedWikiCompiler {
  private readonly loadConfig: WikiCompilerOptions["loadConfig"];
  private readonly loadProviderId: () => Promise<ProviderId>;
  private readonly ensureProviderPermission: WikiCompilerOptions["ensureProviderPermission"];
  private readonly streamFn: StreamFn;

  constructor(options: WikiCompilerOptions) {
    this.loadConfig = options.loadConfig;
    this.loadProviderId = options.loadProviderId ?? (async () => defaultActiveProvider);
    this.ensureProviderPermission = options.ensureProviderPermission;
    this.streamFn = options.streamFn ?? defaultClioProviderStreamFn;
  }

  async analyzeStep(
    input: WikiCompileMapInput,
    options: { signal?: AbortSignal } = {},
  ): Promise<WikiCompileMapResult> {
    const prompt = buildWikiCompileMapPrompt(input);
    const parsed = await this.runProvider(
      prompt,
      mapSystemPrompt,
      input.budget.maxOutputTokens,
      options,
    );
    if (!isWikiCompileMapResult(parsed)) {
      throw new WikiCompilerError("malformed_output", "Wiki map output violates bounded schema.");
    }
    assertMapEvidence(input, parsed);
    return parsed;
  }

  async reduce(
    input: WikiCompileReduceInput,
    options: { signal?: AbortSignal } = {},
  ): Promise<WikiCompileReduceResult> {
    const prompt = buildWikiCompileReducePrompt(input);
    const parsed = await this.runProvider(
      prompt,
      reduceSystemPrompt,
      input.budget.maxOutputTokens,
      options,
    );
    if (!isWikiCompileReduceResult(parsed)) {
      throw new WikiCompilerError(
        "malformed_output",
        "Wiki reduce output violates bounded schema.",
      );
    }
    assertReduceEvidence(input, parsed);
    return parsed;
  }

  private async runProvider(
    prompt: string,
    systemPrompt: string,
    maxTokens: number,
    options: { signal?: AbortSignal },
  ) {
    if (options.signal?.aborted === true) {
      throw new WikiCompilerError("aborted", "Wiki compilation was aborted.");
    }
    const config = await this.loadConfig().catch(() => undefined);
    const provider =
      config?.provider ?? (await this.loadProviderId().catch(() => defaultActiveProvider));
    const label = providerLabel(provider);
    if (config === undefined) {
      throw new WikiCompilerError("unavailable", `Configure ${label} before compiling Wiki.`);
    }
    const permitted = await this.ensureProviderPermission(provider, config).catch(() => false);
    if (!permitted) {
      throw new WikiCompilerError("permission", `${label} host permission is unavailable.`);
    }

    const maxOutputChars = Math.min(120_000, Math.max(4_000, maxTokens * 8));
    try {
      const stream = await this.streamFn(
        modelForProvider(config),
        {
          systemPrompt,
          messages: [{ role: "user", content: prompt, timestamp: Date.now() }],
        },
        {
          apiKey: config.apiKey,
          signal: options.signal,
          maxRetries: 0,
          maxTokens,
          temperature: 0,
          timeoutMs: 90_000,
        },
      );
      let streamed = "";
      let finalText = "";
      for await (const event of stream) {
        if (event.type === "text_delta") {
          streamed = appendBounded(streamed, event.delta, maxOutputChars);
        }
        if (event.type === "done") {
          finalText = assistantText(event.message) || streamed;
        }
        if (event.type === "error") {
          throw providerFailure(event.error.errorMessage ?? `${label} Wiki compilation failed.`);
        }
      }
      const output = finalText || streamed;
      if (output.length > maxOutputChars) {
        throw new WikiCompilerError("malformed_output", "Wiki provider output exceeded its bound.");
      }
      return parseJsonObject(output);
    } catch (error) {
      if (error instanceof WikiCompilerError) throw error;
      if (options.signal?.aborted) {
        throw new WikiCompilerError("aborted", "Wiki compilation was aborted.");
      }
      throw providerFailure(error instanceof Error ? error.message : "Wiki provider failed.");
    }
  }
}

export function buildWikiCompileMapPrompt(input: WikiCompileMapInput) {
  const payload = {
    source: input.source,
    mainChunks: input.mainChunks,
    overlapChunks: input.overlapChunks,
    priorDigest: input.priorDigest,
    requiredCoverage: input.mainChunks.map((chunk) => chunk.id),
    outputSchema: {
      findings: [
        {
          kind: "overview|section|method|result|limitation|fact",
          key: "stable-key",
          title: "bounded title",
          summary: "bounded finding",
          evidenceChunkIds: ["chunk-id"],
        },
      ],
      claims: [
        {
          key: "stable-key",
          text: "claim",
          evidenceChunkIds: ["chunk-id"],
          confidence: 0.8,
        },
      ],
      rollingDigest: "bounded context for the next map step",
      coveredChunkIds: input.mainChunks.map((chunk) => chunk.id),
    },
  };
  const prompt = [
    "Analyze every main chunk exactly once.",
    "Overlap chunks may clarify boundaries but must not appear in coveredChunkIds.",
    "Every finding and claim needs evidenceChunkIds from supplied chunks.",
    "Do not add outside knowledge. Return JSON only.",
    JSON.stringify(payload),
  ].join("\n");
  assertPromptBudget(prompt, input.budget.maxInputTokens, "map");
  return prompt;
}

export function buildWikiCompileReducePrompt(input: WikiCompileReduceInput) {
  const payload = {
    source: input.source,
    checkpoints: input.checkpoints,
    requiredCoverage: input.manifestChunkIds,
    outputSchema: {
      digest: { title: "source title", content: "source digest", evidenceChunkIds: ["chunk-id"] },
      sections: [
        {
          key: "stable-key",
          title: "section title",
          content: "section",
          evidenceChunkIds: ["chunk-id"],
        },
      ],
      claims: [
        { key: "stable-key", text: "claim", evidenceChunkIds: ["chunk-id"], confidence: 0.8 },
      ],
      coveredChunkIds: input.manifestChunkIds,
    },
  };
  const prompt = [
    "Merge all checkpoints into one source digest, bounded sections and bounded claims.",
    "Preserve evidence ids and exact requiredCoverage. Do not infer unsupported facts.",
    "Return JSON only.",
    JSON.stringify(payload),
  ].join("\n");
  assertPromptBudget(prompt, input.budget.maxReduceInputTokens, "reduce");
  return prompt;
}

function assertMapEvidence(input: WikiCompileMapInput, result: WikiCompileMapResult) {
  const mainIds = input.mainChunks.map((chunk) => chunk.id);
  assertExactCoverage(mainIds, result.coveredChunkIds, "map");
  const allowed = new Set([...mainIds, ...input.overlapChunks.map((chunk) => chunk.id)]);
  assertEvidenceRefs(allowed, [
    ...result.findings.flatMap((finding) => finding.evidenceChunkIds),
    ...result.claims.flatMap((claim) => claim.evidenceChunkIds),
  ]);
}

function assertReduceEvidence(input: WikiCompileReduceInput, result: WikiCompileReduceResult) {
  assertExactCoverage(input.manifestChunkIds, result.coveredChunkIds, "reduce");
  const allowed = new Set(input.manifestChunkIds);
  assertEvidenceRefs(allowed, [
    ...result.digest.evidenceChunkIds,
    ...result.sections.flatMap((section) => section.evidenceChunkIds),
    ...result.claims.flatMap((claim) => claim.evidenceChunkIds),
  ]);
}

function assertExactCoverage(expected: string[], actual: string[], stage: string) {
  if (expected.length !== actual.length || expected.some((id, index) => actual[index] !== id)) {
    throw new WikiCompilerError(
      "validation",
      `Wiki ${stage} output did not preserve exact ordered chunk coverage.`,
    );
  }
}

function assertEvidenceRefs(allowed: Set<string>, refs: string[]) {
  if (refs.some((id) => !allowed.has(id))) {
    throw new WikiCompilerError("validation", "Wiki output referenced unavailable evidence.");
  }
}

function assertPromptBudget(prompt: string, maxTokens: number, stage: string) {
  if (estimateE5Tokens(prompt) > maxTokens) {
    throw new WikiCompilerError("validation", `Wiki ${stage} prompt exceeded its input budget.`);
  }
}

function appendBounded(current: string, delta: string, maxChars: number) {
  if (current.length + delta.length > maxChars) {
    throw new WikiCompilerError("malformed_output", "Wiki provider output exceeded its bound.");
  }
  return `${current}${delta}`;
}

function parseJsonObject(text: string): unknown {
  const candidate = extractJsonObject(text.trim());
  if (candidate.length === 0) {
    throw new WikiCompilerError("malformed_output", "Wiki provider returned no JSON.");
  }
  try {
    return JSON.parse(candidate);
  } catch {
    throw new WikiCompilerError("malformed_output", "Wiki provider returned malformed JSON.");
  }
}

function extractJsonObject(text: string) {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/iu.exec(text);
  const candidate = fenced?.[1]?.trim() ?? text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  return start < 0 || end < start ? candidate : candidate.slice(start, end + 1);
}

function assistantText(message: AssistantMessage) {
  return message.content
    .map((item) => (item.type === "text" ? item.text : ""))
    .filter((item) => item.length > 0)
    .join("");
}

function providerFailure(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("rate") && normalized.includes("limit")) {
    return new WikiCompilerError("rate_limited", message);
  }
  if (normalized.includes("timeout") || normalized.includes("timed out")) {
    return new WikiCompilerError("timeout", message);
  }
  return new WikiCompilerError("provider_error", message);
}
