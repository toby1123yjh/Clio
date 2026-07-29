import {
  type LocalEmbeddingModelManifest,
  assertLocalEmbeddingModelManifest,
  deriveLocalEmbeddingModelId,
} from "./contracts";

const e5Identity = {
  repository: "Xenova/multilingual-e5-small",
  revision: "761b726dd34fb83930e26aab4e9ac3899aa1fa78",
  dtype: "int8",
  dimension: 384,
} as const;

export const recommendedLocalEmbeddingModelManifest = {
  schemaVersion: 1,
  modelId: deriveLocalEmbeddingModelId(e5Identity),
  ...e5Identity,
  label: "Multilingual E5 Small",
  license: "MIT",
  metric: "cosine",
  maxInputTokens: 512,
  runtime: {
    task: "feature-extraction",
    pooling: "mean",
    normalize: true,
    queryPrefix: "query: ",
    documentPrefix: "passage: ",
  },
  files: [
    {
      path: "config.json",
      url: "https://huggingface.co/Xenova/multilingual-e5-small/resolve/761b726dd34fb83930e26aab4e9ac3899aa1fa78/config.json",
      bytes: 658,
      sha256: "cb99455288675345e1a4f411438d5d0adbba5fbd3a67ea4fb03c015433b996c1",
    },
    {
      path: "tokenizer_config.json",
      url: "https://huggingface.co/Xenova/multilingual-e5-small/resolve/761b726dd34fb83930e26aab4e9ac3899aa1fa78/tokenizer_config.json",
      bytes: 443,
      sha256: "a1d6bc8734a6f635dc158508bef000f8e2e5a759c7d92f984b2c86e5ff53425b",
    },
    {
      path: "tokenizer.json",
      url: "https://huggingface.co/Xenova/multilingual-e5-small/resolve/761b726dd34fb83930e26aab4e9ac3899aa1fa78/tokenizer.json",
      bytes: 17_082_730,
      sha256: "0b44a9d7b51c3c62626640cda0e2c2f70fdacdc25bbbd68038369d14ebdf4c39",
    },
    {
      path: "onnx/model_int8.onnx",
      url: "https://huggingface.co/Xenova/multilingual-e5-small/resolve/761b726dd34fb83930e26aab4e9ac3899aa1fa78/onnx/model_int8.onnx",
      bytes: 118_054_593,
      sha256: "4d24e2bc01a447951524466ef533e52944bf48509e6552810bcee1a2711cb02c",
    },
  ],
} as const satisfies LocalEmbeddingModelManifest;

assertLocalEmbeddingModelManifest(recommendedLocalEmbeddingModelManifest);

export const trustedLocalEmbeddingModelManifests = Object.freeze([
  recommendedLocalEmbeddingModelManifest,
] satisfies readonly LocalEmbeddingModelManifest[]);

export const recommendedLocalEmbeddingDownloadBytes =
  recommendedLocalEmbeddingModelManifest.files.reduce((sum, file) => sum + file.bytes, 0);

export function getTrustedLocalEmbeddingModelManifest(modelId: string) {
  return trustedLocalEmbeddingModelManifests.find((manifest) => manifest.modelId === modelId);
}
