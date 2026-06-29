import { describe, expect, it } from "vitest";
import {
  type LocalRagMemory,
  assembleLocalRagEvidencePack,
  planLocalRagRetrieval,
} from "./local-rag-evidence";

function memory(overrides: Partial<LocalRagMemory> = {}): LocalRagMemory {
  return {
    id: "mem-1",
    sourceUrl: "https://example.com/a",
    sourceTitle: "Example Memory",
    normalizedText:
      "The durable memory text talks about onboarding, billing, and enterprise support.",
    excerpt: "The durable memory text talks about onboarding.",
    chunks: [
      {
        id: "chunk-1",
        ord: 0,
        text: "Product onboarding notes for the support team.",
        tokenCount: 8,
      },
      {
        id: "chunk-2",
        ord: 1,
        text: "Billing operations and renewal policy details.",
        tokenCount: 7,
      },
    ],
    ...overrides,
  };
}

describe("assembleLocalRagEvidencePack", () => {
  it("returns no evidence for empty query or memory input", () => {
    expect(assembleLocalRagEvidencePack({ query: "", memories: [memory()] })).toEqual([]);
    expect(assembleLocalRagEvidencePack({ query: "billing", memories: [] })).toEqual([]);
  });

  it("prefers matching chunks and emits memory evidence ids", () => {
    const pack = assembleLocalRagEvidencePack({
      query: "billing renewal",
      memories: [memory()],
      maxItems: 2,
    });

    expect(pack).toHaveLength(1);
    expect(pack[0]).toMatchObject({
      id: "memory:mem-1:chunk:chunk-2",
      sourceKind: "memory",
      sourceTitle: "Example Memory",
      text: [
        "Product onboarding notes for the support team.",
        "Billing operations and renewal policy details.",
      ].join(" "),
    });
  });

  it("can disable adjacent chunk context for callers that need anchor-only evidence", () => {
    const pack = assembleLocalRagEvidencePack({
      query: "billing renewal",
      memories: [memory()],
      contextChunksBefore: 0,
      contextChunksAfter: 0,
    });

    expect(pack).toHaveLength(1);
    expect(pack[0]).toMatchObject({
      id: "memory:mem-1:chunk:chunk-2",
      text: "Billing operations and renewal policy details.",
    });
  });

  it("keeps adjacent context scoped to the matched memory", () => {
    const pack = assembleLocalRagEvidencePack({
      query: "billing",
      memories: [
        memory({
          chunks: [
            { id: "chunk-1", ord: 0, text: "Same memory setup context.", tokenCount: 4 },
            { id: "chunk-2", ord: 1, text: "Billing operations details.", tokenCount: 3 },
          ],
        }),
        memory({
          id: "mem-2",
          chunks: [{ id: "chunk-3", ord: 0, text: "Other memory lead-in context.", tokenCount: 4 }],
        }),
      ],
    });

    expect(pack).toHaveLength(1);
    expect(pack[0]?.text).toContain("Same memory setup context.");
    expect(pack[0]?.text).not.toContain("Other memory lead-in context.");
  });

  it("deduplicates overlapping windows by keeping the higher-priority anchor", () => {
    const pack = assembleLocalRagEvidencePack({
      query: "alpha beta",
      memories: [
        memory({
          chunks: [
            { id: "chunk-1", ord: 0, text: "Alpha launch notes.", tokenCount: 3 },
            { id: "chunk-2", ord: 1, text: "Beta launch notes.", tokenCount: 3 },
            { id: "chunk-3", ord: 2, text: "Gamma launch notes.", tokenCount: 3 },
          ],
        }),
      ],
      maxItems: 4,
    });

    expect(pack.map((item) => item.id)).toEqual(["memory:mem-1:chunk:chunk-1"]);
    expect(pack[0]?.text).toBe("Alpha launch notes. Beta launch notes.");
  });

  it("truncates expanded windows under item budgets", () => {
    const pack = assembleLocalRagEvidencePack({
      query: "needle",
      memories: [
        memory({
          chunks: [
            { id: "chunk-1", ord: 0, text: "Short setup.", tokenCount: 2 },
            { id: "chunk-2", ord: 1, text: "Needle match with details.", tokenCount: 4 },
            { id: "chunk-3", ord: 2, text: "Follow-up context continues.", tokenCount: 4 },
          ],
        }),
      ],
      maxCharsPerItem: 38,
    });

    expect(pack).toHaveLength(1);
    expect(pack[0]?.text.length).toBeLessThanOrEqual(38);
    expect(pack[0]?.text).toBe("Short setup. Needle match with deta...");
  });

  it("does not inject weak fallback evidence for ordinary questions", () => {
    const pack = assembleLocalRagEvidencePack({
      query: "what should we prioritize next quarter",
      memories: [memory()],
    });

    expect(pack).toEqual([]);
  });

  it("falls back to memory excerpt when local intent is explicit", () => {
    const pack = assembleLocalRagEvidencePack({
      query: "check my saved archive about unmatched",
      memories: [memory()],
    });

    expect(pack).toHaveLength(1);
    expect(pack[0]).toMatchObject({
      id: "memory:mem-1",
      sourceKind: "memory",
      text: "The durable memory text talks about onboarding.",
    });
  });

  it("enforces per-item and total character budgets", () => {
    const pack = assembleLocalRagEvidencePack({
      query: "alpha beta",
      memories: [
        memory({
          id: "mem-1",
          chunks: [{ id: "chunk-1", ord: 0, text: "alpha ".repeat(20), tokenCount: 20 }],
        }),
        memory({
          id: "mem-2",
          chunks: [{ id: "chunk-2", ord: 0, text: "beta ".repeat(20), tokenCount: 20 }],
        }),
      ],
      maxItems: 4,
      maxCharsPerItem: 20,
      maxTotalChars: 30,
    });

    expect(pack).toHaveLength(2);
    expect(pack[0]?.text.length).toBeLessThanOrEqual(20);
    expect(pack[1]?.text.length).toBeLessThanOrEqual(10);
    expect(pack.reduce((sum, item) => sum + item.text.length, 0)).toBeLessThanOrEqual(30);
  });

  it("deduplicates repeated memory and chunk records deterministically", () => {
    const repeated = memory({
      chunks: [
        { id: "chunk-1", ord: 0, text: "billing first", tokenCount: 2 },
        { id: "chunk-1", ord: 1, text: "billing duplicate", tokenCount: 2 },
      ],
    });

    const pack = assembleLocalRagEvidencePack({
      query: "billing",
      memories: [repeated, repeated],
      maxItems: 4,
    });

    expect(pack.map((item) => item.id)).toEqual(["memory:mem-1:chunk:chunk-1"]);
    expect(pack[0]?.text).toBe("billing first");
  });
});

