import { describe, expect, it } from "vitest";
import {
  defaultKnowledgeBaseAiSettings,
  knowledgeBaseAiSettingsStorageKey,
  readKnowledgeBaseAiSettings,
  saveKnowledgeBaseAiSettings,
} from "./knowledge-base-ai-settings";
import type { ChromeStorageAreaLike } from "./provider-settings";

function fakeStorage(initial: Record<string, unknown> = {}): ChromeStorageAreaLike {
  const values = { ...initial };
  return {
    async get(key) {
      if (typeof key === "string") return { [key]: values[key] };
      return { ...values };
    },
    async set(items) {
      Object.assign(values, items);
    },
  };
}

describe("Knowledge Base AI settings", () => {
  it("keeps Wiki disabled by default", async () => {
    await expect(readKnowledgeBaseAiSettings(fakeStorage())).resolves.toEqual(
      defaultKnowledgeBaseAiSettings(),
    );
  });

  it("normalizes partial and legacy payloads without enabling Wiki", async () => {
    await expect(
      readKnowledgeBaseAiSettings(
        fakeStorage({
          [knowledgeBaseAiSettingsStorageKey]: { wiki: { enabled: "true" }, fineRank: true },
        }),
      ),
    ).resolves.toEqual({ wiki: { enabled: false } });
  });

  it("round-trips the single Wiki switch", async () => {
    const storage = fakeStorage();
    const saved = await saveKnowledgeBaseAiSettings({ wiki: { enabled: true } }, storage);
    expect(saved.wiki.enabled).toBe(true);
    expect(saved.updatedAt).toEqual(expect.any(String));
    await expect(readKnowledgeBaseAiSettings(storage)).resolves.toEqual(saved);
  });

  it("rejects malformed save input", async () => {
    await expect(
      saveKnowledgeBaseAiSettings({ wiki: { enabled: "yes" } } as never, fakeStorage()),
    ).rejects.toThrow("boolean wiki.enabled");
  });
});
