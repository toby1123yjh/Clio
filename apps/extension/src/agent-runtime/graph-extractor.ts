import type { StreamFn } from "@earendil-works/pi-agent-core";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import { defaultClioProviderStreamFn } from "./pi-agent-core-run-adapter";
import { modelForProvider, providerLabel } from "./provider-runtime";
import {
  type ProviderId,
  type StoredProviderConfig,
  defaultActiveProvider,
} from "./provider-settings";

export type GraphExtractionEntityKind = "domain" | "problem" | "method" | "dataset" | "metric";
export type GraphExtractionDimension = "domain" | "technical";

export interface GraphExtractionChunkInput {
  chunkId: string;
  ord: number;
  sectionPath?: string;
  excerpt: string;
}

export interface GraphExtractionInput {
  sourceId: string;
  sourceTitle?: string;
  sourceType?: string;
  abstract?: string;
  chunks: GraphExtractionChunkInput[];
}

export interface GraphExtractionEntity {
  id: string;
  kind: GraphExtractionEntityKind;
  label: string;
  confidence: number;
}

export interface GraphExtractionRelation {
  sourceEntityId: "source" | string;
  targetEntityId: "source" | string;
  dimension: GraphExtractionDimension;
  edgeType: string;
  confidence: number;
  evidenceChunkIds: string[];
}

export interface GraphExtractionResult {
  status: "extracted" | "unavailable" | "error";
  providerKind?: "chat";
  entities: GraphExtractionEntity[];
  relations: GraphExtractionRelation[];
  reason?: string;
}

export interface GraphExtractor {
  extract(
    input: GraphExtractionInput,
    options?: { signal?: AbortSignal },
  ): Promise<GraphExtractionResult>;
}

export interface ProviderBackedGraphExtractorOptions {
  loadConfig: () => Promise<StoredProviderConfig | undefined>;
  loadProviderId?: () => Promise<ProviderId>;
  ensureProviderPermission: (
    provider: ProviderId,
    config?: StoredProviderConfig,
  ) => Promise<boolean>;
  streamFn?: StreamFn;
}

const graphExtractionSystemPrompt =
  "You extract a bounded scientific research graph from source metadata and selected chunk excerpts. " +
  "Use only the supplied bounded input. Do not use full documents, PDF bytes, web search, or outside knowledge. " +
  "Every relation must cite one or more supplied chunkId values as evidenceChunkIds. " +
  "Return only strict JSON with this shape: " +
  '{"entities":[{"id":"method:1","kind":"method","label":"short label","confidence":0.8}],"relations":[{"sourceEntityId":"source","targetEntityId":"method:1","dimension":"technical","edgeType":"uses","confidence":0.8,"evidenceChunkIds":["chunk-id"]}]}';

const maxSourceIdChars = 160;
const maxSourceTitleChars = 240;
const maxSourceTypeChars = 80;
const maxAbstractChars = 1_000;
const maxChunks = 10;
const maxChunkIdChars = 160;
const maxSectionPathChars = 360;
const maxChunkExcerptChars = 900;
const maxEntities = 30;
const maxRelations = 50;
const maxEntityIdChars = 120;
const maxEntityLabelChars = 180;
const maxReasonChars = 240;
const allowedEdgeTypes = new Set([
  "mentions",
  "addresses",
  "related_to",
  "focuses_on",
  "uses",
  "evaluates",
  "trained_on",
  "measured_by",
  "compares",
  "produces",
]);

export class ProviderBackedGraphExtractor implements GraphExtractor {
  private readonly loadConfig: ProviderBackedGraphExtractorOptions["loadConfig"];
  private readonly loadProviderId: () => Promise<ProviderId>;
  private readonly ensureProviderPermission: ProviderBackedGraphExtractorOptions["ensureProviderPermission"];
  private readonly streamFn: StreamFn;

  constructor(options: ProviderBackedGraphExtractorOptions) {
    this.loadConfig = options.loadConfig;
    this.loadProviderId = options.loadProviderId ?? (async () => defaultActiveProvider);
    this.ensureProviderPermission = options.ensureProviderPermission;
    this.streamFn = options.streamFn ?? defaultClioProviderStreamFn;
  }

