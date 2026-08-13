import { estimateE5Tokens } from "./text";

export const SOURCE_FINE_RANK_PROMPT_VERSION = "source-fine-rank-v1";

export const SOURCE_FINE_RANK_LIMITS = {
  queryChars: 2_000,
  sourceIdChars: 192,
  sourceTitleChars: 500,
  sourceTypeChars: 120,
  sourceUrlChars: 1_000,
  abstractChars: 1_200,
  keywordChars: 120,
  maxKeywords: 20,
  headingChars: 180,
  maxHeadings: 16,
  maxEvidence: 4,
  evidenceIdChars: 192,
  chunkIdChars: 192,
  evidenceExcerptChars: 1_200,
  maxWikiArtifacts: 8,
  artifactIdChars: 192,
  artifactKindChars: 80,
  artifactTitleChars: 300,
  artifactOutlineChars: 1_600,
  maxArtifactEvidenceRefs: 16,
  maxCandidates: 32,
  maxInputTokens: 12_000,
  maxOutputTokens: 2_000,
  maxReasonChars: 500,
  maxEvidenceRefs: 12,
} as const;

export type SourceFineRankStrength = "strict" | "balanced" | "broad";
export type SourceFineRankRelevance = "high" | "medium" | "low" | "irrelevant";
export type SourceFineRankDecision = "keep" | "drop";

export type SourceFineRankReasonCode =
  | "wiki_disabled"
  | "wiki_missing"
  | "wiki_stale"
  | "wiki_corrupt"
  | "model_not_configured"
  | "permission_denied"
  | "budget_exceeded"
  | "timeout"
  | "provider_error"
  | "malformed_output"
  | "candidate_mismatch"
  | "invalid_evidence_refs"
  | "input_invalid";

export interface SourceFineRankEvidenceInput {
  id: string;
  chunkId: string;
  excerpt: string;
  pageNo?: number;
  sectionPath?: string;
}

export interface SourceFineRankWikiInput {
  artifactId: string;
  artifactKind: string;
  title: string;
  outline: string;
  evidenceRefs: string[];
}

export interface SourceFineRankCandidateInput {
  source: {
    id: string;
    title: string;
    sourceType: string;
    sourceUrl?: string;
    abstract?: string;
    keywords: string[];
    sectionHeadings: string[];
  };
  evidence: SourceFineRankEvidenceInput[];
  wiki: SourceFineRankWikiInput[];
}

export interface SourceFineRankRequest {
  query: string;
  strength: SourceFineRankStrength;
  promptVersion: string;
  candidates: SourceFineRankCandidateInput[];
}

export interface SourceFineRankJudgment {
  sourceId: string;
  decision: SourceFineRankDecision;
  relevance: SourceFineRankRelevance;
  reason: string;
  confidence: number;
  evidenceRefs: string[];
}

export interface SourceFineRankProviderResult {
  judgments: SourceFineRankJudgment[];
  model?: string;
  promptVersion?: string;
  inputRefs?: string[];
  inputTokens?: number;
  outputTokens?: number;
  latencyMs?: number;
}

export interface SourceFineRankProvider {
  isEnabled(): Promise<boolean>;
  rank(input: SourceFineRankRequest, options?: { signal?: AbortSignal }): Promise<SourceFineRankProviderResult>;
}

export interface SourceFineRankTrace {
  inputCount: number;
  keptCount: number;
  droppedCount: number;
  model?: string;
  promptVersion?: string;
  inputRefs?: string[];
  inputTokens?: number;
  outputTokens?: number;
  latencyMs?: number;
}

export interface SourceFineRankContext {
  request?: SourceFineRankRequest;
}

export function allowedRelevanceForStrength(
  strength: SourceFineRankStrength,
): SourceFineRankRelevance[] {
  return strength === "strict"
    ? ["high"]
    : strength === "balanced"
      ? ["high", "medium"]
      : ["high", "medium", "low"];
}

export function relevanceRank(value: SourceFineRankRelevance) {
  return value === "high" ? 3 : value === "medium" ? 2 : value === "low" ? 1 : 0;
}

