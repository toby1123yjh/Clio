import { describe, expect, it } from "vitest";
import type { ClioWebSource } from "../shared/rpc";
import {
  buildMultiSourceRetrievalResult,
  evaluateLocalEvidenceQuality,
  planMultiSourceFusion,
  webSourcesToEvidence,
} from "./multi-source-retrieval";
import type { EvidenceItem } from "./types";

function memoryEvidence(id: string, text: string): EvidenceItem {
  return {
    id: `memory:${id}:chunk:chunk-${id}`,
    sourceKind: "memory",
    sourceUrl: `https://example.com/${id}`,
    sourceTitle: `Memory ${id}`,
    text,
    excerpt: text.slice(0, 120),
  };
}

function webSource(overrides: Partial<ClioWebSource> = {}): ClioWebSource {
  return {
    id: "web-source-1",
    title: "External source",
    url: "https://external.example.com/source",
    domain: "external.example.com",
    snippet: "A bounded search snippet about external facts.",
    ...overrides,
  };
}

const strongLocalEvidence = [
  memoryEvidence("a", "alpha beta gamma ".repeat(80)),
  memoryEvidence("b", "alpha beta delta ".repeat(80)),
  memoryEvidence("c", "alpha gamma epsilon ".repeat(80)),
];

describe("multi-source retrieval policy", () => {
  it("keeps ordinary chat local-only even when external is allowed by caller", () => {
    const result = buildMultiSourceRetrievalResult({
      request: {
        query: "alpha beta latest",
        trigger: { kind: "ordinary_chat" },
        allowExternal: true,
        externalAvailable: true,
      },
      localEvidence: [memoryEvidence("a", "alpha beta local evidence")],
      webSources: [webSource()],
    });

    expect(result.evidence.map((item) => item.sourceKind)).toEqual(["memory"]);
    expect(result.trace.fusion).toMatchObject({
      mode: "local_only",
      budget: { local_kb: 1, web_search: 0 },
    });
    expect(result.trace.fusion.reasons).toContain(
      "ordinary_chat_requires_explicit_external_trigger",
    );
    expect(result.trace.retrievers.find((trace) => trace.id === "web_search")).toMatchObject({
      status: "skipped",
      budget: 0,
    });
  });

  it("classifies strong local evidence and suppresses external retrieval dynamically", () => {
    const request = {
      query: "alpha beta gamma",
      trigger: { kind: "explicit_web" } as const,
      allowExternal: true,
      externalAvailable: true,
      maxEvidenceItems: 6,
    };

    expect(evaluateLocalEvidenceQuality(strongLocalEvidence, { query: request.query })).toBe(
      "strong",
    );
    expect(planMultiSourceFusion({ request, localEvidence: strongLocalEvidence })).toMatchObject({
      mode: "external_suppressed",
      localEvidenceQuality: "strong",
      budget: { local_kb: 3, web_search: 0 },
    });
  });

  it("allocates web snippet budget only for explicit external trigger with weak local evidence", () => {
    const weakLocalEvidence = [memoryEvidence("a", "alpha only")];
    const strongPlan = planMultiSourceFusion({
      request: {
        query: "alpha beta gamma",
        trigger: { kind: "explicit_web" },
        allowExternal: true,
        externalAvailable: true,
        maxEvidenceItems: 6,
      },
      localEvidence: strongLocalEvidence,
    });
    const weakPlan = planMultiSourceFusion({
      request: {
        query: "alpha beta gamma",
        trigger: { kind: "explicit_web" },
        allowExternal: true,
        externalAvailable: true,
        maxEvidenceItems: 6,
      },
      localEvidence: weakLocalEvidence,
    });

    expect(strongPlan.budget.web_search).toBe(0);
    expect(weakPlan).toMatchObject({
      mode: "external_allowed",
      localEvidenceQuality: "weak",
    });
    expect(weakPlan.budget.web_search).toBeGreaterThan(0);
    expect(weakPlan.reasons).toContain("local_evidence_weak");
  });

  it("falls back to local evidence when external source is unavailable", () => {
    const result = buildMultiSourceRetrievalResult({
      request: {
        query: "alpha beta gamma",
        trigger: { kind: "explicit_web" },
        allowExternal: true,
        externalAvailable: false,
      },
      localEvidence: [memoryEvidence("a", "alpha beta local evidence")],
      webSources: [webSource()],
    });

    expect(result.evidence.map((item) => item.sourceKind)).toEqual(["memory"]);
    expect(result.trace.fusion.reasons).toContain("external_unavailable");
    expect(result.trace.retrievers.find((trace) => trace.id === "web_search")).toMatchObject({
      status: "unavailable",
      evidenceCount: 0,
    });
  });

  it("converts web sources to bounded snippet evidence without loading full documents", () => {
    const evidence = webSourcesToEvidence(
      [
        webSource({
          snippet: "snippet ".repeat(300),
        }),
      ],
      { maxItems: 3, maxCharsPerItem: 120 },
    );

    expect(evidence).toHaveLength(1);
    expect(evidence[0]).toMatchObject({
      sourceKind: "web",
      sourceUrl: "https://external.example.com/source",
      sourceTitle: "External source",
    });
    expect(evidence[0]?.id).toMatch(/^web:/u);
    expect(evidence[0]?.text.length).toBeLessThanOrEqual(120);
    expect(evidence[0]?.text).not.toContain("<html");
  });
});
