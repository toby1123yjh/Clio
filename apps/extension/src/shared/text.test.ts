import { describe, expect, it } from "vitest";
import {
  buildFtsQuery,
  chunkText,
  chunkTextByParagraphs,
  estimateE5Tokens,
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

  it("packs adjacent paragraphs without overlap until the E5 soft target", () => {
    const paragraphs = Array.from({ length: 5 }, (_, index) => ({
      text: `${`Paragraph ${index} contains retrieval evidence. `.repeat(4)}`.trim(),
      contentKind: "body" as const,
    }));

    const chunks = chunkTextByParagraphs(paragraphs, {
      softTargetTokens: 80,
      hardMaxTokens: 120,
      oversizedOverlapTokens: 16,
    });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.tokenCount <= 120)).toBe(true);
    expect(chunks.map((chunk) => chunk.text).join("\n\n")).toBe(
      paragraphs.map((paragraph) => paragraph.text).join("\n\n"),
    );
  });

  it("splits only oversized paragraphs with bounded overlap", () => {
    const longParagraph = Array.from(
      { length: 18 },
      (_, index) => `Sentence ${index} explains a distinct scientific retrieval result.`,
    ).join(" ");

    const chunks = chunkTextByParagraphs([{ text: longParagraph }], {
      softTargetTokens: 40,
      hardMaxTokens: 55,
      oversizedOverlapTokens: 8,
    });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.tokenCount <= 55)).toBe(true);
    expect(chunks[1]?.text).toContain("Sentence 3");
    expect(chunks[1]?.text).toContain("Sentence 5");
  });

  it("does not mix independent content kinds", () => {
    const chunks = chunkTextByParagraphs([
      { text: "Body evidence remains a normal paragraph.", contentKind: "body" },
      { text: "| metric | value |\n| recall | 0.82 |", contentKind: "table" },
      { text: "[1] Retrieval reference.", contentKind: "reference" },
    ]);

    expect(chunks.map((chunk) => chunk.contentKind)).toEqual(["body", "table", "reference"]);
  });

  it("keeps a conservative E5 token estimate", () => {
    expect(estimateE5Tokens("retrieval evidence for scientific papers")).toBeGreaterThan(0);
    expect(estimateE5Tokens("知识库检索")).toBe(5);
  });

  it("uses stable text hashes", () => {
    expect(hashText("same")).toBe(hashText("same"));
    expect(hashText("same")).not.toBe(hashText("different"));
  });
});
