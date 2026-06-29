import { excerpt, normalizeText } from "../shared/text";
import type { EvidenceAnchor, EvidenceItem } from "./types";

export interface LocalRagMemory {
  id: string;
  sourceUrl: string;
  sourceTitle: string;
  normalizedText: string;
  excerpt: string;
  anchor?: {
    selectedText: string;
    contextBefore: string;
    contextAfter: string;
    xpath?: string;
    textFragment?: string;
  };
  chunks: Array<{
    id: string;
    ord: number;
    text: string;
    tokenCount: number;
  }>;
}

export interface LocalRagEvidencePackInput {
  query: string;
  memories: LocalRagMemory[];
  maxItems?: number;
  maxCharsPerItem?: number;
  maxTotalChars?: number;
  contextChunksBefore?: number;
  contextChunksAfter?: number;
}

export type LocalRagRetrievalSkipReason = "empty" | "too_short" | "smalltalk" | "creative";

export type LocalRagRetrievalReason = "local_intent" | "question";

export type LocalRagRetrievalPlan =
  | { shouldRetrieve: true; reason: LocalRagRetrievalReason }
  | { shouldRetrieve: false; reason: LocalRagRetrievalSkipReason };

interface Candidate {
  evidenceId: string;
  memory: LocalRagMemory;
  chunkId?: string;
  text: string;
  rank: CandidateRank;
}

interface CandidateRank {
  kind: "chunk" | "fallback";
  coverage: number;
  exactMatches: number;
  substringMatches: number;
  memoryIndex: number;
  chunkOrd: number;
}

const defaultMaxItems = 6;
const defaultMaxCharsPerItem = 1_200;
const defaultMaxTotalChars = 4_800;
const defaultContextChunksBefore = 1;
const defaultContextChunksAfter = 1;
const maxQueryTerms = 16;
const minQuestionLength = 8;
const minEvidenceTextLength = 8;
const queryTokenPattern = /\p{Script=Han}|[\p{L}\p{N}_]+/gu;
const smalltalkWords = new Set([
  "hi",
  "hello",
  "hey",
  "yo",
  "ok",
  "okay",
  "thanks",
  "thank you",
  "thx",
  "\u4f60\u597d",
  "\u60a8\u597d",
  "\u55e8",
  "\u54c8\u55bd",
  "\u8c22\u8c22",
  "\u611f\u8c22",
  "\u597d\u7684",
  "\u597d",
  "\u55ef",
  "\u662f\u7684",
  "\u5bf9",
  "\u53ef\u4ee5",
  "\u7ee7\u7eed",
  "\u884c",
  "\u6536\u5230",
]);
const localIntentNeedles = [
  "memory",
  "memories",
  "knowledge base",
  "save",
  "saved",
  "previous",
  "earlier",
  "note",
  "notes",
  "doc",
  "docs",
  "document",
  "project",
  "commit",
  "wiki",
  "remember",
  "record",
  "archive",
  "\u8bb0\u5fc6",
  "\u77e5\u8bc6\u5e93",
  "\u4fdd\u5b58",
  "\u4e4b\u524d",
  "\u524d\u9762",
  "\u7b14\u8bb0",
  "\u6587\u6863",
  "\u8d44\u6599",
  "\u9879\u76ee",
  "\u63d0\u4ea4",
  "\u5f52\u6863",
  "\u8bb0\u5f55",
  "\u65e5\u5fd7",
];
const creativePrefixes = [
  "write",
  "draft",
  "compose",
  "rewrite",
  "polish",
  "translate",
  "summarize",
  "brainstorm",
  "create",
  "generate",
  "\u6da6\u8272",
  "\u6539\u5199",
  "\u7ffb\u8bd1",
  "\u5199",
  "\u521b\u4f5c",
  "\u751f\u6210",
  "\u8d77\u8349",
  "\u5934\u8111\u98ce\u66b4",
  "\u603b\u7ed3",
];

export function planLocalRagRetrieval(query: string): LocalRagRetrievalPlan {
  const normalizedQuery = normalizeText(query);
  if (normalizedQuery.length === 0) return { shouldRetrieve: false, reason: "empty" };
  if (isSmalltalk(normalizedQuery)) return { shouldRetrieve: false, reason: "smalltalk" };

  const hasLocalIntent = includesAny(normalizedQuery, localIntentNeedles);
  if (hasLocalIntent) return { shouldRetrieve: true, reason: "local_intent" };
  if (startsWithAny(normalizedQuery, creativePrefixes)) {
    return { shouldRetrieve: false, reason: "creative" };
  }
  if (normalizedQuery.length < minQuestionLength)
    return { shouldRetrieve: false, reason: "too_short" };
  return { shouldRetrieve: true, reason: "question" };
}

