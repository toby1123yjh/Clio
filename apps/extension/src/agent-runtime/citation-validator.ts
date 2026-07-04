import type {
  CitationValidationClaimPreview,
  CitationValidationReason,
  CitationValidationResult,
  EvidenceItem,
  LocalCitation,
} from "./types";

export const citationValidationWarningMessage =
  "Source citation could not be verified for this local-knowledge answer.";

const maxUncoveredClaimPreviews = 5;
const maxClaimPreviewChars = 180;

export interface CitationValidationInput {
  evidence: EvidenceItem[];
  citations: LocalCitation[];
  content?: string;
}

export function validateCitationCoverage(input: CitationValidationInput): CitationValidationResult {
  const evidenceById = new Map(input.evidence.map((item) => [item.id, item]));
  const validCitations = input.citations.filter((citation) =>
    evidenceById.has(citation.evidenceId),
  );
  const validMemoryCitationCount = validCitations.filter(
    (citation) => evidenceById.get(citation.evidenceId)?.sourceKind === "memory",
  ).length;
  const validMemoryCitations = validCitations.filter(
    (citation) => evidenceById.get(citation.evidenceId)?.sourceKind === "memory",
  );
  const memoryEvidenceCount = input.evidence.filter((item) => item.sourceKind === "memory").length;
  const base = {
    evidenceCount: input.evidence.length,
    memoryEvidenceCount,
    citationCount: input.citations.length,
    validCitationCount: validCitations.length,
    validMemoryCitationCount,
  };
  const claimCoverage =
    memoryEvidenceCount === 0 ? undefined : buildClaimCoverage(input, validMemoryCitations);

  if (validCitations.length !== input.citations.length) {
    return warningResult("invalid_citation", base, claimCoverage);
  }
  if (memoryEvidenceCount === 0) {
    return { status: "valid", reason: "no_memory_evidence", ...base };
  }
  if (claimCoverage !== undefined && claimCoverage.claimCount > 0) {
    if (claimCoverage.uncoveredClaimCount === 0) {
      return {
        status: "valid",
        reason: "valid_memory_claims",
        ...base,
        ...claimCoverageResult(claimCoverage),
      };
    }
    return warningResult("missing_memory_claim_citation", base, {
      ...claimCoverageResult(claimCoverage),
      uncoveredClaims: claimCoverage.uncoveredClaims.slice(0, maxUncoveredClaimPreviews),
    });
  }
  if (validMemoryCitationCount > 0) {
    return { status: "valid", reason: "valid_memory_citation", ...base };
  }
  return warningResult("missing_memory_citation", base, claimCoverage);
}

export function citationValidatorErrorResult(
  input: CitationValidationInput,
): CitationValidationResult {
  return warningResult("validator_error", {
    evidenceCount: input.evidence.length,
    memoryEvidenceCount: input.evidence.filter((item) => item.sourceKind === "memory").length,
    citationCount: input.citations.length,
    validCitationCount: 0,
    validMemoryCitationCount: 0,
  });
}

export function readClioCitationValidation(value: unknown): CitationValidationResult | undefined {
  if (!isRecord(value)) return undefined;
  const validation = value.clioCitationValidation;
  return isCitationValidationResult(validation) ? validation : undefined;
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
    (value.message === undefined || typeof value.message === "string")
  );
}

function warningResult(
  reason: Extract<
    CitationValidationReason,
    | "invalid_citation"
    | "missing_memory_citation"
    | "missing_memory_claim_citation"
    | "validator_error"
  >,
  counts: Omit<CitationValidationResult, "status" | "reason" | "message">,
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
    ...counts,
    ...claimCoverage,
    message: citationValidationWarningMessage,
  };
}

function isCitationValidationReason(value: unknown): value is CitationValidationReason {
  return (
    value === "no_memory_evidence" ||
    value === "valid_memory_citation" ||
    value === "valid_memory_claims" ||
    value === "missing_memory_citation" ||
    value === "missing_memory_claim_citation" ||
    value === "invalid_citation" ||
    value === "validator_error"
  );
}

function isCitationValidationClaimPreview(value: unknown): value is CitationValidationClaimPreview {
  return (
    isRecord(value) &&
    typeof value.text === "string" &&
    isNonNegativeFiniteNumber(value.position) &&
    value.reason === "missing_memory_citation"
  );
}

function isNonNegativeFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

interface ClaimCoverage {
  claimCount: number;
  coveredClaimCount: number;
  uncoveredClaimCount: number;
  uncoveredClaims: CitationValidationClaimPreview[];
}

function buildClaimCoverage(
  input: CitationValidationInput,
  memoryCitations: LocalCitation[],
): ClaimCoverage {
  const claims = extractClaimLikeSentences(input.content ?? "");
  const uncoveredClaims = uncoveredClaimPreviews(claims, memoryCitations);
  return {
    claimCount: claims.length,
    coveredClaimCount: claims.length - uncoveredClaims.length,
    uncoveredClaimCount: uncoveredClaims.length,
    uncoveredClaims,
  };
}

function claimCoverageResult(claimCoverage: ClaimCoverage) {
  return {
    claimCount: claimCoverage.claimCount,
    coveredClaimCount: claimCoverage.coveredClaimCount,
    uncoveredClaimCount: claimCoverage.uncoveredClaimCount,
    uncoveredClaims: claimCoverage.uncoveredClaims.slice(0, maxUncoveredClaimPreviews),
  };
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

function uncoveredClaimPreviews(
  claims: ClaimSentence[],
  memoryCitations: LocalCitation[],
): CitationValidationClaimPreview[] {
  if (claims.length === 0) return [];
  const offsets = memoryCitations
    .map((citation) => citation.outputOffset)
    .filter((offset): offset is number => typeof offset === "number" && Number.isFinite(offset));
  if (offsets.length === 0) return fallbackUncoveredClaimPreviews(claims, memoryCitations.length);

  return claims
    .filter(
      (claim) =>
        !offsets.some((offset) => offset >= claim.citationStart && offset <= claim.citationEnd),
    )
    .map(claimPreview);
}

function fallbackUncoveredClaimPreviews(claims: ClaimSentence[], memoryCitationCount: number) {
  return claims.slice(memoryCitationCount).map(claimPreview);
}

function claimPreview(claim: ClaimSentence): CitationValidationClaimPreview {
  return {
    text: claim.text,
    position: claim.position,
    reason: "missing_memory_citation",
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
