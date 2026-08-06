import { describe, expect, it } from "vitest";
import {
  type SourceCoarseRankCandidate,
  rankSourceCoarseCandidates,
  runSourceFineRanker,
  selectSourceCoarseCandidates,
} from "./source-coarse-ranker";

interface TestItem {
  id: string;
}

function candidate(
  id: string,
  overrides: Partial<SourceCoarseRankCandidate<TestItem>> = {},
): SourceCoarseRankCandidate<TestItem> {
  return {
    id,
    item: { id },
    title: id,
    abstract: "",
    keywords: [],
    headings: [],
    capturedAt: "2026-08-05T00:00:00.000Z",
    trackRanks: { fts_chunks: 1 },
    hits: [
      {
        chunkId: `${id}-chunk-0`,
        ord: 0,
        snippet: "retrieval evidence",
        track: "fts_chunks",
        rank: 1,
      },
    ],
    totalChunkCount: 10,
    totalSectionCount: 0,
    fallbackScore: 1 / 61,
    bestRank: 1,
    ...overrides,
  };
}

describe("source document coarse ranker", () => {
  it("treats matching title and abstract as explicit topic evidence", () => {
    const [ranked] = rankSourceCoarseCandidates("graph retrieval", [
      candidate("paper", {
        title: "Graph Retrieval for Scientific Literature",
        abstract: "A graph retrieval architecture for research corpora.",
        trackRanks: { meta_sources: 1 },
        hits: [],
      }),
    ]);

    expect(ranked?.signals.topicEvidence).toBeGreaterThan(0.8);
    expect(ranked?.signals.matchedMetadataFields).toEqual(["title", "abstract"]);
    expect(ranked?.signals.lanes.find((lane) => lane.name === "topic")?.eligible).toBe(true);
  });

  it("counts independent sections but collapses adjacent unsectioned chunks into one region", () => {
    const independent = candidate("independent", {
      hits: [
        chunkHit("i-1", 1, "Introduction"),
        chunkHit("i-4", 4, "Evaluation"),
        chunkHit("i-8", 8, "Limitations"),
      ],
      totalChunkCount: 20,
      totalSectionCount: 6,
    });
    const adjacent = candidate("adjacent", {
      hits: [chunkHit("a-1", 1), chunkHit("a-2", 2), chunkHit("a-3", 3)],
      totalChunkCount: 20,
      totalSectionCount: 0,
    });
    const ranked = rankSourceCoarseCandidates("retrieval evidence", [independent, adjacent]);
    const independentSignals = ranked.find((item) => item.candidate.id === "independent")?.signals;
    const adjacentSignals = ranked.find((item) => item.candidate.id === "adjacent")?.signals;

    expect(independentSignals?.uniqueHitChunkCount).toBe(3);
    expect(independentSignals?.evidenceRegionCount).toBe(3);
    expect(adjacentSignals?.evidenceRegionCount).toBe(1);
    expect(independentSignals?.breadth ?? 0).toBeGreaterThan(adjacentSignals?.breadth ?? 1);
  });

  it("deduplicates the same chunk across lexical and vector tracks", () => {
    const [ranked] = rankSourceCoarseCandidates("bounded evidence", [
      candidate("duplicate", {
        trackRanks: { fts_chunks: 1, vector_chunks: 1 },
        hits: [
          chunkHit("same", 2, "Methods", "fts_chunks", 1),
          chunkHit("same", 2, "Methods", "vector_chunks", 2),
        ],
      }),
    ]);

    expect(ranked?.signals.uniqueHitChunkCount).toBe(1);
    expect(ranked?.signals.evidenceRegionCount).toBe(1);
    expect(ranked?.signals.breadth).toBe(0);
    expect(ranked?.signals.agreement).toBeGreaterThan(0);
  });

  it("normalizes breadth by document length instead of rewarding long PDFs", () => {
    const hits = [
      chunkHit("c-1", 1, "A"),
      chunkHit("c-4", 4, "B"),
      chunkHit("c-8", 8, "C"),
      chunkHit("c-12", 12, "D"),
    ];
    const ranked = rankSourceCoarseCandidates("retrieval evidence", [
      candidate("short", { hits, totalChunkCount: 16, totalSectionCount: 4 }),
      candidate("long", { hits, totalChunkCount: 800, totalSectionCount: 100 }),
    ]);
    const short = ranked.find((item) => item.candidate.id === "short")?.signals;
    const long = ranked.find((item) => item.candidate.id === "long")?.signals;

    expect(short?.hitChunkRatio ?? 0).toBeGreaterThan(long?.hitChunkRatio ?? 1);
    expect(short?.breadth ?? 0).toBeGreaterThan(long?.breadth ?? 1);
  });

  it("suppresses corpus-wide generic terms in the specificity lane", () => {
    const generic = rankSourceCoarseCandidates("transformer", [
      candidate("vision", { title: "Vision transformer baseline" }),
      candidate("speech", { title: "Speech transformer baseline" }),
      candidate("retrieval", { title: "Retrieval transformer baseline" }),
    ]);
    expect(generic.every((item) => item.signals.specificity === 0)).toBe(true);

    const specific = rankSourceCoarseCandidates("puritychecker 42", [
      candidate("target", { title: "PurityChecker 42 evaluation" }),
      candidate("other", { title: "Generic evaluation" }),
    ]);
    expect(
      specific.find((item) => item.candidate.id === "target")?.signals.specificity ?? 0,
    ).toBeGreaterThan(0);
  });

  it("ranks four strong signals above five weak positive signals", () => {
    const query = "contextual rag automated code refactoring developer reviewer agents";
    const ranked = rankSourceCoarseCandidates(query, [
      candidate("focused", {
        title: "Contextual RAG for Automated Code Refactoring with Developer Reviewer Agents",
        trackRanks: { meta_sources: 1, fts_chunks: 1 },
        hits: [
          {
            ...chunkHit("focused-hit", 1, "Method", "fts_chunks", 1),
            snippet: query,
          },
        ],
      }),
      candidate("broad-but-weak", {
        title: "Contextual RAG overview",
        trackRanks: { meta_sources: 20, fts_chunks: 20 },
        hits: [
          {
            ...chunkHit("weak-1", 1, "Introduction", "fts_chunks", 20),
            snippet: "contextual rag background",
          },
          {
            ...chunkHit("weak-2", 5, "Discussion", "fts_chunks", 21),
            snippet: "automated developer workflows",
          },
          {
            ...chunkHit("weak-3", 9, "Related Work", "fts_chunks", 22),
            snippet: "general software systems",
          },
        ],
      }),
      candidate("unrelated", {
        title: "Distributed storage systems",
        hits: [{ ...chunkHit("other", 1), snippet: "consensus and replication" }],
      }),
    ]);

    expect(ranked.map((item) => item.candidate.id).indexOf("focused")).toBeLessThan(
      ranked.map((item) => item.candidate.id).indexOf("broad-but-weak"),
    );
    expect(ranked.find((item) => item.candidate.id === "focused")?.signals.breadth).toBe(0);
    expect(
      ranked
        .find((item) => item.candidate.id === "broad-but-weak")
        ?.signals.lanes.every((lane) => lane.eligible),
    ).toBe(true);
  });

  it("uses breadth to lift a broadly supported document when relevance is comparable", () => {
    const query = "graph retrieval";
    const shared = {
      title: "Graph Retrieval",
      abstract: "Graph retrieval for research corpora",
      trackRanks: { meta_sources: 1, fts_chunks: 1 },
      totalChunkCount: 20,
      totalSectionCount: 4,
    } satisfies Partial<SourceCoarseRankCandidate<TestItem>>;
    const ranked = rankSourceCoarseCandidates(query, [
      candidate("narrow", {
        ...shared,
        hits: [
          {
            ...chunkHit("narrow-hit", 1, "Method"),
            snippet: "graph retrieval evidence",
          },
        ],
      }),
      candidate("broad", {
        ...shared,
        hits: [
          chunkHit("broad-1", 1, "Introduction"),
          chunkHit("broad-2", 5, "Method"),
          chunkHit("broad-3", 9, "Evaluation"),
        ],
      }),
    ]);

    expect(ranked[0]?.candidate.id).toBe("broad");
    expect(ranked[0]?.signals.breadth ?? 0).toBeGreaterThan(0);
  });

  it("does not let track agreement score without topic or local evidence", () => {
    const [ranked] = rankSourceCoarseCandidates("graph retrieval", [
      candidate("agreement-only", {
        title: "Distributed storage systems",
        trackRanks: { fts_chunks: 1, vector_chunks: 1 },
        hits: [],
      }),
    ]);
    const agreementLane = ranked?.signals.lanes.find((lane) => lane.name === "agreement");

    expect(ranked?.signals.agreement ?? 0).toBeGreaterThan(0);
    expect(agreementLane?.fusionStrength).toBe(0);
    expect(ranked?.score).toBe(0);
  });

  it("keeps topic, breadth, and local-peak document shapes in a bounded coarse pool", () => {
    const ranked = rankSourceCoarseCandidates("rare retrieval evidence", [
      candidate("topic", {
        title: "Rare Retrieval Evidence",
        trackRanks: { meta_sources: 1 },
        hits: [],
      }),
      candidate("broad", {
        hits: [
          chunkHit("b-1", 1, "One", "fts_chunks", 20),
          chunkHit("b-5", 5, "Two", "fts_chunks", 21),
          chunkHit("b-9", 9, "Three", "fts_chunks", 22),
        ],
      }),
      candidate("peak", {
        hits: [
          {
            ...chunkHit("p", 1, undefined, "fts_chunks", 1),
            snippet: "rare retrieval evidence",
          },
        ],
      }),
      candidate("agreement", {
        trackRanks: { meta_sources: 2, vector_meta: 2, fts_chunks: 2, vector_chunks: 2 },
        hits: [{ ...chunkHit("a", 1), snippet: "generic background" }],
      }),
    ]);
    const selected = selectSourceCoarseCandidates(ranked, 3);

    expect(new Set(selected.map((item) => item.candidate.id))).toEqual(
      new Set(["topic", "broad", "peak"]),
    );
  });

  it("leaves a failure-safe optional fine-rank boundary", async () => {
    const input = [{ id: "first" }, { id: "second" }];
    await expect(runSourceFineRanker("query", input)).resolves.toEqual({
      items: input,
      status: "not_configured",
    });
    await expect(
      runSourceFineRanker("query", input, {
        rerank: async ({ candidates }) => [...candidates].reverse(),
      }),
    ).resolves.toEqual({ items: [...input].reverse(), status: "applied" });
    const failed = await runSourceFineRanker("query", input, {
      rerank: async () => {
        throw new Error("offline");
      },
    });
    expect(failed).toEqual({ items: input, status: "failed", reason: "fine_ranker_failed" });
  });
});

function chunkHit(
  chunkId: string,
  ord: number,
  sectionPath?: string,
  track: "fts_chunks" | "vector_chunks" = "fts_chunks",
  rank = ord,
) {
  return {
    chunkId,
    ord,
    snippet: "retrieval evidence",
    track,
    rank,
    ...(track === "vector_chunks" ? { rawScore: 0.8 } : {}),
    ...(sectionPath === undefined ? {} : { sectionPath }),
  };
}