export function boundSourceFineRankRequest(input: SourceFineRankRequest): SourceFineRankRequest {
  if (input.candidates.length > SOURCE_FINE_RANK_LIMITS.maxCandidates) {
    throw new SourceFineRankValidationError(
      "budget_exceeded",
      "Fine Rank candidate count exceeded its batch budget.",
    );
  }
  const candidates = input.candidates.map((candidate) => ({
    source: {
      id: boundString(candidate.source.id, SOURCE_FINE_RANK_LIMITS.sourceIdChars),
      title: boundString(candidate.source.title, SOURCE_FINE_RANK_LIMITS.sourceTitleChars),
      sourceType: boundString(candidate.source.sourceType, SOURCE_FINE_RANK_LIMITS.sourceTypeChars),
      ...(candidate.source.sourceUrl === undefined
        ? {}
        : { sourceUrl: boundString(candidate.source.sourceUrl, SOURCE_FINE_RANK_LIMITS.sourceUrlChars) }),
      ...(candidate.source.abstract === undefined
        ? {}
        : { abstract: boundString(candidate.source.abstract, SOURCE_FINE_RANK_LIMITS.abstractChars) }),
      keywords: uniqueBoundedStrings(
        candidate.source.keywords,
        SOURCE_FINE_RANK_LIMITS.maxKeywords,
        SOURCE_FINE_RANK_LIMITS.keywordChars,
      ),
      sectionHeadings: uniqueBoundedStrings(
        candidate.source.sectionHeadings,
        SOURCE_FINE_RANK_LIMITS.maxHeadings,
        SOURCE_FINE_RANK_LIMITS.headingChars,
      ),
    },
    evidence: candidate.evidence.slice(0, SOURCE_FINE_RANK_LIMITS.maxEvidence).map((evidence) => ({
      id: boundString(evidence.id, SOURCE_FINE_RANK_LIMITS.evidenceIdChars),
      chunkId: boundString(evidence.chunkId, SOURCE_FINE_RANK_LIMITS.chunkIdChars),
      excerpt: boundString(evidence.excerpt, SOURCE_FINE_RANK_LIMITS.evidenceExcerptChars),
      ...(evidence.pageNo === undefined ? {} : { pageNo: positiveInteger(evidence.pageNo) }),
      ...(evidence.sectionPath === undefined
        ? {}
        : { sectionPath: boundString(evidence.sectionPath, SOURCE_FINE_RANK_LIMITS.headingChars) }),
    })),
    wiki: candidate.wiki.slice(0, SOURCE_FINE_RANK_LIMITS.maxWikiArtifacts).map((artifact) => ({
      artifactId: boundString(artifact.artifactId, SOURCE_FINE_RANK_LIMITS.artifactIdChars),
      artifactKind: boundString(artifact.artifactKind, SOURCE_FINE_RANK_LIMITS.artifactKindChars),
      title: boundString(artifact.title, SOURCE_FINE_RANK_LIMITS.artifactTitleChars),
      outline: boundString(artifact.outline, SOURCE_FINE_RANK_LIMITS.artifactOutlineChars),
      evidenceRefs: uniqueBoundedStrings(
        artifact.evidenceRefs,
        SOURCE_FINE_RANK_LIMITS.maxArtifactEvidenceRefs,
        SOURCE_FINE_RANK_LIMITS.evidenceIdChars,
      ),
    })),
  }));
  return {
    query: boundString(input.query, SOURCE_FINE_RANK_LIMITS.queryChars),
    strength: input.strength,
    promptVersion: boundString(input.promptVersion, 120),
    candidates,
  };
}

