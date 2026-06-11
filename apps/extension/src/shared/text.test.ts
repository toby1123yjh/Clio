import { describe, expect, it } from "vitest";
import {
  buildFtsQuery,
  chunkText,
  expandChineseBigrams,
  hashText,
  normalizeSourceUrl,
  normalizeText,
} from "./text";

describe("text utilities", () => {
  it("normalizes text without dropping paragraph boundaries", () => {
    expect(normalizeText("  A\tpage\r\n\r\n\r\nwith\u00a0space  ")).toBe("A page\n\nwith space");
  });

  it("normalizes source urls for duplicate detection", () => {
    expect(normalizeSourceUrl("HTTPS://Example.COM/path?q=1#frag")).toBe(
      "https://example.com/path?q=1",
    );
  });

  it("adds Chinese bigrams for FTS", () => {
    expect(expandChineseBigrams("浏览器记忆")).toContain("浏览");
    expect(expandChineseBigrams("浏览器记忆")).toContain("器记");
  });

  it("builds a quoted FTS query", () => {
    expect(buildFtsQuery("Clio 浏览器")).toContain('"clio"');
    expect(buildFtsQuery("Clio 浏览器")).toContain(" OR ");
  });

  it("chunks long text with overlap", () => {
    const text = Array.from({ length: 1200 }, (_, index) => `word${index}`).join(" ");
    const chunks = chunkText(text, 300, 50);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]?.tokenCount).toBe(300);
    expect(chunks[1]?.text).toContain("word250");
  });

  it("uses stable text hashes", () => {
    expect(hashText("same")).toBe(hashText("same"));
    expect(hashText("same")).not.toBe(hashText("different"));
  });
});