export function assembleLocalRagEvidencePack(input: LocalRagEvidencePackInput): EvidenceItem[] {
  const query = normalizeText(input.query);
  const memories = dedupeMemories(input.memories);
  const maxItems = positiveLimit(input.maxItems, defaultMaxItems);
  const maxCharsPerItem = positiveLimit(input.maxCharsPerItem, defaultMaxCharsPerItem);
  const maxTotalChars = positiveLimit(input.maxTotalChars, defaultMaxTotalChars);
  const contextChunksBefore = contextChunkLimit(
    input.contextChunksBefore,
    defaultContextChunksBefore,
  );
  const contextChunksAfter = contextChunkLimit(input.contextChunksAfter, defaultContextChunksAfter);
  if (
    query.length === 0 ||
    memories.length === 0 ||
    maxItems === 0 ||
    maxCharsPerItem === 0 ||
    maxTotalChars === 0
  ) {
    return [];
  }

  const queryTerms = queryTermSet(query);
  const retrievalPlan = planLocalRagRetrieval(query);
  const allowFallback = retrievalPlan.shouldRetrieve && retrievalPlan.reason === "local_intent";
  const candidates = memories
    .flatMap((memory, memoryIndex) =>
      candidatesForMemory(memory, queryTerms, {
        allowFallback,
        contextChunksBefore,
        contextChunksAfter,
        memoryIndex,
      }),
    )
    .sort(compareCandidates);
  const pack: EvidenceItem[] = [];
  const seenIds = new Set<string>();
  let totalChars = 0;

  for (const candidate of candidates) {
    if (pack.length >= maxItems) break;
    if (seenIds.has(candidate.evidenceId)) continue;

    const remaining = maxTotalChars - totalChars;
    if (remaining <= 0) break;

    const text = truncateEvidenceText(candidate.text, Math.min(maxCharsPerItem, remaining));
    if (text.length < minEvidenceTextLength) continue;

    seenIds.add(candidate.evidenceId);
    totalChars += text.length;
    pack.push({
      id: candidate.evidenceId,
      sourceKind: "memory",
      sourceUrl: candidate.memory.sourceUrl,
      sourceTitle: candidate.memory.sourceTitle,
      text,
      excerpt: excerpt(text, Math.min(260, text.length)),
      ...(candidate.memory.anchor === undefined
        ? {}
        : { anchor: evidenceAnchor(candidate.memory) }),
    });
  }

  return pack;
}

function candidatesForMemory(
  memory: LocalRagMemory,
  queryTerms: Set<string>,
  options: {
    allowFallback: boolean;
    contextChunksBefore: number;
    contextChunksAfter: number;
    memoryIndex: number;
  },
): Candidate[] {
  const chunks = dedupeChunks(memory.chunks).sort(compareChunks);
  const scoredChunks = chunks
    .map((chunk, index) => ({
      chunk,
      index,
      match: matchDetails(chunk.text, queryTerms),
    }))
    .filter((item) => item.match.totalMatches > 0)
    .sort(
      (left, right) =>
        compareMatchDetails(right.match, left.match) ||
        left.chunk.ord - right.chunk.ord ||
        left.index - right.index,
    );

  if (scoredChunks.length > 0) {
    const acceptedWindows: Array<{ startIndex: number; endIndex: number }> = [];
    return scoredChunks.flatMap(({ chunk, index, match }) => {
      const startIndex = Math.max(0, index - options.contextChunksBefore);
      const endIndex = Math.min(chunks.length - 1, index + options.contextChunksAfter);
      if (acceptedWindows.some((window) => windowsOverlap(window, { startIndex, endIndex }))) {
        return [];
      }
      acceptedWindows.push({ startIndex, endIndex });
      return [
        {
          evidenceId: `memory:${memory.id}:chunk:${chunk.id}`,
          memory,
          chunkId: chunk.id,
          text: chunks
            .slice(startIndex, endIndex + 1)
            .map((windowChunk) => windowChunk.text)
            .join("\n\n"),
          rank: {
            kind: "chunk",
            coverage: match.coverage,
            exactMatches: match.exactMatches,
            substringMatches: match.substringMatches,
            memoryIndex: options.memoryIndex,
            chunkOrd: chunk.ord,
          },
        },
      ];
    });
  }

  if (!options.allowFallback) return [];
  const fallbackText = normalizeText(memory.excerpt) || normalizeText(memory.normalizedText);
  if (fallbackText.length === 0) return [];
  return [
    {
      evidenceId: `memory:${memory.id}`,
      memory,
      text: fallbackText,
      rank: {
        kind: "fallback",
        coverage: 0,
        exactMatches: 0,
        substringMatches: 0,
        memoryIndex: options.memoryIndex,
        chunkOrd: Number.MAX_SAFE_INTEGER,
      },
    },
  ];
}

function dedupeMemories(memories: LocalRagMemory[]) {
  const seen = new Set<string>();
  return memories.flatMap((memory) => {
    const id = normalizeText(memory.id);
    if (id.length === 0 || seen.has(id)) return [];
    seen.add(id);
    return [memory];
  });
}