export function validateSourceFineRankProviderResult(
  request: SourceFineRankRequest,
  result: unknown,
): SourceFineRankProviderResult {
  if (!isRecord(result) || !Array.isArray(result.judgments)) {
    throw new SourceFineRankValidationError("malformed_output", "Fine Rank output must contain judgments.");
  }
  const expected = new Map(request.candidates.map((candidate) => [candidate.source.id, candidate]));
  const seen = new Set<string>();
  const judgments: SourceFineRankJudgment[] = [];
  for (const value of result.judgments) {
    if (!isRecord(value) || typeof value.sourceId !== "string") {
      throw new SourceFineRankValidationError("malformed_output", "Fine Rank judgment is malformed.");
    }
    const sourceId = value.sourceId;
    if (!expected.has(sourceId) || seen.has(sourceId)) {
      throw new SourceFineRankValidationError("candidate_mismatch", "Fine Rank candidate coverage is invalid.");
    }
    if (value.decision !== "keep" && value.decision !== "drop") {
      throw new SourceFineRankValidationError("malformed_output", "Fine Rank decision is invalid.");
    }
    if (
      value.relevance !== "high" &&
      value.relevance !== "medium" &&
      value.relevance !== "low" &&
      value.relevance !== "irrelevant"
    ) {
      throw new SourceFineRankValidationError("malformed_output", "Fine Rank relevance is invalid.");
    }
    if (typeof value.reason !== "string" || value.reason.length === 0) {
      throw new SourceFineRankValidationError("malformed_output", "Fine Rank reason is required.");
    }
    if (typeof value.confidence !== "number" || !Number.isFinite(value.confidence) || value.confidence < 0 || value.confidence > 1) {
      throw new SourceFineRankValidationError("malformed_output", "Fine Rank confidence must be between 0 and 1.");
    }
    if (!Array.isArray(value.evidenceRefs) || value.evidenceRefs.some((ref) => typeof ref !== "string")) {
      throw new SourceFineRankValidationError("malformed_output", "Fine Rank evidence refs are invalid.");
    }
    if (value.evidenceRefs.length > SOURCE_FINE_RANK_LIMITS.maxEvidenceRefs) {
      throw new SourceFineRankValidationError("malformed_output", "Fine Rank evidence refs exceeded their bound.");
    }
    const candidate = expected.get(sourceId);
    const allowedRefs = new Set([
      ...(candidate?.evidence.map((evidence) => evidence.id) ?? []),
      ...(candidate?.evidence.map((evidence) => evidence.chunkId) ?? []),
      ...(candidate?.wiki.flatMap((artifact) => artifact.evidenceRefs) ?? []),
      ...(candidate?.wiki.map((artifact) => artifact.artifactId) ?? []),
    ]);
    if (value.evidenceRefs.some((ref) => !allowedRefs.has(ref))) {
      throw new SourceFineRankValidationError("invalid_evidence_refs", "Fine Rank referenced evidence outside its candidate.");
    }
    seen.add(sourceId);
    judgments.push({
      sourceId,
      decision: value.decision,
      relevance: value.relevance,
      reason: boundString(value.reason, SOURCE_FINE_RANK_LIMITS.maxReasonChars),
      confidence: value.confidence,
      evidenceRefs: [...new Set(value.evidenceRefs)].slice(0, SOURCE_FINE_RANK_LIMITS.maxEvidenceRefs),
    });
  }
  if (seen.size !== expected.size) {
    throw new SourceFineRankValidationError("candidate_mismatch", "Fine Rank must judge every candidate exactly once.");
  }
  const inputRefs = result.inputRefs;
  if (inputRefs !== undefined) {
    if (!Array.isArray(inputRefs) || !inputRefs.every((ref) => typeof ref === "string")) {
      throw new SourceFineRankValidationError("invalid_evidence_refs", "Fine Rank input refs are invalid.");
    }
    const allowedInputRefs = new Set<string>();
    for (const candidate of request.candidates) {
      allowedInputRefs.add(candidate.source.id);
      for (const evidence of candidate.evidence) {
        allowedInputRefs.add(evidence.id);
        allowedInputRefs.add(evidence.chunkId);
      }
      for (const artifact of candidate.wiki) {
        allowedInputRefs.add(artifact.artifactId);
        artifact.evidenceRefs.forEach((ref) => allowedInputRefs.add(ref));
      }
    }
    if (inputRefs.some((ref) => !allowedInputRefs.has(ref))) {
      throw new SourceFineRankValidationError(
        "invalid_evidence_refs",
        "Fine Rank input refs must belong to the supplied candidates.",
      );
    }
  }
  return {
    judgments,
    ...(typeof result.model === "string" ? { model: boundString(result.model, 240) } : {}),
    ...(typeof result.promptVersion === "string" ? { promptVersion: boundString(result.promptVersion, 120) } : {}),
    ...(Array.isArray(inputRefs)
      ? { inputRefs: [...new Set(inputRefs)].slice(0, SOURCE_FINE_RANK_LIMITS.maxCandidates * 4) }
      : {}),
    ...(nonNegativeNumber(result.inputTokens) ? { inputTokens: result.inputTokens } : {}),
    ...(nonNegativeNumber(result.outputTokens) ? { outputTokens: result.outputTokens } : {}),
    ...(nonNegativeNumber(result.latencyMs) ? { latencyMs: result.latencyMs } : {}),
  };
}

