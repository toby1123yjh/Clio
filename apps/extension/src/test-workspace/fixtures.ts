import type { TestWorkspaceBuildConfig } from "./contracts";

interface TestWorkspaceFixtureBase {
  id: string;
  sourceUrl: string;
  sourceTitle: string;
  metadata: Record<string, unknown>;
}

export type TestWorkspaceFixture =
  | (TestWorkspaceFixtureBase & {
      kind: "page";
      normalizedText: string;
    })
  | (TestWorkspaceFixtureBase & {
      kind: "selection";
      normalizedText: string;
      contextBefore: string;
      contextAfter: string;
      textFragment: string;
    })
  | (TestWorkspaceFixtureBase & {
      kind: "markdown";
      markdownText: string;
    })
  | (TestWorkspaceFixtureBase & {
      kind: "pdf";
      assetPath: string;
      byteLength: number;
    });

export function buildTestWorkspaceFixtures(
  config: TestWorkspaceBuildConfig,
): TestWorkspaceFixture[] {
  const metadata = (fixtureId: string, sourceType: string) => ({
    test_workspace: true,
    test_workspace_corpus: config.corpusId,
    fixture_id: fixtureId,
    source_type: sourceType,
  });
  const versionedMarkdownUrl = `${config.namespace}markdown/evidence-retrieval-notes.md`;
  const fixtures: TestWorkspaceFixture[] = [
    {
      id: "web-evidence-ranking",
      kind: "page",
      sourceUrl: `${config.namespace}page/evidence-ranking`,
      sourceTitle: "Evidence ranking for browser research",
      normalizedText:
        "Reciprocal rank fusion combines independently ranked keyword, vector, and metadata result lists without comparing incompatible raw scores. Bounded evidence windows keep retrieval precise while preventing an entire long document from entering the model context.",
      metadata: {
        ...metadata("web-evidence-ranking", "webpage"),
        authors: ["Clio Validation Team"],
        year: 2026,
        venue: "Browser Knowledge Notes",
        topic: "retrieval",
      },
    },
    {
      id: "selection-context-budget",
      kind: "selection",
      sourceUrl: `${config.namespace}selection/context-budget`,
      sourceTitle: "Selection fixture: context budget",
      normalizedText:
        "A source context pack should allocate depth dynamically and preserve citations to the original source chunks.",
      contextBefore: "The user is comparing strategies for long-document retrieval.",
      contextAfter: "The selected claim becomes a bounded evidence anchor.",
      textFragment: "source context pack should allocate depth dynamically",
      metadata: {
        ...metadata("selection-context-budget", "selection"),
        year: 2025,
        venue: "Clio Manual Validation",
        topic: "context-planning",
      },
    },
    {
      id: "markdown-evidence-v1",
      kind: "markdown",
      sourceUrl: versionedMarkdownUrl,
      sourceTitle: "Evidence retrieval notes",
      markdownText: markdownFixtureVersionOne,
      metadata: metadata("markdown-evidence-v1", "markdown"),
    },
    {
      id: "markdown-evidence-v2",
      kind: "markdown",
      sourceUrl: versionedMarkdownUrl,
      sourceTitle: "Evidence retrieval notes",
      markdownText: markdownFixtureVersionTwo,
      metadata: metadata("markdown-evidence-v2", "markdown"),
    },
  ];

  for (const [index, pdf] of config.pdfs.entries()) {
    const sequence = String(index + 1).padStart(2, "0");
    fixtures.push({
      id: `pdf-${sequence}`,
      kind: "pdf",
      sourceUrl: `${config.namespace}pdf/${sequence}-${sourceSlug(pdf.fileName)}`,
      sourceTitle: pdf.fileName.replace(/\.pdf$/i, ""),
      assetPath: pdf.assetPath,
      byteLength: pdf.byteLength,
      metadata: {
        ...metadata(`pdf-${sequence}`, "pdf"),
        original_file_name: pdf.fileName,
      },
    });
  }
  return fixtures;
}

const markdownFixtureVersionOne = `---
title: Evidence Retrieval Notes
authors: [Ada Lovelace, Grace Hopper]
year: 2024
venue: Local RAG Symposium
doi: 10.5555/clio.validation
---

# Evidence Retrieval Notes

The first revision describes keyword retrieval and bounded chunk evidence.

## Baseline

Use source metadata and lexical matches to find candidate passages. Preserve
the source and chunk identifiers so a later answer can cite the evidence.
`;

const markdownFixtureVersionTwo = `---
title: Evidence Retrieval Notes
authors: [Ada Lovelace, Grace Hopper]
year: 2025
venue: Local RAG Symposium
doi: 10.5555/clio.validation
---

# Evidence Retrieval Notes

The second revision adds multilingual semantic retrieval, reciprocal rank
fusion, and bounded evidence windows.

## Updated workflow

Combine keyword, vector, and metadata candidate lists. Re-rank bounded chunks,
then load only the source windows that fit the context budget. Citations must
continue to point to the original source and chunk identifiers.
`;

function sourceSlug(fileName: string) {
  return fileName
    .replace(/\.pdf$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}
