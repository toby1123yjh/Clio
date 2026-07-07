import { evaluateLocalEvidenceQuality } from "./multi-source-retrieval";
import type { LocalEvidenceQuality } from "./multi-source-retrieval";
import type {
  SemanticCitationJudgeInput,
  SemanticCitationJudgeResult,
} from "./semantic-citation-judge";
import type {
  CitationEvidenceQuality,
  CitationSemanticJudgeSummary,
  CitationSupportCheck,
  CitationValidationClaimPreview,
  CitationValidationClaimPreviewReason,
  CitationValidationReason,
  CitationValidationResult,
  EvidenceItem,
  LocalCitation,
} from "./types";

export const citationValidationWarningMessage =
  "Source citation could not be verified for this local-knowledge answer.";

const maxUncoveredClaimPreviews = 5;
const maxClaimPreviewChars = 180;
const maxSemanticJudgeClaims = 6;
const maxSemanticEvidenceExcerptChars = 900;
const minCitedEvidenceChars = 20;

export interface CitationValidationInput {
  evidence: EvidenceItem[];
  citations: LocalCitation[];
  content?: string;
  question?: string;
  semanticJudge?: SemanticCitationJudgeResult;
  semanticJudgeRequired?: boolean;
  retry?: CitationValidationResult["retry"];
}

export function validateCitationCoverage(input: CitationValidationInput): CitationValidationResult {
  const analysis = analyzeCitationCoverage(input);
  const base = validationBase(analysis, input);
  const claimCoverage = analysis.claimCoverage;

  if (analysis.validCitations.length !== input.citations.length) {
    return warningResult("invalid_citation", base, claimCoverageResult(claimCoverage));
  }
  if (analysis.memoryEvidence.length === 0) {
    return validResult("no_memory_evidence", base);
  }
  if (claimCoverage !== undefined && claimCoverage.claimCount > 0) {
    if (claimCoverage.uncoveredClaimCount > 0) {
      return warningResult(
        "missing_memory_claim_citation",
        base,
        claimCoverageResult(claimCoverage),
      );
    }
    if (analysis.insufficientCitedEvidenceIds.size > 0) {
      return warningResult(
        "insufficient_memory_evidence",
        { ...base, supportCheck: "insufficient_evidence" },
        insufficientClaimCoverageResult(claimCoverage, analysis.insufficientCitedEvidenceIds),
      );
    }

    const semanticSummary = semanticJudgeSummary(
      input.semanticJudge,
      input.semanticJudgeRequired === true,
      claimCoverage.coveredClaims.length,
    );
    if (semanticSummary !== undefined) {
      if (semanticSummary.status === "supported") {
        return validResult("valid_memory_claims", {
          ...base,
          ...claimCoverageResult(claimCoverage),
          supportCheck: "semantic_supported",
          semanticJudge: semanticSummary,
        });
      }
      if (semanticSummary.status === "unsupported") {
        return warningResult(
          "unsupported_memory_claim",
          {
            ...base,
            supportCheck: "semantic_unsupported",
            semanticJudge: semanticSummary,
          },
          semanticUnsupportedCoverageResult(claimCoverage, input.semanticJudge),
        );
      }
      if (semanticSummary.status === "unavailable") {
        return warningResult(
          "semantic_judge_unavailable",
          {
            ...base,
            supportCheck: "judge_unavailable",
            semanticJudge: semanticSummary,
          },
          semanticUnavailableCoverageResult(claimCoverage, "semantic_judge_unavailable"),
        );
      }
      if (semanticSummary.status === "error") {
        return warningResult(
          "semantic_judge_error",
          {
            ...base,
            supportCheck: "judge_error",
            semanticJudge: semanticSummary,
          },
          semanticUnavailableCoverageResult(claimCoverage, "semantic_judge_unavailable"),
        );
      }
    }

    return validResult("valid_memory_claims", {
      ...base,
      ...claimCoverageResult(claimCoverage),
      supportCheck: "deterministic_supported",
      semanticJudge: {
        status: "not_run",
        checkedClaimCount: 0,
        unsupportedClaimCount: 0,
      },
    });
  }

  if (analysis.validMemoryCitations.length > 0) {
    if (analysis.insufficientCitedEvidenceIds.size > 0) {
      return warningResult("insufficient_memory_evidence", {
        ...base,
        supportCheck: "insufficient_evidence",
        ...(claimCoverage === undefined ? {} : claimCoverageResult(claimCoverage)),
      });
    }
    return validResult("valid_memory_citation", {
      ...base,
      ...(claimCoverage === undefined ? {} : claimCoverageResult(claimCoverage)),
      supportCheck: "deterministic_supported",
    });
  }
  return warningResult("missing_memory_citation", base, claimCoverageResult(claimCoverage));
}

