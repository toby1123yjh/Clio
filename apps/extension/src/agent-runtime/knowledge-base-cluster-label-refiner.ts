import type { StreamFn } from "@earendil-works/pi-agent-core";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import { defaultClioProviderStreamFn } from "./pi-agent-core-run-adapter";
import { modelForProvider, providerLabel } from "./provider-runtime";
import {
  type ProviderId,
  type StoredProviderConfig,
  defaultActiveProvider,
} from "./provider-settings";

export interface KnowledgeBaseClusterLabelRefinementExample {
  sourceId: string;
  title?: string;
  sourceType?: string;
  year?: number;
  venue?: string;
  authors?: string[];
  abstractSnippet?: string;
  topicTerms?: string[];
}

export interface KnowledgeBaseClusterLabelRefinementClusterInput {
  id: string;
  label: string;
  summary?: string;
  clusterBy: "topic";
  sourceCount: number;
  examples: KnowledgeBaseClusterLabelRefinementExample[];
}

export interface KnowledgeBaseClusterLabelRefinementInput {
  clusters: KnowledgeBaseClusterLabelRefinementClusterInput[];
}

export interface KnowledgeBaseClusterLabelRefinementItem {
  clusterId: string;
  status: "refined" | "unavailable" | "error";
  providerKind?: "chat";
  label?: string;
  summary?: string;
  confidence?: number;
  reason?: string;
}

export interface KnowledgeBaseClusterLabelRefinementResult {
  status: "refined" | "unavailable" | "error";
  providerKind?: "chat";
  clusters: KnowledgeBaseClusterLabelRefinementItem[];
  reason?: string;
}

export interface KnowledgeBaseClusterLabelRefiner {
  refine(
    input: KnowledgeBaseClusterLabelRefinementInput,
    options?: { signal?: AbortSignal },
  ): Promise<KnowledgeBaseClusterLabelRefinementResult>;
}

export interface ProviderBackedKnowledgeBaseClusterLabelRefinerOptions {
  loadConfig: () => Promise<StoredProviderConfig | undefined>;
  loadProviderId?: () => Promise<ProviderId>;
  ensureProviderPermission: (
    provider: ProviderId,
    config?: StoredProviderConfig,
  ) => Promise<boolean>;
  streamFn?: StreamFn;
}

const systemPrompt =
  "You refine display labels for topic clusters in a local knowledge base. " +
  "Use only the supplied bounded source-level metadata examples. " +
  "Do not use full PDF text, full webpage text, chunk text, web search, citation evidence, or outside knowledge. " +
  "Return only strict JSON with this shape: " +
  '{"clusters":[{"clusterId":"id","label":"short label","summary":"short summary","confidence":0.7}]}.';

const maxClusters = 12;
const maxExamplesPerCluster = 4;
const maxSourceIdChars = 160;
const maxLabelChars = 80;
const maxSummaryChars = 260;
const maxTitleChars = 180;
const maxSourceTypeChars = 80;
const maxVenueChars = 120;
const maxAuthorChars = 80;
const maxAuthors = 4;
const maxAbstractSnippetChars = 360;
const maxTopicTerms = 8;
const maxTopicTermChars = 80;
const maxReasonChars = 240;

export class ProviderBackedKnowledgeBaseClusterLabelRefiner
  implements KnowledgeBaseClusterLabelRefiner
{
  private readonly loadConfig: ProviderBackedKnowledgeBaseClusterLabelRefinerOptions["loadConfig"];
  private readonly loadProviderId: () => Promise<ProviderId>;
  private readonly ensureProviderPermission: ProviderBackedKnowledgeBaseClusterLabelRefinerOptions["ensureProviderPermission"];
  private readonly streamFn: StreamFn;

  constructor(options: ProviderBackedKnowledgeBaseClusterLabelRefinerOptions) {
    this.loadConfig = options.loadConfig;
    this.loadProviderId = options.loadProviderId ?? (async () => defaultActiveProvider);
    this.ensureProviderPermission = options.ensureProviderPermission;
    this.streamFn = options.streamFn ?? defaultClioProviderStreamFn;
  }

  async refine(
    input: KnowledgeBaseClusterLabelRefinementInput,
    options: { signal?: AbortSignal } = {},
  ): Promise<KnowledgeBaseClusterLabelRefinementResult> {
    const boundedInput = boundKnowledgeBaseClusterLabelRefinementInput(input);
    if (boundedInput.clusters.length === 0) {
      return unavailableResult("kb_cluster_label_refinement_clusters_required");
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
          systemPrompt,
          messages: [
            {
              role: "user",
              content: buildKnowledgeBaseClusterLabelRefinementPrompt(boundedInput),
              timestamp: Date.now(),
            },
          ],
        },
        {
          apiKey: config.apiKey,
          signal: options.signal,
          maxRetries: 0,
          maxTokens: 900,
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
          return errorResult(
            event.error.errorMessage ?? `${label} cluster label refinement failed.`,
          );
        }
      }
      return parseKnowledgeBaseClusterLabelRefinementOutput(
        finalText || streamedText,
        boundedInput,
      );
    } catch (error) {
      if (options.signal?.aborted === true) {
        return unavailableResult("kb_cluster_label_refinement_aborted");
      }
      return errorResult(
        error instanceof Error ? error.message : "kb_cluster_label_refinement_provider_error",
      );
    }
  }
}