  async extract(
    input: GraphExtractionInput,
    options: { signal?: AbortSignal } = {},
  ): Promise<GraphExtractionResult> {
    const boundedInput = boundGraphExtractionInput(input);
    if (boundedInput.chunks.length === 0) {
      return unavailableResult("graph_extraction_chunks_required");
    }

    const config = await this.loadConfig().catch(() => undefined);
    const provider =
      config?.provider ?? (await this.loadProviderId().catch(() => defaultActiveProvider));
    const label = providerLabel(provider);
    if (config === undefined) return unavailableResult(`${label} provider is not configured.`);

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
          systemPrompt: graphExtractionSystemPrompt,
          messages: [
            {
              role: "user",
              content: buildGraphExtractionPrompt(boundedInput),
              timestamp: Date.now(),
            },
          ],
        },
        {
          apiKey: config.apiKey,
          signal: options.signal,
          maxRetries: 0,
          maxTokens: 1_800,
          temperature: 0,
          timeoutMs: 45_000,
        },
      );
      let streamedText = "";
      let finalText = "";
      for await (const event of stream) {
        if (event.type === "text_delta") streamedText = `${streamedText}${event.delta}`;
        if (event.type === "done") finalText = assistantText(event.message) || streamedText;
        if (event.type === "error") {
          return errorResult(event.error.errorMessage ?? `${label} graph extraction failed.`);
        }
      }
      return parseGraphExtractionOutput(finalText || streamedText, boundedInput);
    } catch (error) {
      if (options.signal?.aborted === true) return unavailableResult("graph_extraction_aborted");
      return errorResult(
        error instanceof Error ? error.message : "graph_extraction_provider_error",
      );
    }
  }
}

export function buildGraphExtractionPrompt(input: GraphExtractionInput) {
  const bounded = boundGraphExtractionInput(input);
  return [
    "Extract a compact scientific research graph from this bounded source sample.",
    "Allowed entity kinds: domain, problem, method, dataset, metric.",
    "Allowed dimensions: domain, technical.",
    `Allowed edge types: ${Array.from(allowedEdgeTypes).join(", ")}.`,
    "Use sourceEntityId or targetEntityId = source for the document node.",
    "Every other relation endpoint must reference an entity id returned in entities.",
    "Every relation must contain at least one evidenceChunkIds value copied exactly from the input.",
    "Do not return prose or markdown. Return JSON only.",
    "",
    JSON.stringify(bounded),
  ].join("\n");
}

export function boundGraphExtractionInput(input: GraphExtractionInput): GraphExtractionInput {
  const seen = new Set<string>();
  const chunks: GraphExtractionChunkInput[] = [];
  for (const chunk of input.chunks ?? []) {
    if (chunks.length >= maxChunks) break;
    const chunkId = truncateText(chunk.chunkId, maxChunkIdChars);
    const excerpt = truncateText(chunk.excerpt, maxChunkExcerptChars);
    if (chunkId.length === 0 || excerpt.length === 0 || seen.has(chunkId)) continue;
    seen.add(chunkId);
    chunks.push({
      chunkId,
      ord: Number.isFinite(chunk.ord) ? Math.floor(chunk.ord) : 0,
      ...(chunk.sectionPath === undefined
        ? {}
        : { sectionPath: truncateText(chunk.sectionPath, maxSectionPathChars) }),
      excerpt,
    });
  }
  return {
    sourceId: truncateText(input.sourceId, maxSourceIdChars),
    ...(input.sourceTitle === undefined
      ? {}
      : { sourceTitle: truncateText(input.sourceTitle, maxSourceTitleChars) }),
    ...(input.sourceType === undefined
      ? {}
      : { sourceType: truncateText(input.sourceType, maxSourceTypeChars) }),
    ...(input.abstract === undefined
      ? {}
      : { abstract: truncateText(input.abstract, maxAbstractChars) }),
    chunks,
  };
}

export function parseGraphExtractionOutput(
  output: string,
  input: GraphExtractionInput,
): GraphExtractionResult {
  const text = output.trim();
  if (text.length === 0) return errorResult("graph_extraction_empty_output");

  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonObject(text));
  } catch {
    return errorResult("graph_extraction_malformed_json");
  }
  if (!isRecord(parsed)) return errorResult("graph_extraction_invalid_json");

  const entities = parseEntities(parsed.entities);
  const entityIds = new Set(entities.map((entity) => entity.id));
  const inputChunkIds = new Set(
    boundGraphExtractionInput(input).chunks.map((chunk) => chunk.chunkId),
  );
  const relations = parseRelations(parsed.relations, entityIds, inputChunkIds);
  if (relations.length === 0) return errorResult("graph_extraction_missing_anchored_relations");

  const referencedEntityIds = new Set(
    relations.flatMap((relation) => [relation.sourceEntityId, relation.targetEntityId]),
  );
  return {
    status: "extracted",
    providerKind: "chat",
    entities: entities.filter((entity) => referencedEntityIds.has(entity.id)),
    relations,
  };
}

