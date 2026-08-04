export interface TextChunk {
  ord: number;
  text: string;
  tokenCount: number;
  hash: string;
  contentKind: TextBlockContentKind;
}

export type TextBlockContentKind =
  | "body"
  | "heading"
  | "code"
  | "table"
  | "figure_caption"
  | "table_caption"
  | "reference";

export interface TextBlock {
  text: string;
  contentKind?: TextBlockContentKind;
}

export interface ParagraphChunkOptions {
  softTargetTokens?: number;
  hardMaxTokens?: number;
  oversizedOverlapTokens?: number;
  ordOffset?: number;
}

const whitespacePattern = /\s+/g;
const tokenPattern = /\p{Script=Han}|[\p{L}\p{N}_]+|[^\s]/gu;
const searchableTokenPattern = /[\p{L}\p{N}_]+/gu;
const defaultParagraphSoftTargetTokens = 300;
const defaultParagraphHardMaxTokens = 420;
const defaultOversizedParagraphOverlapTokens = 48;

export function normalizeText(input: string) {
  return input
    .normalize("NFKC")
    .replace(/\u00a0/g, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function normalizeSourceUrl(input: string) {
  try {
    const url = new URL(input);
    url.hash = "";
    url.protocol = url.protocol.toLowerCase();
    url.hostname = url.hostname.toLowerCase();
    return url.toString();
  } catch {
    return input.trim();
  }
}

export function expandChineseBigrams(input: string) {
  return normalizeText(input).replace(/\p{Script=Han}+/gu, (segment) => {
    const chars = Array.from(segment);
    if (chars.length < 2) return segment;
    const bigrams: string[] = [];
    for (let index = 0; index < chars.length - 1; index += 1) {
      const current = chars[index];
      const next = chars[index + 1];
      if (current !== undefined && next !== undefined) bigrams.push(`${current}${next}`);
    }
    return `${segment} ${bigrams.join(" ")}`;
  });
}

export function buildFtsQuery(input: string, maxTerms = 16) {
  const expanded = expandChineseBigrams(input).toLowerCase();
  const terms = Array.from(new Set(expanded.match(searchableTokenPattern) ?? []))
    .filter((term) => term.length > 0)
    .slice(0, maxTerms);
  if (terms.length === 0) return "";
  return terms.map((term) => `"${term.replace(/"/g, '""')}"`).join(" OR ");
}

export function hashText(input: string) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${input.length.toString(36)}-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function excerpt(input: string, maxLength = 220) {
  const compact = normalizeText(input).replace(whitespacePattern, " ");
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
}

export function chunkText(
  input: string,
  targetTokens = 900,
  overlapTokens = 120,
  ordOffset = 0,
): TextChunk[] {
  const normalized = normalizeText(input);
  const tokens = normalized.match(tokenPattern) ?? [];
  if (tokens.length === 0) return [];
  if (tokens.length <= targetTokens) {
    return [
      {
        ord: ordOffset,
        text: joinTokens(tokens),
        tokenCount: tokens.length,
        hash: hashText(normalized),
        contentKind: "body",
      },
    ];
  }

  const chunks: TextChunk[] = [];
  const step = Math.max(1, targetTokens - overlapTokens);
  for (let start = 0; start < tokens.length; start += step) {
    const slice = tokens.slice(start, Math.min(tokens.length, start + targetTokens));
    if (slice.length === 0) break;
    const text = joinTokens(slice);
    chunks.push({
      ord: ordOffset + chunks.length,
      text,
      tokenCount: slice.length,
      hash: hashText(text),
      contentKind: "body",
    });
    if (start + targetTokens >= tokens.length) break;
  }
  return chunks;
}

/**
 * Builds retrieval chunks from natural text blocks. Whole blocks never overlap; only a single
 * block that exceeds the hard E5 budget is split with a small sentence-aware overlap.
 */
export function chunkTextByParagraphs(
  blocks: readonly TextBlock[],
  options: ParagraphChunkOptions = {},
): TextChunk[] {
  const softTargetTokens = positiveInteger(
    options.softTargetTokens,
    defaultParagraphSoftTargetTokens,
  );
  const hardMaxTokens = Math.max(
    softTargetTokens,
    positiveInteger(options.hardMaxTokens, defaultParagraphHardMaxTokens),
  );
  const oversizedOverlapTokens = Math.min(
    Math.max(
      0,
      Math.floor(options.oversizedOverlapTokens ?? defaultOversizedParagraphOverlapTokens),
    ),
    Math.max(0, hardMaxTokens - 1),
  );
  const ordOffset = Math.max(0, Math.floor(options.ordOffset ?? 0));
  const normalizedBlocks = blocks.flatMap((block): Array<Required<TextBlock>> => {
    const text = normalizeText(block.text);
    if (text.length === 0) return [];
    return [{ text, contentKind: block.contentKind ?? "body" }];
  });

  const chunks: TextChunk[] = [];
  let pending: Array<Required<TextBlock>> = [];
  let pendingTokens = 0;
  let pendingKind: TextBlockContentKind | undefined;

  const append = (text: string, tokenCount: number, contentKind: TextBlockContentKind) => {
    const normalized = normalizeText(text);
    if (normalized.length === 0) return;
    chunks.push({
      ord: ordOffset + chunks.length,
      text: normalized,
      tokenCount,
      hash: hashText(normalized),
      contentKind,
    });
  };
  const flush = () => {
    if (pending.length === 0 || pendingKind === undefined) return;
    const text = pending.map((block) => block.text).join("\n\n");
    append(text, estimateE5Tokens(text), pendingKind);
    pending = [];
    pendingTokens = 0;
    pendingKind = undefined;
  };

  for (const block of normalizedBlocks) {
    const blockTokens = estimateE5Tokens(block.text);
    if (blockTokens > hardMaxTokens) {
      flush();
      for (const split of splitOversizedTextBlock(
        block.text,
        hardMaxTokens,
        oversizedOverlapTokens,
      )) {
        append(split, estimateE5Tokens(split), block.contentKind);
      }
      continue;
    }

    const kindChanged = pendingKind !== undefined && pendingKind !== block.contentKind;
    const reachedSoftTarget = pendingTokens >= softTargetTokens;
    const wouldExceedHardTarget =
      pending.length > 0 &&
      estimateE5Tokens(`${pending.map((item) => item.text).join("\n\n")}\n\n${block.text}`) >
        hardMaxTokens;
    if (kindChanged || reachedSoftTarget || wouldExceedHardTarget) flush();

    pending.push(block);
    pendingKind = block.contentKind;
    pendingTokens = estimateE5Tokens(pending.map((item) => item.text).join("\n\n"));
  }
  flush();
  return chunks;
}

/**
 * Conservative model-independent estimate calibrated for the multilingual E5 tokenizer. The
 * 420-token hard budget intentionally leaves headroom under E5 Base's 512-token model window.
 */
export function estimateE5Tokens(input: string) {
  const normalized = normalizeText(input);
  if (normalized.length === 0) return 0;
  let cjkCount = 0;
  let nonCjkLength = 0;
  for (const char of normalized) {
    if (/\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul}/u.test(char)) {
      cjkCount += 1;
    } else {
      nonCjkLength += char.length;
    }
  }
  return Math.max(1, cjkCount + Math.ceil(nonCjkLength / 4));
}

function splitOversizedTextBlock(text: string, hardMaxTokens: number, overlapTokens: number) {
  const sentences = sentenceSegments(text);
  if (sentences.length <= 1) {
    return splitTextByEstimatedTokens(text, hardMaxTokens, overlapTokens);
  }

  const chunks: string[] = [];
  let current: string[] = [];
  const flush = () => {
    const value = normalizeText(current.join(" "));
    if (value.length > 0) chunks.push(value);
    current = [];
  };
  for (const sentence of sentences) {
    if (estimateE5Tokens(sentence) > hardMaxTokens) {
      flush();
      chunks.push(...splitTextByEstimatedTokens(sentence, hardMaxTokens, overlapTokens));
      continue;
    }
    const candidate = normalizeText([...current, sentence].join(" "));
    if (current.length > 0 && estimateE5Tokens(candidate) > hardMaxTokens) flush();
    current.push(sentence);
  }
  flush();
  if (overlapTokens <= 0 || chunks.length <= 1) return chunks;
  return chunks.map((chunk, index) => {
    if (index === 0) return chunk;
    const previous = chunks[index - 1] ?? "";
    const availableOverlapTokens = Math.max(0, hardMaxTokens - estimateE5Tokens(chunk));
    const overlap = estimatedTokenSuffix(previous, Math.min(overlapTokens, availableOverlapTokens));
    return normalizeText(`${overlap} ${chunk}`);
  });
}

function sentenceSegments(input: string) {
  const normalized = normalizeText(input).replace(/\n+/g, " ");
  return (
    normalized.match(
      /[^.!?\u3002\uff01\uff1f]+[.!?\u3002\uff01\uff1f]+(?:["'\u201d\u2019)\]]+)?|[^.!?\u3002\uff01\uff1f]+$/gu,
    ) ?? []
  )
    .map((sentence) => normalizeText(sentence))
    .filter((sentence) => sentence.length > 0);
}

function splitTextByEstimatedTokens(text: string, hardMaxTokens: number, overlapTokens: number) {
  const normalized = normalizeText(text);
  const chunks: string[] = [];
  let start = 0;
  while (start < normalized.length) {
    let end = largestEstimatedTokenEnd(normalized, start, hardMaxTokens);
    if (end < normalized.length) end = previousTextBoundary(normalized, start, end);
    if (end <= start) end = Math.min(normalized.length, start + 1);
    const chunk = normalizeText(normalized.slice(start, end));
    if (chunk.length > 0) chunks.push(chunk);
    if (end >= normalized.length) break;
    const overlapStart = estimatedTokenSuffixStart(normalized, start, end, overlapTokens);
    start = overlapStart > start && overlapStart < end ? overlapStart : end;
  }
  return chunks;
}

function estimatedTokenSuffix(input: string, budget: number) {
  if (budget <= 0) return "";
  const start = estimatedTokenSuffixStart(input, 0, input.length, budget);
  return normalizeText(input.slice(start));
}

function estimatedTokenSuffixStart(input: string, minimum: number, end: number, budget: number) {
  if (budget <= 0) return end;
  let low = minimum;
  let high = end;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (estimateE5Tokens(input.slice(middle, end)) <= budget) high = middle;
    else low = middle + 1;
  }
  return nextTextBoundary(input, low, end);
}

function largestEstimatedTokenEnd(input: string, start: number, budget: number) {
  let low = start + 1;
  let high = input.length;
  let best = start;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (estimateE5Tokens(input.slice(start, middle)) <= budget) {
      best = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return best;
}

function previousTextBoundary(input: string, minimum: number, position: number) {
  let cursor = position;
  while (
    cursor > minimum &&
    !/[\s,.;:!?\u3001\u3002\uff0c\uff1b\uff1a\uff01\uff1f]/u.test(input[cursor - 1] ?? "")
  ) {
    cursor -= 1;
  }
  return cursor > minimum ? cursor : position;
}

function nextTextBoundary(input: string, position: number, maximum: number) {
  let cursor = position;
  while (cursor < maximum && !/\s/u.test(input[cursor] ?? "")) cursor += 1;
  while (cursor < maximum && /\s/u.test(input[cursor] ?? "")) cursor += 1;
  return cursor;
}

function positiveInteger(value: number | undefined, fallback: number) {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return fallback;
  return Math.max(1, Math.floor(value));
}

function joinTokens(tokens: string[]) {
  return tokens
    .join(" ")
    .replace(/\s+([,.;:!?%)\]}])/g, "$1")
    .replace(/([([{])\s+/g, "$1")
    .replace(/\s+([\u3001\u3002\uff0c\uff1b\uff1a\uff01\uff1f])/g, "$1")
    .replace(/([\p{Script=Han}])\s+(?=[\p{Script=Han}])/gu, "$1")
    .trim();
}
