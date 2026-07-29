export type EmbeddingRuntimeProviderId = "local-transformers";
export type EmbeddingReindexProviderId = "local-transformers";

export function isEmbeddingRuntimeProviderId(value: unknown): value is EmbeddingRuntimeProviderId {
  return value === "local-transformers";
}

export function isEmbeddingReindexProviderId(value: unknown): value is EmbeddingReindexProviderId {
  return value === "local-transformers";
}
