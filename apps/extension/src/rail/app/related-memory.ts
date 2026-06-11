import { isSensitiveUrlForRelatedCards } from "../../shared/privacy";
import { sourceUrlsMatch } from "../../shared/reliability";
import type { SearchMemoryItem } from "../../shared/rpc";
import { normalizeText } from "../../shared/text";
import type { PageContext, SelectionSnapshot } from "./rail-state";

const maxRelatedQueryLength = 1200;
const maxReadablePrefixLength = 700;
const maxUrlTokens = 16;

export interface RelatedMemoryQueryInput {
  activePageContext: PageContext;
  liveSelectionText?: string;
  selectionSnapshot?: SelectionSnapshot;
  readableText?: string;
}

export function buildRelatedMemoryQuery(input: RelatedMemoryQueryInput) {
  const snapshot = matchingSelectionSnapshot(input.selectionSnapshot, input.activePageContext.url);
  const selectionText = normalizeText(input.liveSelectionText ?? snapshot?.text ?? "");
  const title = normalizeText(input.activePageContext.title);
  const urlTokens = extractUrlTokens(input.activePageContext.url).join(" ");

  if (selectionText.length > 0) {
    return compactQuery([selectionText, title, urlTokens]);
  }

  const readablePrefix = normalizeText(input.readableText ?? "").slice(0, maxReadablePrefixLength);
  return compactQuery([title, urlTokens, readablePrefix]);
}

export function filterRelatedMemoryItems(
  items: SearchMemoryItem[],
  activePageUrl: string,
  maxItems = 3,
) {
  const seen = new Set<string>();
  const filtered: SearchMemoryItem[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    if (sourceUrlsMatch(item.sourceUrl, activePageUrl)) continue;
    if (isSensitiveUrlForRelatedCards(item.sourceUrl)) continue;
    filtered.push(item);
    if (filtered.length >= maxItems) break;
  }
  return filtered;
}

export function shouldLoadRelatedCards(activePageUrl: string) {
  return !isSensitiveUrlForRelatedCards(activePageUrl);
}

function matchingSelectionSnapshot(snapshot: SelectionSnapshot | undefined, activePageUrl: string) {
  if (snapshot === undefined) return undefined;
  if (!sourceUrlsMatch(snapshot.sourceUrl, activePageUrl)) return undefined;
  return snapshot;
}

function compactQuery(parts: string[]) {
  return normalizeText(parts.filter((part) => part.trim().length > 0).join("\n")).slice(
    0,
    maxRelatedQueryLength,
  );
}

function extractUrlTokens(input: string) {
  try {
    const url = new URL(input);
    return Array.from(
      new Set(
        `${url.hostname.replace(/^www\./, "")} ${url.pathname}`
          .toLowerCase()
          .split(/[^a-z0-9]+/g)
          .filter((token) => token.length >= 2),
      ),
    ).slice(0, maxUrlTokens);
  } catch {
    return [];
  }
}
