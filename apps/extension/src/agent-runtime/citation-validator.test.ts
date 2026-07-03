import { describe, expect, it } from "vitest";
import {
  citationValidationWarningMessage,
  readClioCitationValidation,
  validateCitationCoverage,
} from "./citation-validator";
import type { EvidenceItem, LocalCitation } from "./types";

const memoryEvidence: EvidenceItem = {
  id: "memory:mem-1:chunk:chunk-1",
  sourceKind: "memory",
  sourceUrl: "https://example.com/memory",
  sourceTitle: "Saved Memory",
  text: "Bounded memory evidence",
  excerpt: "Bounded memory evidence",
};

const pageEvidence: EvidenceItem = {
  id: "page:0",
  sourceKind: "page",
  sourceUrl: "https://example.com/page",
  sourceTitle: "Page",
  text: "Page evidence",
  excerpt: "Page evidence",
};

function citation(evidence: EvidenceItem, overrides: Partial<LocalCitation> = {}): LocalCitation {
  return {
    id: `run-1:citation:${evidence.id}`,
    evidenceId: evidence.id,
    label: evidence.sourceKind,
    sourceKind: evidence.sourceKind,
    sourceUrl: evidence.sourceUrl,
    sourceTitle: evidence.sourceTitle,
    excerpt: evidence.excerpt,
    ...overrides,
  };
}

describe("validateCitationCoverage", () => {
  it("accepts a valid memory citation", () => {
    expect(
      validateCitationCoverage({
        evidence: [memoryEvidence],
        citations: [citation(memoryEvidence)],
      }),
    ).toMatchObject({
      status: "valid",
      reason: "valid_memory_citation",
      evidenceCount: 1,
      memoryEvidenceCount: 1,
      citationCount: 1,
      validCitationCount: 1,
      validMemoryCitationCount: 1,
    });
  });

  it("warns when local memory evidence has no valid memory citation", () => {
    expect(
      validateCitationCoverage({
        evidence: [memoryEvidence],
        citations: [],
      }),
    ).toEqual({
      status: "warning",
      reason: "missing_memory_citation",
      evidenceCount: 1,
      memoryEvidenceCount: 1,
      citationCount: 0,
      validCitationCount: 0,
      validMemoryCitationCount: 0,
      message: citationValidationWarningMessage,
    });
  });

  it("warns when an accepted citation points outside the request evidence", () => {
    const invalidCitation = citation(memoryEvidence, { evidenceId: "memory:missing:chunk:1" });

    expect(
      validateCitationCoverage({
        evidence: [memoryEvidence],
        citations: [invalidCitation],
      }),
    ).toMatchObject({
      status: "warning",
      reason: "invalid_citation",
      validCitationCount: 0,
      validMemoryCitationCount: 0,
    });
  });

  it("does not warn ordinary answers without memory evidence", () => {
    expect(
      validateCitationCoverage({
        evidence: [pageEvidence],
        citations: [],
      }),
    ).toMatchObject({
      status: "valid",
      reason: "no_memory_evidence",
      evidenceCount: 1,
      memoryEvidenceCount: 0,
    });
  });

  it("does not warn empty evidence answers", () => {
    expect(validateCitationCoverage({ evidence: [], citations: [] })).toMatchObject({
      status: "valid",
      reason: "no_memory_evidence",
      evidenceCount: 0,
      memoryEvidenceCount: 0,
    });
  });

  it("reads persisted citation validation metadata through a shared guard", () => {
    const validation = validateCitationCoverage({
      evidence: [memoryEvidence],
      citations: [citation(memoryEvidence)],
    });

    expect(readClioCitationValidation({ clioCitationValidation: validation })).toEqual(validation);
    expect(readClioCitationValidation({ clioCitationValidation: { status: "warning" } })).toBe(
      undefined,
    );
  });
});
