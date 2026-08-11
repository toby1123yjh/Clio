import type { CaptureBasePayload, EngineRequest, EngineResultFor } from "@/src/shared/rpc";
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  LocalEngine,
  type LocalEngineOptions,
  type LocalEngineSqliteApi,
  type LocalEngineSqliteDb,
} from "./local-engine.worker";
import { resolveWikiCompileBudget } from "./wiki-compile-plan";

let sqliteApi: LocalEngineSqliteApi;
const engines: LocalEngine[] = [];

beforeAll(async () => {
  sqliteApi = (await sqlite3InitModule()) as unknown as LocalEngineSqliteApi;
});

afterEach(() => {
  while (engines.length > 0) engines.pop()?.close();
});

describe("Local Engine Wiki compiler scheduler", () => {
  it("persists map checkpoints and atomically publishes reduce artifacts", async () => {
    const harness = createHarness();
    const capture = await harness.request({
      kind: "capturePage",
      payload: pagePayload(
        "Wiki scheduler source with enough content to exercise the bounded map and reduce path.",
      ),
    });
    const budget = resolveWikiCompileBudget("gpt-4o");
    const created = await harness.request({
      kind: "createWikiCompileRun",
      payload: {
        sourceId: capture.memory.id,
        provider: "openai",
        modelId: "gpt-4o",
        budget,
      },
    });
    expect(created.disposition).toBe("created");
    const run = created.run;
    if (run === undefined) throw new Error("Expected a Wiki run.");
    const claimed = await harness.request({
      kind: "claimNextWikiCompileStep",
      leaseOwner: "test-runner",
      now: "2026-08-11T00:00:00.000Z",
      leaseMs: 60_000,
    });
    expect(claimed.step?.runId).toBe(run.id);
    const step = claimed.step;
    if (step === undefined) throw new Error("Expected a map step.");
    const input = await harness.request({
      kind: "getWikiCompileStepInput",
      runId: run.id,
      stepId: step.id,
      leaseOwner: "test-runner",
    });
    const completed = await harness.request({
      kind: "completeWikiCompileStep",
      payload: {
        runId: run.id,
        stepId: step.id,
        leaseOwner: "test-runner",
        inputSignature: run.inputSignature,
        result: {
          findings: [
            {
              kind: "overview",
              key: "overview",
              title: "Overview",
              summary: "A bounded Wiki source summary.",
              evidenceChunkIds: input.mainChunks.map((chunk) => chunk.id),
            },
          ],
          claims: [],
          rollingDigest: "A rolling digest for the reduce stage.",
          coveredChunkIds: input.mainChunks.map((chunk) => chunk.id),
        },
      },
    });
    expect(completed.status).toBe("completed");
    const reduceClaim = await harness.request({
      kind: "claimWikiCompileReduce",
      leaseOwner: "test-reducer",
      now: "2026-08-11T00:01:00.000Z",
      leaseMs: 60_000,
    });
    expect(reduceClaim.run?.id).toBe(run.id);
    const reduceInput = await harness.request({
      kind: "getWikiCompileReduceInput",
      runId: run.id,
      leaseOwner: "test-reducer",
    });
    const final = await harness.request({
      kind: "completeWikiCompileReduce",
      payload: {
        runId: run.id,
        leaseOwner: "test-reducer",
        inputSignature: run.inputSignature,
        result: {
          digest: {
            title: "Wiki scheduler source",
            content: "The source was compiled into a bounded Wiki digest.",
            evidenceChunkIds: reduceInput.manifestChunkIds,
          },
          sections: [],
          claims: [],
          coveredChunkIds: reduceInput.manifestChunkIds,
        },
      },
    });
    expect(final.status).toBe("completed");
    expect(harness.count("wiki_artifacts", "scope_id = ?", [capture.memory.id])).toBe(1);
    expect(harness.count("wiki_compile_events", "run_id = ?", [run.id])).toBeGreaterThanOrEqual(4);
    const reused = await harness.request({
      kind: "createWikiCompileRun",
      payload: {
        sourceId: capture.memory.id,
        provider: "openai",
        modelId: "gpt-4o",
        budget,
      },
    });
    expect(reused.disposition).toBe("reused_artifact");
  });

  it("rejects transport enqueue and cancels active runs when a Source is deleted", async () => {
    const harness = createHarness();
    const capture = await harness.request({
      kind: "capturePage",
      payload: pagePayload("A source that will be deleted while Wiki compilation is queued."),
    });
    const runResult = await harness.request({
      kind: "createWikiCompileRun",
      payload: {
        sourceId: capture.memory.id,
        provider: "openai",
        modelId: "gpt-4o",
        budget: resolveWikiCompileBudget("gpt-4o"),
      },
    });
    const runId = runResult.run?.id;
    if (runId === undefined) throw new Error("Expected a Wiki run.");
    await expect(
      harness.request({ kind: "enqueueWikiCompileRun", payload: { sourceId: capture.memory.id } }),
    ).rejects.toMatchObject({ code: "WIKI_COMPILE_TRUSTED_ROUTE_REQUIRED" });
    await harness.request({ kind: "deleteMemory", id: capture.memory.id });
    const detail = await harness.request({ kind: "getWikiCompileRun", id: runId });
    expect(detail?.status).toBe("cancelled");
  });
});

function createHarness(options: Omit<LocalEngineOptions, "openDatabase"> = {}) {
  const dbPath = `/local-engine-wiki-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite3`;
  let db: LocalEngineSqliteDb | undefined;
  const engine = new LocalEngine({
    ...options,
    openDatabase: async () => {
      db = new sqliteApi.oo1.DB({ filename: dbPath, flags: "c" });
      return { db, sqliteVersion: sqliteApi.version.libVersion, opfs: "unavailable" };
    },
  });
  engines.push(engine);
  return {
    request: <T extends EngineRequest>(request: T) =>
      engine.handle(request) as Promise<EngineResultFor<T>>,
    count(table: string, where: string, bind: unknown[] = []) {
      if (db === undefined) throw new Error("Test database is not open.");
      return Number(db.selectValue(`SELECT COUNT(*) FROM ${table} WHERE ${where}`, bind) ?? 0);
    },
  };
}

function pagePayload(normalizedText: string): CaptureBasePayload {
  return {
    sourceUrl: "https://example.test/wiki-scheduler",
    sourceTitle: "Wiki scheduler source",
    normalizedText,
    capturedAt: "2026-08-11T00:00:00.000Z",
    metadata: { source_type: "webpage" },
  };
}
