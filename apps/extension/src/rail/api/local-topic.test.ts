import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("local topic wiki compile helpers", () => {
  const source = readFileSync(fileURLToPath(new URL("./local-topic.ts", import.meta.url)), "utf8");

  it("stores source refs from bounded memory evidence ids", () => {
    expect(source).toContain("function sourceRefFromEvidence");
    expect(source).toContain("/^memory:(.+):chunk:(.+)$/u.exec(item.id)");
    expect(source).toContain("memoryId");
    expect(source).toContain("chunkId");
    expect(source).toContain("...sourceRefFromEvidence(item)");
  });
});
