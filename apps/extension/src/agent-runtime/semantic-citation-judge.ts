import type { StreamFn } from "@earendil-works/pi-agent-core";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import { defaultClioProviderStreamFn } from "./pi-agent-core-run-adapter";
import { modelForProvider, providerLabel } from "./provider-runtime";
import {
  type ProviderId,
  type StoredProviderConfig,
  defaultActiveProvider,
} from "./provider-settings";

export interface SemanticCitationJudgeInput {
  question: string;
  claims: Array<{
    claimId: string;
    claimPreview: string;
    citations: Array<{
      citationId: string;
      evidenceId: string;
      evidenceTitle?: string;
      evidenceExcerpt: string;
    }>;
  }>;
}

export interface SemanticCitationJudgeResult {
  status: "supported" | "unsupported" | "unavailable" | "error";
  checkedClaimCount: number;
  unsupportedClaimIds: string[];
  providerKind?: "chat" | "embedding";
  reason?: string;
}

export interface SemanticCitationJudge {
  judge(
    input: SemanticCitationJudgeInput,
    options?: { signal?: AbortSignal },
  ): Promise<SemanticCitationJudgeResult>;
}

export interface ProviderBackedSemanticCitationJudgeOptions {
  loadConfig: () => Promise<StoredProviderConfig | undefined>;
  loadProviderId?: () => Promise<ProviderId>;
  ensureProviderPermission: (
    provider: ProviderId,
    config?: StoredProviderConfig,
  ) => Promise<boolean>;
  streamFn?: StreamFn;
}

const semanticJudgeSystemPrompt =
  "You verify whether local evidence entails each claim. " +
  "Use only the provided claim previews and cited evidence excerpts. " +
  "Return only strict JSON with this shape: " +
  '{"claims":[{"claimId":"claim:0","supported":true,"reason":"short reason"}]}. ' +
  "Mark supported true only when the evidence directly supports the claim.";

const maxJudgeQuestionChars = 500;
const maxJudgeClaimChars = 240;
const maxJudgeEvidenceChars = 900;
const maxJudgeClaims = 6;
const maxJudgeCitationsPerClaim = 4;

export class ProviderBackedSemanticCitationJudge implements SemanticCitationJudge {
  private readonly loadConfig: ProviderBackedSemanticCitationJudgeOptions["loadConfig"];
  private readonly loadProviderId: () => Promise<ProviderId>;
  private readonly ensureProviderPermission: ProviderBackedSemanticCitationJudgeOptions["ensureProviderPermission"];
  private readonly streamFn: StreamFn;

  constructor(options: ProviderBackedSemanticCitationJudgeOptions) {
    this.loadConfig = options.loadConfig;
    this.loadProviderId = options.loadProviderId ?? (async () => defaultActiveProvider);
    this.ensureProviderPermission = options.ensureProviderPermission;
    this.streamFn = options.streamFn ?? defaultClioProviderStreamFn;
  }