describe("planLocalRagRetrieval", () => {
  it("skips empty input, short smalltalk, and short non-local queries", () => {
    expect(planLocalRagRetrieval("")).toEqual({ shouldRetrieve: false, reason: "empty" });
    expect(planLocalRagRetrieval("hi")).toEqual({
      shouldRetrieve: false,
      reason: "smalltalk",
    });
    expect(planLocalRagRetrieval("你好")).toEqual({
      shouldRetrieve: false,
      reason: "smalltalk",
    });
    expect(planLocalRagRetrieval("ok?")).toEqual({
      shouldRetrieve: false,
      reason: "smalltalk",
    });
    expect(planLocalRagRetrieval("why")).toEqual({
      shouldRetrieve: false,
      reason: "too_short",
    });
  });

  it("skips pure creative requests without local context intent", () => {
    expect(planLocalRagRetrieval("write a concise announcement")).toEqual({
      shouldRetrieve: false,
      reason: "creative",
    });
    expect(planLocalRagRetrieval("润色这句话")).toEqual({
      shouldRetrieve: false,
      reason: "creative",
    });
  });

  it("retrieves when local memory or project/document intent is explicit", () => {
    expect(planLocalRagRetrieval("what did I save about billing?")).toEqual({
      shouldRetrieve: true,
      reason: "local_intent",
    });
    expect(planLocalRagRetrieval("查一下知识库里面 LightRAG 的笔记")).toEqual({
      shouldRetrieve: true,
      reason: "local_intent",
    });
    expect(planLocalRagRetrieval("继续分析这个项目的 commit")).toEqual({
      shouldRetrieve: true,
      reason: "local_intent",
    });
  });

  it("retrieves ordinary longer questions and lets the evidence gate filter weak results", () => {
    expect(planLocalRagRetrieval("how should the retrieval pipeline handle evidence?")).toEqual({
      shouldRetrieve: true,
      reason: "question",
    });
  });
});
