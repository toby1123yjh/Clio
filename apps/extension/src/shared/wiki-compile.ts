export const WIKI_COMPILER_VERSION = "wiki-compiler-v1";
export const WIKI_PROMPT_VERSION = "wiki-map-reduce-v1";
export const WIKI_INPUT_MANIFEST_VERSION = "wiki-input-manifest-v1";

export const WIKI_COMPILE_LIMITS = {
  idChars: 192,
  modelChars: 240,
  titleChars: 500,
  sectionPathChars: 500,
  digestChars: 12_000,
  findingChars: 4_000,
  claimChars: 2_000,
  errorChars: 2_000,
  eventMessageChars: 1_000,
  maxChunks: 20_000,
  maxSteps: 2_000,
  maxFindings: 160,
  maxClaims: 240,
  maxSections: 120,
  maxEvidenceRefs: 400,
  maxEvents: 200,
} as const;

export type WikiCompileRunStatus =
  | "queued"
  | "running"
  | "reducing"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";

export type WikiCompileStepStatus = "queued" | "running" | "completed" | "failed" | "cancelled";
export type WikiCompilePauseReason = "wiki_disabled" | "manual";
export type WikiCompileEventLevel = "info" | "warning" | "error";
export type WikiCompileEventKind =
  | "queued"
  | "reused"
  | "recovered"
  | "resumed"
  | "step_claimed"
  | "step_completed"
  | "step_failed"
  | "reduce_claimed"
  | "published"
  | "completed"
  | "pause_requested"
  | "paused"
  | "cancel_requested"
  | "cancelled"
  | "retry_started"
  | "failed";

export type WikiCompileErrorCode =
  | "unavailable"
  | "permission"
  | "timeout"
  | "aborted"
  | "malformed_output"
  | "validation"
  | "rate_limited"
  | "provider_error";

export interface WikiCompileBudget {
  contextTokens: number;
  maxInputTokens: number;
  maxOutputTokens: number;
  maxStepTokens: number;
  maxReduceInputTokens: number;
  maxDigestTokens: number;
  maxOverlapTokens: number;
}

export interface WikiCompileManifestChunk {
  id: string;
  ord: number;
  hash: string;
  tokenCount: number;
  sectionPath?: string;
  pageStart?: number;
  pageEnd?: number;
}

export interface WikiCompileInputManifest {
  version: typeof WIKI_INPUT_MANIFEST_VERSION;
  scope: { kind: "source"; id: string };
  source: {
    id: string;
    contentHash: string;
    title: string;
    sourceType?: string;
  };
  chunks: WikiCompileManifestChunk[];
  parserVersion?: string;
  chunkStrategyVersion: string;
  compilerVersion: string;
  promptVersion: string;
  provider: string;
  modelId: string;
  budget: WikiCompileBudget;
  modalityScope: "text";
}

export interface WikiCompileStepPlan {
  index: number;
  signature: string;
  mainChunkIds: string[];
  overlapChunkIds: string[];
  tokenEstimate: number;
}

export interface WikiCompileSourceCard {
  id: string;
  title: string;
  sourceType?: string;
  contentHash: string;
}

export interface WikiCompileChunkText {
  id: string;
  ord: number;
  text: string;
  tokenCount: number;
  sectionPath?: string;
  pageStart?: number;
  pageEnd?: number;
}

export type WikiFindingKind = "overview" | "section" | "method" | "result" | "limitation" | "fact";

export interface WikiCompileFinding {
  kind: WikiFindingKind;
  key: string;
  title: string;
  summary: string;
  evidenceChunkIds: string[];
}

export interface WikiCompileClaim {
  key: string;
  text: string;
  evidenceChunkIds: string[];
  confidence: number;
}

export interface WikiCompileMapInput {
  runId: string;
  stepId: string;
  inputSignature: string;
  source: WikiCompileSourceCard;
  mainChunks: WikiCompileChunkText[];
  overlapChunks: WikiCompileChunkText[];
  priorDigest: string;
  budget: WikiCompileBudget;
}

export interface WikiCompileMapResult {
  findings: WikiCompileFinding[];
  claims: WikiCompileClaim[];
  rollingDigest: string;
  coveredChunkIds: string[];
}

export interface WikiCompileCheckpoint extends WikiCompileMapResult {
  stepId: string;
  stepIndex: number;
}

export interface WikiCompileReduceInput {
  runId: string;
  inputSignature: string;
  source: WikiCompileSourceCard;
  checkpoints: WikiCompileCheckpoint[];
  manifestChunkIds: string[];
  budget: WikiCompileBudget;
}

export interface WikiCompileSectionResult {
  key: string;
  title: string;
  content: string;
  evidenceChunkIds: string[];
}

