import type { StreamFn } from "@earendil-works/pi-agent-core";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import { defaultClioProviderStreamFn } from "./pi-agent-core-run-adapter";
import { modelForProvider, providerLabel } from "./provider-runtime";
import type { ProviderId, StoredProviderConfig } from "./provider-settings";
import {
  type VisionProviderSettings,
  defaultVisionProviderSettings,
  resolveVisionProviderConfig,
} from "./vision-provider-settings";

export interface FigureVisionImageInput {
  base64: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  byteLength?: number;
}

export interface FigureVisionAnalysisInput {
  analysisId: string;
  imageId: string;
  pageNumber: number;
  label?: string;
  caption?: string;
  pageContext?: string;
  image: FigureVisionImageInput;
}

export interface FigureVisionAnalysisResult {
  status: "analyzed" | "unavailable" | "error";
  analysisId: string;
  imageId: string;
  providerKind?: "chat";
  summary?: string;
  chartType?: string;
  extractedLabels: string[];
  extractedValues: string[];
  claims: Array<{
    claimId: string;
    text: string;
    confidence: "low" | "medium" | "high";
  }>;
  reason?: string;
}

export interface FigureVisionAnalyzer {
  analyze(
    input: FigureVisionAnalysisInput,
    options?: { signal?: AbortSignal },
  ): Promise<FigureVisionAnalysisResult>;
}

export interface ProviderBackedFigureVisionAnalyzerOptions {
  loadVisionProviderSettings?: () => Promise<VisionProviderSettings>;
  loadActiveProviderConfig?: () => Promise<StoredProviderConfig | undefined>;
  loadConfig?: () => Promise<StoredProviderConfig | undefined>;
  ensureProviderPermission: (
    provider: ProviderId,
    config?: StoredProviderConfig,
  ) => Promise<boolean>;
  streamFn?: StreamFn;
}

const figureVisionSystemPrompt =
  "You analyze one scientific-paper figure or chart image. " +
  "Use only the supplied image and bounded caption/page context. " +
  "Do not infer from unstated full-document text. " +
  "Return only strict JSON with this shape: " +
  '{"summary":"short","chartType":"bar|line|scatter|diagram|table|unknown","extractedLabels":["x"],"extractedValues":["1"],"claims":[{"claimId":"claim:0","text":"short claim","confidence":"medium"}]}.';

const maxFigureCaptionChars = 320;
const maxFigurePageContextChars = 700;
const maxFigureSummaryChars = 500;
const maxFigureChartTypeChars = 80;
const maxFigureLabelChars = 80;
const maxFigureValueChars = 80;
const maxFigureLabels = 12;
const maxFigureValues = 20;
const maxFigureClaims = 6;
const maxFigureClaimChars = 220;
const maxVisionImageBase64Chars = 5_000_000;

export class ProviderBackedFigureVisionAnalyzer implements FigureVisionAnalyzer {
  private readonly loadVisionProviderSettings: () => Promise<VisionProviderSettings>;
  private readonly loadActiveProviderConfig: () => Promise<StoredProviderConfig | undefined>;
  private readonly ensureProviderPermission: ProviderBackedFigureVisionAnalyzerOptions["ensureProviderPermission"];
  private readonly streamFn: StreamFn;

  constructor(options: ProviderBackedFigureVisionAnalyzerOptions) {
    this.loadVisionProviderSettings =
      options.loadVisionProviderSettings ?? (async () => defaultVisionProviderSettings());
    this.loadActiveProviderConfig =
      options.loadActiveProviderConfig ?? options.loadConfig ?? (async () => undefined);
    this.ensureProviderPermission = options.ensureProviderPermission;
    this.streamFn = options.streamFn ?? defaultClioProviderStreamFn;
  }

  async analyze(
    input: FigureVisionAnalysisInput,
    options: { signal?: AbortSignal } = {},
  ): Promise<FigureVisionAnalysisResult> {
    const boundedInput = boundFigureVisionInput(input);
    if (boundedInput.image.base64.length === 0) {
      return unavailableFigureResult(boundedInput, "figure_image_input_required");
    }

    const [visionSettings, activeProviderConfig] = await Promise.all([
      this.loadVisionProviderSettings().catch(() => defaultVisionProviderSettings()),
      this.loadActiveProviderConfig().catch(() => undefined),
    ]);
    const resolved = resolveVisionConfigSoft(visionSettings, activeProviderConfig);
    if (resolved === undefined) {
      return unavailableFigureResult(boundedInput, "Vision analysis provider is not configured.");
    }

    const config = resolved.config;
    const provider = config.provider;
    const label = providerLabel(provider);

    const permissionGranted = await this.ensureProviderPermission(provider, config).catch(
      () => false,
    );
    if (!permissionGranted) {
      return unavailableFigureResult(boundedInput, `${label} provider permission is unavailable.`);
    }

    const model = modelForProvider(config);
    if (!model.input.includes("image")) {
      return unavailableFigureResult(boundedInput, `${label} model does not support image input.`);
    }

    try {
      const stream = await this.streamFn(
        model,
        {
          systemPrompt: figureVisionSystemPrompt,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: buildFigureVisionPrompt(boundedInput) },
                {
                  type: "image",
                  data: boundedInput.image.base64,
                  mimeType: boundedInput.image.mimeType,
                },
              ],
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
          timeoutMs: 45_000,
        },
      );
      let streamedText = "";
      let finalText = "";
      for await (const event of stream) {
        if (event.type === "text_delta") streamedText = `${streamedText}${event.delta}`;
        if (event.type === "done") finalText = assistantText(event.message) || streamedText;
        if (event.type === "error") {
          return errorFigureResult(
            boundedInput,
            event.error.errorMessage ?? `${label} figure vision analysis failed.`,
          );
        }
      }
      return parseFigureVisionOutput(finalText || streamedText, boundedInput);
    } catch (error) {
      if (options.signal?.aborted === true) {
        return unavailableFigureResult(boundedInput, "figure_vision_aborted");
      }
      return errorFigureResult(
        boundedInput,
        error instanceof Error ? error.message : "figure_vision_provider_error",
      );
    }
  }
}

