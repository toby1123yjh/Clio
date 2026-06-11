import { describe, expect, it } from "vitest";
import {
  buildMemoryVersionGroupKey,
  buildTextFragmentUrl,
  selectAnchorContext,
  sourceUrlsMatch,
} from "./reliability";

describe("Phase 1B reliability helpers", () => {
  it("groups page versions by normalized URL only", () => {
    expect(buildMemoryVersionGroupKey("page", "https://example.com/a", "hash-a")).toBe(
      "page:https://example.com/a",
    );
    expect(buildMemoryVersionGroupKey("page", "https://example.com/a", "hash-b")).toBe(
      "page:https://example.com/a",
    );
  });

  it("keeps different selections independent within the same URL", () => {
    expect(buildMemoryVersionGroupKey("selection", "https://example.com/a", "hash-a")).not.toBe(
      buildMemoryVersionGroupKey("selection", "https://example.com/a", "hash-b"),
    );
  });

  it("compares source URLs with normalized fragments removed", () => {
    expect(sourceUrlsMatch("HTTPS://Example.com/page#old", "https://example.com/page")).toBe(true);
  });

  it("builds text fragment URLs without preserving existing fragments", () => {
    expect(buildTextFragmentUrl("https://example.com/a#old", "hello world")).toBe(
      "https://example.com/a#:~:text=hello%20world",
    );
  });

  it("selects bounded context around a saved selection", () => {
    const context = selectAnchorContext("aaa before selected text after bbb", "selected text", 8);
    expect(context.before).toBe(" before ");
    expect(context.after).toBe(" after b");
  });
});