function dedupeChunks(chunks: LocalRagMemory["chunks"]) {
  const seen = new Set<string>();
  return chunks.flatMap((chunk) => {
    const text = normalizeText(chunk.text);
    if (text.length === 0) return [];
    const key = normalizeText(chunk.id) || `ord:${chunk.ord}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ ...chunk, text }];
  });
}

function compareChunks(
  left: LocalRagMemory["chunks"][number],
  right: LocalRagMemory["chunks"][number],
) {
  return left.ord - right.ord || left.id.localeCompare(right.id);
}

function compareCandidates(left: Candidate, right: Candidate) {
  return (
    candidateKindRank(left.rank.kind) - candidateKindRank(right.rank.kind) ||
    right.rank.coverage - left.rank.coverage ||
    right.rank.exactMatches - left.rank.exactMatches ||
    right.rank.substringMatches - left.rank.substringMatches ||
    left.rank.memoryIndex - right.rank.memoryIndex ||
    left.rank.chunkOrd - right.rank.chunkOrd ||
    left.evidenceId.localeCompare(right.evidenceId)
  );
}

function candidateKindRank(kind: CandidateRank["kind"]) {
  return kind === "chunk" ? 0 : 1;
}

function queryTermSet(query: string) {
  return new Set(
    Array.from(query.toLowerCase().match(queryTokenPattern) ?? [])
      .map((term) => term.trim())
      .filter((term) => term.length > 0)
      .slice(0, maxQueryTerms),
  );
}

function isSmalltalk(query: string) {
  const compact = query
    .toLowerCase()
    .replace(/[.!?\s\u3002\uff01\uff1f]+/gu, " ")
    .trim();
  return smalltalkWords.has(compact);
}

function includesAny(query: string, needles: string[]) {
  const lowerQuery = query.toLowerCase();
  return needles.some((needle) => includesNeedle(lowerQuery, needle));
}

function includesNeedle(query: string, needle: string) {
  const lowerNeedle = needle.toLowerCase();
  if (!isAscii(lowerNeedle)) return query.includes(lowerNeedle);
  let startIndex = query.indexOf(lowerNeedle);
  while (startIndex >= 0) {
    const before = startIndex === 0 ? undefined : query.at(startIndex - 1);
    const after = query.at(startIndex + lowerNeedle.length);
    if (!isWordChar(before) && !isWordChar(after)) return true;
    startIndex = query.indexOf(lowerNeedle, startIndex + 1);
  }
  return false;
}

function startsWithAny(query: string, prefixes: string[]) {
  const lowerQuery = query.toLowerCase();
  return prefixes.some((prefix) => {
    if (lowerQuery === prefix) return true;
    if (!lowerQuery.startsWith(prefix)) return false;
    const next = lowerQuery.at(prefix.length);
    return next === undefined || /\s/u.test(next) || !isAscii(prefix);
  });
}

function isAscii(value: string) {
  return Array.from(value).every((char) => {
    const codePoint = char.codePointAt(0);
    return codePoint !== undefined && codePoint <= 127;
  });
}

function isWordChar(value: string | undefined) {
  return value !== undefined && /[\p{L}\p{N}_]/u.test(value);
}

function matchDetails(text: string, queryTerms: Set<string>) {
  if (queryTerms.size === 0) {
    return { coverage: 0, exactMatches: 0, substringMatches: 0, totalMatches: 0 };
  }
  const lowerText = text.toLowerCase();
  const textTerms = new Set(Array.from(text.toLowerCase().match(queryTokenPattern) ?? []));
  let exactMatches = 0;
  let substringMatches = 0;
  for (const term of queryTerms) {
    if (textTerms.has(term)) {
      exactMatches += 1;
    } else if (lowerText.includes(term)) {
      substringMatches += 1;
    }
  }
  const totalMatches = exactMatches + substringMatches;
  return {
    coverage: totalMatches / queryTerms.size,
    exactMatches,
    substringMatches,
    totalMatches,
  };
}

function compareMatchDetails(
  left: ReturnType<typeof matchDetails>,
  right: ReturnType<typeof matchDetails>,
) {
  return (
    left.coverage - right.coverage ||
    left.exactMatches - right.exactMatches ||
    left.substringMatches - right.substringMatches
  );
}

function positiveLimit(value: number | undefined, fallback: number) {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.floor(value));
}

function contextChunkLimit(value: number | undefined, fallback: number) {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function windowsOverlap(
  left: { startIndex: number; endIndex: number },
  right: { startIndex: number; endIndex: number },
) {
  return left.startIndex <= right.endIndex && right.startIndex <= left.endIndex;
}

function evidenceAnchor(memory: LocalRagMemory): EvidenceAnchor | undefined {
  const anchor = memory.anchor;
  if (anchor === undefined) return undefined;
  return {
    selectedText: anchor.selectedText,
    contextBefore: anchor.contextBefore,
    contextAfter: anchor.contextAfter,
    ...(anchor.xpath === undefined ? {} : { xpath: anchor.xpath }),
    ...(anchor.textFragment === undefined ? {} : { textFragment: anchor.textFragment }),
  };
}

function truncateEvidenceText(input: string, maxChars: number) {
  const text = normalizeText(input).replace(/\s+/g, " ");
  if (text.length <= maxChars) return text;
  if (maxChars <= 3) return text.slice(0, maxChars);
  return `${text.slice(0, maxChars - 3).trimEnd()}...`;
}
