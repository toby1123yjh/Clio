import { describe, expect, it } from "vitest";
import type { TestWorkspaceBuildConfig } from "./contracts";
import { buildTestWorkspaceFixtures } from "./fixtures";

describe("test workspace fixtures", () => {
  it("provides mixed source types and a real two-version Markdown pair", () => {
    const fixtures = buildTestWorkspaceFixtures(config());
    expect(fixtures.map((fixture) => fixture.kind)).toEqual([
      "page",
      "selection",
      "markdown",
      "markdown",
      "pdf",
    ]);
    const markdown = fixtures.filter((fixture) => fixture.kind === "markdown");
    expect(markdown).toHaveLength(2);
    expect(markdown[0]?.sourceUrl).toBe(markdown[1]?.sourceUrl);
    expect(markdown[0]?.markdownText).not.toBe(markdown[1]?.markdownText);
    expect(markdown[1]?.markdownText).toContain("reciprocal rank");
  });

  it("namespaces every source and keeps staged PDF paths relative", () => {
    const fixtures = buildTestWorkspaceFixtures(config());
    expect(
      fixtures.every((fixture) => fixture.sourceUrl.startsWith("clio://test-fixture/v1/")),
    ).toBe(true);
    const pdf = fixtures.find((fixture) => fixture.kind === "pdf");
    expect(pdf).toMatchObject({
      assetPath: "assets/test-workspace/01-paper.pdf",
      byteLength: 9,
    });
    expect(JSON.stringify(fixtures)).not.toContain("C:/Users");
  });
});

function config(): TestWorkspaceBuildConfig {
  return {
    schemaVersion: 1,
    corpusId: "clio-validation-v1",
    namespace: "clio://test-fixture/v1/",
    pdfs: [
      {
        fileName: "paper.pdf",
        assetPath: "assets/test-workspace/01-paper.pdf",
        byteLength: 9,
      },
    ],
  };
}