export function buildKnowledgeBaseClusterLabelRefinementPrompt(
  input: KnowledgeBaseClusterLabelRefinementInput,
) {
  const bounded = boundKnowledgeBaseClusterLabelRefinementInput(input);
  return [
    "Refine display labels for these topic clusters.",
    "Use only the supplied bounded source-level metadata examples.",
    "Do not use outside knowledge, web search, full PDF text, full webpage text, chunk text, citation evidence, or raw provider context.",
    "Keep labels short noun phrases. Keep summaries concise and browsing-oriented.",
    "Return JSON only.",
    "",
    JSON.stringify(bounded),
  ].join("\n");
}

export function boundKnowledgeBaseClusterLabelRefinementInput(
  input: KnowledgeBaseClusterLabelRefinementInput,
): KnowledgeBaseClusterLabelRefinementInput {
  const seen = new Set<string>();
  const clusters: KnowledgeBaseClusterLabelRefinementClusterInput[] = [];
  for (const cluster of input.clusters) {
    if (clusters.length >= maxClusters) break;
    const id = truncateText(cluster.id, maxSourceIdChars);
    if (id.length === 0 || seen.has(id)) continue;
    seen.add(id);
    const examples = (cluster.examples ?? []).slice(0, maxExamplesPerCluster).map(boundExample);
    clusters.push({
      id,
      label: truncateText(cluster.label, maxLabelChars),
      ...(cluster.summary === undefined
        ? {}
        : { summary: truncateText(cluster.summary, maxSummaryChars) }),
      clusterBy: "topic",
      sourceCount:
        Number.isFinite(cluster.sourceCount) && cluster.sourceCount > 0
          ? Math.floor(cluster.sourceCount)
          : examples.length,
      examples,
    });
  }
  return { clusters };
}

function boundExample(
  example: KnowledgeBaseClusterLabelRefinementExample,
): KnowledgeBaseClusterLabelRefinementExample {
  return {
    sourceId: truncateText(example.sourceId, maxSourceIdChars),
    ...(example.title === undefined ? {} : { title: truncateText(example.title, maxTitleChars) }),
    ...(example.sourceType === undefined
      ? {}
      : { sourceType: truncateText(example.sourceType, maxSourceTypeChars) }),
    ...(example.year === undefined || !Number.isFinite(example.year)
      ? {}
      : { year: Math.floor(example.year) }),
    ...(example.venue === undefined ? {} : { venue: truncateText(example.venue, maxVenueChars) }),
    ...(example.authors === undefined
      ? {}
      : {
          authors: example.authors
            .map((author) => truncateText(author, maxAuthorChars))
            .filter((author) => author.length > 0)
            .slice(0, maxAuthors),
        }),
    ...(example.abstractSnippet === undefined
      ? {}
      : { abstractSnippet: truncateText(example.abstractSnippet, maxAbstractSnippetChars) }),
    ...(example.topicTerms === undefined
      ? {}
      : {
          topicTerms: uniqueStrings(example.topicTerms, maxTopicTerms).map((term) =>
            truncateText(term, maxTopicTermChars),
          ),
        }),
  };
}

function parseKnowledgeBaseClusterLabelRefinementOutput(
  output: string,
  input: KnowledgeBaseClusterLabelRefinementInput,
): KnowledgeBaseClusterLabelRefinementResult {
  const text = output.trim();
  if (text.length === 0) return errorResult("kb_cluster_label_refinement_empty_output");

  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonObject(text));
  } catch {
    return errorResult("kb_cluster_label_refinement_malformed_json");
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.clusters)) {
    return errorResult("kb_cluster_label_refinement_invalid_json");
  }

  const inputIds = new Set(input.clusters.map((cluster) => cluster.id));
  const seen = new Set<string>();
  const clusters: KnowledgeBaseClusterLabelRefinementItem[] = [];
  for (const item of parsed.clusters) {
    if (!isRecord(item) || typeof item.clusterId !== "string") continue;
    const clusterId = truncateText(item.clusterId, maxSourceIdChars);
    if (!inputIds.has(clusterId) || seen.has(clusterId)) continue;
    seen.add(clusterId);
    const label = typeof item.label === "string" ? truncateText(item.label, maxLabelChars) : "";
    if (label.length === 0) continue;
    const summary =
      typeof item.summary === "string" ? truncateText(item.summary, maxSummaryChars) : "";
    const confidence =
      typeof item.confidence === "number" && Number.isFinite(item.confidence)
        ? Math.max(0, Math.min(1, item.confidence))
        : undefined;
    clusters.push({
      clusterId,
      status: "refined",
      providerKind: "chat",
      label,
      ...(summary.length === 0 ? {} : { summary }),
      ...(confidence === undefined ? {} : { confidence }),
    });
  }

  if (clusters.length === 0) {
    return errorResult("kb_cluster_label_refinement_missing_labels");
  }
  return { status: "refined", providerKind: "chat", clusters };
}

function unavailableResult(reason: string): KnowledgeBaseClusterLabelRefinementResult {
  return {
    status: "unavailable",
    providerKind: "chat",
    clusters: [],
    reason: truncateText(reason, maxReasonChars),
  };
}

function errorResult(reason: string): KnowledgeBaseClusterLabelRefinementResult {
  return {
    status: "error",
    providerKind: "chat",
    clusters: [],
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

function uniqueStrings(values: string[], limit: number) {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const value of values) {
    if (next.length >= limit) break;
    const normalized = value.replace(/\s+/g, " ").trim();
    if (normalized.length === 0) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(normalized);
  }
  return next;
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