export function buildSemanticCitationJudgeInput(
  input: CitationValidationInput,
): SemanticCitationJudgeInput | undefined {
  const analysis = analyzeCitationCoverage(input);
  const claimCoverage = analysis.claimCoverage;
  if (analysis.memoryEvidence.length === 0) return undefined;
  if (analysis.validCitations.length !== input.citations.length) return undefined;
  if (claimCoverage === undefined || claimCoverage.claimCount === 0) return undefined;
  if (claimCoverage.uncoveredClaimCount > 0) return undefined;
  if (analysis.insufficientCitedEvidenceIds.size > 0) return undefined;

  const claims = claimCoverage.coveredClaims
    .slice(0, maxSemanticJudgeClaims)
    .flatMap((coveredClaim) => {
      const citations = coveredClaim.citations.flatMap((citation) => {
        const evidence = analysis.evidenceById.get(citation.evidenceId);
        if (evidence?.sourceKind !== "memory") return [];
        return [
          {
            citationId: citation.id,
            evidenceId: evidence.id,
            evidenceTitle: evidence.sourceTitle,
            evidenceExcerpt: boundedEvidenceExcerpt(citation, evidence),
          },
        ];
      });
      if (citations.length === 0) return [];
      return [
        {
          claimId: coveredClaim.claim.id,
          claimPreview: coveredClaim.claim.text,
          citations,
        },
      ];
    });

  if (claims.length === 0) return undefined;
  return {
    question: truncateForJudge(input.question ?? ""),
    claims,
  };
}

export function citationValidatorErrorResult(
  input: CitationValidationInput,
): CitationValidationResult {
  const analysis = analyzeCitationCoverage(input);
  return warningResult("validator_error", {
    evidenceCount: input.evidence.length,
    memoryEvidenceCount: analysis.memoryEvidence.length,
    citationCount: input.citations.length,
    validCitationCount: 0,
    validMemoryCitationCount: 0,
    evidenceQuality: analysis.evidenceQuality,
    qualityReason: qualityReasonFor(analysis.evidenceQuality, analysis.memoryEvidence.length),
    supportCheck: "not_checked",
  });
}

export function readClioCitationValidation(value: unknown): CitationValidationResult | undefined {
  if (!isRecord(value)) return undefined;
  const validation = value.clioCitationValidation;
  return isCitationValidationResult(validation) ? validation : undefined;
}

export function formatCitationValidationWarning(validation: CitationValidationResult) {
  if (validation.status !== "warning") return "";
  const parts = [citationValidationReasonLabel(validation.reason)];
  if (validation.claimCount !== undefined && validation.claimCount > 0) {
    parts.push(
      `${validation.uncoveredClaimCount ?? 0}/${validation.claimCount} claim(s) unresolved`,
    );
  }
  if (validation.evidenceQuality !== undefined) {
    parts.push(`evidence ${validation.evidenceQuality}`);
  }
  if (validation.semanticJudge !== undefined && validation.semanticJudge.status !== "not_run") {
    parts.push(`judge ${validation.semanticJudge.status}`);
  }
  if (validation.retry?.exhausted === true) {
    parts.push("retry exhausted");
  }
  return parts.join(" · ");
}

export function isCitationValidationResult(value: unknown): value is CitationValidationResult {
  if (!isRecord(value)) return false;
  return (
    (value.status === "valid" || value.status === "warning") &&
    isCitationValidationReason(value.reason) &&
    isNonNegativeFiniteNumber(value.evidenceCount) &&
    isNonNegativeFiniteNumber(value.memoryEvidenceCount) &&
    isNonNegativeFiniteNumber(value.citationCount) &&
    isNonNegativeFiniteNumber(value.validCitationCount) &&
    isNonNegativeFiniteNumber(value.validMemoryCitationCount) &&
    (value.claimCount === undefined || isNonNegativeFiniteNumber(value.claimCount)) &&
    (value.coveredClaimCount === undefined || isNonNegativeFiniteNumber(value.coveredClaimCount)) &&
    (value.uncoveredClaimCount === undefined ||
      isNonNegativeFiniteNumber(value.uncoveredClaimCount)) &&
    (value.uncoveredClaims === undefined ||
      (Array.isArray(value.uncoveredClaims) &&
        value.uncoveredClaims.every(isCitationValidationClaimPreview))) &&
    (value.evidenceQuality === undefined || isCitationEvidenceQuality(value.evidenceQuality)) &&
    (value.qualityReason === undefined || typeof value.qualityReason === "string") &&
    (value.supportCheck === undefined || isCitationSupportCheck(value.supportCheck)) &&
    (value.semanticJudge === undefined || isCitationSemanticJudgeSummary(value.semanticJudge)) &&
    (value.retry === undefined || isCitationValidationRetrySummary(value.retry)) &&
    (value.message === undefined || typeof value.message === "string")
  );
}