export interface WikiCompileDigestResult {
  title: string;
  content: string;
  evidenceChunkIds: string[];
}

export interface WikiCompileReduceResult {
  digest: WikiCompileDigestResult;
  sections: WikiCompileSectionResult[];
  claims: WikiCompileClaim[];
  coveredChunkIds: string[];
}

export interface WikiCompileRunSummary {
  id: string;
  sourceId: string;
  inputSignature: string;
  status: WikiCompileRunStatus;
  pauseReason?: WikiCompilePauseReason;
  provider: string;
  modelId: string;
  stepCount: number;
  completedStepCount: number;
  coveredChunkCount: number;
  totalChunkCount: number;
  attemptCount: number;
  maxAttempts: number;
  cancelRequested: boolean;
  leaseOwner?: string;
  versionGroupId?: string;
  errorCode?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  finishedAt?: string;
}

export interface WikiCompileStepRecord {
  id: string;
  runId: string;
  index: number;
  signature: string;
  status: WikiCompileStepStatus;
  mainChunkIds: string[];
  overlapChunkIds: string[];
  tokenEstimate: number;
  attemptCount: number;
  maxAttempts: number;
  rollingDigest?: string;
  findings: WikiCompileFinding[];
  claims: WikiCompileClaim[];
  coveredChunkIds: string[];
  inputTokenEstimate?: number;
  outputTokenEstimate?: number;
  latencyMs?: number;
  errorCode?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface WikiCompileRunDetail extends WikiCompileRunSummary {
  manifest: WikiCompileInputManifest;
  budget: WikiCompileBudget;
  steps: WikiCompileStepRecord[];
}

export interface ListWikiCompileRunsResult {
  runs: WikiCompileRunSummary[];
}

export interface WikiCompileRunFilter {
  sourceId?: string;
  status?: WikiCompileRunStatus;
  limit?: number;
}

export interface WikiCompileEvent {
  id: string;
  runId: string;
  stepId?: string;
  kind: WikiCompileEventKind;
  level: WikiCompileEventLevel;
  message: string;
  detail: Record<string, unknown>;
  createdAt: string;
}

export interface ListWikiCompileEventsResult {
  events: WikiCompileEvent[];
}

export interface EnqueueWikiCompileRunPayload {
  sourceId: string;
}

export interface CreateWikiCompileRunPayload extends EnqueueWikiCompileRunPayload {
  provider: string;
  modelId: string;
  budget: WikiCompileBudget;
  compilerVersion?: string;
  promptVersion?: string;
  createdAt?: string;
}

export interface WikiCompileCreateResult {
  disposition: "created" | "reused_run" | "reused_artifact";
  run?: WikiCompileRunDetail;
  versionGroupId?: string;
}

export interface WikiCompileClaimStepResult {
  run?: WikiCompileRunSummary;
  step?: WikiCompileStepRecord;
}

export interface CompleteWikiCompileStepPayload {
  runId: string;
  stepId: string;
  leaseOwner: string;
  inputSignature: string;
  result: WikiCompileMapResult;
  inputTokenEstimate?: number;
  outputTokenEstimate?: number;
  latencyMs?: number;
  completedAt?: string;
}

export interface FailWikiCompileStagePayload {
  runId: string;
  leaseOwner: string;
  errorCode: WikiCompileErrorCode;
  errorMessage: string;
  stepId?: string;
  failedAt?: string;
}

export interface PauseWikiCompileRunPayload {
  runId: string;
  reason: WikiCompilePauseReason;
  leaseOwner?: string;
  pausedAt?: string;
}

export interface WikiCompileClaimReduceResult {
  run?: WikiCompileRunSummary;
  leaseOwner?: string;
}

export interface CompleteWikiCompileReducePayload {
  runId: string;
  leaseOwner: string;
  inputSignature: string;
  result: WikiCompileReduceResult;
  completedAt?: string;
}

export interface RecoverWikiCompileRunsPayload {
  leaseOwner: string;
  resumeWikiDisabled?: boolean;
  now?: string;
}

export interface RecoverWikiCompileRunsResult {
  recoveredRunCount: number;
  recoveredStepCount: number;
  resumedRunCount: number;
}

export function isWikiCompileBudget(value: unknown): value is WikiCompileBudget {
  if (!isRecord(value)) return false;
  const fields: Array<keyof WikiCompileBudget> = [
    "contextTokens",
    "maxInputTokens",
    "maxOutputTokens",
    "maxStepTokens",
    "maxReduceInputTokens",
    "maxDigestTokens",
    "maxOverlapTokens",
  ];
  if (!fields.every((field) => isPositiveInteger(value[field]))) return false;
  const budget = value as unknown as WikiCompileBudget;
  return (
    budget.maxInputTokens <= budget.contextTokens &&
    budget.maxStepTokens <= budget.maxInputTokens &&
    budget.maxReduceInputTokens <= budget.maxInputTokens &&
    budget.maxOutputTokens < budget.contextTokens
  );
}

export function isWikiCompileRunStatus(value: unknown): value is WikiCompileRunStatus {
  return (
    value === "queued" ||
    value === "running" ||
    value === "reducing" ||
    value === "paused" ||
    value === "completed" ||
    value === "failed" ||
    value === "cancelled"
  );
}

export function isWikiCompileRunFilter(value: unknown): value is WikiCompileRunFilter {
  return (
    isRecord(value) &&
    (value.sourceId === undefined ||
      isBoundedString(value.sourceId, WIKI_COMPILE_LIMITS.idChars)) &&
    (value.status === undefined || isWikiCompileRunStatus(value.status)) &&
    (value.limit === undefined || isIntegerInRange(value.limit, 1, 200))
  );
}

export function isEnqueueWikiCompileRunPayload(
  value: unknown,
): value is EnqueueWikiCompileRunPayload {
  return isRecord(value) && isBoundedString(value.sourceId, WIKI_COMPILE_LIMITS.idChars);
}

export function isCreateWikiCompileRunPayload(
  value: unknown,
): value is CreateWikiCompileRunPayload {
  if (!isRecord(value) || !isEnqueueWikiCompileRunPayload(value)) return false;
  return (
    isBoundedString(value.provider, 80) &&
    isBoundedString(value.modelId, WIKI_COMPILE_LIMITS.modelChars) &&
    isWikiCompileBudget(value.budget) &&
    isOptionalBoundedString(value.compilerVersion, 120) &&
    isOptionalBoundedString(value.promptVersion, 120) &&
    isOptionalBoundedString(value.createdAt, 80)
  );
}

export function isCompleteWikiCompileStepPayload(
  value: unknown,
): value is CompleteWikiCompileStepPayload {
  return (
    isRecord(value) &&
    isBoundedString(value.runId, WIKI_COMPILE_LIMITS.idChars) &&
    isBoundedString(value.stepId, WIKI_COMPILE_LIMITS.idChars) &&
    isBoundedString(value.leaseOwner, WIKI_COMPILE_LIMITS.idChars) &&
    isBoundedString(value.inputSignature, 512) &&
    isWikiCompileMapResult(value.result) &&
    isOptionalNonNegativeNumber(value.inputTokenEstimate) &&
    isOptionalNonNegativeNumber(value.outputTokenEstimate) &&
    isOptionalNonNegativeNumber(value.latencyMs) &&
    isOptionalBoundedString(value.completedAt, 80)
  );
}

export function isFailWikiCompileStagePayload(
  value: unknown,
): value is FailWikiCompileStagePayload {
  return (
    isRecord(value) &&
    isBoundedString(value.runId, WIKI_COMPILE_LIMITS.idChars) &&
    isBoundedString(value.leaseOwner, WIKI_COMPILE_LIMITS.idChars) &&
    isWikiCompileErrorCode(value.errorCode) &&
    isBoundedString(value.errorMessage, WIKI_COMPILE_LIMITS.errorChars) &&
    isOptionalBoundedString(value.stepId, WIKI_COMPILE_LIMITS.idChars) &&
    isOptionalBoundedString(value.failedAt, 80)
  );
}

export function isPauseWikiCompileRunPayload(value: unknown): value is PauseWikiCompileRunPayload {
  return (
    isRecord(value) &&
    isBoundedString(value.runId, WIKI_COMPILE_LIMITS.idChars) &&
    (value.reason === "wiki_disabled" || value.reason === "manual") &&
    isOptionalBoundedString(value.leaseOwner, WIKI_COMPILE_LIMITS.idChars) &&
    isOptionalBoundedString(value.pausedAt, 80)
  );
}

export function isCompleteWikiCompileReducePayload(
  value: unknown,
): value is CompleteWikiCompileReducePayload {
  return (
    isRecord(value) &&
    isBoundedString(value.runId, WIKI_COMPILE_LIMITS.idChars) &&
    isBoundedString(value.leaseOwner, WIKI_COMPILE_LIMITS.idChars) &&
    isBoundedString(value.inputSignature, 512) &&
    isWikiCompileReduceResult(value.result) &&
    isOptionalBoundedString(value.completedAt, 80)
  );
}

export function isRecoverWikiCompileRunsPayload(
  value: unknown,
): value is RecoverWikiCompileRunsPayload {
  return (
    isRecord(value) &&
    isBoundedString(value.leaseOwner, WIKI_COMPILE_LIMITS.idChars) &&
    (value.resumeWikiDisabled === undefined || typeof value.resumeWikiDisabled === "boolean") &&
    isOptionalBoundedString(value.now, 80)
  );
}

export function isWikiCompileMapResult(value: unknown): value is WikiCompileMapResult {
  return (
    isRecord(value) &&
    Array.isArray(value.findings) &&
    value.findings.length <= WIKI_COMPILE_LIMITS.maxFindings &&
    value.findings.every(isWikiCompileFinding) &&
    Array.isArray(value.claims) &&
    value.claims.length <= WIKI_COMPILE_LIMITS.maxClaims &&
    value.claims.every(isWikiCompileClaim) &&
    typeof value.rollingDigest === "string" &&
    value.rollingDigest.length <= WIKI_COMPILE_LIMITS.digestChars &&
    isBoundedStringArray(value.coveredChunkIds, WIKI_COMPILE_LIMITS.maxEvidenceRefs)
  );
}

export function isWikiCompileReduceResult(value: unknown): value is WikiCompileReduceResult {
  return (
    isRecord(value) &&
    isWikiCompileDigestResult(value.digest) &&
    Array.isArray(value.sections) &&
    value.sections.length <= WIKI_COMPILE_LIMITS.maxSections &&
    value.sections.every(isWikiCompileSectionResult) &&
    Array.isArray(value.claims) &&
    value.claims.length <= WIKI_COMPILE_LIMITS.maxClaims &&
    value.claims.every(isWikiCompileClaim) &&
    isBoundedStringArray(value.coveredChunkIds, WIKI_COMPILE_LIMITS.maxChunks)
  );
}

function isWikiCompileFinding(value: unknown): value is WikiCompileFinding {
  return (
    isRecord(value) &&
    isWikiFindingKind(value.kind) &&
    isBoundedString(value.key, 240) &&
    isBoundedString(value.title, WIKI_COMPILE_LIMITS.titleChars) &&
    isBoundedString(value.summary, WIKI_COMPILE_LIMITS.findingChars) &&
    isBoundedStringArray(value.evidenceChunkIds, WIKI_COMPILE_LIMITS.maxEvidenceRefs)
  );
}

function isWikiCompileClaim(value: unknown): value is WikiCompileClaim {
  return (
    isRecord(value) &&
    isBoundedString(value.key, 240) &&
    isBoundedString(value.text, WIKI_COMPILE_LIMITS.claimChars) &&
    isBoundedStringArray(value.evidenceChunkIds, WIKI_COMPILE_LIMITS.maxEvidenceRefs) &&
    typeof value.confidence === "number" &&
    Number.isFinite(value.confidence) &&
    value.confidence >= 0 &&
    value.confidence <= 1
  );
}

function isWikiCompileDigestResult(value: unknown): value is WikiCompileDigestResult {
  return (
    isRecord(value) &&
    isBoundedString(value.title, WIKI_COMPILE_LIMITS.titleChars) &&
    isBoundedString(value.content, WIKI_COMPILE_LIMITS.digestChars) &&
    isBoundedStringArray(value.evidenceChunkIds, WIKI_COMPILE_LIMITS.maxEvidenceRefs)
  );
}

function isWikiCompileSectionResult(value: unknown): value is WikiCompileSectionResult {
  return (
    isRecord(value) &&
    isBoundedString(value.key, 240) &&
    isBoundedString(value.title, WIKI_COMPILE_LIMITS.titleChars) &&
    isBoundedString(value.content, WIKI_COMPILE_LIMITS.findingChars) &&
    isBoundedStringArray(value.evidenceChunkIds, WIKI_COMPILE_LIMITS.maxEvidenceRefs)
  );
}

function isWikiFindingKind(value: unknown): value is WikiFindingKind {
  return (
    value === "overview" ||
    value === "section" ||
    value === "method" ||
    value === "result" ||
    value === "limitation" ||
    value === "fact"
  );
}

function isWikiCompileErrorCode(value: unknown): value is WikiCompileErrorCode {
  return (
    value === "unavailable" ||
    value === "permission" ||
    value === "timeout" ||
    value === "aborted" ||
    value === "malformed_output" ||
    value === "validation" ||
    value === "rate_limited" ||
    value === "provider_error"
  );
}

function isBoundedStringArray(value: unknown, limit: number): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= limit &&
    value.every((item) => isBoundedString(item, WIKI_COMPILE_LIMITS.idChars))
  );
}

function isBoundedString(value: unknown, maxChars: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxChars;
}

function isOptionalBoundedString(value: unknown, maxChars: number) {
  return value === undefined || isBoundedString(value, maxChars);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isIntegerInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

function isOptionalNonNegativeNumber(value: unknown) {
  return value === undefined || (typeof value === "number" && Number.isFinite(value) && value >= 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
