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

export type ChunkMetaSemanticRelationKind =
  | "parent"
  | "previous"
  | "next"
  | "section"
  | "role"
  | "citation_hint";

export interface ChunkMetaSemanticRelationCandidate {
  kind: ChunkMetaSemanticRelationKind;
  target: string;
  label?: string;
  confidence: number;
  reason?: string;
  source: "remote_llm";
}

export interface ChunkMetaSummaryResult {
  status: "summarized" | "unavailable" | "error";
  providerKind?: "chat";
  sectionSummary?: string;
  chunkSummary?: string;
  semanticRelations?: ChunkMetaSemanticRelationCandidate[];
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
  '{"sectionSummary":"short section summary","chunkSummary":"short chunk summary","semanticRelations":[{"kind":"role","target":"bounded target","label":"optional label","confidence":0.7,"reason":"short reason"}]}.';

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
const maxSemanticRelations = 8;
const maxRelationTargetChars = 360;
const maxRelationLabelChars = 160;
const maxRelationReasonChars = 240;

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
    "Optionally extract semanticRelations using only these kinds: parent, previous, next, section, role, citation_hint.",
    "Each relation target must be a chunk id, section path, bounded role/citation target, or short phrase present in the supplied context.",
    "Return at most 8 relation candidates. Include confidence from 0 to 1 and a short reason.",
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
  const semanticRelations = parseChunkMetaSemanticRelations(parsed.semanticRelations);
  if (
    (sectionSummary === undefined || sectionSummary.length === 0) &&
    (chunkSummary === undefined || chunkSummary.length === 0) &&
    semanticRelations.length === 0
  ) {
    return errorResult("chunk_meta_summary_missing_summary");
  }

  return {
    status: "summarized",
    providerKind: "chat",
    ...(sectionSummary === undefined || sectionSummary.length === 0 ? {} : { sectionSummary }),
    ...(chunkSummary === undefined || chunkSummary.length === 0 ? {} : { chunkSummary }),
    ...(semanticRelations.length === 0 ? {} : { semanticRelations }),
  };
}

function parseChunkMetaSemanticRelations(value: unknown): ChunkMetaSemanticRelationCandidate[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const relations: ChunkMetaSemanticRelationCandidate[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    if (!isChunkMetaSemanticRelationKind(item.kind)) continue;
    if (typeof item.target !== "string") continue;
    const target = truncateText(item.target, maxRelationTargetChars);
    if (target.length === 0) continue;
    const key = `${item.kind}:${target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const label =
      typeof item.label === "string" ? truncateText(item.label, maxRelationLabelChars) : "";
    const reason =
      typeof item.reason === "string" ? truncateText(item.reason, maxRelationReasonChars) : "";
    const confidence =
      typeof item.confidence === "number" && Number.isFinite(item.confidence)
        ? Math.max(0, Math.min(1, item.confidence))
        : 0.5;
    relations.push({
      kind: item.kind,
      target,
      ...(label.length === 0 ? {} : { label }),
      confidence,
      ...(reason.length === 0 ? {} : { reason }),
      source: "remote_llm",
    });
    if (relations.length >= maxSemanticRelations) break;
  }
  return relations;
}

function isChunkMetaSemanticRelationKind(value: unknown): value is ChunkMetaSemanticRelationKind {
  return (
    value === "parent" ||
    value === "previous" ||
    value === "next" ||
    value === "section" ||
    value === "role" ||
    value === "citation_hint"
  );
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