function parseEntities(value: unknown): GraphExtractionEntity[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const entities: GraphExtractionEntity[] = [];
  for (const item of value) {
    if (entities.length >= maxEntities) break;
    if (!isRecord(item) || typeof item.id !== "string" || typeof item.label !== "string") continue;
    if (!isGraphExtractionEntityKind(item.kind)) continue;
    const id = truncateText(item.id, maxEntityIdChars);
    const label = truncateText(item.label, maxEntityLabelChars);
    if (id.length === 0 || id === "source" || label.length === 0 || seen.has(id)) continue;
    seen.add(id);
    entities.push({
      id,
      kind: item.kind,
      label,
      confidence: confidenceValue(item.confidence),
    });
  }
  return entities;
}

function parseRelations(
  value: unknown,
  entityIds: ReadonlySet<string>,
  inputChunkIds: ReadonlySet<string>,
): GraphExtractionRelation[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const relations: GraphExtractionRelation[] = [];
  for (const item of value) {
    if (relations.length >= maxRelations) break;
    if (!isRecord(item)) continue;
    if (typeof item.sourceEntityId !== "string" || typeof item.targetEntityId !== "string")
      continue;
    const sourceEntityId = truncateText(item.sourceEntityId, maxEntityIdChars);
    const targetEntityId = truncateText(item.targetEntityId, maxEntityIdChars);
    if (sourceEntityId === targetEntityId) continue;
    if (
      !isGraphEndpoint(sourceEntityId, entityIds) ||
      !isGraphEndpoint(targetEntityId, entityIds)
    ) {
      continue;
    }
    if (!isGraphExtractionDimension(item.dimension) || typeof item.edgeType !== "string") continue;
    const edgeType = normalizeEdgeType(item.edgeType);
    if (!allowedEdgeTypes.has(edgeType)) continue;
    if (!Array.isArray(item.evidenceChunkIds) || item.evidenceChunkIds.length === 0) continue;
    const rawEvidence = item.evidenceChunkIds.filter(
      (chunkId): chunkId is string => typeof chunkId === "string",
    );
    if (
      rawEvidence.length !== item.evidenceChunkIds.length ||
      rawEvidence.some((chunkId) => !inputChunkIds.has(chunkId))
    ) {
      continue;
    }
    const evidenceChunkIds = Array.from(new Set(rawEvidence)).slice(0, 8);
    if (evidenceChunkIds.length === 0) continue;
    const key = `${sourceEntityId}:${targetEntityId}:${item.dimension}:${edgeType}:${evidenceChunkIds.join(",")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    relations.push({
      sourceEntityId,
      targetEntityId,
      dimension: item.dimension,
      edgeType,
      confidence: confidenceValue(item.confidence),
      evidenceChunkIds,
    });
  }
  return relations;
}

function isGraphEndpoint(value: string, entityIds: ReadonlySet<string>) {
  return value === "source" || entityIds.has(value);
}

function isGraphExtractionEntityKind(value: unknown): value is GraphExtractionEntityKind {
  return (
    value === "domain" ||
    value === "problem" ||
    value === "method" ||
    value === "dataset" ||
    value === "metric"
  );
}

function isGraphExtractionDimension(value: unknown): value is GraphExtractionDimension {
  return value === "domain" || value === "technical";
}

function normalizeEdgeType(value: string) {
  return value
    .replace(/[^a-z0-9]+/giu, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function confidenceValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : 0.5;
}

function unavailableResult(reason: string): GraphExtractionResult {
  return {
    status: "unavailable",
    providerKind: "chat",
    entities: [],
    relations: [],
    reason: truncateText(reason, maxReasonChars),
  };
}

function errorResult(reason: string): GraphExtractionResult {
  return {
    status: "error",
    providerKind: "chat",
    entities: [],
    relations: [],
    reason: truncateText(reason, maxReasonChars),
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
