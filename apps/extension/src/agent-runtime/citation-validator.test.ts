import { describe, expect, it } from "vitest";
import {
  buildSemanticCitationJudgeInput,
  citationValidationWarningMessage,
  formatCitationValidationWarning,
  isCitationValidationResult,
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

const webEvidence: EvidenceItem = {
  id: "web:0",
  sourceKind: "web",
  sourceUrl: "https://example.com/web",
  sourceTitle: "Web Result",
  text: "Web evidence",
  excerpt: "Web evidence",
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

  it("accepts memory claims when each claim has a memory citation", () => {
    expect(
      validateCitationCoverage({
        evidence: [memoryEvidence],
        citations: [
          citation(memoryEvidence, {
            outputOffset: "The local store preserves bounded memory evidence".length,
          }),
        ],
        content: "The local store preserves bounded memory evidence.",
      }),
    ).toMatchObject({
      status: "valid",
      reason: "valid_memory_claims",
      claimCount: 1,
      coveredClaimCount: 1,
      uncoveredClaimCount: 0,
      uncoveredClaims: [],
    });
  });

  it("accepts memory claims when semantic judge supports cited evidence", () => {
    const claim = "The local store preserves bounded memory evidence.";

    expect(
      validateCitationCoverage({
        evidence: [memoryEvidence],
        citations: [citation(memoryEvidence, { outputOffset: claim.length })],
        content: claim,
        semanticJudgeRequired: true,
        semanticJudge: {
          status: "supported",
          checkedClaimCount: 1,
          unsupportedClaimIds: [],
          providerKind: "chat",
        },
      }),
    ).toMatchObject({
      status: "valid",
      reason: "valid_memory_claims",
      supportCheck: "semantic_supported",
      semanticJudge: {
        status: "supported",
        checkedClaimCount: 1,
        unsupportedClaimCount: 0,
        providerKind: "chat",
      },
    });
  });

  it("warns when semantic judge rejects a cited claim", () => {
    const claim = "The local store preserves bounded memory evidence.";

    expect(
      validateCitationCoverage({
        evidence: [memoryEvidence],
        citations: [citation(memoryEvidence, { outputOffset: claim.length })],
        content: claim,
        semanticJudgeRequired: true,
        semanticJudge: {
          status: "unsupported",
          checkedClaimCount: 1,
          unsupportedClaimIds: ["claim:0"],
          providerKind: "chat",
          reason: "not stated",
        },
      }),
    ).toMatchObject({
      status: "warning",
      reason: "unsupported_memory_claim",
      supportCheck: "semantic_unsupported",
      uncoveredClaims: [
        {
          text: claim,
          reason: "semantic_unsupported",
        },
      ],
      semanticJudge: {
        status: "unsupported",
        unsupportedClaimCount: 1,
        reason: "not stated",
      },
    });
  });

  it("warns when semantic judge is unavailable for cited claims", () => {
    const claim = "The local store preserves bounded memory evidence.";
    const result = validateCitationCoverage({
      evidence: [memoryEvidence],
      citations: [citation(memoryEvidence, { outputOffset: claim.length })],
      content: claim,
      semanticJudgeRequired: true,
      semanticJudge: {
        status: "unavailable",
        checkedClaimCount: 1,
        unsupportedClaimIds: [],
        providerKind: "chat",
        reason: "missing config",
      },
    });

    expect(result).toMatchObject({
      status: "warning",
      reason: "semantic_judge_unavailable",
      supportCheck: "judge_unavailable",
      uncoveredClaimCount: 1,
      semanticJudge: {
        status: "unavailable",
        checkedClaimCount: 1,
        reason: "missing config",
      },
    });
    expect(formatCitationValidationWarning(result)).toContain("Semantic citation judge");
  });

  it("warns when cited memory evidence is too short to verify", () => {
    const shortEvidence = {
      ...memoryEvidence,
      text: "tiny",
      excerpt: "tiny",
    };
    const claim = "The local store preserves bounded memory evidence.";

    expect(
      validateCitationCoverage({
        evidence: [shortEvidence],
        citations: [citation(shortEvidence, { outputOffset: claim.length })],
        content: claim,
      }),
    ).toMatchObject({
      status: "warning",
      reason: "insufficient_memory_evidence",
      supportCheck: "insufficient_evidence",
      uncoveredClaims: [
        {
          reason: "insufficient_memory_evidence",
        },
      ],
    });
  });

  it("builds bounded semantic judge inputs from cited memory claims", () => {
    const claim = "The local store preserves bounded memory evidence.";
    const semanticInput = buildSemanticCitationJudgeInput({
      evidence: [memoryEvidence],
      citations: [citation(memoryEvidence, { outputOffset: claim.length })],
      content: claim,
      question: "Explain the local store",
    });

    expect(semanticInput).toEqual({
      question: "Explain the local store",
      claims: [
        {
          claimId: "claim:0",
          claimPreview: claim,
          citations: [
            expect.objectContaining({
              evidenceId: memoryEvidence.id,
              evidenceExcerpt: memoryEvidence.excerpt,
            }),
          ],
        },
      ],
    });
  });

  it("uses citation offsets to identify uncovered memory-backed claims", () => {
    const firstClaim = "The local store preserves bounded memory evidence.";
    const secondClaim = "The second claim has no memory citation.";

    expect(
      validateCitationCoverage({
        evidence: [memoryEvidence],
        citations: [citation(memoryEvidence, { outputOffset: firstClaim.length })],
        content: `${firstClaim} ${secondClaim}`,
      }),
    ).toMatchObject({
      status: "warning",
      reason: "missing_memory_claim_citation",
      claimCount: 2,
      coveredClaimCount: 1,
      uncoveredClaimCount: 1,
      uncoveredClaims: [
        {
          text: secondClaim,
          position: firstClaim.length,
          reason: "missing_memory_citation",
        },
      ],
    });
  });

  it("warns when memory-backed claims are not covered by memory citations", () => {
    expect(
      validateCitationCoverage({
        evidence: [memoryEvidence],
        citations: [],
        content: "The local store preserves bounded memory evidence.",
      }),
    ).toMatchObject({
      status: "warning",
      reason: "missing_memory_claim_citation",
      claimCount: 1,
      coveredClaimCount: 0,
      uncoveredClaimCount: 1,
      uncoveredClaims: [
        {
          text: "The local store preserves bounded memory evidence.",
          position: 0,
          reason: "missing_memory_citation",
        },
      ],
      message: citationValidationWarningMessage,
    });
  });

  it("does not let page or web citations cover memory-backed claims", () => {
    expect(
      validateCitationCoverage({
        evidence: [memoryEvidence, pageEvidence, webEvidence],
        citations: [citation(pageEvidence), citation(webEvidence)],
        content: "The saved memory says the local store preserves bounded evidence.",
      }),
    ).toMatchObject({
      status: "warning",
      reason: "missing_memory_claim_citation",
      validCitationCount: 2,
      validMemoryCitationCount: 0,
      claimCount: 1,
      uncoveredClaimCount: 1,
    });
  });

  it("bounds uncovered claim previews", () => {
    const result = validateCitationCoverage({
      evidence: [memoryEvidence],
      citations: [],
      content: [
        "First claim requires a memory citation.",
        "Second claim requires a memory citation.",
        "Third claim requires a memory citation.",
        "Fourth claim requires a memory citation.",
        "Fifth claim requires a memory citation.",
        "Sixth claim requires a memory citation.",
      ].join(" "),
    });

    expect(result).toMatchObject({
      status: "warning",
      reason: "missing_memory_claim_citation",
      claimCount: 6,
      uncoveredClaimCount: 6,
    });
    expect(result.uncoveredClaims).toHaveLength(5);
  });

  it("warns when local memory evidence has no valid memory citation", () => {
    expect(
      validateCitationCoverage({
        evidence: [memoryEvidence],
        citations: [],
      }),
    ).toMatchObject({
      status: "warning",
      reason: "missing_memory_citation",
      evidenceCount: 1,
      memoryEvidenceCount: 1,
      citationCount: 0,
      validCitationCount: 0,
      validMemoryCitationCount: 0,
      claimCount: 0,
      uncoveredClaims: [],
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
        content: "The current page describes bounded local evidence.",
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
    expect(
      readClioCitationValidation({
        clioCitationValidation: {
          status: "valid",
          reason: "valid_memory_citation",
          evidenceCount: 1,
          memoryEvidenceCount: 1,
          citationCount: 1,
          validCitationCount: 1,
          validMemoryCitationCount: 1,
        },
      }),
    ).toMatchObject({
      status: "valid",
      reason: "valid_memory_citation",
    });
    expect(readClioCitationValidation({ clioCitationValidation: { status: "warning" } })).toBe(
      undefined,
    );
  });

  it("rejects malformed claim validation previews", () => {
    expect(
      isCitationValidationResult({
        status: "warning",
        reason: "missing_memory_claim_citation",
        evidenceCount: 1,
        memoryEvidenceCount: 1,
        citationCount: 0,
        validCitationCount: 0,
        validMemoryCitationCount: 0,
        claimCount: 1,
        coveredClaimCount: 0,
        uncoveredClaimCount: 1,
        uncoveredClaims: [{ text: "Claim", position: -1, reason: "missing_memory_citation" }],
      }),
    ).toBe(false);
  });

  it("accepts extended validation metadata through the shared guard", () => {
    expect(
      isCitationValidationResult({
        status: "warning",
        reason: "semantic_judge_error",
        evidenceCount: 1,
        memoryEvidenceCount: 1,
        citationCount: 1,
        validCitationCount: 1,
        validMemoryCitationCount: 1,
        evidenceQuality: "weak",
        supportCheck: "judge_error",
        semanticJudge: {
          status: "error",
          checkedClaimCount: 1,
          unsupportedClaimCount: 0,
          providerKind: "chat",
          reason: "malformed json",
        },
        retry: {
          attempted: true,
          count: 1,
          exhausted: true,
          reason: "unsupported_memory_claim",
        },
      }),
    ).toBe(true);
  });
});