function validResult(
  reason: Extract<
    CitationValidationReason,
    "no_memory_evidence" | "valid_memory_citation" | "valid_memory_claims"
  >,
  values: Omit<CitationValidationResult, "status" | "reason" | "message">,
): CitationValidationResult {
  return {
    status: "valid",
    reason,
    ...values,
  };
}

function warningResult(
  reason: Exclude<
    CitationValidationReason,
    "no_memory_evidence" | "valid_memory_citation" | "valid_memory_claims"
  >,
  values: Omit<CitationValidationResult, "status" | "reason" | "message">,
  claimCoverage?: Partial<
    Pick<
      CitationValidationResult,
      "claimCount" | "coveredClaimCount" | "uncoveredClaimCount" | "uncoveredClaims"
    >
  >,
): CitationValidationResult {
  return {
    status: "warning",
    reason,
    ...values,
    ...claimCoverage,
    message: citationValidationWarningMessage,
  };
}

export function isCitationValidationReason(value: unknown): value is CitationValidationReason {
  return (
    value === "no_memory_evidence" ||
    value === "valid_memory_citation" ||
    value === "valid_memory_claims" ||
    value === "missing_memory_citation" ||
    value === "missing_memory_claim_citation" ||
    value === "invalid_citation" ||
    value === "unsupported_memory_claim" ||
    value === "insufficient_memory_evidence" ||
    value === "semantic_judge_unavailable" ||
    value === "semantic_judge_error" ||
    value === "validator_error"
  );
}

function isCitationValidationClaimPreview(value: unknown): value is CitationValidationClaimPreview {
  return (
    isRecord(value) &&
    typeof value.text === "string" &&
    isNonNegativeFiniteNumber(value.position) &&
    isCitationValidationClaimPreviewReason(value.reason)
  );
}

function isCitationValidationClaimPreviewReason(
  value: unknown,
): value is CitationValidationClaimPreviewReason {
  return (
    value === "missing_memory_citation" ||
    value === "unsupported_memory_citation" ||
    value === "insufficient_memory_evidence" ||
    value === "semantic_unsupported" ||
    value === "semantic_judge_unavailable"
  );
}

function citationValidationReasonLabel(reason: CitationValidationReason) {
  switch (reason) {
    case "missing_memory_citation":
      return "Missing local-memory citation";
    case "missing_memory_claim_citation":
      return "Some local-memory claims are uncited";
    case "invalid_citation":
      return "Citation id was not in the provided evidence";
    case "unsupported_memory_claim":
      return "A cited claim is not supported by its evidence";
    case "insufficient_memory_evidence":
      return "Cited local evidence is too small to verify";
    case "semantic_judge_unavailable":
      return "Semantic citation judge is unavailable";
    case "semantic_judge_error":
      return "Semantic citation judge failed";
    case "validator_error":
      return "Citation validator failed";
    case "no_memory_evidence":
    case "valid_memory_citation":
    case "valid_memory_claims":
      return citationValidationWarningMessage;
    default:
      return assertNever(reason);
  }
}

function isCitationEvidenceQuality(value: unknown): value is CitationEvidenceQuality {
  return value === "none" || value === "weak" || value === "strong";
}

function isCitationSupportCheck(value: unknown): value is CitationSupportCheck {
  return (
    value === "not_checked" ||
    value === "deterministic_supported" ||
    value === "semantic_supported" ||
    value === "semantic_unsupported" ||
    value === "insufficient_evidence" ||
    value === "judge_unavailable" ||
    value === "judge_error"
  );
}

