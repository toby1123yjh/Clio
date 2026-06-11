import { describe, expect, it } from "vitest";

describe("Phase 0 scaffold", () => {
  it("keeps the shared barrel importable", async () => {
    const shared = await import("./index");

    expect(shared).toBeDefined();
  });
});
