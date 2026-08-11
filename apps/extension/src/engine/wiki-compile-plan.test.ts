import type { WikiCompileManifestChunk } from "@/src/shared/wiki-compile";
import { describe, expect, it } from "vitest";
import {
  assertWikiCompileCoverage,
  buildWikiCompilePlan,
  resolveWikiCompileBudget,
} from "./wiki-compile-plan";

function chunk(
  id: string,
  ord: number,
  tokenCount: number,
  sectionPath = "Section",
): WikiCompileManifestChunk {
  return { id, ord, tokenCount, sectionPath, hash: `hash-${id}` };
}

describe("Wiki compile planner", () => {
  it("uses a conservative fallback for unknown models and caps known models", () => {
    expect(resolveWikiCompileBudget("private-model").contextTokens).toBe(8_192);
    expect(resolveWikiCompileBudget("gemini-2.5-pro").contextTokens).toBe(65_536);
    expect(resolveWikiCompileBudget("private-model").maxStepTokens).toBeLessThan(8_192);
  });

  it("creates one stable step when all chunks fit", () => {
    const budget = resolveWikiCompileBudget("private-model");
    const input = {
      source: { id: "source-1", contentHash: "source-hash", title: "Paper" },
      chunks: [chunk("chunk-2", 1, 500), chunk("chunk-1", 0, 500)],
      provider: "openai",
      modelId: "private-model",
      budget,
      chunkStrategyVersion: "paragraph-v2",
    };
    const first = buildWikiCompilePlan(input);
    const second = buildWikiCompilePlan(input);
    expect(first.inputSignature).toBe(second.inputSignature);
    expect(first.steps).toHaveLength(1);
    expect(first.steps[0]?.mainChunkIds).toEqual(["chunk-1", "chunk-2"]);
    expect(first.manifest).not.toHaveProperty("normalizedText");
  });

  it("splits continuously at a useful section boundary without losing coverage", () => {
    const base = resolveWikiCompileBudget("private-model");
    const budget = { ...base, maxStepTokens: 1_000, maxOverlapTokens: 250 };
    const plan = buildWikiCompilePlan({
      source: { id: "source-1", contentHash: "source-hash", title: "Paper" },
      chunks: [
        chunk("c1", 0, 400, "Intro"),
        chunk("c2", 1, 300, "Intro"),
        chunk("c3", 2, 300, "Method"),
        chunk("c4", 3, 400, "Method"),
      ],
      provider: "openai",
      modelId: "private-model",
      budget,
      chunkStrategyVersion: "paragraph-v2",
    });
    expect(plan.steps.map((step) => step.mainChunkIds)).toEqual([
      ["c1", "c2"],
      ["c3", "c4"],
    ]);
    assertWikiCompileCoverage(plan.manifest.chunks, plan.steps);
  });

  it("rejects empty, oversized and duplicate child chunks", () => {
    const budget = { ...resolveWikiCompileBudget("private-model"), maxStepTokens: 1_000 };
    const base = {
      source: { id: "source-1", contentHash: "hash", title: "Paper" },
      provider: "openai",
      modelId: "private-model",
      budget,
      chunkStrategyVersion: "paragraph-v2",
    };
    expect(() => buildWikiCompilePlan({ ...base, chunks: [] })).toThrow("SOURCE_EMPTY");
    expect(() => buildWikiCompilePlan({ ...base, chunks: [chunk("c1", 0, 1_001)] })).toThrow(
      "CHUNK_OVER_BUDGET",
    );
    expect(() =>
      buildWikiCompilePlan({ ...base, chunks: [chunk("c1", 0, 100), chunk("c1", 1, 100)] }),
    ).toThrow("CHUNK_ID_INVALID");
  });
});