function isCitationSemanticJudgeSummary(value: unknown): value is CitationSemanticJudgeSummary {
  return (
    isRecord(value) &&
    (value.status === "not_run" ||
      value.status === "supported" ||
      value.status === "unsupported" ||
      value.status === "unavailable" ||
      value.status === "error") &&
    isNonNegativeFiniteNumber(value.checkedClaimCount) &&
    isNonNegativeFiniteNumber(value.unsupportedClaimCount) &&
    (value.providerKind === undefined ||
      value.providerKind === "chat" ||
      value.providerKind === "embedding") &&
    (value.reason === undefined || typeof value.reason === "string")
  );
}

function isCitationValidationRetrySummary(
  value: unknown,
): value is CitationValidationResult["retry"] {
  return (
    isRecord(value) &&
    typeof value.attempted === "boolean" &&
    isNonNegativeFiniteNumber(value.count) &&
    typeof value.exhausted === "boolean" &&
    (value.reason === undefined || typeof value.reason === "string")
  );
}

function isNonNegativeFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

interface CitationAnalysis {
  evidenceById: Map<string, EvidenceItem>;
  memoryEvidence: EvidenceItem[];
  validCitations: LocalCitation[];
  validMemoryCitations: LocalCitation[];
  insufficientCitedEvidenceIds: Set<string>;
  evidenceQuality: LocalEvidenceQuality;
  claimCoverage?: ClaimCoverage;
}

interface ClaimCoverage {
  claimCount: number;
  coveredClaimCount: number;
  uncoveredClaimCount: number;
  uncoveredClaims: CitationValidationClaimPreview[];
  coveredClaims: CoveredClaim[];
}

interface CoveredClaim {
  claim: ClaimSentence;
  citations: LocalCitation[];
}

function analyzeCitationCoverage(input: CitationValidationInput): CitationAnalysis {
  const evidenceById = new Map(input.evidence.map((item) => [item.id, item]));
  const validCitations = input.citations.filter((citation) =>
    evidenceById.has(citation.evidenceId),
  );
  const validMemoryCitations = validCitations.filter(
    (citation) => evidenceById.get(citation.evidenceId)?.sourceKind === "memory",
  );
  const memoryEvidence = input.evidence.filter((item) => item.sourceKind === "memory");
  const evidenceQuality = evaluateLocalEvidenceQuality(memoryEvidence, {
    query: input.question,
    candidateCount: memoryEvidence.length,
  });
  const claimCoverage =
    memoryEvidence.length === 0 ? undefined : buildClaimCoverage(input, validMemoryCitations);

  return {
    evidenceById,
    memoryEvidence,
    validCitations,
    validMemoryCitations,
    insufficientCitedEvidenceIds: insufficientCitedEvidenceIds(validMemoryCitations, evidenceById),
    evidenceQuality,
    claimCoverage,
  };
}

function validationBase(
  analysis: CitationAnalysis,
  input: CitationValidationInput,
): Omit<CitationValidationResult, "status" | "reason" | "message"> {
  return {
    evidenceCount: input.evidence.length,
    memoryEvidenceCount: analysis.memoryEvidence.length,
    citationCount: input.citations.length,
    validCitationCount: analysis.validCitations.length,
    validMemoryCitationCount: analysis.validMemoryCitations.length,
    evidenceQuality: analysis.evidenceQuality,
    qualityReason: qualityReasonFor(analysis.evidenceQuality, analysis.memoryEvidence.length),
    supportCheck: "not_checked",
    ...(input.retry === undefined ? {} : { retry: input.retry }),
  };
}

function qualityReasonFor(quality: LocalEvidenceQuality, memoryEvidenceCount: number) {
  if (quality === "none") return "no_local_memory_evidence";
  if (quality === "strong") return "local_memory_evidence_has_broad_coverage";
  return memoryEvidenceCount <= 1
    ? "local_memory_evidence_is_sparse"
    : "local_memory_evidence_needs_claim_support_check";
}

function insufficientCitedEvidenceIds(
  memoryCitations: LocalCitation[],
  evidenceById: Map<string, EvidenceItem>,
) {
  const ids = new Set<string>();
  for (const citation of memoryCitations) {
    const evidence = evidenceById.get(citation.evidenceId);
    if (evidence === undefined) continue;
    if (compactEvidenceText(evidence.text || evidence.excerpt).length < minCitedEvidenceChars) {
      ids.add(evidence.id);
    }
  }
  return ids;
}

function buildClaimCoverage(
  input: CitationValidationInput,
  memoryCitations: LocalCitation[],
): ClaimCoverage {
  const claims = extractClaimLikeSentences(input.content ?? "");
  const { coveredClaims, uncoveredClaims } = partitionClaimsByCitation(claims, memoryCitations);
  return {
    claimCount: claims.length,
    coveredClaimCount: coveredClaims.length,
    uncoveredClaimCount: uncoveredClaims.length,
    uncoveredClaims,
    coveredClaims,
  };
}

