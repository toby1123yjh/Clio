import type {
  CitationValidationReason,
  CitationValidationResult,
  EvidenceItem,
  LocalCitation,
} from "./types";

export const citationValidationWarningMessage =
  "Source citation could not be verified for this local-knowledge answer.";

export interface CitationValidationInput {
  evidence: EvidenceItem[];
  citations: LocalCitation[];
}

export function validateCitationCoverage(input: CitationValidationInput): CitationValidationResult {
  const evidenceById = new Map(input.evidence.map((item) => [item.id, item]));
  const validCitations = input.citations.filter((citation) =>
    evidenceById.has(citation.evidenceId),
  );
  const validMemoryCitationCount = validCitations.filter(
    (citation) => evidenceById.get(citation.evidenceId)?.sourceKind === "memory",
  ).length;
  const memoryEvidenceCount = input.evidence.filter((item) => item.sourceKind === "memory").length;
  const base = {
    evidenceCount: input.evidence.length,
    memoryEvidenceCount,
    citationCount: input.citations.length,
    validCitationCount: validCitations.length,
    validMemoryCitationCount,
  };

  if (validCitations.length !== input.citations.length) {
    return warningResult("invalid_citation", base);
  }
  if (memoryEvidenceCount === 0) {
    return { status: "valid", reason: "no_memory_evidence", ...base };
  }
  if (validMemoryCitationCount > 0) {
    return { status: "valid", reason: "valid_memory_citation", ...base };
  }
  return warningResult("missing_memory_citation", base);
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
    (value.message === undefined || typeof value.message === "string")
  );
}

function warningResult(
  reason: Extract<
    CitationValidationReason,
    "invalid_citation" | "missing_memory_citation" | "validator_error"
  >,
  counts: Omit<CitationValidationResult, "status" | "reason" | "message">,
): CitationValidationResult {
  return {
    status: "warning",
    reason,
    ...counts,
    message: citationValidationWarningMessage,
  };
}

function isCitationValidationReason(value: unknown): value is CitationValidationReason {
  return (
    value === "no_memory_evidence" ||
    value === "valid_memory_citation" ||
    value === "missing_memory_citation" ||
    value === "invalid_citation" ||
    value === "validator_error"
  );
}

function isNonNegativeFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
