import {
  type LocalEmbeddingModelManifest,
  assertLocalEmbeddingModelManifest,
  deriveLocalEmbeddingModelId,
} from "./contracts";

const e5Identity = {
  repository: "Xenova/multilingual-e5-base",
  revision: "1ec9243030a27d1a115d5c340572074c125b58b2",
  dtype: "int8",
  dimension: 768,
} as const;

export const recommendedLocalEmbeddingModelManifest = {
  schemaVersion: 1,
  modelId: deriveLocalEmbeddingModelId(e5Identity),
  ...e5Identity,
  label: "Multilingual E5 Base",
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
      url: "https://huggingface.co/Xenova/multilingual-e5-base/resolve/1ec9243030a27d1a115d5c340572074c125b58b2/config.json",
      bytes: 686,
      sha256: "4c27930e59106027abab56f7531c1fa6b14bbf31e8229ec36d68affa4e869bcd",
    },
    {
      path: "tokenizer_config.json",
      url: "https://huggingface.co/Xenova/multilingual-e5-base/resolve/1ec9243030a27d1a115d5c340572074c125b58b2/tokenizer_config.json",
      bytes: 418,
      sha256: "efb5c0d09722e5fe59a462cd2a9976ee216d55b037597d997cd3fe833216da15",
    },
    {
      path: "tokenizer.json",
      url: "https://huggingface.co/Xenova/multilingual-e5-base/resolve/1ec9243030a27d1a115d5c340572074c125b58b2/tokenizer.json",
      bytes: 17_082_660,
      sha256: "31cfad7e457e392bdebe2bd63796205ff3f6ab825e13da0a03d83dfbf932c919",
    },
    {
      path: "onnx/model_int8.onnx",
      url: "https://huggingface.co/Xenova/multilingual-e5-base/resolve/1ec9243030a27d1a115d5c340572074c125b58b2/onnx/model_int8.onnx",
      bytes: 278_184_162,
      sha256: "4a034acfb09fb03c0489c7518e26ec44c2004a304d0dba81a4543744799bccac",
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