export function isSourceFineRankRequest(value: unknown): value is SourceFineRankRequest {
  if (!isRecord(value) || typeof value.query !== "string" || typeof value.promptVersion !== "string") {
    return false;
  }
  if (containsFineRankBoundaryLeak(value)) return false;
  if (value.strength !== "strict" && value.strength !== "balanced" && value.strength !== "broad") {
    return false;
  }
  if (!Array.isArray(value.candidates)) return false;
  if (value.candidates.length === 0 || value.candidates.length > SOURCE_FINE_RANK_LIMITS.maxCandidates) {
    return false;
  }
  return value.candidates.every((candidate) => {
    if (!isRecord(candidate) || !isRecord(candidate.source)) return false;
    const source = candidate.source;
    return (
      typeof source.id === "string" &&
      typeof source.title === "string" &&
      typeof source.sourceType === "string" &&
      Array.isArray(source.keywords) &&
      source.keywords.every((keyword) => typeof keyword === "string") &&
      Array.isArray(source.sectionHeadings) &&
      source.sectionHeadings.every((heading) => typeof heading === "string") &&
      Array.isArray(candidate.evidence) &&
      candidate.evidence.length <= SOURCE_FINE_RANK_LIMITS.maxEvidence &&
      candidate.evidence.every(
        (evidence) =>
          isRecord(evidence) &&
          typeof evidence.id === "string" &&
          typeof evidence.chunkId === "string" &&
          typeof evidence.excerpt === "string",
      ) &&
      Array.isArray(candidate.wiki) &&
      candidate.wiki.length > 0 &&
      candidate.wiki.length <= SOURCE_FINE_RANK_LIMITS.maxWikiArtifacts &&
      candidate.wiki.every(
        (artifact) =>
          isRecord(artifact) &&
          typeof artifact.artifactId === "string" &&
          typeof artifact.artifactKind === "string" &&
          typeof artifact.title === "string" &&
          typeof artifact.outline === "string" &&
          Array.isArray(artifact.evidenceRefs) &&
          artifact.evidenceRefs.every((ref) => typeof ref === "string"),
      )
    );
  });
}

function containsFineRankBoundaryLeak(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsFineRankBoundaryLeak);
  if (!isRecord(value)) return false;
  const forbidden = [
    "apiKey",
    "providerSecret",
    "secret",
    "fullText",
    "normalizedText",
    "pdfBytes",
    "documentBytes",
  ];
  if (Object.keys(value).some((key) => forbidden.includes(key))) return true;
  return Object.values(value).some(containsFineRankBoundaryLeak);
}

export function assertSourceFineRankPromptBudget(_request: SourceFineRankRequest, prompt: string) {
  if (estimateE5Tokens(prompt) > SOURCE_FINE_RANK_LIMITS.maxInputTokens) {
    throw new SourceFineRankValidationError("budget_exceeded", "Fine Rank prompt exceeded its input budget.");
  }
  return prompt;
}

export class SourceFineRankValidationError extends Error {
  constructor(readonly code: SourceFineRankReasonCode, message: string) {
    super(message);
    this.name = "SourceFineRankValidationError";
  }
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null;
}

function boundString(value: string, maxChars: number) {
  return value.trim().slice(0, maxChars);
}

function uniqueBoundedStrings(values: string[], maxItems: number, maxChars: number) {
  return [...new Set(values.map((value) => boundString(value, maxChars)).filter((value) => value.length > 0))].slice(0, maxItems);
}

function positiveInteger(value: number) {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : undefined;
}

function nonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}
