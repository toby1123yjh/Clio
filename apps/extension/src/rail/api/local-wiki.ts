import type {
  WikiArtifactFreshness,
  WikiArtifactJsonValue,
  WikiArtifactKind,
  WikiArtifactMachineVersion,
} from "@/src/shared/rpc";
import type {
  WikiCompileCreateResult,
  WikiCompileRunStatus,
  WikiCompileRunSummary,
} from "@/src/shared/wiki-compile";

export function wikiArtifactKindLabel(kind: WikiArtifactKind) {
  if (kind === "source_digest") return "Source digest";
  if (kind === "section") return "Section";
  if (kind === "claim") return "Claim";
  if (kind === "topic") return "Topic";
  return "Index";
}

export function wikiArtifactFreshnessLabel(freshness: WikiArtifactFreshness) {
  if (freshness === "fresh") return "Current";
  if (freshness === "partial") return "Partial";
  return "History";
}

export function wikiArtifactSourceLabel(artifact: WikiArtifactMachineVersion) {
  if (artifact.scope.kind === "source") return `Source ${shortIdentifier(artifact.scope.id)}`;
  if (artifact.scope.kind === "library") return "Knowledge Base";
  return `Topic ${shortIdentifier(artifact.scope.id)}`;
}

export function wikiCompileRunStatusLabel(status: WikiCompileRunStatus) {
  if (status === "queued") return "Queued";
  if (status === "running") return "Compiling";
  if (status === "reducing") return "Publishing";
  if (status === "paused") return "Paused";
  if (status === "completed") return "Completed";
  if (status === "failed") return "Failed";
  return "Cancelled";
}

export function wikiCompileRunProgress(run: WikiCompileRunSummary) {
  if (run.status === "completed") return 100;
  if (run.stepCount <= 0) return 0;
  return Math.min(99, Math.round((run.completedStepCount / run.stepCount) * 100));
}

export function wikiCompileRunCanCancel(status: WikiCompileRunStatus) {
  return status !== "completed" && status !== "failed" && status !== "cancelled";
}

export function wikiCompileRunCanRetry(status: WikiCompileRunStatus, wikiEnabled: boolean) {
  return wikiEnabled && status === "failed";
}

export function wikiCompileRunCanResume(status: WikiCompileRunStatus, wikiEnabled: boolean) {
  return wikiEnabled && status === "paused";
}

export function wikiCompileCreateResultMessage(result: WikiCompileCreateResult) {
  if (result.disposition === "reused_artifact") return "Wiki is already current for this Source.";
  if (result.disposition === "reused_run") return "The existing Wiki compile was opened.";
  return "Wiki compile started.";
}

export function wikiArtifactJsonValueLabel(value: WikiArtifactJsonValue) {
  if (value === null) return "None";
  if (typeof value === "string") return boundedWikiMetadataText(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return boundedWikiMetadataText(JSON.stringify(value));
}

function boundedWikiMetadataText(value: string) {
  return value.length <= 160 ? value : `${value.slice(0, 157)}...`;
}

function shortIdentifier(value: string) {
  return value.length <= 12 ? value : `${value.slice(0, 8)}...`;
}
