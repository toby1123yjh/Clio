import type { EvidenceAnchor, EvidenceSourceKind, LocalCitation } from "../../agent-runtime/types";
import { excerpt, normalizeText } from "../../shared/text";
import type { PageContext, RailDialogueMessage } from "./rail-state";

export type MarkdownSourceKind = "page" | "selection" | "memory" | "chat" | "unknown";

export interface MarkdownSource {
  id: string;
  kind: MarkdownSourceKind;
  label: string;
  title?: string;
  url?: string;
  excerpt?: string;
  anchor?: EvidenceAnchor;
  citation?: LocalCitation;
}

export const markdownSourceHref = "clio-source:all";

const sourcePlaceholderPattern = /\[source\](?!\()/gi;
const legacyCitationMarkerPattern = /\s*\[\[cite:[^\]]+\]\]/g;

export function buildMarkdownSources(
  message: RailDialogueMessage,
  activePageContext?: PageContext,
): MarkdownSource[] {
  if (message.role !== "assistant") return [];
  if (message.citations.length > 0) {
    return message.citations.map(citationToSource);
  }
  const pageUrl = message.pageUrl ?? activePageContext?.url;
  if (message.scope === "selection" && normalizeText(message.selectionText ?? "").length > 0) {
    const text = normalizeText(message.selectionText ?? "");
    return [
      {
        id: `${message.id}:selection-source`,
        kind: "selection",
        label: sourceLabel("selection", message.pageTitle ?? activePageContext?.title, text),
        title: message.pageTitle ?? activePageContext?.title,
        ...(pageUrl === undefined ? {} : { url: pageUrl }),
        excerpt: excerpt(text, 120),
      },
    ];
  }
  if (message.scope === "current-page" && pageUrl !== undefined) {
    return [
      {
        id: `${message.id}:page-source`,
        kind: "page",
        label: sourceLabel("page", message.pageTitle ?? activePageContext?.title, pageUrl),
        title: message.pageTitle ?? activePageContext?.title,
        url: pageUrl,
      },
    ];
  }
  return [];
}

export function stripLegacyCitationMarkers(markdown: string) {
  return markdown.replace(legacyCitationMarkerPattern, "").replace(/[ \t]+\n/g, "\n");
}

export function hasSourcePlaceholder(markdown: string) {
  sourcePlaceholderPattern.lastIndex = 0;
  return sourcePlaceholderPattern.test(markdown);
}

export function projectMarkdownSources(markdown: string, sources: MarkdownSource[]) {
  const withoutMarkers = stripLegacyCitationMarkers(markdown);
  if (sources.length === 0) {
    return replaceSourcePlaceholders(withoutMarkers, "");
  }
  if (hasSourcePlaceholder(withoutMarkers)) {
    return replaceSourcePlaceholders(withoutMarkers, `[source](${markdownSourceHref})`);
  }
  const trimmed = withoutMarkers.trimEnd();
  const sourceLink = `[source](${markdownSourceHref})`;
  return trimmed.length === 0 ? sourceLink : `${trimmed}\n\n${sourceLink}`;
}

export function markdownToPlainText(markdown: string) {
  return stripLegacyCitationMarkers(markdown)
    .replace(sourcePlaceholderPattern, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/^```[^\n]*\n?|\n?```$/g, ""))
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}[-*+]\s+/gm, "\n")
    .replace(/^\s{0,3}\d+\.\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[*_~>#|]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function replaceSourcePlaceholders(markdown: string, replacement: string) {
  sourcePlaceholderPattern.lastIndex = 0;
  return markdown.replace(sourcePlaceholderPattern, replacement);
}

function citationToSource(citation: LocalCitation): MarkdownSource {
  return {
    id: citation.id,
    kind: citation.sourceKind,
    label: sourceLabel(citation.sourceKind, citation.sourceTitle, citation.excerpt),
    title: citation.sourceTitle,
    url: citation.sourceUrl,
    excerpt: citation.excerpt,
    ...(citation.anchor === undefined ? {} : { anchor: citation.anchor }),
    citation,
  };
}

function sourceLabel(kind: EvidenceSourceKind, title: string | undefined, fallback: string) {
  if (kind === "selection") {
    const compact = excerpt(fallback, 44);
    return compact.length === 0 ? "Selection" : `Selection: ${compact}`;
  }
  if (kind === "memory") {
    const compactTitle = normalizeText(title ?? "");
    if (compactTitle.length > 0 && !isGenericSourceLabel(compactTitle)) {
      return excerpt(compactTitle, 52);
    }
    const compact = excerpt(fallback, 44);
    return compact.length === 0 ? "Memory" : `Memory: ${compact}`;
  }
  const compactTitle = normalizeText(title ?? "");
  if (compactTitle.length > 0 && !isGenericSourceLabel(compactTitle)) {
    return excerpt(compactTitle, 52);
  }
  return sourceHost(fallback);
}

function isGenericSourceLabel(value: string) {
  const normalized = value.trim().toLowerCase();
  return normalized === "page" || normalized === "selection" || normalized === "memory";
}

function sourceHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return excerpt(url, 52);
  }
}
