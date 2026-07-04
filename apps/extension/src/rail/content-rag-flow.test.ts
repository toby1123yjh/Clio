import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const contentSource = readFileSync(
  fileURLToPath(new URL("../../entrypoints/content.tsx", import.meta.url)),
  "utf8",
);

describe("content local RAG flow", () => {
  it("selects retrieval candidates before loading bounded evidence windows", () => {
    const localRagSection = contentSource.slice(
      contentSource.indexOf("async function loadLocalRagEvidencePack"),
      contentSource.indexOf("async function loadMultiSourceRagEvidencePack"),
    );

    expect(localRagSection).toContain('kind: "retrieveSources"');
    expect(localRagSection).toContain('kind: "getMemoryEvidenceWindows"');
    expect(localRagSection.indexOf('kind: "retrieveSources"')).toBeLessThan(
      localRagSection.indexOf('kind: "getMemoryEvidenceWindows"'),
    );
    expect(localRagSection).toContain("retrievalEvidenceWindowAnchors(retrieval)");
    expect(localRagSection).toContain("anchors,");
    expect(localRagSection).toContain("memoryIds,");
    expect(localRagSection).toContain("assembleLocalRagEvidencePack");
    expect(localRagSection).not.toContain('kind: "getMemory"');
  });

  it("keeps ordinary chat behind multi-source local-only policy without silent Web Search", () => {
    const multiSourceSection = contentSource.slice(
      contentSource.indexOf("async function loadMultiSourceRagEvidencePack"),
      contentSource.indexOf("function buildAttachedEvidence"),
    );
    const startRunSection = contentSource.slice(
      contentSource.indexOf("const startAgentRun = React.useCallback"),
      contentSource.indexOf("const handleCancelDialogue = React.useCallback"),
    );

    expect(multiSourceSection).toContain("buildMultiSourceRetrievalResult");
    expect(multiSourceSection).toContain('trigger: { kind: "ordinary_chat" }');
    expect(multiSourceSection).toContain("allowExternal: false");
    expect(multiSourceSection).not.toContain("openWebSearchStream");
    expect(startRunSection).toContain("await loadMultiSourceRagEvidencePack(providerQuestion)");
    expect(startRunSection).not.toContain("await openWebSearchStream");
  });

  it("routes Knowledge Base page search through source-level KB search", () => {
    const loadLibrarySection = contentSource.slice(
      contentSource.indexOf("const loadLibrary = React.useCallback"),
      contentSource.indexOf("const loadChatHistory = React.useCallback"),
    );

    expect(loadLibrarySection).toContain('kind: "searchKnowledgeBase"');
    expect(loadLibrarySection).toContain("toKnowledgeBaseSearchItem");
    expect(loadLibrarySection).not.toContain('kind: "searchMemory"');
    expect(loadLibrarySection).not.toContain('kind: "listMemories"');
  });

  it("keeps source context packs behind explicit research mode", () => {
    const startRunSection = contentSource.slice(
      contentSource.indexOf("const startAgentRun = React.useCallback"),
      contentSource.indexOf("const handleCancelDialogue = React.useCallback"),
    );
    const slashSection = contentSource.slice(
      contentSource.indexOf("const handleResearchCommand = React.useCallback"),
      contentSource.indexOf("const handleExecuteCommand = React.useCallback"),
    );

    expect(startRunSection).toContain(
      'scope === "general" && options.sourceContextPack === undefined',
    );
    expect(startRunSection).toContain("sourceContextPack: options.sourceContextPack");
    expect(slashSection).toContain('sourceContextPack: { mode: "research" }');
    expect(slashSection).toContain("research: handleResearchCommand");
    expect(startRunSection).not.toContain('kind: "buildSourceContextPack"');
  });
});
