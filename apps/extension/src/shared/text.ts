export interface TextChunk {
  ord: number;
  text: string;
  tokenCount: number;
  hash: string;
}

const whitespacePattern = /\s+/g;
const tokenPattern = /\p{Script=Han}|[\p{L}\p{N}_]+|[^\s]/gu;
const searchableTokenPattern = /[\p{L}\p{N}_]+/gu;

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

export function chunkText(input: string, targetTokens = 900, overlapTokens = 120): TextChunk[] {
  const normalized = normalizeText(input);
  const tokens = normalized.match(tokenPattern) ?? [];
  if (tokens.length === 0) return [];
  if (tokens.length <= targetTokens) {
    return [
      {
        ord: 0,
        text: joinTokens(tokens),
        tokenCount: tokens.length,
        hash: hashText(normalized),
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
      ord: chunks.length,
      text,
      tokenCount: slice.length,
      hash: hashText(text),
    });
    if (start + targetTokens >= tokens.length) break;
  }
  return chunks;
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
