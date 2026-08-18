import {
  SOURCE_FINE_RANK_LIMITS,
  SOURCE_FINE_RANK_PROMPT_VERSION,
  type SourceFineRankProvider,
  type SourceFineRankProviderResult,
  type SourceFineRankRequest,
  SourceFineRankValidationError,
  assertSourceFineRankPromptBudget,
  boundSourceFineRankRequest,
  validateSourceFineRankProviderResult,
} from "@/src/shared/source-fine-rank";
import type { StreamFn } from "@earendil-works/pi-agent-core";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { KnowledgeBaseAiSettings } from "./knowledge-base-ai-settings";
import { defaultClioProviderStreamFn } from "./pi-agent-core-run-adapter";
import { modelForProvider, providerLabel } from "./provider-runtime";
import {
  type ProviderId,
  type StoredProviderConfig,
  defaultActiveProvider,
} from "./provider-settings";

export interface ProviderBackedSourceFineRankerOptions {
  loadSettings: () => Promise<KnowledgeBaseAiSettings>;
  loadConfig: () => Promise<StoredProviderConfig | undefined>;
  loadProviderId?: () => Promise<ProviderId>;
  ensureProviderPermission: (
    provider: ProviderId,
    config?: StoredProviderConfig,
  ) => Promise<boolean>;
  streamFn?: StreamFn;
}

export const sourceFineRankSystemPrompt =
  "You perform bounded source relevance judgments for a local knowledge base. " +
  "Use only the supplied query, source cards, representative evidence, and fresh Wiki artifacts. " +
  "Absence from Wiki is not proof of irrelevance. Do not use full documents, PDF bytes, web search, or outside knowledge. " +
  "Judge every candidate exactly once and copy evidence refs exactly from that candidate. Return strict JSON only.";

export class ProviderBackedSourceFineRanker implements SourceFineRankProvider {
  private readonly loadSettings: ProviderBackedSourceFineRankerOptions["loadSettings"];
  private readonly loadConfig: ProviderBackedSourceFineRankerOptions["loadConfig"];
  private readonly loadProviderId: () => Promise<ProviderId>;
  private readonly ensureProviderPermission: ProviderBackedSourceFineRankerOptions["ensureProviderPermission"];
  private readonly streamFn: StreamFn;

  constructor(options: ProviderBackedSourceFineRankerOptions) {
    this.loadSettings = options.loadSettings;
    this.loadConfig = options.loadConfig;
    this.loadProviderId = options.loadProviderId ?? (async () => defaultActiveProvider);
    this.ensureProviderPermission = options.ensureProviderPermission;
    this.streamFn = options.streamFn ?? defaultClioProviderStreamFn;
  }

  async isEnabled() {
    return (
      (await this.loadSettings().catch(() => ({ wiki: { enabled: false } }))).wiki.enabled === true
    );
  }

  async rank(
    input: SourceFineRankRequest,
    options: { signal?: AbortSignal } = {},
  ): Promise<SourceFineRankProviderResult> {
    if (!(await this.isEnabled())) {
      throw new SourceFineRankValidationError("wiki_disabled", "Wiki Fine Rank is disabled.");
    }
    const bounded = boundSourceFineRankRequest(input);
    if (bounded.candidates.length === 0) {
      throw new SourceFineRankValidationError("input_invalid", "Fine Rank requires candidates.");
    }
    if (options.signal?.aborted === true) {
      throw new SourceFineRankValidationError("timeout", "Fine Rank was aborted.");
    }
    const config = await this.loadConfig().catch(() => undefined);
    const provider =
      config?.provider ?? (await this.loadProviderId().catch(() => defaultActiveProvider));
    const label = providerLabel(provider);
    if (config === undefined) {
      throw new SourceFineRankValidationError(
        "model_not_configured",
        `${label} provider is not configured.`,
      );
    }
    if (!(await this.ensureProviderPermission(provider, config).catch(() => false))) {
      throw new SourceFineRankValidationError(
        "permission_denied",
        `${label} provider permission is unavailable.`,
      );
    }

    const prompt = buildSourceFineRankPrompt(bounded);
    const startedAt = Date.now();
    try {
      const stream = await this.streamFn(
        modelForProvider(config),
        {
          systemPrompt: sourceFineRankSystemPrompt,
          messages: [{ role: "user", content: prompt, timestamp: Date.now() }],
        },
        {
          apiKey: config.apiKey,
          signal: options.signal,
          maxRetries: 0,
          maxTokens: SOURCE_FINE_RANK_LIMITS.maxOutputTokens,
          temperature: 0,
          timeoutMs: 60_000,
        },
      );
      let streamed = "";
      let finalText = "";
      for await (const event of stream) {
        if (event.type === "text_delta") {
          streamed += event.delta;
          if (streamed.length > SOURCE_FINE_RANK_LIMITS.maxOutputTokens * 8) {
            throw new SourceFineRankValidationError(
              "malformed_output",
              "Fine Rank output exceeded its bound.",
            );
          }
        }
        if (event.type === "done") finalText = assistantText(event.message) || streamed;
        if (event.type === "error") {
          throw new SourceFineRankValidationError(
            /timeout|timed out/i.test(event.error.errorMessage ?? "")
              ? "timeout"
              : "provider_error",
            event.error.errorMessage ?? "Fine Rank provider failed.",
          );
        }
      }
      const parsed = parseJsonObject(finalText || streamed);
      const validated = validateSourceFineRankProviderResult(bounded, parsed);
      return {
        ...validated,
        model: config.model,
        promptVersion: SOURCE_FINE_RANK_PROMPT_VERSION,
        inputRefs: bounded.candidates.flatMap((candidate) => [
          candidate.source.id,
          ...candidate.evidence.map((evidence) => evidence.id),
          ...candidate.wiki.map((artifact) => artifact.artifactId),
        ]),
        latencyMs: Date.now() - startedAt,
      };
    } catch (error) {
      if (error instanceof SourceFineRankValidationError) throw error;
      if (options.signal?.aborted) {
        throw new SourceFineRankValidationError("timeout", "Fine Rank timed out.");
      }
      throw new SourceFineRankValidationError(
        "provider_error",
        error instanceof Error ? error.message : `${label} Fine Rank failed.`,
      );
    }
  }
}

export function buildSourceFineRankPrompt(input: SourceFineRankRequest) {
  const bounded = boundSourceFineRankRequest(input);
  const prompt = [
    "Judge every source candidate exactly once.",
    `Strength: ${bounded.strength}. Allowed relevance: high, medium, low, irrelevant.`,
    "Keep/drop must reflect the query and supplied evidence. Copy evidenceRefs exactly.",
    'Return JSON only with {"judgments":[{"sourceId":"id","decision":"keep|drop","relevance":"high|medium|low|irrelevant","reason":"bounded","confidence":0.0,"evidenceRefs":["id"]}]}.',
    JSON.stringify(bounded),
  ].join("\n");
  return assertSourceFineRankPromptBudget(bounded, prompt);
}

function parseJsonObject(text: string): unknown {
  const candidate = extractJsonObject(text.trim());
  if (candidate.length === 0) {
    throw new SourceFineRankValidationError(
      "malformed_output",
      "Fine Rank provider returned no JSON.",
    );
  }
  try {
    return JSON.parse(candidate);
  } catch {
    throw new SourceFineRankValidationError(
      "malformed_output",
      "Fine Rank provider returned malformed JSON.",
    );
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
