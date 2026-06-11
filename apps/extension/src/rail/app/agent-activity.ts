import type { AgentToolTrace } from "@/src/agent-runtime/types";
import type { RailDialogueMessage } from "@/src/rail/app/rail-state";
import {
  type ExplicitToolTrace,
  explicitToolRouteLabel,
  explicitToolTriggerLabel,
} from "../../tool-routing/tool-route-types";

const defaultSummaryLimit = 120;

export interface AgentActivitySnapshot {
  thinking?: string;
  traces: AgentToolTrace[];
  explicitToolTraces: ExplicitToolTrace[];
  summary: string;
}

export function buildAgentActivitySnapshot(
  message: Pick<RailDialogueMessage, "thinkingTrace" | "toolTraces" | "explicitToolTraces">,
): AgentActivitySnapshot | undefined {
  const thinking = normalizeActivityText(message.thinkingTrace);
  const traces = message.toolTraces ?? [];
  const explicitToolTraces = message.explicitToolTraces ?? [];
  const latestTrace = traces.at(-1);
  const latestExplicitTrace = explicitToolTraces.at(-1);

  if (thinking === undefined && latestTrace === undefined && latestExplicitTrace === undefined) {
    return undefined;
  }

  const summaryParts = [
    thinking === undefined ? undefined : "Thinking",
    latestTrace === undefined ? undefined : formatToolTraceSummary(latestTrace),
    latestExplicitTrace === undefined
      ? undefined
      : formatExplicitToolTraceSummary(latestExplicitTrace),
  ].filter((part): part is string => part !== undefined);

  return {
    ...(thinking === undefined ? {} : { thinking }),
    traces,
    explicitToolTraces,
    summary: truncateActivityText(summaryParts.join(" / "), defaultSummaryLimit),
  };
}

export function formatToolTraceSummary(trace: AgentToolTrace) {
  const status = formatToolTraceStatus(trace.status);
  const summary = normalizeActivityText(trace.summary);
  return `${formatToolName(trace.toolName)} ${status}${
    summary === undefined ? "" : ` - ${truncateActivityText(summary, 72)}`
  }`;
}

export function formatToolTraceStatus(status: AgentToolTrace["status"]) {
  switch (status) {
    case "running":
      return "running";
    case "completed":
      return "done";
    case "failed":
      return "failed";
    default:
      return exhaustive(status);
  }
}

export function formatExplicitToolTraceSummary(trace: ExplicitToolTrace) {
  const status = trace.status === "completed" ? "opened" : "failed";
  const summary = normalizeActivityText(trace.sourceSummary ?? trace.inputSummary);
  return `${explicitToolRouteLabel(trace.route)} ${status}${
    summary === undefined ? "" : ` - ${truncateActivityText(summary, 72)}`
  }`;
}

export function formatExplicitToolTraceMeta(trace: ExplicitToolTrace) {
  return `${explicitToolTriggerLabel(trace.trigger)} / ${trace.status}`;
}

export function formatToolName(name: string) {
  const normalized = name.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return normalized.length > 0 ? normalized : "tool";
}

export function normalizeActivityText(text: string | undefined) {
  const normalized = text?.replace(/\s+/g, " ").trim();
  return normalized === undefined || normalized.length === 0 ? undefined : normalized;
}

export function truncateActivityText(text: string, maxLength: number) {
  if (text.length <= maxLength) return text;
  if (maxLength <= 3) return ".".repeat(Math.max(0, maxLength));
  return `${text.slice(0, maxLength - 3).trimEnd()}...`;
}

function exhaustive(value: never): never {
  throw new Error(`Unhandled agent activity value: ${String(value)}`);
}
