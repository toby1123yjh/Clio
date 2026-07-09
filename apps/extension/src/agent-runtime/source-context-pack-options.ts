import type {
  SourceContextPackLoadDepth,
  SourceContextPackMapReduceOptions,
  SourceContextPackRequestOptions,
  SourceContextPackSourceDepthOverride,
} from "./types";

export const sourceContextPackResearchBudgetDefaults = {
  maxTotalTokens: 10_000,
  maxGroups: 3,
  maxGroupTokens: 4_000,
  maxSources: 8,
  maxWindowsPerSource: 2,
  contextChunksBefore: 1,
  contextChunksAfter: 1,
} as const;

export const sourceContextPackAutoBudgetDefaults = {
  maxTotalTokens: 6_000,
  maxGroups: 2,
  maxGroupTokens: 3_000,
  maxSources: 4,
  maxWindowsPerSource: 2,
  contextChunksBefore: 1,
  contextChunksAfter: 1,
} as const;

const numericSourceContextPackFields = [
  "maxTotalTokens",
  "maxGroups",
  "maxGroupTokens",
  "maxSources",
  "maxWindowsPerSource",
  "contextChunksBefore",
  "contextChunksAfter",
] as const;

export function isSourceContextPackRequestOptions(
  value: unknown,
): value is SourceContextPackRequestOptions {
  return readSourceContextPackRequestOptions(value) !== undefined;
}

export function readSourceContextPackRequestOptions(
  value: unknown,
): SourceContextPackRequestOptions | undefined {
  if (!isRecord(value) || (value.mode !== "research" && value.mode !== "auto")) {
    return undefined;
  }
  if (value.planner !== undefined && value.planner !== "source_context_planner_v1") {
    return undefined;
  }
  if (value.triggerReason !== undefined && typeof value.triggerReason !== "string") {
    return undefined;
  }
  if (
    value.sourceIds !== undefined &&
    (!Array.isArray(value.sourceIds) ||
      !value.sourceIds.every((sourceId) => typeof sourceId === "string"))
  ) {
    return undefined;
  }
  const sourceDepthOverrides =
    value.sourceDepthOverrides === undefined
      ? undefined
      : readSourceDepthOverrides(value.sourceDepthOverrides);
  if (value.sourceDepthOverrides !== undefined && sourceDepthOverrides === undefined) {
    return undefined;
  }
  if (value.useWorkingSet !== undefined && typeof value.useWorkingSet !== "boolean") {
    return undefined;
  }
  for (const field of numericSourceContextPackFields) {
    if (!isOptionalFiniteNumber(value[field])) return undefined;
  }
  const mapReduce =
    value.mapReduce === undefined
      ? undefined
      : readSourceContextPackMapReduceOptions(value.mapReduce);
  if (value.mapReduce !== undefined && mapReduce === undefined) {
    return undefined;
  }

  return {
    mode: value.mode,
    ...(value.planner === undefined ? {} : { planner: value.planner }),
    ...(value.triggerReason === undefined ? {} : { triggerReason: value.triggerReason }),
    ...(value.sourceIds === undefined ? {} : { sourceIds: value.sourceIds }),
    ...(sourceDepthOverrides === undefined ? {} : { sourceDepthOverrides }),
    ...(value.useWorkingSet === undefined ? {} : { useWorkingSet: value.useWorkingSet }),
    ...copyOptionalNumberFields(value, numericSourceContextPackFields),
    ...(mapReduce === undefined ? {} : { mapReduce }),
  };
}

function readSourceDepthOverrides(
  value: unknown,
): SourceContextPackSourceDepthOverride[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const bySourceId = new Map<string, SourceContextPackSourceDepthOverride>();
  for (const item of value) {
    if (!isRecord(item) || typeof item.sourceId !== "string") return undefined;
    const sourceId = item.sourceId.trim();
    if (sourceId.length === 0 || !isSourceContextPackLoadDepth(item.loadDepth)) return undefined;
    bySourceId.delete(sourceId);
    bySourceId.set(sourceId, { sourceId, loadDepth: item.loadDepth });
  }
  return [...bySourceId.values()];
}

function readSourceContextPackMapReduceOptions(
  value: unknown,
): SourceContextPackMapReduceOptions | undefined {
  if (!isRecord(value) || typeof value.enabled !== "boolean") return undefined;
  if (!isOptionalFiniteNumber(value.maxGroups)) return undefined;
  if (!isOptionalFiniteNumber(value.perGroupTokenBudget)) return undefined;
  if (!isOptionalFiniteNumber(value.maxConcurrentMaps)) return undefined;
  const output: SourceContextPackMapReduceOptions = {
    enabled: value.enabled,
  };
  if (typeof value.maxGroups === "number") output.maxGroups = value.maxGroups;
  if (typeof value.perGroupTokenBudget === "number") {
    output.perGroupTokenBudget = value.perGroupTokenBudget;
  }
  if (typeof value.maxConcurrentMaps === "number") {
    output.maxConcurrentMaps = value.maxConcurrentMaps;
  }
  return output;
}

function copyOptionalNumberFields<TKey extends readonly (keyof SourceContextPackRequestOptions)[]>(
  value: Record<string, unknown>,
  fields: TKey,
) {
  const output: Partial<SourceContextPackRequestOptions> = {};
  for (const field of fields) {
    const numericValue = value[field];
    if (typeof numericValue === "number") {
      output[field] = numericValue as never;
    }
  }
  return output;
}

function isOptionalFiniteNumber(value: unknown) {
  return value === undefined || (typeof value === "number" && Number.isFinite(value));
}

function isSourceContextPackLoadDepth(value: unknown): value is SourceContextPackLoadDepth {
  return value === "meta" || value === "outline" || value === "chunks" || value === "full";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
