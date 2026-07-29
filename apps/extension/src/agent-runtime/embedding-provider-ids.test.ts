import { describe, expect, it } from "vitest";
import {
  isEmbeddingReindexProviderId,
  isEmbeddingRuntimeProviderId,
} from "./embedding-provider-ids";

describe("embedding provider identities", () => {
  it("allows only local models in persisted runtime descriptors", () => {
    expect(isEmbeddingRuntimeProviderId("local-transformers")).toBe(true);
    expect(isEmbeddingRuntimeProviderId("local-deterministic")).toBe(false);
    expect(isEmbeddingRuntimeProviderId("openai")).toBe(false);
    expect(isEmbeddingRuntimeProviderId("openai-compatible")).toBe(false);
    expect(isEmbeddingRuntimeProviderId("unknown")).toBe(false);
  });

  it("allows only the installed local runtime for user-authorized reindex", () => {
    expect(isEmbeddingReindexProviderId("local-transformers")).toBe(true);
    expect(isEmbeddingReindexProviderId("openai")).toBe(false);
    expect(isEmbeddingReindexProviderId("openai-compatible")).toBe(false);
    expect(isEmbeddingReindexProviderId("local-deterministic")).toBe(false);
  });
});
