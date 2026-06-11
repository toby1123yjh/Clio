import type { SourceKind } from "./rpc";
import { normalizeSourceUrl, normalizeText } from "./text";

export interface AnchorContext {
  before: string;
  after: string;
}

export function buildMemoryVersionGroupKey(
  kind: SourceKind,
  normalizedSourceUrl: string,
  textHash: string,
) {
  if (kind === "page") return `page:${normalizedSourceUrl}`;
  return `selection:${normalizedSourceUrl}:${textHash}`;
}

export function sourceUrlsMatch(left: string, right: string) {
  return normalizeSourceUrl(left) === normalizeSourceUrl(right);
}

export function buildTextFragmentUrl(sourceUrl: string, selectedText: string) {
  const baseUrl = sourceUrl.split("#")[0] ?? sourceUrl;
  const target = normalizeText(selectedText).replace(/\s+/g, " ").slice(0, 240);
  if (target.length === 0) return undefined;
  return `${baseUrl}#:~:text=${encodeURIComponent(target)}`;
}

export function selectAnchorContext(
  pageText: string,
  selectedText: string,
  radius = 240,
): AnchorContext {
  const normalizedPageText = normalizeText(pageText);
  const normalizedSelection = normalizeText(selectedText);
  const index = normalizedPageText.indexOf(normalizedSelection);
  if (index < 0) return { before: "", after: "" };
  return {
    before: normalizedPageText.slice(Math.max(0, index - radius), index),
    after: normalizedPageText.slice(
      index + normalizedSelection.length,
      index + normalizedSelection.length + radius,
    ),
  };
}
