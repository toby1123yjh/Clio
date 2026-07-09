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
    const retrieveFilterSection = contentSource.slice(
      contentSource.indexOf("function retrieveFilterForKnowledgeBase"),
      contentSource.indexOf("function knowledgeUploadKindForFile"),
    );
    const contentStateSection = contentSource.slice(
      contentSource.indexOf("function ClioContentApp()"),
      contentSource.indexOf("React.useEffect(() => {"),
    );
    const loadLibrarySection = contentSource.slice(
      contentSource.indexOf("const loadLibrary = React.useCallback"),
      contentSource.indexOf("const loadChatHistory = React.useCallback"),
    );

    expect(loadLibrarySection).toContain('kind: "searchKnowledgeBase"');
    expect(loadLibrarySection).toContain("toKnowledgeBaseSearchItem");
    expect(contentStateSection).toContain("const knowledgeBaseRetrieveFilter = React.useMemo(");
    expect(contentStateSection).toContain("retrieveFilterForKnowledgeBase(knowledgeBaseFilter)");
    expect(contentStateSection).toContain("defaultKnowledgeBaseClustering");
    expect(contentStateSection).toContain(
      "clusteringPayloadForKnowledgeBase(knowledgeBaseClustering)",
    );
    expect(retrieveFilterSection).toContain('["webpage", "page", "selection"]');
    expect(retrieveFilterSection).toContain('if (clustering.clusterBy === "none")');
    expect(retrieveFilterSection).toContain("clusterBy: clustering.clusterBy");
    expect(retrieveFilterSection).toContain("semanticBackend: clustering.semanticBackend");
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
    expect(loadLibrarySection).toContain("knowledgeBaseRetrieveFilter === undefined");
    expect(loadLibrarySection).toContain("{ filter: knowledgeBaseRetrieveFilter }");
    expect(loadLibrarySection).toContain("knowledgeBaseClusteringPayload === undefined");
    expect(loadLibrarySection).toContain("{ clustering: knowledgeBaseClusteringPayload }");
    expect(loadLibrarySection).toContain("knowledgeBaseClusterGroups(nextClusters, nextItems)");
    expect(loadLibrarySection).not.toContain('kind: "searchMemory"');
    expect(loadLibrarySection).not.toContain('kind: "listMemories"');
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
    expect(knowledgeFilterSection).toContain('data-clio-knowledge-advanced-filters="true"');
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

  it("exposes Knowledge Base clustering controls through content-owned search payloads", () => {
    const contentStateSection = contentSource.slice(
      contentSource.indexOf("function ClioContentApp()"),
      contentSource.indexOf("React.useEffect(() => {"),
    );
    const loadLibrarySection = contentSource.slice(
      contentSource.indexOf("const loadLibrary = React.useCallback"),
      contentSource.indexOf("const pinWorkingSetSource = React.useCallback"),
    );
    const railPropsSection = contentSource.slice(
      contentSource.indexOf("<RailShell"),
      contentSource.indexOf("</RailShell>"),
    );
    const clusteringControlsSection = railShellSource.slice(
      railShellSource.indexOf("function KnowledgeBaseClusteringControls"),
      railShellSource.indexOf("function KnowledgeBaseWorkingSetPanel"),
    );
    const memoryListSection = railShellSource.slice(
      railShellSource.indexOf("function MemoryList"),
      railShellSource.indexOf("function MemoryDetailPanel"),
    );
    const refinementSection = contentSource.slice(
      contentSource.indexOf("async function refineKnowledgeBaseClusterLabels"),
      contentSource.indexOf("function knowledgeUploadKindForFile"),
    );

    expect(contentStateSection).toContain("React.useState<KnowledgeBaseClusteringState>");
    expect(contentStateSection).toContain("KnowledgeBaseClusterGroup[]");
    expect(loadLibrarySection).toContain("knowledgeBaseClusteringPayload");
    expect(loadLibrarySection).toContain("result.clusters");
    expect(loadLibrarySection).toContain("shouldRefineKnowledgeBaseClusterLabels");
    expect(loadLibrarySection).toContain("refineKnowledgeBaseClusterLabels(result.clusters");
    expect(railPropsSection).toContain("knowledgeBaseClustering={knowledgeBaseClustering}");
    expect(railPropsSection).toContain("knowledgeBaseClusters={knowledgeBaseClusters}");
    expect(railPropsSection).toContain(
      "onKnowledgeBaseClusteringChange={setKnowledgeBaseClustering}",
    );
    expect(clusteringControlsSection).toContain('data-clio-knowledge-clustering="true"');
    expect(clusteringControlsSection).toContain('id="clio-kb-cluster-by"');
    expect(clusteringControlsSection).toContain('id="clio-kb-cluster-granularity"');
    expect(clusteringControlsSection).toContain('id="clio-kb-cluster-semantic-backend"');
    expect(clusteringControlsSection).toContain('id="clio-kb-cluster-llm-labels"');
    expect(clusteringControlsSection).toContain("providerBackedLabels");
    expect(clusteringControlsSection).toContain("providerBackedLabels: false");
    expect(clusteringControlsSection).toContain("disabled={disabled || !topicEnabled}");
    expect(clusteringControlsSection).toContain("knowledgeBaseSemanticClusterBackendOptions");
    expect(clusteringControlsSection).toContain("knowledgeBaseClusterByOptions");
    expect(railShellSource).toContain('{ value: "topic", label: "Topic" }');
    expect(memoryListSection).toContain('data-clio-knowledge-cluster-list="true"');
    expect(memoryListSection).toContain('data-clio-knowledge-cluster="true"');
    expect(memoryListSection).toContain('data-clio-knowledge-cluster-summary="true"');
    expect(memoryListSection).toContain('data-clio-knowledge-cluster-trace="true"');
    expect(memoryListSection).toContain("knowledgeBaseClusterTraceLabel(cluster.trace)");
    expect(memoryListSection).toContain("cluster.deterministicLabel");
    expect(contentSource).toContain("requestKnowledgeBaseClusterLabelRefinement(request)");
    expect(contentSource).toContain("abstractSnippet: excerpt(item.excerpt, 360)");
    expect(refinementSection).not.toContain('kind: "getMemory"');
    expect(clusteringControlsSection).not.toContain("requestEngine");
    expect(memoryListSection).not.toContain("requestEngine");
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

    expect(loadLibrarySection).toContain('kind: "getWorkingSetStatus"');
    expect(contentWorkingSetSection).toContain('kind: "pinWorkingSetSource"');
    expect(contentWorkingSetSection).toContain('kind: "evictWorkingSetSource"');
    expect(contentWorkingSetSection).toContain('kind: "setWorkingSetSourceDepth"');
    expect(contentWorkingSetSection).toContain('kind: "reloadWorkingSetSource"');
    expect(railPropsSection).toContain("workingSetStatus={workingSetStatus}");
    expect(railPropsSection).toContain("onPinWorkingSetSource=");
    expect(workingSetPanelSection).toContain('data-clio-working-set="true"');
    expect(workingSetPanelSection).toContain("workingSetLoadDepthOptions");
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

  it("keeps raw PDF reader loading in content and renders preview in Rail", () => {
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
    expect(detailPanelSection).toContain("PdfReaderPreview");
    expect(detailPanelSection).toContain('data-clio-pdf-preview="true"');
    expect(detailPanelSection).toContain('data-clio-pdf-bbox-overlay="true"');
    expect(detailPanelSection).toContain('data-clio-pdf-bbox-highlight="true"');
    expect(detailPanelSection).toContain("metadataBoundingBox(record.bbox)");
    expect(detailPanelSection).toContain("pdfPageSize(detail, pageNumber)");
    expect(detailPanelSection).toContain("pdf_figure_analysis_results");
    expect(detailPanelSection).toContain("pdfFigureAnalysisResultDetail");
    expect(detailPanelSection).not.toContain("requestEngine");
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
