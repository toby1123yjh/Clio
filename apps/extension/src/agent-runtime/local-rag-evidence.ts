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
}

interface Candidate {
  evidenceId: string;
  memory: LocalRagMemory;
  chunkId?: string;
  text: string;
  score: number;
}

const defaultMaxItems = 6;
const defaultMaxCharsPerItem = 1_200;
const defaultMaxTotalChars = 4_800;
const maxQueryTerms = 16;
const queryTokenPattern = /\p{Script=Han}|[\p{L}\p{N}_]+/gu;

export function assembleLocalRagEvidencePack(input: LocalRagEvidencePackInput): EvidenceItem[] {
  const query = normalizeText(input.query);
  const memories = dedupeMemories(input.memories);
  const maxItems = positiveLimit(input.maxItems, defaultMaxItems);
  const maxCharsPerItem = positiveLimit(input.maxCharsPerItem, defaultMaxCharsPerItem);
  const maxTotalChars = positiveLimit(input.maxTotalChars, defaultMaxTotalChars);
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
  const candidates = memories.flatMap((memory) => candidatesForMemory(memory, queryTerms));
  const pack: EvidenceItem[] = [];
  const seenIds = new Set<string>();
  let totalChars = 0;

  for (const candidate of candidates) {
    if (pack.length >= maxItems) break;
    if (seenIds.has(candidate.evidenceId)) continue;

    const remaining = maxTotalChars - totalChars;
    if (remaining <= 0) break;

    const text = truncateEvidenceText(candidate.text, Math.min(maxCharsPerItem, remaining));
    if (text.length === 0) continue;

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

function candidatesForMemory(memory: LocalRagMemory, queryTerms: Set<string>): Candidate[] {
  const chunks = dedupeChunks(memory.chunks);
  const scoredChunks = chunks
    .map((chunk) => ({
      chunk,
      score: overlapScore(chunk.text, queryTerms),
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.chunk.ord - right.chunk.ord);

  if (scoredChunks.length > 0) {
    return scoredChunks.map(({ chunk, score }) => ({
      evidenceId: `memory:${memory.id}:chunk:${chunk.id}`,
      memory,
      chunkId: chunk.id,
      text: chunk.text,
      score,
    }));
  }

  const fallbackText = normalizeText(memory.excerpt) || normalizeText(memory.normalizedText);
  if (fallbackText.length === 0) return [];
  return [
    {
      evidenceId: `memory:${memory.id}`,
      memory,
      text: fallbackText,
      score: 0,
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

function queryTermSet(query: string) {
  return new Set(
    Array.from(query.toLowerCase().match(queryTokenPattern) ?? [])
      .map((term) => term.trim())
      .filter((term) => term.length > 0)
      .slice(0, maxQueryTerms),
  );
}

function overlapScore(text: string, queryTerms: Set<string>) {
  if (queryTerms.size === 0) return 0;
  const textTerms = new Set(Array.from(text.toLowerCase().match(queryTokenPattern) ?? []));
  let score = 0;
  for (const term of queryTerms) {
    if (textTerms.has(term) || text.toLowerCase().includes(term)) score += 1;
  }
  return score;
}

function positiveLimit(value: number | undefined, fallback: number) {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.floor(value));
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