  async judge(
    input: SemanticCitationJudgeInput,
    options: { signal?: AbortSignal } = {},
  ): Promise<SemanticCitationJudgeResult> {
    const boundedInput = boundSemanticJudgeInput(input);
    if (boundedInput.claims.length === 0) {
      return supportedResult(0);
    }

    const config = await this.loadConfig().catch(() => undefined);
    const provider =
      config?.provider ?? (await this.loadProviderId().catch(() => defaultActiveProvider));
    const label = providerLabel(provider);
    if (config === undefined) {
      return unavailableResult(boundedInput, `${label} provider is not configured.`);
    }

    const permissionGranted = await this.ensureProviderPermission(provider, config).catch(
      () => false,
    );
    if (!permissionGranted) {
      return unavailableResult(boundedInput, `${label} provider permission is unavailable.`);
    }

    try {
      const stream = await this.streamFn(
        modelForProvider(config),
        {
          systemPrompt: semanticJudgeSystemPrompt,
          messages: [
            {
              role: "user",
              content: buildSemanticCitationJudgePrompt(boundedInput),
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
        if (event.type === "done") {
          finalText = assistantText(event.message) || streamedText;
        }
        if (event.type === "error") {
          return errorResult(
            boundedInput,
            event.error.errorMessage ?? `${label} semantic judge failed.`,
          );
        }
      }

      return parseSemanticJudgeOutput(finalText || streamedText, boundedInput);
    } catch (error) {
      if (options.signal?.aborted === true) {
        return unavailableResult(boundedInput, "semantic_judge_aborted");
      }
      return errorResult(
        boundedInput,
        error instanceof Error ? error.message : "semantic_judge_provider_error",
      );
    }
  }
}

export function buildSemanticCitationJudgePrompt(input: SemanticCitationJudgeInput) {
  return [
    "Decide whether each claim is supported by its cited local evidence excerpts.",
    "Do not use outside knowledge, web search, full documents, or unstated source text.",
    "Return JSON only.",
    "",
    JSON.stringify(boundSemanticJudgeInput(input)),
  ].join("\n");
}

export function boundSemanticJudgeInput(
  input: SemanticCitationJudgeInput,
): SemanticCitationJudgeInput {
  return {
    question: truncateText(input.question, maxJudgeQuestionChars),
    claims: input.claims.slice(0, maxJudgeClaims).map((claim) => ({
      claimId: truncateText(claim.claimId, 80),
      claimPreview: truncateText(claim.claimPreview, maxJudgeClaimChars),
      citations: claim.citations.slice(0, maxJudgeCitationsPerClaim).map((citation) => ({
        citationId: truncateText(citation.citationId, 120),
        evidenceId: truncateText(citation.evidenceId, 160),
        ...(citation.evidenceTitle === undefined
          ? {}
          : { evidenceTitle: truncateText(citation.evidenceTitle, 180) }),
        evidenceExcerpt: truncateText(citation.evidenceExcerpt, maxJudgeEvidenceChars),
      })),
    })),
  };
}

function parseSemanticJudgeOutput(
  output: string,
  input: SemanticCitationJudgeInput,
): SemanticCitationJudgeResult {
  const text = output.trim();
  if (text.length === 0) return errorResult(input, "semantic_judge_empty_output");

  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonObject(text));
  } catch {
    return errorResult(input, "semantic_judge_malformed_json");
  }
  if (!isRecord(parsed)) return errorResult(input, "semantic_judge_invalid_json");

  const rawClaims = Array.isArray(parsed.claims)
    ? parsed.claims
    : Array.isArray(parsed.verdicts)
      ? parsed.verdicts
      : undefined;
  if (rawClaims === undefined) return errorResult(input, "semantic_judge_missing_claims");

  const verdicts = new Map<string, { supported: boolean; reason?: string }>();
  for (const rawClaim of rawClaims) {
    if (!isRecord(rawClaim) || typeof rawClaim.claimId !== "string") {
      return errorResult(input, "semantic_judge_invalid_claim_verdict");
    }
    const supported = readSupportedVerdict(rawClaim.supported);
    if (supported === undefined) return errorResult(input, "semantic_judge_invalid_supported");
    verdicts.set(rawClaim.claimId, {
      supported,
      ...(typeof rawClaim.reason === "string" ? { reason: rawClaim.reason } : {}),
    });
  }

  const unsupportedClaimIds: string[] = [];
  const reasons: string[] = [];
  for (const claim of input.claims) {
    const verdict = verdicts.get(claim.claimId);
    if (verdict === undefined) return errorResult(input, "semantic_judge_missing_claim_verdict");
    if (!verdict.supported) {
      unsupportedClaimIds.push(claim.claimId);
      if (verdict.reason !== undefined) reasons.push(verdict.reason);
    }
  }

  if (unsupportedClaimIds.length === 0) return supportedResult(input.claims.length);
  return {
    status: "unsupported",
    checkedClaimCount: input.claims.length,
    unsupportedClaimIds,
    providerKind: "chat",
    reason: truncateText(reasons.join("; ") || "semantic_judge_found_unsupported_claims", 240),
  };
}

function supportedResult(checkedClaimCount: number): SemanticCitationJudgeResult {
  return {
    status: "supported",
    checkedClaimCount,
    unsupportedClaimIds: [],
    providerKind: "chat",
  };
}

function unavailableResult(
  input: SemanticCitationJudgeInput,
  reason: string,
): SemanticCitationJudgeResult {
  return {
    status: "unavailable",
    checkedClaimCount: input.claims.length,
    unsupportedClaimIds: [],
    providerKind: "chat",
    reason: truncateText(reason, 240),
  };
}

function errorResult(
  input: SemanticCitationJudgeInput,
  reason: string,
): SemanticCitationJudgeResult {
  return {
    status: "error",
    checkedClaimCount: input.claims.length,
    unsupportedClaimIds: [],
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

function readSupportedVerdict(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === "supported" || normalized === "true" || normalized === "yes") return true;
  if (normalized === "unsupported" || normalized === "false" || normalized === "no") return false;
  return undefined;
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
