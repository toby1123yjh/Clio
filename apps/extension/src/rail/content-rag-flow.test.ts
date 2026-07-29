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
const railCssSource = readFileSync(
  fileURLToPath(new URL("../ui/tailwind.css", import.meta.url)),
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
    const retrieveFilterSection = contentSource.slice(
      contentSource.indexOf("function retrieveFilterForKnowledgeBase"),
      contentSource.indexOf("function knowledgeUploadKindForFile"),
    );
    const contentStateSection = contentSource.slice(
      contentSource.indexOf("function ClioContentApp()"),
      contentSource.indexOf("React.useEffect(() => {"),
    );
    const knowledgeBaseResultsSection = contentSource.slice(
      contentSource.indexOf("const requestKnowledgeBaseResults = React.useCallback"),
      contentSource.indexOf("const loadKnowledgeBaseResults = React.useCallback"),
    );

    expect(knowledgeBaseResultsSection).toContain('kind: "searchKnowledgeBase"');
    expect(knowledgeBaseResultsSection).toContain("toKnowledgeBaseSearchItem");
    expect(contentStateSection).toContain("const knowledgeBaseRetrieveFilter = React.useMemo(");
    expect(contentStateSection).toContain("retrieveFilterForKnowledgeBase(knowledgeBaseFilter)");
    expect(retrieveFilterSection).toContain('["webpage", "page", "selection"]');
    expect(retrieveFilterSection).toContain(
      "const years = normalizeKnowledgeBaseYears(filter.yearsText)",
    );
    expect(retrieveFilterSection).toContain(
      "const authors = normalizeKnowledgeBaseListText(filter.authorsText",
    );
    expect(retrieveFilterSection).toContain(
      "const venues = normalizeKnowledgeBaseListText(filter.venuesText",
    );
    expect(retrieveFilterSection).toContain(
      "const doi = normalizeKnowledgeBaseScalarText(filter.doiText)",
    );
    expect(retrieveFilterSection).toContain(
      "const arxivIds = normalizeKnowledgeBaseListText(filter.arxivIdsText",
    );
    expect(knowledgeBaseResultsSection).toContain("knowledgeBaseRetrieveFilter === undefined");
    expect(knowledgeBaseResultsSection).toContain("{ filter: knowledgeBaseRetrieveFilter }");
    expect(knowledgeBaseResultsSection).not.toContain("clustering:");
    expect(knowledgeBaseResultsSection).not.toContain('kind: "searchMemory"');
    expect(knowledgeBaseResultsSection).not.toContain('kind: "listMemories"');
  });

  it("exposes Knowledge Base advanced source filters without bypassing searchKnowledgeBase", () => {
    const contentStateSection = contentSource.slice(
      contentSource.indexOf("function ClioContentApp()"),
      contentSource.indexOf("React.useEffect(() => {"),
    );
    const railPropsSection = contentSource.slice(
      contentSource.indexOf("<RailShell"),
      contentSource.indexOf("</RailShell>"),
    );
    const knowledgeFilterSection = railShellSource.slice(
      railShellSource.indexOf("type KnowledgeBaseAdvancedFilterField"),
      railShellSource.indexOf("function KnowledgeBaseWorkingSetPanel"),
    );

    expect(contentStateSection).toContain("defaultKnowledgeBaseFilter");
    expect(contentSource).toContain('yearsText: ""');
    expect(contentSource).toContain('authorsText: ""');
    expect(contentSource).toContain('venuesText: ""');
    expect(contentSource).toContain('doiText: ""');
    expect(contentSource).toContain('arxivIdsText: ""');
    expect(railPropsSection).toContain("knowledgeBaseFilter={knowledgeBaseFilter}");
    expect(railPropsSection).toContain("knowledgeBaseRetrieveFilter={knowledgeBaseRetrieveFilter}");
    expect(railPropsSection).toContain("onKnowledgeBaseFilterChange={setKnowledgeBaseFilter}");
    expect(knowledgeFilterSection).toContain('data-clio-knowledge-filters="true"');
    expect(knowledgeFilterSection).toContain('data-clio-knowledge-filter-bar="true"');
    expect(knowledgeFilterSection).toContain('data-clio-knowledge-advanced-filters="true"');
    expect(knowledgeFilterSection).toContain("aria-expanded={advancedOpen}");
    expect(knowledgeFilterSection).toContain("More filters");
    expect(knowledgeFilterSection).toContain("activeAdvancedChips.length");
    expect(knowledgeFilterSection).toContain('id="clio-kb-source-type-filter"');
    expect(knowledgeFilterSection).toContain('id="clio-kb-lifecycle-filter"');
    expect(knowledgeFilterSection).toContain('id="clio-kb-years-filter"');
    expect(knowledgeFilterSection).toContain('id="clio-kb-authors-filter"');
    expect(knowledgeFilterSection).toContain('id="clio-kb-venues-filter"');
    expect(knowledgeFilterSection).toContain('id="clio-kb-doi-filter"');
    expect(knowledgeFilterSection).toContain('id="clio-kb-arxiv-filter"');
    expect(knowledgeFilterSection).toContain("knowledgeBaseAdvancedFilterChips");
    expect(knowledgeFilterSection).toContain("nextKnowledgeBaseAdvancedFieldText");
    expect(knowledgeFilterSection).not.toContain('kind: "searchMemory"');
    expect(knowledgeFilterSection).not.toContain('kind: "listMemories"');
  });

  it("keeps Knowledge Base source browsing flat without clustering UI state", () => {
    const contentStateSection = contentSource.slice(
      contentSource.indexOf("function ClioContentApp()"),
      contentSource.indexOf("React.useEffect(() => {"),
    );
    const knowledgeBaseResultsSection = contentSource.slice(
      contentSource.indexOf("const requestKnowledgeBaseResults = React.useCallback"),
      contentSource.indexOf("const loadKnowledgeBaseResults = React.useCallback"),
    );
    const railPropsSection = contentSource.slice(
      contentSource.indexOf("<RailShell"),
      contentSource.indexOf("</RailShell>"),
    );
    const knowledgePanelSection = railShellSource.slice(
      railShellSource.indexOf("function KnowledgeBasePanel"),
      railShellSource.indexOf("function ResearchPlannerPanel"),
    );
    const memoryListSection = railShellSource.slice(
      railShellSource.indexOf("function MemoryList"),
      railShellSource.indexOf("function MemoryDetailPanel"),
    );

    expect(contentStateSection).not.toContain("KnowledgeBaseClusteringState");
    expect(contentStateSection).not.toContain("KnowledgeBaseClusterGroup");
    expect(knowledgeBaseResultsSection).not.toContain("clustering:");
    expect(knowledgeBaseResultsSection).not.toContain("result.clusters");
    expect(railPropsSection).not.toContain("knowledgeBaseClustering=");
    expect(railPropsSection).not.toContain("knowledgeBaseClusters=");
    expect(railPropsSection).not.toContain("onKnowledgeBaseClusteringChange=");
    expect(knowledgePanelSection).not.toContain("KnowledgeBaseClusteringControls");
    expect(knowledgePanelSection).not.toContain("Group by");
    expect(knowledgePanelSection).not.toContain("clio-kb-cluster-by");
    expect(memoryListSection).not.toContain("clusters");
    expect(memoryListSection).not.toContain("data-clio-knowledge-cluster");
    expect(memoryListSection).toContain("items.map((item)");
    expect(memoryListSection).not.toContain("requestEngine");
  });

  it("adapts Knowledge Base layout to the resizable Rail container", () => {
    const knowledgePanelSection = railShellSource.slice(
      railShellSource.indexOf("function KnowledgeBasePanel"),
      railShellSource.indexOf("function ResearchPlannerPanel"),
    );
    const memoryListItemSection = railShellSource.slice(
      railShellSource.indexOf("function MemoryListItem"),
      railShellSource.indexOf("function MemoryDetailPanel"),
    );

    expect(railShellSource).toContain('containerName: "clio-rail"');
    expect(railShellSource).toContain('containerType: "inline-size"');
    expect(knowledgePanelSection).toContain('data-clio-knowledge-actions="true"');
    expect(knowledgePanelSection).toContain('data-clio-knowledge-tabs="true"');
    expect(knowledgePanelSection).toContain('role="tablist"');
    expect(knowledgePanelSection).toContain('role="tabpanel"');
    expect(knowledgePanelSection).toContain('data-clio-knowledge-toolbar="true"');
    expect(knowledgePanelSection).toContain('data-clio-knowledge-scroll="true"');
    expect(knowledgePanelSection).toContain('aria-label="Open Research planner"');
    expect(knowledgePanelSection).toContain("<MemoryList");
    expect(knowledgePanelSection).not.toContain("<KnowledgeBaseWorkingSetPanel");
    expect(knowledgePanelSection).not.toContain("<SourceContextPlannerPanel");
    expect(knowledgePanelSection).not.toContain("<SourceContextCompressionLogPanel");
    expect(knowledgePanelSection).not.toContain("<OrchestrationDiagnosticsPanel");
    expect(knowledgePanelSection).not.toContain("<ChunkMetaTier2AuditPanel");
    expect(knowledgePanelSection).not.toContain("<SourceContextMapSchedulerPanel");
    expect(knowledgePanelSection).not.toContain("<SourceContextMapArtifactPanel");
    expect(railShellSource).toContain('data-clio-responsive-grid="stack"');
    expect(memoryListItemSection).toContain('data-clio-memory-actions="true"');
    expect(memoryListItemSection).toContain(
      'className="flex flex-wrap items-center justify-end gap-1.5 px-3 pb-2.5 pt-0"',
    );
    expect(memoryListItemSection).toContain('data-clio-memory-menu="true"');
    expect(memoryListItemSection).toContain('aria-haspopup="menu"');
    expect(memoryListItemSection).toContain("event.composedPath()");
    expect(memoryListItemSection).toContain('data-clio-memory-title="true"');
    expect(memoryListItemSection).toContain('data-clio-memory-snippet="true"');
    expect(memoryListItemSection).toContain("break-all");
    expect(memoryListItemSection).not.toContain("pr-44");
    expect(memoryListItemSection).not.toContain("right-[120px]");
    expect(railCssSource).toContain("@container clio-rail (max-width: 480px)");
    expect(railCssSource).toContain("@container clio-rail (max-width: 380px)");
    expect(railCssSource).toContain('[data-clio-responsive-grid="stack"]');
    expect(railCssSource).toContain("grid-template-columns: minmax(0, 1fr)");
  });

  it("shows the source-list empty state directly below source filters", () => {
    const knowledgePanelSection = railShellSource.slice(
      railShellSource.indexOf("function KnowledgeBasePanel"),
      railShellSource.indexOf("function ResearchPlannerPanel"),
    );
    const memoryListSection = railShellSource.slice(
      railShellSource.indexOf("function MemoryList"),
      railShellSource.indexOf("function MemoryListItem"),
    );

    expect(knowledgePanelSection.indexOf("<KnowledgeBaseFilterControls")).toBeLessThan(
      knowledgePanelSection.indexOf("<MemoryList"),
    );
    expect(knowledgePanelSection).not.toContain("<KnowledgeBaseClusteringControls");
    expect(knowledgePanelSection).not.toContain("<SourceContextPlannerPanel");
    expect(memoryListSection).toContain("data-clio-knowledge-empty-state=");
    expect(memoryListSection).toContain('"No matching sources"');
    expect(memoryListSection).toContain('"No saved sources yet"');
    expect(memoryListSection).not.toContain("No saved memories yet.");
  });

  it("keeps existing sources mounted during debounced Knowledge Base search", () => {
    const contentStateSection = contentSource.slice(
      contentSource.indexOf("function ClioContentApp()"),
      contentSource.indexOf("const loadKnowledgeBaseResults = React.useCallback"),
    );
    const interactiveSearchSection = contentSource.slice(
      contentSource.indexOf("const loadKnowledgeBaseResults = React.useCallback"),
      contentSource.indexOf("const loadLibrary = React.useCallback"),
    );
    const searchEffectSection = contentSource.slice(
      contentSource.indexOf(
        'if (railState.mode !== "knowledge-base" && railState.mode !== "research-planner")',
      ),
      contentSource.indexOf('if (railState.mode !== "agent-home")'),
    );
    const knowledgePanelSection = railShellSource.slice(
      railShellSource.indexOf("function KnowledgeBasePanel"),
      railShellSource.indexOf("function ResearchPlannerPanel"),
    );
    const memoryListSection = railShellSource.slice(
      railShellSource.indexOf("function MemoryList"),
      railShellSource.indexOf("function MemoryListItem"),
    );

    expect(interactiveSearchSection).toContain("requestKnowledgeBaseResults(nextQuery)");
    expect(contentStateSection).toContain('React.useState<KnowledgeBaseSearchMode>("exact")');
    expect(contentStateSection).toContain("mode: knowledgeBaseSearchMode");
    expect(interactiveSearchSection).not.toContain('kind: "listTopicPages"');
    expect(interactiveSearchSection).not.toContain('kind: "listWikiCompileJobs"');
    expect(searchEffectSection).toContain("loadKnowledgeBaseResults(railState.query)");
    expect(searchEffectSection).not.toContain("loadLibrary(railState.query)");
    expect(knowledgePanelSection).toContain('data-clio-knowledge-search-loading="true"');
    expect(knowledgePanelSection).toContain("<KnowledgeBaseSearchModeControl");
    expect(knowledgePanelSection).toContain("mode={props.knowledgeBaseSearchMode}");
    expect(knowledgePanelSection).toContain("props.onKnowledgeBaseSearchModeChange");
    expect(knowledgePanelSection).toContain("aria-busy={props.knowledgeBaseSearchLoading}");
    expect(memoryListSection).toContain("if (loading && items.length === 0)");
  });

  it("keeps existing sources mounted during explicit Knowledge Base refresh", () => {
    const contentStateSection = contentSource.slice(
      contentSource.indexOf("function ClioContentApp()"),
      contentSource.indexOf("const loadLibrary = React.useCallback"),
    );
    const loadLibrarySection = contentSource.slice(
      contentSource.indexOf("const loadLibrary = React.useCallback"),
      contentSource.indexOf("const pinWorkingSetSource = React.useCallback"),
    );
    const railPropsSection = contentSource.slice(
      contentSource.indexOf("<RailShell"),
      contentSource.indexOf("</RailShell>"),
    );
    const knowledgePanelSection = railShellSource.slice(
      railShellSource.indexOf("function KnowledgeBasePanel"),
      railShellSource.indexOf("function ResearchPlannerPanel"),
    );

    expect(contentStateSection).toContain("knowledgeBaseRefreshLoading");
    expect(loadLibrarySection).toContain("options?: { background?: boolean }");
    expect(loadLibrarySection).toContain("setKnowledgeBaseSearchLoading(false)");
    expect(loadLibrarySection).toContain("setKnowledgeBaseRefreshLoading(true)");
    expect(loadLibrarySection).toContain('dispatch({ type: "SET_LOADING", loading: true })');
    expect(railPropsSection).toContain("knowledgeBaseRefreshLoading={knowledgeBaseRefreshLoading}");
    expect(railPropsSection).toContain("loadLibrary(railState.query, { background: true })");
    expect(knowledgePanelSection).toContain("aria-busy={props.knowledgeBaseRefreshLoading}");
    expect(knowledgePanelSection).toContain(
      "props.state.loading || props.knowledgeBaseRefreshLoading",
    );
  });

  it("exposes Working Set controls without loading full memories in the Rail", () => {
    const loadLibrarySection = contentSource.slice(
      contentSource.indexOf("const loadLibrary = React.useCallback"),
      contentSource.indexOf("const loadChatHistory = React.useCallback"),
    );
    const contentWorkingSetSection = contentSource.slice(
      contentSource.indexOf("const pinWorkingSetSource = React.useCallback"),
      contentSource.indexOf("const loadChatHistory = React.useCallback"),
    );
    const railPropsSection = contentSource.slice(
      contentSource.indexOf("<RailShell"),
      contentSource.indexOf("</RailShell>"),
    );
    const workingSetPanelSection = railShellSource.slice(
      railShellSource.indexOf("function KnowledgeBaseWorkingSetPanel"),
      railShellSource.indexOf("function TopicKnowledgePanel"),
    );
    const memoryListSection = railShellSource.slice(
      railShellSource.indexOf("function MemoryList"),
      railShellSource.indexOf("function MemoryDetailPanel"),
    );
    const researchPlannerPanelSection = railShellSource.slice(
      railShellSource.indexOf("function ResearchPlannerPanel"),
      railShellSource.indexOf("function KnowledgeBaseFilterControls"),
    );

    expect(loadLibrarySection).toContain('kind: "getWorkingSetStatus"');
    expect(contentWorkingSetSection).toContain('kind: "pinWorkingSetSource"');
    expect(contentWorkingSetSection).toContain('kind: "evictWorkingSetSource"');
    expect(contentWorkingSetSection).toContain('kind: "setWorkingSetSourceDepth"');
    expect(contentWorkingSetSection).toContain('kind: "reloadWorkingSetSource"');
    expect(railPropsSection).toContain("workingSetStatus={workingSetStatus}");
    expect(railPropsSection).toContain("onPinWorkingSetSource=");
    expect(workingSetPanelSection).toContain('data-clio-working-set="true"');
    expect(workingSetPanelSection).toContain("workingSetLoadDepthOptions");
    expect(researchPlannerPanelSection).toContain("KnowledgeBaseWorkingSetPanel");
    expect(memoryListSection).toContain('onPinWorkingSetSource(item.id, "meta")');
    expect(workingSetPanelSection).not.toContain('kind: "getMemory"');
    expect(memoryListSection).not.toContain('kind: "getMemory"');
  });

  it("exposes source context compression logs as non-citeable Rail diagnostics", () => {
    const contentCompressionSection = contentSource.slice(
      contentSource.indexOf("const loadSourceContextCompressionLogs = React.useCallback"),
      contentSource.indexOf("const loadLibrary = React.useCallback"),
    );
    const railPropsSection = contentSource.slice(
      contentSource.indexOf("<RailShell"),
      contentSource.indexOf("</RailShell>"),
    );
    const compressionPanelSection = railShellSource.slice(
      railShellSource.indexOf("function SourceContextCompressionLogPanel"),
      railShellSource.indexOf("function formatWorkingSetTokenCount"),
    );

    expect(contentCompressionSection).toContain('kind: "listSourceContextCompressionLogs"');
    expect(contentCompressionSection).toContain("filter: { sessionId, limit: 30 }");
    expect(railPropsSection).toContain(
      "sourceContextCompressionLogs={sourceContextCompressionLogs}",
    );
    expect(railPropsSection).toContain("onRefreshSourceContextCompressionLogs=");
    expect(compressionPanelSection).toContain('data-clio-source-context-compression-log="true"');
    expect(compressionPanelSection).toContain("Non-citeable context diagnostics");
    expect(compressionPanelSection).toContain("log.reason");
    expect(compressionPanelSection).toContain("log.lostInfoTypes");
    expect(compressionPanelSection).not.toContain("requestEngine");
  });

  it("exposes source context map artifacts as non-citeable Rail diagnostics", () => {
    const contentMapArtifactSection = contentSource.slice(
      contentSource.indexOf("const loadSourceContextMapArtifacts = React.useCallback"),
      contentSource.indexOf("const loadLibrary = React.useCallback"),
    );
    const railPropsSection = contentSource.slice(
      contentSource.indexOf("<RailShell"),
      contentSource.indexOf("</RailShell>"),
    );
    const artifactPanelSection = railShellSource.slice(
      railShellSource.indexOf("function SourceContextMapArtifactPanel"),
      railShellSource.indexOf("interface SourceContextPlannerSelectedItem"),
    );

    expect(contentMapArtifactSection).toContain('kind: "listSourceContextMapArtifacts"');
    expect(contentMapArtifactSection).toContain("filter: { sessionId, limit: 30 }");
    expect(railPropsSection).toContain("sourceContextMapArtifacts={sourceContextMapArtifacts}");
    expect(railPropsSection).toContain("onRefreshSourceContextMapArtifacts=");
    expect(artifactPanelSection).toContain('data-clio-source-context-map-artifacts="true"');
    expect(artifactPanelSection).toContain("Non-citeable map/reduce diagnostics");
    expect(artifactPanelSection).toContain("sourceContextMapArtifactTitle");
    expect(artifactPanelSection).toContain("sourceContextMapArtifactSummary");
    expect(artifactPanelSection).not.toContain("requestEngine");
  });

  it("exposes source context map scheduler through content-owned controls", () => {
    const contentSchedulerLoadSection = contentSource.slice(
      contentSource.indexOf("const loadSourceContextMapEvents = React.useCallback"),
      contentSource.indexOf("const loadLibrary = React.useCallback"),
    );
    const contentSchedulerControlSection = contentSource.slice(
      contentSource.indexOf("const cancelSourceContextMapRun = React.useCallback"),
      contentSource.indexOf("const loadChatHistory = React.useCallback"),
    );
    const railPropsSection = contentSource.slice(
      contentSource.indexOf("<RailShell"),
      contentSource.indexOf("</RailShell>"),
    );
    const schedulerPanelSection = railShellSource.slice(
      railShellSource.indexOf("function SourceContextMapSchedulerPanel"),
      railShellSource.indexOf("function SourceContextMapArtifactPanel"),
    );
    const researchPlannerPanelSection = railShellSource.slice(
      railShellSource.indexOf("function ResearchPlannerPanel"),
      railShellSource.indexOf("function KnowledgeBaseFilterControls"),
    );

    expect(contentSchedulerLoadSection).toContain('kind: "listSourceContextMapRuns"');
    expect(contentSchedulerLoadSection).toContain('kind: "listSourceContextMapEvents"');
    expect(contentSchedulerLoadSection).toContain("filter: { sessionId, limit: 8 }");
    expect(contentSchedulerControlSection).toContain('kind: "cancelSourceContextMapRun"');
    expect(contentSchedulerControlSection).toContain('kind: "retrySourceContextMapRun"');
    expect(contentSchedulerControlSection).toContain('kind: "resumeSourceContextMapRun"');
    expect(contentSchedulerControlSection).not.toContain("startAgentRun(");
    expect(railPropsSection).toContain("sourceContextMapRuns={sourceContextMapRuns}");
    expect(railPropsSection).toContain("sourceContextMapEvents={sourceContextMapEvents}");
    expect(railPropsSection).toContain("onCancelSourceContextMapRun=");
    expect(railPropsSection).toContain("onRetrySourceContextMapRun=");
    expect(railPropsSection).toContain("onResumeSourceContextMapRun=");
    expect(railPropsSection).toContain("onRefreshSourceContextMapRuns=");
    expect(schedulerPanelSection).toContain('data-clio-source-context-map-scheduler="true"');
    expect(schedulerPanelSection).toContain("sourceContextMapRunStatusLabel");
    expect(schedulerPanelSection).toContain("sourceContextMapEventLabel");
    expect(schedulerPanelSection).toContain("onCancel");
    expect(schedulerPanelSection).toContain("onRetry");
    expect(schedulerPanelSection).toContain("onResume");
    expect(schedulerPanelSection).not.toContain("requestEngine");
    expect(schedulerPanelSection).not.toContain('kind: "getMemory"');
    expect(researchPlannerPanelSection).toContain("SourceContextMapSchedulerPanel");
    expect(researchPlannerPanelSection).not.toContain("requestEngine");
  });

  it("exposes explicit Tier2 chunk summary scheduling through content-owned RPCs", () => {
    const contentStateSection = contentSource.slice(
      contentSource.indexOf("function ClioContentApp()"),
      contentSource.indexOf("React.useEffect(() => {"),
    );
    const contentAuditLoadSection = contentSource.slice(
      contentSource.indexOf("const loadChunkMetaTier2Audit = React.useCallback"),
      contentSource.indexOf("const loadLibrary = React.useCallback"),
    );
    const contentOrchestrationLoadSection = contentSource.slice(
      contentSource.indexOf("const loadOrchestrationEvents = React.useCallback"),
      contentSource.indexOf("const loadLibrary = React.useCallback"),
    );
    const loadLibrarySection = contentSource.slice(
      contentSource.indexOf("const loadLibrary = React.useCallback"),
      contentSource.indexOf("const pinWorkingSetSource = React.useCallback"),
    );
    const contentRunSection = contentSource.slice(
      contentSource.indexOf("const runChunkMetaTier2Job = React.useCallback"),
      contentSource.indexOf("const selectSourceContextPlannerSource = React.useCallback"),
    );
    const railPropsSection = contentSource.slice(
      contentSource.indexOf("<RailShell"),
      contentSource.indexOf("</RailShell>"),
    );
    const auditPanelSection = railShellSource.slice(
      railShellSource.indexOf("function ChunkMetaTier2AuditPanel"),
      railShellSource.indexOf("function SourceContextMapArtifactPanel"),
    );
    const orchestrationPanelSection = railShellSource.slice(
      railShellSource.indexOf("function OrchestrationDiagnosticsPanel"),
      railShellSource.indexOf("function ChunkMetaTier2AuditPanel"),
    );
    const memoryListSection = railShellSource.slice(
      railShellSource.indexOf("function MemoryList"),
      railShellSource.indexOf("function MemoryDetailPanel"),
    );

    expect(contentStateSection).toContain("ChunkMetaTier2AuditRecord[]");
    expect(contentAuditLoadSection).toContain('kind: "listChunkMetaTier2Audit"');
    expect(contentAuditLoadSection).toContain("filter: { limit: 30 }");
    expect(loadLibrarySection).toContain('kind: "listChunkMetaTier2Audit"');
    expect(contentRunSection).toContain('kind: "enqueueChunkMetaTier2Job"');
    expect(contentRunSection).toContain('kind: "enqueueSourceGraphJob"');
    expect(contentRunSection).toContain('payload: { sourceId, mode: "llm" }');
    expect(contentRunSection).toContain('kind: "createOrchestrationRun"');
    expect(contentRunSection).toContain('kind: "runOrchestration"');
    expect(contentRunSection).toContain('kind: "cancelOrchestrationRun"');
    expect(contentRunSection).toContain('kind: "retryOrchestrationRun"');
    expect(contentOrchestrationLoadSection).toContain('kind: "listOrchestrationRuns"');
    expect(contentOrchestrationLoadSection).toContain('kind: "listOrchestrationEvents"');
    expect(contentRunSection).toContain("payload: { sourceId, maxChunks }");
    expect(contentRunSection).toContain("await loadChunkMetaTier2Audit()");
    expect(contentRunSection).toContain("await loadOrchestrationRuns()");
    expect(railPropsSection).toContain("chunkMetaTier2Audit={chunkMetaTier2Audit}");
    expect(railPropsSection).toContain("orchestrationRuns={orchestrationRuns}");
    expect(railPropsSection).toContain("orchestrationEvents={orchestrationEvents}");
    expect(railPropsSection).toContain("onRunChunkMetaTier2Job=");
    expect(railPropsSection).toContain("onRunSourceGraphJob=");
    expect(railPropsSection).toContain("onCancelOrchestrationRun=");
    expect(railPropsSection).toContain("onRetryOrchestrationRun=");
    expect(railPropsSection).toContain("onRefreshOrchestrationRuns=");
    expect(railPropsSection).toContain("onRefreshChunkMetaTier2Audit=");
    expect(orchestrationPanelSection).toContain('data-clio-orchestration-diagnostics="true"');
    expect(orchestrationPanelSection).toContain("Durable background job state");
    expect(orchestrationPanelSection).not.toContain("requestEngine");
    expect(auditPanelSection).toContain('data-clio-chunk-meta-tier2-audit="true"');
    expect(auditPanelSection).toContain("Explicit chat-provider summaries");
    expect(auditPanelSection).toContain("chunkMetaTier2AuditLengthLabel(row)");
    expect(railShellSource).toContain("row.sectionSummaryChars");
    expect(railShellSource).toContain("row.chunkSummaryChars");
    expect(memoryListSection).toContain("onRunChunkMetaTier2Job(item.id, 8)");
    expect(memoryListSection).toContain("onRunSourceGraphJob(item.id)");
    expect(memoryListSection).toContain("Generate research graph");
    expect(auditPanelSection).not.toContain("requestEngine");
    expect(memoryListSection).not.toContain("requestEngine");
  });

  it("exposes explicit source context planner UI through content-owned pack preview", () => {
    const contentPlannerPreviewSection = contentSource.slice(
      contentSource.indexOf("const previewSourceContextPlanner = React.useCallback"),
      contentSource.indexOf("const loadChatHistory = React.useCallback"),
    );
    const contentPlannerStartSection = contentSource.slice(
      contentSource.indexOf("const startSourceContextPlannerResearch = React.useCallback"),
      contentSource.indexOf("const handleSubmitDialogue = React.useCallback"),
    );
    const railPropsSection = contentSource.slice(
      contentSource.indexOf("<RailShell"),
      contentSource.indexOf("</RailShell>"),
    );
    const plannerPanelSection = railShellSource.slice(
      railShellSource.indexOf("function SourceContextPlannerPanel"),
      railShellSource.indexOf("function SourceContextCompressionLogPanel"),
    );
    const memoryListSection = railShellSource.slice(
      railShellSource.indexOf("function MemoryList"),
      railShellSource.indexOf("function MemoryDetailPanel"),
    );

    expect(contentSource).toContain("React.useState<SourceContextPlannerState>");
    expect(contentPlannerPreviewSection).toContain('kind: "buildSourceContextPack"');
    expect(contentPlannerPreviewSection).toContain("sourceIds,");
    expect(contentPlannerPreviewSection).toContain("sourceDepthOverrides");
    expect(contentPlannerPreviewSection).toContain("useWorkingSet: false");
    expect(contentPlannerPreviewSection).toContain("sourceContextPlanner.budget");
    expect(contentPlannerPreviewSection).not.toContain("openAgentStream");
    expect(contentPlannerStartSection).toContain("sourceContextPackOptionsFromPlanner");
    expect(contentPlannerStartSection).toContain("sourceIds,");
    expect(contentPlannerStartSection).toContain(
      "sourceDepthOverrides: sourceContextPlanner.sourceDepthOverrides",
    );
    expect(contentPlannerStartSection).toContain("budget: sourceContextPlanner.budget");
    expect(contentPlannerStartSection).toContain("startAgentRun(normalizedQuestion");
    expect(railPropsSection).toContain("sourceContextPlanner={sourceContextPlanner}");
    expect(railPropsSection).toContain(
      "onSelectSourceContextPlannerSource={selectSourceContextPlannerSource}",
    );
    expect(railPropsSection).toContain(
      "onPreviewSourceContextPlanner={(query) => void previewSourceContextPlanner(query)}",
    );
    expect(railPropsSection).toContain(
      "onSetSourceContextPlannerSourceDepth={setSourceContextPlannerSourceDepth}",
    );
    expect(plannerPanelSection).toContain('data-clio-source-context-planner="true"');
    expect(plannerPanelSection).toContain("SourceContextPlannerBudgetInput");
    expect(plannerPanelSection).toContain("SourceContextPlannerPreviewSummary");
    expect(plannerPanelSection).toContain("workingSetLoadDepthLabel");
    expect(plannerPanelSection).toContain("onSetSourceDepth");
    expect(plannerPanelSection).not.toContain("requestEngine");
    expect(plannerPanelSection).not.toContain('kind: "getMemory"');
    expect(memoryListSection).toContain("onSelectSourceContextPlannerSource(item.id)");
  });

  it("exposes a dedicated research planner route without moving Engine calls into RailShell", () => {
    const contentOpenPlannerSection = contentSource.slice(
      contentSource.indexOf("const openResearchPlanner = React.useCallback"),
      contentSource.indexOf("const openWebSearch = React.useCallback"),
    );
    const railPropsSection = contentSource.slice(
      contentSource.indexOf("<RailShell"),
      contentSource.indexOf("</RailShell>"),
    );
    const renderModeSection = railShellSource.slice(
      railShellSource.indexOf("function renderMode"),
      railShellSource.indexOf("function RoutePrompt"),
    );
    const knowledgeBasePanelSection = railShellSource.slice(
      railShellSource.indexOf("function KnowledgeBasePanel"),
      railShellSource.indexOf("function ResearchPlannerPanel"),
    );
    const researchPlannerPanelSection = railShellSource.slice(
      railShellSource.indexOf("function ResearchPlannerPanel"),
      railShellSource.indexOf("function KnowledgeBaseFilterControls"),
    );

    expect(contentOpenPlannerSection).toContain('dispatch({ type: "SHOW_RESEARCH_PLANNER" })');
    expect(contentOpenPlannerSection).toContain("await loadHealth()");
    expect(contentOpenPlannerSection).toContain("await loadLibrary(railState.query)");
    expect(contentOpenPlannerSection).not.toContain("buildSourceContextPack");
    expect(contentOpenPlannerSection).not.toContain("startAgentRun");
    expect(contentSource).toContain(
      'railState.mode !== "knowledge-base" && railState.mode !== "research-planner"',
    );
    expect(railPropsSection).toContain("onOpenResearchPlanner={() => void openResearchPlanner()}");
    expect(renderModeSection).toContain('props.state.mode === "research-planner"');
    expect(knowledgeBasePanelSection).toContain("props.onOpenResearchPlanner");
    expect(researchPlannerPanelSection).toContain('data-clio-panel="research-planner"');
    expect(researchPlannerPanelSection).toContain('data-clio-research-planner-source-list="true"');
    expect(researchPlannerPanelSection).toContain("SourceContextPlannerPanel");
    expect(researchPlannerPanelSection).toContain("SourceContextCompressionLogPanel");
    expect(researchPlannerPanelSection).toContain("SourceContextMapArtifactPanel");
    expect(researchPlannerPanelSection).toContain("OrchestrationDiagnosticsPanel");
    expect(researchPlannerPanelSection).toContain("KnowledgeBaseWorkingSetPanel");
    expect(researchPlannerPanelSection).toContain("ChunkMetaTier2AuditPanel");
    expect(researchPlannerPanelSection).toContain("MemoryList");
    expect(researchPlannerPanelSection).not.toContain("requestEngine");
    expect(researchPlannerPanelSection).not.toContain('kind: "getMemory"');
    expect(researchPlannerPanelSection).not.toContain("normalizedText");
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

  it("loads raw PDF in content and renders a document index in Rail", () => {
    const openDetailSection = contentSource.slice(
      contentSource.indexOf("const openDetail = React.useCallback"),
      contentSource.indexOf("const openTopicDetail = React.useCallback"),
    );
    const railPropsSection = contentSource.slice(
      contentSource.indexOf("<RailShell"),
      contentSource.indexOf("</RailShell>"),
    );
    const detailPanelSection = railShellSource.slice(
      railShellSource.indexOf("function MemoryDetailPanel"),
      railShellSource.indexOf("function ChatHistoryPanel"),
    );

    expect(openDetailSection).toContain('kind: "getMemory"');
    expect(openDetailSection).toContain('kind: "getPdfRawFile"');
    expect(openDetailSection).toContain("URL.createObjectURL");
    expect(contentSource).toContain("URL.revokeObjectURL");
    expect(railPropsSection).toContain("pdfPreview={pdfPreview}");
    expect(detailPanelSection).toContain("PdfDocumentIndex");
    expect(detailPanelSection).toContain('data-clio-pdf-document-index="true"');
    expect(detailPanelSection).toContain('data-clio-pdf-evidence="true"');
    expect(detailPanelSection).toContain("aria-label={`Open PDF page ${activePage} in a new tab`}");
    expect(detailPanelSection).toContain("pdfPreviewUrl(objectUrl, item.pageNumber)");
    expect(detailPanelSection).toContain('role="tablist"');
    expect(detailPanelSection).not.toContain("lg:grid-cols");
    expect(detailPanelSection).toContain('data-clio-pdf-bbox-overlay="true"');
    expect(detailPanelSection).toContain('data-clio-pdf-bbox-highlight="true"');
    expect(detailPanelSection).toContain("metadataBoundingBox(record.bbox)");
    expect(detailPanelSection).toContain("pdfPageSize(detail, pageNumber)");
    expect(detailPanelSection).not.toContain('aria-label="PDF page number"');
    expect(detailPanelSection).not.toContain("<iframe");
    expect(detailPanelSection).toContain("pdf_figure_analysis_results");
    expect(detailPanelSection).toContain("pdfFigureAnalysisResultDetail");
    expect(detailPanelSection).toContain("isMarkdownMemoryDetail(detail)");
    expect(detailPanelSection).toContain("<MarkdownRenderer");
    expect(detailPanelSection).toContain("markdown={detail.normalizedText}");
    expect(detailPanelSection).not.toContain("requestEngine");
  });

  it("shows provider connection results inline with success and error tones", () => {
    const connectionTestSection = contentSource.slice(
      contentSource.indexOf("const testGeminiProvider = React.useCallback"),
      contentSource.indexOf("const saveSelectionSnapshot = React.useCallback"),
    );
    const settingsPanelSection = railShellSource.slice(
      railShellSource.indexOf("function SettingsPanel"),
      railShellSource.indexOf("function SettingsSectionMenu"),
    );

    expect(connectionTestSection).toContain('setProviderMessageTone("success")');
    expect(connectionTestSection).toContain('setProviderMessageTone("error")');
    expect(connectionTestSection).toContain('setProviderMessage("Gemini connection works.")');
    expect(connectionTestSection).toContain('setProviderMessage("OpenAI connection works.")');
    expect(connectionTestSection).toContain(
      'setProviderMessage("OpenAI-compatible connection works.")',
    );
    expect(connectionTestSection).not.toContain("showToast(");
    expect(settingsPanelSection).toContain('data-clio-provider-message="true"');
    expect(settingsPanelSection).toContain(
      "data-clio-provider-message-tone={props.providerMessageTone}",
    );
    expect(settingsPanelSection).toContain(
      "border-success-border bg-success-background text-success-foreground",
    );
    expect(settingsPanelSection).toContain("border-danger bg-danger/10 text-danger");
  });

  it("names the primary provider Main model and makes Vision reuse explicit", () => {
    const settingsPanelSection = railShellSource.slice(
      railShellSource.indexOf("function SettingsPanel"),
      railShellSource.indexOf("function SettingsSectionMenu"),
    );
    const settingsMenuSection = railShellSource.slice(
      railShellSource.indexOf("function SettingsSectionMenu"),
      railShellSource.indexOf("interface VisionProviderSettingsCardProps"),
    );
    const visionSettingsSection = railShellSource.slice(
      railShellSource.indexOf("function VisionProviderSettingsCard"),
      railShellSource.indexOf("interface ImageGenerationSettingsCardProps"),
    );

    expect(settingsPanelSection).toContain(">Main model</h4>");
    expect(settingsPanelSection).not.toContain(">Large model</h4>");
    expect(settingsMenuSection).toContain('aria-label="Main model settings"');
    expect(settingsMenuSection).toContain(">Main model</span>");
    expect(visionSettingsSection).toContain('<option value="auto">Main model</option>');
    expect(visionSettingsSection).toContain("Main model for Vision");
    expect(visionSettingsSection).toContain(
      "Reuses the Main model configuration for vision analysis.",
    );
    expect(visionSettingsSection).not.toContain("must support image input");
    expect(visionSettingsSection).toContain("{usesMainModel ? null : (");
    expect(visionSettingsSection).not.toContain("Use Main model API key");
    expect(visionSettingsSection).not.toContain("Use Main model name");
    expect(visionSettingsSection).not.toContain("Use Main model Base URL");
    expect(visionSettingsSection).not.toContain("Auto Vision fallback");
    expect(visionSettingsSection).not.toContain("Use main");
  });

  it("makes the Settings directory navigate to the matching long-page section", () => {
    const settingsPanelSection = railShellSource.slice(
      railShellSource.indexOf("function SettingsPanel"),
      railShellSource.indexOf("function SettingsSectionMenu"),
    );
    const settingsMenuSection = railShellSource.slice(
      railShellSource.indexOf("function SettingsSectionMenu"),
      railShellSource.indexOf("interface VisionProviderSettingsCardProps"),
    );

    expect(settingsPanelSection).toContain("settingsScrollRef");
    expect(settingsPanelSection).toContain("scrollToSettingsSection");
    expect(settingsPanelSection).toContain("container.scrollTo({");
    expect(settingsPanelSection).toContain('behavior: "smooth"');
    expect(settingsPanelSection).toContain("onSelectSection={scrollToSettingsSection}");
    expect(settingsMenuSection).toContain('data-clio-settings-directory="true"');
    for (const section of [
      "appearance",
      "search",
      "embeddings",
      "vision",
      "image-generation",
      "model",
    ]) {
      expect(settingsMenuSection).toContain(`onClick={() => props.onSelectSection("${section}")}`);
      expect(settingsMenuSection).toContain(`className={buttonClass("${section}")}`);
    }
  });

  it("gates the local test workspace and wires initialization through existing RPCs", () => {
    const runnerAdapterSection = contentSource.slice(
      contentSource.indexOf("const createTestWorkspaceDependencies = React.useCallback"),
      contentSource.indexOf("const testOpenAICompatibleProvider = React.useCallback"),
    );
    const railPropsSection = contentSource.slice(
      contentSource.indexOf("<RailShell"),
      contentSource.indexOf("</RailShell>"),
    );
    const settingsPanelSection = railShellSource.slice(
      railShellSource.indexOf("function SettingsPanel"),
      railShellSource.indexOf("function SettingsSectionMenu"),
    );
    const settingsMenuSection = railShellSource.slice(
      railShellSource.indexOf("function SettingsSectionMenu"),
      railShellSource.indexOf("interface TestWorkspaceSettingsCardProps"),
    );
    const testWorkspaceCardSection = railShellSource.slice(
      railShellSource.indexOf("function TestWorkspaceSettingsCard"),
      railShellSource.indexOf("interface VisionProviderSettingsCardProps"),
    );

    expect(contentSource).toContain(
      'import { testWorkspaceBuildConfig } from "@/src/test-workspace/build-config"',
    );
    expect(runnerAdapterSection).toContain('kind: "getLocalEmbeddingModelStatus"');
    expect(runnerAdapterSection).toContain('kind: "installLocalEmbeddingModel"');
    expect(runnerAdapterSection).toContain('kind: "authorizeLocalEmbeddingReindex"');
    expect(runnerAdapterSection).toContain('kind: "capturePage"');
    expect(runnerAdapterSection).toContain('kind: "captureSelection"');
    expect(runnerAdapterSection).toContain('kind: "captureMarkdown"');
    expect(runnerAdapterSection).toContain('kind: "capturePdf"');
    expect(runnerAdapterSection).toContain("chrome.runtime.getURL(assetPath)");
    expect(runnerAdapterSection).toContain("initializeTestWorkspace(");
    expect(runnerAdapterSection).toContain("removeTestWorkspaceSources(");
    expect(runnerAdapterSection).toContain('loadLibrary("")');
    expect(runnerAdapterSection).toContain("completed: Math.max(1, result.matched)");
    expect(railPropsSection).toContain("testWorkspaceConfig={testWorkspaceBuildConfig}");
    expect(railPropsSection).toContain("onInitializeTestWorkspace={initializeLocalTestWorkspace}");
    expect(railPropsSection).toContain("onRemoveTestWorkspace={removeLocalTestWorkspace}");
    expect(settingsPanelSection).toContain("props.testWorkspaceConfig === null ? null : (");
    expect(settingsMenuSection).toContain("props.testWorkspaceEnabled ? (");
    expect(settingsMenuSection).toContain('className={buttonClass("test-workspace")}');
    expect(testWorkspaceCardSection).toContain('data-clio-test-workspace="true"');
    expect(testWorkspaceCardSection).toContain("Other Knowledge Base data will be preserved.");
    expect(testWorkspaceCardSection).not.toContain("sm:grid-cols-2");
    expect(testWorkspaceCardSection).not.toContain("reset_library");
  });

  it("shows Vision save feedback beside the action with explicit success and error tones", () => {
    const saveVisionSection = contentSource.slice(
      contentSource.indexOf("const saveVisionProviderSettings = React.useCallback"),
      contentSource.indexOf("const runLocalEmbeddingAction = React.useCallback"),
    );
    const visionSettingsSection = railShellSource.slice(
      railShellSource.indexOf("function VisionProviderSettingsCard"),
      railShellSource.indexOf("interface ImageGenerationSettingsCardProps"),
    );

    expect(saveVisionSection).toContain('setProviderMessageTone("success")');
    expect(saveVisionSection).toContain('setProviderMessageTone("error")');
    expect(visionSettingsSection).toContain("saveVisionSettings");
    expect(visionSettingsSection).toContain("await props.onSave()");
    expect(visionSettingsSection).toContain("props.message");
    expect(visionSettingsSection).toContain('data-clio-vision-save-feedback="true"');
    expect(visionSettingsSection).toContain(
      "data-clio-vision-save-feedback-tone={props.messageTone}",
    );
    expect(visionSettingsSection).toContain(
      "border-success-border bg-success-background text-success-foreground",
    );
    expect(visionSettingsSection).toContain("border-danger bg-danger/10 text-danger");
  });

  it("keeps local embedding status in content and exposes no remote embedding settings", () => {
    const statusOwnerSection = contentSource.slice(
      contentSource.indexOf("const loadLocalEmbeddingStatus = React.useCallback"),
      contentSource.indexOf("const loadWebSearchHistory = React.useCallback"),
    );
    const embeddingCardSection = railShellSource.slice(
      railShellSource.indexOf("function EmbeddingProviderSettingsCard"),
      railShellSource.indexOf("function AppearanceSettingsCard"),
    );

    expect(statusOwnerSection).toContain('kind: "getLocalEmbeddingModelStatus"');
    expect(contentSource).toContain("window.setInterval");
    expect(contentSource).toContain('localEmbeddingStatus?.state !== "downloading"');
    expect(embeddingCardSection).toContain('data-clio-local-embedding-progress="true"');
    expect(embeddingCardSection).toContain('data-clio-local-embedding-error="true"');
    expect(embeddingCardSection).not.toContain("Advanced remote providers");
    expect(embeddingCardSection).not.toContain("OpenAI Compatible");
    expect(embeddingCardSection).not.toContain("embedding API key");
    expect(embeddingCardSection).not.toContain("Base URL");
    expect(embeddingCardSection).toContain("break-words");
    expect(embeddingCardSection).toContain('title="Delete local embedding model"');
    expect(embeddingCardSection).not.toContain("requestProvider(");
    expect(embeddingCardSection).not.toContain("chrome.storage");
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