function claimCoverageResult(claimCoverage: ClaimCoverage | undefined) {
  if (claimCoverage === undefined) return undefined;
  return {
    claimCount: claimCoverage.claimCount,
    coveredClaimCount: claimCoverage.coveredClaimCount,
    uncoveredClaimCount: claimCoverage.uncoveredClaimCount,
    uncoveredClaims: claimCoverage.uncoveredClaims.slice(0, maxUncoveredClaimPreviews),
  };
}

function insufficientClaimCoverageResult(
  claimCoverage: ClaimCoverage,
  insufficientEvidenceIds: Set<string>,
) {
  const previews = claimCoverage.coveredClaims
    .filter((coveredClaim) =>
      coveredClaim.citations.some((citation) => insufficientEvidenceIds.has(citation.evidenceId)),
    )
    .map((coveredClaim) => claimPreview(coveredClaim.claim, "insufficient_memory_evidence"));
  return {
    claimCount: claimCoverage.claimCount,
    coveredClaimCount: Math.max(0, claimCoverage.claimCount - previews.length),
    uncoveredClaimCount: previews.length,
    uncoveredClaims: previews.slice(0, maxUncoveredClaimPreviews),
  };
}

function semanticUnsupportedCoverageResult(
  claimCoverage: ClaimCoverage,
  semanticJudge: SemanticCitationJudgeResult | undefined,
) {
  const unsupportedIds = new Set(semanticJudge?.unsupportedClaimIds ?? []);
  const unsupportedClaims =
    unsupportedIds.size === 0
      ? claimCoverage.coveredClaims.slice(0, 1)
      : claimCoverage.coveredClaims.filter((coveredClaim) =>
          unsupportedIds.has(coveredClaim.claim.id),
        );
  const previews = unsupportedClaims.map((coveredClaim) =>
    claimPreview(coveredClaim.claim, "semantic_unsupported"),
  );
  const unsupportedCount = Math.max(
    previews.length,
    semanticJudge?.unsupportedClaimIds.length ?? 0,
  );
  return {
    claimCount: claimCoverage.claimCount,
    coveredClaimCount: Math.max(0, claimCoverage.claimCount - unsupportedCount),
    uncoveredClaimCount: unsupportedCount,
    uncoveredClaims: previews.slice(0, maxUncoveredClaimPreviews),
  };
}

function semanticUnavailableCoverageResult(
  claimCoverage: ClaimCoverage,
  reason: CitationValidationClaimPreviewReason,
) {
  const previews = claimCoverage.coveredClaims.map((coveredClaim) =>
    claimPreview(coveredClaim.claim, reason),
  );
  return {
    claimCount: claimCoverage.claimCount,
    coveredClaimCount: 0,
    uncoveredClaimCount: claimCoverage.claimCount,
    uncoveredClaims: previews.slice(0, maxUncoveredClaimPreviews),
  };
}

function semanticJudgeSummary(
  result: SemanticCitationJudgeResult | undefined,
  required: boolean,
  expectedClaimCount: number,
): CitationSemanticJudgeSummary | undefined {
  if (result === undefined) {
    if (!required) return undefined;
    return {
      status: "unavailable",
      checkedClaimCount: 0,
      unsupportedClaimCount: 0,
      providerKind: "chat",
      reason: "semantic_judge_not_configured",
    };
  }

  return {
    status: result.status,
    checkedClaimCount: Math.min(result.checkedClaimCount, expectedClaimCount),
    unsupportedClaimCount: result.unsupportedClaimIds.length,
    providerKind: result.providerKind ?? "chat",
    ...(result.reason === undefined ? {} : { reason: truncateReason(result.reason) }),
  };
}

function partitionClaimsByCitation(claims: ClaimSentence[], memoryCitations: LocalCitation[]) {
  if (claims.length === 0) {
    return {
      coveredClaims: [] as CoveredClaim[],
      uncoveredClaims: [] as CitationValidationClaimPreview[],
    };
  }

  const citationsWithOffsets = memoryCitations.filter(
    (citation) =>
      typeof citation.outputOffset === "number" && Number.isFinite(citation.outputOffset),
  );
  if (citationsWithOffsets.length === 0) {
    return fallbackPartitionClaimsByCitation(claims, memoryCitations);
  }

  const coveredClaims: CoveredClaim[] = [];
  const uncoveredClaims: CitationValidationClaimPreview[] = [];
  for (const claim of claims) {
    const citations = citationsWithOffsets.filter(
      (citation) =>
        citation.outputOffset !== undefined &&
        citation.outputOffset >= claim.citationStart &&
        citation.outputOffset <= claim.citationEnd,
    );
    if (citations.length === 0) {
      uncoveredClaims.push(claimPreview(claim, "missing_memory_citation"));
    } else {
      coveredClaims.push({ claim, citations });
    }
  }
  return { coveredClaims, uncoveredClaims };
}