export function buildFigureVisionPrompt(input: FigureVisionAnalysisInput) {
  const bounded = boundFigureVisionInput(input);
  return [
    "Analyze this single figure image for a scientific knowledge base.",
    "Use only the image, caption, and bounded page context below.",
    "Do not use full PDF text, web search, or outside document context.",
    "Return JSON only.",
    "",
    JSON.stringify({
      analysisId: bounded.analysisId,
      imageId: bounded.imageId,
      pageNumber: bounded.pageNumber,
      label: bounded.label,
      caption: bounded.caption,
      pageContext: bounded.pageContext,
      image: {
        mimeType: bounded.image.mimeType,
        byteLength: bounded.image.byteLength,
        base64Length: bounded.image.base64.length,
      },
    }),
  ].join("\n");
}

export function boundFigureVisionInput(
  input: FigureVisionAnalysisInput,
): FigureVisionAnalysisInput {
  return {
    analysisId: truncateText(input.analysisId, 120),
    imageId: truncateText(input.imageId, 120),
    pageNumber: input.pageNumber,
    ...(input.label === undefined ? {} : { label: truncateText(input.label, 120) }),
    ...(input.caption === undefined
      ? {}
      : { caption: truncateText(input.caption, maxFigureCaptionChars) }),
    ...(input.pageContext === undefined
      ? {}
      : { pageContext: truncateText(input.pageContext, maxFigurePageContextChars) }),
    image: {
      base64: truncateBase64(input.image.base64),
      mimeType: input.image.mimeType,
      ...(input.image.byteLength === undefined ? {} : { byteLength: input.image.byteLength }),
    },
  };
}

function parseFigureVisionOutput(
  output: string,
  input: FigureVisionAnalysisInput,
): FigureVisionAnalysisResult {
  const text = output.trim();
  if (text.length === 0) return errorFigureResult(input, "figure_vision_empty_output");

  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonObject(text));
  } catch {
    return errorFigureResult(input, "figure_vision_malformed_json");
  }
  if (!isRecord(parsed)) return errorFigureResult(input, "figure_vision_invalid_json");

  return {
    status: "analyzed",
    analysisId: input.analysisId,
    imageId: input.imageId,
    providerKind: "chat",
    ...(typeof parsed.summary === "string"
      ? { summary: truncateText(parsed.summary, maxFigureSummaryChars) }
      : {}),
    ...(typeof parsed.chartType === "string"
      ? { chartType: truncateText(parsed.chartType, maxFigureChartTypeChars) }
      : {}),
    extractedLabels: boundedStringArray(
      parsed.extractedLabels,
      maxFigureLabels,
      maxFigureLabelChars,
    ),
    extractedValues: boundedStringArray(
      parsed.extractedValues,
      maxFigureValues,
      maxFigureValueChars,
    ),
    claims: parseFigureClaims(parsed.claims),
  };
}

function parseFigureClaims(value: unknown): FigureVisionAnalysisResult["claims"] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, maxFigureClaims).flatMap((item, index) => {
    if (!isRecord(item) || typeof item.text !== "string") return [];
    return [
      {
        claimId:
          typeof item.claimId === "string" ? truncateText(item.claimId, 120) : `claim:${index}`,
        text: truncateText(item.text, maxFigureClaimChars),
        confidence: figureClaimConfidence(item.confidence),
      },
    ];
  });
}

function resolveVisionConfigSoft(
  settings: VisionProviderSettings,
  activeProviderConfig: StoredProviderConfig | undefined,
) {
  try {
    return resolveVisionProviderConfig(settings, activeProviderConfig);
  } catch {
    return undefined;
  }
}

function figureClaimConfidence(value: unknown): "low" | "medium" | "high" {
  return value === "low" || value === "medium" || value === "high" ? value : "low";
}

function unavailableFigureResult(
  input: FigureVisionAnalysisInput,
  reason: string,
): FigureVisionAnalysisResult {
  return {
    status: "unavailable",
    analysisId: input.analysisId,
    imageId: input.imageId,
    providerKind: "chat",
    extractedLabels: [],
    extractedValues: [],
    claims: [],
    reason: truncateText(reason, 240),
  };
}

function errorFigureResult(
  input: FigureVisionAnalysisInput,
  reason: string,
): FigureVisionAnalysisResult {
  return {
    status: "error",
    analysisId: input.analysisId,
    imageId: input.imageId,
    providerKind: "chat",
    extractedLabels: [],
    extractedValues: [],
    claims: [],
    reason: truncateText(reason, 240),
  };
}

function assistantText(message: AssistantMessage) {
  return message.content
    .map((item) => (item.type === "text" ? item.text : ""))
    .filter((item) => item.length > 0)
    .join("");
}

function boundedStringArray(value: unknown, maxItems: number, maxChars: number) {
  if (!Array.isArray(value)) return [];
  return value
    .flatMap((item) => (typeof item === "string" ? [truncateText(item, maxChars)] : []))
    .filter((item) => item.length > 0)
    .slice(0, maxItems);
}

function truncateBase64(input: string) {
  const compact = input.replace(/\s+/g, "");
  return compact.slice(0, maxVisionImageBase64Chars);
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
