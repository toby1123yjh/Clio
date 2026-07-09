import type { StreamFn } from "@earendil-works/pi-agent-core";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import { defaultClioProviderStreamFn } from "./pi-agent-core-run-adapter";
import { modelForProvider, providerLabel } from "./provider-runtime";
import {
  type ProviderId,
  type StoredProviderConfig,
  defaultActiveProvider,
} from "./provider-settings";

export interface ChunkMetaSummaryInput {
  sourceId: string;
  chunkId: string;
  ord: number;
  role: string;
  sourceTitle?: string;
  sourceType?: string;
  docContext?: string;
  sectionPath?: string;
  chunkTextExcerpt: string;
}

export interface ChunkMetaSummaryResult {
  status: "summarized" | "unavailable" | "error";
  providerKind?: "chat";
  sectionSummary?: string;
  chunkSummary?: string;
  reason?: string;
}

export interface ChunkMetaSummarizer {
  summarize(
    input: ChunkMetaSummaryInput,
    options?: { signal?: AbortSignal },
  ): Promise<ChunkMetaSummaryResult>;
}

export interface ProviderBackedChunkMetaSummarizerOptions {
  loadConfig: () => Promise<StoredProviderConfig | undefined>;
  loadProviderId?: () => Promise<ProviderId>;
  ensureProviderPermission: (
    provider: ProviderId,
    config?: StoredProviderConfig,
  ) => Promise<boolean>;
  streamFn?: StreamFn;
}

const chunkMetaSummarySystemPrompt =
  "You summarize one bounded source chunk for a local scientific knowledge base. " +
  "Use only the supplied metadata, section path, and chunk excerpt. " +
  "Do not use full PDF text, full webpage text, web search, or outside knowledge. " +
  "Return only strict JSON with this shape: " +
  '{"sectionSummary":"short section summary","chunkSummary":"short chunk summary"}.';

const maxSourceIdChars = 160;
const maxChunkIdChars = 160;
const maxRoleChars = 40;
const maxSourceTitleChars = 240;
const maxSourceTypeChars = 80;
const maxDocContextChars = 1_000;
const maxSectionPathChars = 360;
const maxChunkExcerptChars = 1_800;
const maxSectionSummaryChars = 500;
const maxChunkSummaryChars = 360;

export class ProviderBackedChunkMetaSummarizer implements ChunkMetaSummarizer {
  private readonly loadConfig: ProviderBackedChunkMetaSummarizerOptions["loadConfig"];
  private readonly loadProviderId: () => Promise<ProviderId>;
  private readonly ensureProviderPermission: ProviderBackedChunkMetaSummarizerOptions["ensureProviderPermission"];
  private readonly streamFn: StreamFn;

  constructor(options: ProviderBackedChunkMetaSummarizerOptions) {
    this.loadConfig = options.loadConfig;
    this.loadProviderId = options.loadProviderId ?? (async () => defaultActiveProvider);
    this.ensureProviderPermission = options.ensureProviderPermission;
    this.streamFn = options.streamFn ?? defaultClioProviderStreamFn;
  }

  async summarize(
    input: ChunkMetaSummaryInput,
    options: { signal?: AbortSignal } = {},
  ): Promise<ChunkMetaSummaryResult> {
    const boundedInput = boundChunkMetaSummaryInput(input);
    if (boundedInput.chunkTextExcerpt.length === 0) {
      return unavailableResult("chunk_meta_summary_excerpt_required");
    }

    const config = await this.loadConfig().catch(() => undefined);
    const provider =
      config?.provider ?? (await this.loadProviderId().catch(() => defaultActiveProvider));
    const label = providerLabel(provider);
    if (config === undefined) {
      return unavailableResult(`${label} provider is not configured.`);
    }

    const permissionGranted = await this.ensureProviderPermission(provider, config).catch(
      () => false,
    );
    if (!permissionGranted) {
      return unavailableResult(`${label} provider permission is unavailable.`);
    }

    try {
      const stream = await this.streamFn(
        modelForProvider(config),
        {
          systemPrompt: chunkMetaSummarySystemPrompt,
          messages: [
            {
              role: "user",
              content: buildChunkMetaSummaryPrompt(boundedInput),
              timestamp: Date.now(),
            },
          ],
        },
        {
          apiKey: config.apiKey,
          signal: options.signal,
          maxRetries: 0,
          maxTokens: 700,
          temperature: 0,
          timeoutMs: 30_000,
        },
      );
      let streamedText = "";
      let finalText = "";
      for await (const event of stream) {
        if (event.type === "text_delta") streamedText = `${streamedText}${event.delta}`;
        if (event.type === "done") finalText = assistantText(event.message) || streamedText;
        if (event.type === "error") {
          return errorResult(event.error.errorMessage ?? `${label} chunk meta summary failed.`);
        }
      }
      return parseChunkMetaSummaryOutput(finalText || streamedText);
    } catch (error) {
      if (options.signal?.aborted === true) return unavailableResult("chunk_meta_summary_aborted");
      return errorResult(
        error instanceof Error ? error.message : "chunk_meta_summary_provider_error",
      );
    }
  }
}