function fallbackPartitionClaimsByCitation(
  claims: ClaimSentence[],
  memoryCitations: LocalCitation[],
) {
  const coveredClaims: CoveredClaim[] = [];
  const uncoveredClaims: CitationValidationClaimPreview[] = [];
  for (const [index, claim] of claims.entries()) {
    const citation = memoryCitations[index];
    if (citation === undefined) {
      uncoveredClaims.push(claimPreview(claim, "missing_memory_citation"));
    } else {
      coveredClaims.push({ claim, citations: [citation] });
    }
  }
  return { coveredClaims, uncoveredClaims };
}

function extractClaimLikeSentences(content: string) {
  const normalized = content.replace(/\r\n?/g, "\n").trim();
  if (normalized.length === 0) return [];

  const claims: ClaimSentence[] = [];
  const sentencePattern = /[^.!?\u3002\uff01\uff1f\n]+[.!?\u3002\uff01\uff1f]?/g;
  let match = sentencePattern.exec(normalized);
  while (match !== null) {
    const sentence = cleanClaimSentence(match[0]);
    if (isClaimLikeSentence(sentence)) {
      claims.push({
        id: `claim:${match.index}`,
        text: truncateClaimPreview(sentence),
        position: match.index,
        endPosition: match.index + match[0].length,
        citationStart: match.index + trailingPunctuationStart(match[0]),
        citationEnd: match.index + match[0].length + 1,
      });
    }
    match = sentencePattern.exec(normalized);
  }
  return claims;
}

interface ClaimSentence {
  id: string;
  text: string;
  position: number;
  endPosition: number;
  citationStart: number;
  citationEnd: number;
}

function trailingPunctuationStart(input: string) {
  const trimmedEnd = input.trimEnd();
  const punctuationMatch = /[.!?\u3002\uff01\uff1f]+$/.exec(trimmedEnd);
  return punctuationMatch?.index ?? trimmedEnd.length;
}

function claimPreview(
  claim: ClaimSentence,
  reason: CitationValidationClaimPreviewReason,
): CitationValidationClaimPreview {
  return {
    text: claim.text,
    position: claim.position,
    reason,
  };
}

function cleanClaimSentence(input: string) {
  return input
    .replace(/^\s*[-*+]\s+/, "")
    .replace(/^\s*\d+[.)]\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isClaimLikeSentence(sentence: string) {
  if (sentence.length < 12) return false;
  if (/^#{1,6}\s/.test(sentence)) return false;
  if (/^[\s:\uff1a\-*+]+$/.test(sentence)) return false;
  if (
    /^(sure|okay|ok|thanks|thank you|\u5f53\u7136|\u53ef\u4ee5|\u597d\u7684|\u6536\u5230)[.!?\u3002\uff01\uff1f]?$/i.test(
      sentence,
    )
  ) {
    return false;
  }
  return /[A-Za-z0-9\u4e00-\u9fff]/.test(sentence);
}

function truncateClaimPreview(input: string) {
  return input.length <= maxClaimPreviewChars
    ? input
    : `${input.slice(0, maxClaimPreviewChars - 3)}...`;
}

function boundedEvidenceExcerpt(citation: LocalCitation, evidence: EvidenceItem) {
  return truncateForJudge(citation.excerpt || evidence.excerpt || evidence.text);
}

function truncateForJudge(input: string) {
  const text = compactEvidenceText(input);
  if (text.length <= maxSemanticEvidenceExcerptChars) return text;
  return `${text.slice(0, maxSemanticEvidenceExcerptChars - 3).trimEnd()}...`;
}

function compactEvidenceText(input: string) {
  return input.replace(/\s+/g, " ").trim();
}

function truncateReason(input: string) {
  const text = compactEvidenceText(input);
  return text.length <= 160 ? text : `${text.slice(0, 157).trimEnd()}...`;
}

function assertNever(value: never): never {
  throw new Error(`Unhandled citation validation reason: ${value}`);
}
