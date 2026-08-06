import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import type {
  EmbeddingReindexModelDescriptor,
  EngineRequest,
  EngineResultFor,
} from "@/src/shared/rpc";
import { env, pipeline } from "@huggingface/transformers";
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import { describe, expect, it } from "vitest";
import {
  type ActiveEmbeddingModel,
  LocalEngine,
  type LocalEngineSqliteApi,
  type PdfRawFileStore,
} from "./local-engine.worker";
import { parsePdfDocument } from "./pdf-parser";

const shouldRunRealCorpusEval = process.env.CLIO_REAL_CORPUS_EVAL === "1";
const assetDirectory = path.resolve(".output/chrome-mv3/assets/test-workspace");
const query = "contextual RAG automated code refactoring developer reviewer agents";
const repository = "Xenova/multilingual-e5-base";
const revision = "1ec9243030a27d1a115d5c340572074c125b58b2";
const modelDirectory = path.resolve(
  `node_modules/@huggingface/transformers/.cache/${repository}/${revision}`,
);
const model: EmbeddingReindexModelDescriptor = {
  id: `local-transformers:${repository}:d768`,
  provider: "local-transformers",
  label: "Real corpus E5 base",
  dimension: 768,
  metric: "cosine",
};

interface FeatureExtractionTensor {
  dims: number[];
  data: ArrayLike<number>;
  dispose?: () => void;
}

interface FeatureExtractor {
  (
    inputs: string[],
    options: { pooling: "mean"; normalize: true; truncation: true; max_length: 512 },
  ): Promise<FeatureExtractionTensor>;
  dispose?: () => Promise<void>;
}

describe.runIf(shouldRunRealCorpusEval)("source coarse ranker real corpus evaluation", () => {
  it(
    "ranks the nine-paper PDF corpus through the production retrieval chain",
    async () => {
      env.allowRemoteModels = false;
      env.allowLocalModels = true;
      const extractor = (await pipeline("feature-extraction", modelDirectory, {
        dtype: "int8",
        device: "cpu",
        local_files_only: true,
      })) as unknown as FeatureExtractor;
      const sqliteApi = (await sqlite3InitModule()) as unknown as LocalEngineSqliteApi;
      const dbPath = `/source-coarse-real-eval-${Date.now()}.sqlite3`;
      const rawFiles = new MemoryPdfRawFileStore();
      const engine = new LocalEngine({
        pdfParser: parsePdfDocument,
        pdfRawFileStore: rawFiles,
        embeddingProviderFactory: (activeModel) =>
          activeModel.modelId === model.id ? realEmbeddingProvider(activeModel, extractor) : null,
        openDatabase: async () => ({
          db: new sqliteApi.oo1.DB({ filename: dbPath, flags: "c" }),
          sqliteVersion: sqliteApi.version.libVersion,
          opfs: "unavailable",
        }),
      });

      try {
        const entries = (await readdir(assetDirectory, { withFileTypes: true }))
          .filter((entry) => entry.isFile() && entry.name.toLocaleLowerCase().endsWith(".pdf"))
          .sort((left, right) => left.name.localeCompare(right.name));
        expect(entries).toHaveLength(9);
        for (const entry of entries) {
          const bytes = new Uint8Array(await readFile(path.join(assetDirectory, entry.name)));
          await request(engine, {
            kind: "capturePdf",
            payload: {
              sourceUrl: `clio://real-corpus/${encodeURIComponent(entry.name)}`,
              sourceTitle: entry.name,
              capturedAt: "2026-08-06T00:00:00.000Z",
              bytes,
              metadata: { file_name: entry.name, file_size: bytes.byteLength },
            },
          });
        }

        const reindex = await request(engine, { kind: "reindex", scope: "embeddings", model });
        if (reindex.status !== "done") {
          console.log(
            "REAL_SOURCE_COARSE_RANK_REINDEX_FAILURE",
            JSON.stringify(await request(engine, { kind: "getJobStatus", limit: 100 }), null, 2),
          );
        }
        expect(reindex.status).toBe("done");
        const result = await request(engine, {
          kind: "searchKnowledgeBase",
          payload: { query, mode: "semantic", limit: 5, includeChunks: 8 },
        });
        const diagnostics = result.items.map((item, index) => ({
          rank: index + 1,
          title: item.sourceTitle,
          score: rounded(item.score),
          topic: rounded(item.coarseSignals?.topicEvidence),
          localPeak: rounded(item.coarseSignals?.localPeak),
          breadth: rounded(item.coarseSignals?.breadth),
          specificity: rounded(item.coarseSignals?.specificity),
          agreement: rounded(item.coarseSignals?.agreement),
          hits: `${item.coarseSignals?.uniqueHitChunkCount ?? 0}/${item.coarseSignals?.totalChunkCount ?? 0}`,
          lanes: item.coarseSignals?.lanes.map((lane) => ({
            name: lane.name,
            raw: rounded(lane.rawScore),
            strength: rounded(lane.fusionStrength),
            rank: lane.rank,
          })),
        }));
        console.log("REAL_SOURCE_COARSE_RANK_EVAL", JSON.stringify(diagnostics, null, 2));

        expect(result.trace.coarseRank?.candidateCount).toBe(9);
        const muarf = result.items.find((item) =>
          item.sourceTitle.toLocaleLowerCase().includes("muarf"),
        );
        expect(result.items[0]?.sourceTitle.toLocaleLowerCase()).toContain("muarf");
        expect(muarf?.coarseSignals?.uniqueHitChunkCount).toBe(1);
        expect(muarf?.coarseSignals?.breadth).toBe(0);
      } finally {
        engine.close();
        await extractor.dispose?.();
      }
    },
    15 * 60_000,
  );
});

