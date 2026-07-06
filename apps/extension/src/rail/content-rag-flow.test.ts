import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const contentSource = readFileSync(
  fileURLToPath(new URL("../../entrypoints/content.tsx", import.meta.url)),
  "utf8",
);
const railShellSource = readFileSync(
  fileURLToPath(new URL("./components/RailShell.tsx", import.meta.url)),
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

  it("routes Knowledge Base uploads through public file capture RPCs", () => {
    const uploadSection = contentSource.slice(
      contentSource.indexOf("const uploadKnowledgeFiles = React.useCallback"),
      contentSource.indexOf("const searchSelection = React.useCallback"),
    );
    const knowledgePanelSection = railShellSource.slice(
      railShellSource.indexOf("function KnowledgeBasePanel"),
      railShellSource.indexOf("function TopicKnowledgePanel"),
    );

    expect(uploadSection).toContain('kind: "capturePdf"');
    expect(uploadSection).toContain('kind: "captureMarkdown"');
    expect(uploadSection).toContain("file.arrayBuffer()");
    expect(uploadSection).toContain("file.text()");
    expect(uploadSection).not.toContain('kind: "capturePage"');
    expect(knowledgePanelSection).toContain('type="file"');
    expect(knowledgePanelSection).toContain(
      'accept="application/pdf,text/markdown,.pdf,.md,.markdown"',
    );
    expect(knowledgePanelSection).toContain("props.onUploadKnowledgeFiles(files)");
  });

  it("plans source context packs through controlled auto or explicit research mode", () => {
    const planSection = contentSource.slice(
      contentSource.indexOf("function planDefaultSourceContextPack"),
      contentSource.indexOf("function buildAttachedEvidence"),
    );
    const startRunSection = contentSource.slice(
      contentSource.indexOf("const startAgentRun = React.useCallback"),
      contentSource.indexOf("const handleCancelDialogue = React.useCallback"),
    );
    const slashSection = contentSource.slice(
      contentSource.indexOf("const handleResearchCommand = React.useCallback"),
      contentSource.indexOf("const handleExecuteCommand = React.useCallback"),
    );

    expect(planSection).toContain("planLocalRagRetrieval(normalizedQuery)");
    expect(planSection).toContain("defaultSourceContextPackIntentNeedles");
    expect(planSection).toContain('mode: "auto"');
    expect(planSection).toContain('planner: "source_context_planner_v1"');
    expect(planSection).toContain("sourceContextPackAutoBudgetDefaults");
    expect(startRunSection).toContain("const effectiveSourceContextPack");
    expect(startRunSection).toContain("planDefaultSourceContextPack(providerQuestion)");
    expect(startRunSection).toContain("effectiveSourceContextPack === undefined");
    expect(startRunSection).toContain("sourceContextPack: effectiveSourceContextPack");
    expect(slashSection).toContain('mode: "research"');
    expect(slashSection).toContain("sourceContextPackResearchBudgetDefaults");
    expect(slashSection).toContain("research: handleResearchCommand");
    expect(startRunSection).not.toContain('kind: "buildSourceContextPack"');
  });
});
