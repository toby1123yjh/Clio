import { hashText } from "@/src/shared/text";
import {
  WIKI_COMPILER_VERSION,
  WIKI_INPUT_MANIFEST_VERSION,
  WIKI_PROMPT_VERSION,
  type WikiCompileBudget,
  type WikiCompileInputManifest,
  type WikiCompileManifestChunk,
  type WikiCompileStepPlan,
} from "@/src/shared/wiki-compile";

const unknownModelContextTokens = 8_192;
const hardContextTokenLimit = 65_536;
const minimumStepTokens = 1_024;
const fixedInputReserveTokens = 1_200;

export interface WikiCompilePlanSource {
  id: string;
  contentHash: string;
  title: string;
  sourceType?: string;
  parserVersion?: string;
}

export interface WikiCompilePlanInput {
  source: WikiCompilePlanSource;
  chunks: WikiCompileManifestChunk[];
  provider: string;
  modelId: string;
  budget: WikiCompileBudget;
  chunkStrategyVersion: string;
  compilerVersion?: string;
  promptVersion?: string;
}

export interface WikiCompilePlan {
  manifest: WikiCompileInputManifest;
  inputSignature: string;
  steps: WikiCompileStepPlan[];
}

export function resolveWikiCompileBudget(modelId: string): WikiCompileBudget {
  const contextTokens = Math.min(resolveKnownContextTokens(modelId), hardContextTokenLimit);
  const maxOutputTokens = contextTokens >= 32_000 ? 4_096 : 1_536;
  const maxDigestTokens = contextTokens >= 32_000 ? 2_048 : 768;
  const maxOverlapTokens = contextTokens >= 32_000 ? 768 : 256;
  const maxInputTokens = Math.max(
    minimumStepTokens,
    contextTokens - maxOutputTokens - fixedInputReserveTokens,
  );
  return {
    contextTokens,
    maxInputTokens,
    maxOutputTokens,
    maxStepTokens: Math.max(minimumStepTokens, maxInputTokens - maxDigestTokens - maxOverlapTokens),
    maxReduceInputTokens: Math.max(minimumStepTokens, maxInputTokens - maxDigestTokens),
    maxDigestTokens,
    maxOverlapTokens,
  };
}

export function buildWikiCompilePlan(input: WikiCompilePlanInput): WikiCompilePlan {
  const chunks = normalizeManifestChunks(input.chunks);
  if (chunks.length === 0) {
    throw new Error("WIKI_COMPILE_SOURCE_EMPTY: Wiki compilation requires child chunks.");
  }
  if (chunks.some((chunk) => chunk.tokenCount > input.budget.maxStepTokens)) {
    throw new Error("WIKI_COMPILE_CHUNK_OVER_BUDGET: A child chunk exceeds the Wiki step budget.");
  }

  const manifest: WikiCompileInputManifest = {
    version: WIKI_INPUT_MANIFEST_VERSION,
    scope: { kind: "source", id: input.source.id },
    source: {
      id: input.source.id,
      contentHash: input.source.contentHash,
      title: input.source.title,
      ...(input.source.sourceType === undefined ? {} : { sourceType: input.source.sourceType }),
    },
    chunks,
    ...(input.source.parserVersion === undefined
      ? {}
      : { parserVersion: input.source.parserVersion }),
    chunkStrategyVersion: input.chunkStrategyVersion,
    compilerVersion: input.compilerVersion ?? WIKI_COMPILER_VERSION,
    promptVersion: input.promptVersion ?? WIKI_PROMPT_VERSION,
    provider: input.provider,
    modelId: input.modelId,
    budget: { ...input.budget },
    modalityScope: "text",
  };
  const inputSignature = buildWikiCompileInputSignature(manifest);
  const steps = planWikiCompileSteps(inputSignature, chunks, input.budget);
  assertWikiCompileCoverage(chunks, steps);
  return { manifest, inputSignature, steps };
}

export function buildWikiCompileInputSignature(manifest: WikiCompileInputManifest) {
  const canonical = {
    ...manifest,
    chunks: [...manifest.chunks].sort(compareManifestChunks).map((chunk) => ({ ...chunk })),
  };
  return `wiki-input-v1:${hashText(JSON.stringify(canonical))}`;
}