function realEmbeddingProvider(activeModel: ActiveEmbeddingModel, extractor: FeatureExtractor) {
  return {
    modelId: activeModel.modelId,
    provider: activeModel.provider,
    dimension: activeModel.dimension,
    async embedTexts(inputs: string[], purpose: "query" | "document" = "document") {
      const vectors: number[][] = [];
      const prefixed = inputs.map(
        (input) => `${purpose === "query" ? "query: " : "passage: "}${input}`,
      );
      for (let offset = 0; offset < prefixed.length; offset += 8) {
        const batch = prefixed.slice(offset, offset + 8);
        const tensor = await extractor(batch, {
          pooling: "mean",
          normalize: true,
          truncation: true,
          max_length: 512,
        });
        try {
          const dimension = tensor.dims.at(-1) ?? 0;
          expect(dimension).toBe(activeModel.dimension);
          const data = Array.from(tensor.data, Number);
          for (let index = 0; index < batch.length; index += 1) {
            vectors.push(data.slice(index * dimension, (index + 1) * dimension));
          }
        } finally {
          tensor.dispose?.();
        }
      }
      return vectors;
    },
  };
}

async function request<T extends EngineRequest>(engine: LocalEngine, input: T) {
  return engine.handle(input) as Promise<EngineResultFor<T>>;
}

function rounded(value: number | undefined) {
  return Number((value ?? 0).toFixed(6));
}

class MemoryPdfRawFileStore implements PdfRawFileStore {
  private readonly files = new Map<string, Uint8Array>();

  async write(input: Parameters<PdfRawFileStore["write"]>[0]) {
    this.files.set(input.sourceId, new Uint8Array(input.bytes));
    return {
      storage: "opfs" as const,
      path: `/real-eval/${encodeURIComponent(input.sourceId)}.pdf`,
      byteLength: input.bytes.byteLength,
      contentType: "application/pdf" as const,
      persistedAt: input.capturedAt,
    };
  }

  async read(sourceId: string) {
    const bytes = this.files.get(sourceId);
    if (bytes === undefined) throw new Error(`Missing raw PDF ${sourceId}`);
    return new Uint8Array(bytes);
  }

  async delete(sourceId: string) {
    this.files.delete(sourceId);
  }

  async clear() {
    this.files.clear();
  }
}