export function buildChunkMetaSummaryPrompt(input: ChunkMetaSummaryInput) {
  const bounded = boundChunkMetaSummaryInput(input);
  return [
    "Summarize this single bounded chunk for chunk metadata.",
    "Do not use outside knowledge, web search, full PDF text, full webpage text, or unstated source text.",
    "Keep both summaries concise and citation-neutral.",
    "Return JSON only.",
    "",
    JSON.stringify({
      sourceId: bounded.sourceId,
      chunkId: bounded.chunkId,
      ord: bounded.ord,
      role: bounded.role,
      sourceTitle: bounded.sourceTitle,
      sourceType: bounded.sourceType,
      docContext: bounded.docContext,
      sectionPath: bounded.sectionPath,
      chunkTextExcerpt: bounded.chunkTextExcerpt,
    }),
  ].join("\n");
}

export function boundChunkMetaSummaryInput(input: ChunkMetaSummaryInput): ChunkMetaSummaryInput {
  return {
    sourceId: truncateText(input.sourceId, maxSourceIdChars),
    chunkId: truncateText(input.chunkId, maxChunkIdChars),
    ord: Number.isFinite(input.ord) ? Math.floor(input.ord) : 0,
    role: truncateText(input.role, maxRoleChars),
    ...(input.sourceTitle === undefined
      ? {}
      : { sourceTitle: truncateText(input.sourceTitle, maxSourceTitleChars) }),
    ...(input.sourceType === undefined
      ? {}
      : { sourceType: truncateText(input.sourceType, maxSourceTypeChars) }),
    ...(input.docContext === undefined
      ? {}
      : { docContext: truncateText(input.docContext, maxDocContextChars) }),
    ...(input.sectionPath === undefined
      ? {}
      : { sectionPath: truncateText(input.sectionPath, maxSectionPathChars) }),
    chunkTextExcerpt: truncateText(input.chunkTextExcerpt, maxChunkExcerptChars),
  };
}

function parseChunkMetaSummaryOutput(output: string): ChunkMetaSummaryResult {
  const text = output.trim();
  if (text.length === 0) return errorResult("chunk_meta_summary_empty_output");

  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonObject(text));
  } catch {
    return errorResult("chunk_meta_summary_malformed_json");
  }
  if (!isRecord(parsed)) return errorResult("chunk_meta_summary_invalid_json");

  const sectionSummary =
    typeof parsed.sectionSummary === "string"
      ? truncateText(parsed.sectionSummary, maxSectionSummaryChars)
      : undefined;
  const chunkSummary =
    typeof parsed.chunkSummary === "string"
      ? truncateText(parsed.chunkSummary, maxChunkSummaryChars)
      : undefined;
  if (
    (sectionSummary === undefined || sectionSummary.length === 0) &&
    (chunkSummary === undefined || chunkSummary.length === 0)
  ) {
    return errorResult("chunk_meta_summary_missing_summary");
  }

  return {
    status: "summarized",
    providerKind: "chat",
    ...(sectionSummary === undefined || sectionSummary.length === 0 ? {} : { sectionSummary }),
    ...(chunkSummary === undefined || chunkSummary.length === 0 ? {} : { chunkSummary }),
  };
}

function unavailableResult(reason: string): ChunkMetaSummaryResult {
  return {
    status: "unavailable",
    providerKind: "chat",
    reason: truncateText(reason, 240),
  };
}

function errorResult(reason: string): ChunkMetaSummaryResult {
  return {
    status: "error",
    providerKind: "chat",
    reason: truncateText(reason, 240),
  };
}

function assistantText(message: AssistantMessage) {
  return message.content
    .map((item) => (item.type === "text" ? item.text : ""))
    .filter((item) => item.length > 0)
    .join("");
}

function extractJsonObject(text: string) {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/iu.exec(text);
  const candidate = fenced?.[1]?.trim() ?? text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end < start) return candidate;
  return candidate.slice(start, end + 1);
}

function truncateText(input: string, maxChars: number) {
  const text = input.replace(/\s+/g, " ").trim();
  if (text.length <= maxChars) return text;
  if (maxChars <= 3) return text.slice(0, maxChars);
  return `${text.slice(0, maxChars - 3).trimEnd()}...`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