export function planWikiCompileSteps(
  inputSignature: string,
  chunks: WikiCompileManifestChunk[],
  budget: WikiCompileBudget,
): WikiCompileStepPlan[] {
  const ordered = normalizeManifestChunks(chunks);
  const groups: WikiCompileManifestChunk[][] = [];
  let current: WikiCompileManifestChunk[] = [];
  let currentTokens = 0;

  const flush = () => {
    if (current.length === 0) return;
    groups.push(current);
    current = [];
    currentTokens = 0;
  };

  for (const chunk of ordered) {
    if (chunk.tokenCount > budget.maxStepTokens) {
      throw new Error(
        "WIKI_COMPILE_CHUNK_OVER_BUDGET: A child chunk exceeds the Wiki step budget.",
      );
    }
    const sectionChanged =
      current.length > 0 &&
      normalizedSection(current[current.length - 1]?.sectionPath) !==
        normalizedSection(chunk.sectionPath);
    const nearUsefulBoundary = currentTokens >= Math.floor(budget.maxStepTokens * 0.6);
    if (
      current.length > 0 &&
      (currentTokens + chunk.tokenCount > budget.maxStepTokens ||
        (sectionChanged && nearUsefulBoundary))
    ) {
      flush();
    }
    current.push(chunk);
    currentTokens += chunk.tokenCount;
  }
  flush();

  return groups.map((mainChunks, index) => {
    const overlapChunks = selectOverlapChunks(groups[index - 1] ?? [], budget.maxOverlapTokens);
    const mainChunkIds = mainChunks.map((chunk) => chunk.id);
    const overlapChunkIds = overlapChunks.map((chunk) => chunk.id);
    const tokenEstimate = [...mainChunks, ...overlapChunks].reduce(
      (total, chunk) => total + chunk.tokenCount,
      0,
    );
    const signature = `wiki-step-v1:${hashText(
      JSON.stringify({
        inputSignature,
        index,
        mainChunkIds,
        overlapChunkIds,
        tokenEstimate,
        maxStepTokens: budget.maxStepTokens,
      }),
    )}`;
    return { index, signature, mainChunkIds, overlapChunkIds, tokenEstimate };
  });
}

export function assertWikiCompileCoverage(
  chunks: WikiCompileManifestChunk[],
  steps: WikiCompileStepPlan[],
) {
  const expected = normalizeManifestChunks(chunks).map((chunk) => chunk.id);
  const actual = steps.flatMap((step) => step.mainChunkIds);
  if (new Set(actual).size !== actual.length) {
    throw new Error("WIKI_COMPILE_COVERAGE_DUPLICATE: Main chunk coverage contains duplicates.");
  }
  if (expected.length !== actual.length || expected.some((id, index) => actual[index] !== id)) {
    throw new Error(
      "WIKI_COMPILE_COVERAGE_MISMATCH: Main chunk coverage is incomplete or reordered.",
    );
  }
  const prior = new Set<string>();
  for (const step of steps) {
    if (step.overlapChunkIds.some((id) => !prior.has(id))) {
      throw new Error(
        "WIKI_COMPILE_OVERLAP_INVALID: Overlap must reference an earlier main chunk.",
      );
    }
    for (const id of step.mainChunkIds) prior.add(id);
  }
}

function resolveKnownContextTokens(modelId: string) {
  const model = modelId.trim().toLowerCase();
  if (
    model.includes("gemini-2.5") ||
    model.includes("gemini-3") ||
    model.includes("gpt-5") ||
    model.includes("gpt-4.1") ||
    model.includes("claude-3.5") ||
    model.includes("claude-3.7") ||
    model.includes("claude-4")
  ) {
    return 128_000;
  }
  if (model.includes("gpt-4o") || model.includes("qwen") || model.includes("deepseek")) {
    return 32_768;
  }
  return unknownModelContextTokens;
}

function normalizeManifestChunks(chunks: WikiCompileManifestChunk[]) {
  const ordered = chunks.map((chunk) => ({ ...chunk })).sort(compareManifestChunks);
  const ids = new Set<string>();
  for (const chunk of ordered) {
    if (chunk.id.trim().length === 0 || ids.has(chunk.id)) {
      throw new Error("WIKI_COMPILE_CHUNK_ID_INVALID: Child chunk ids must be unique.");
    }
    if (
      !Number.isInteger(chunk.ord) ||
      chunk.ord < 0 ||
      !Number.isInteger(chunk.tokenCount) ||
      chunk.tokenCount <= 0
    ) {
      throw new Error(
        "WIKI_COMPILE_CHUNK_INVALID: Child chunk order and token count must be positive integers.",
      );
    }
    ids.add(chunk.id);
  }
  return ordered;
}

function compareManifestChunks(left: WikiCompileManifestChunk, right: WikiCompileManifestChunk) {
  return left.ord - right.ord || left.id.localeCompare(right.id);
}

function selectOverlapChunks(chunks: WikiCompileManifestChunk[], maxTokens: number) {
  const selected: WikiCompileManifestChunk[] = [];
  let tokens = 0;
  for (let index = chunks.length - 1; index >= 0; index -= 1) {
    const chunk = chunks[index];
    if (chunk === undefined || tokens + chunk.tokenCount > maxTokens) break;
    selected.unshift(chunk);
    tokens += chunk.tokenCount;
  }
  return selected;
}

function normalizedSection(value: string | undefined) {
  return value?.trim() ?? "";
}
