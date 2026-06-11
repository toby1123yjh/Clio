import type { PageContext, SelectionSnapshot } from "@/src/rail/app/rail-state";
import { buildTextFragmentUrl, selectAnchorContext } from "@/src/shared/reliability";
import { normalizeText } from "@/src/shared/text";

const clioRootId = "clio-toolbox-root";

export interface SelectionState {
  text: string;
  x: number;
  y: number;
}

export interface SelectionContext {
  selectedText: string;
  contextBefore: string;
  contextAfter: string;
  xpath?: string;
  textFragment?: string;
}

export function readCurrentSelection(): SelectionState | null {
  const selection = window.getSelection();
  if (selection === null || selection.isCollapsed || selection.rangeCount === 0) return null;
  if (selectionBelongsToClioUi(selection)) return null;
  const text = normalizeText(selection.toString());
  if (text.length < 2) return null;
  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;
  return {
    text,
    x: Math.min(Math.max(rect.left + rect.width / 2, 64), window.innerWidth - 64),
    y: Math.max(rect.top - 8, 48),
  };
}

function selectionBelongsToClioUi(selection: Selection) {
  return nodeBelongsToClioUi(selection.anchorNode) || nodeBelongsToClioUi(selection.focusNode);
}

function nodeBelongsToClioUi(node: Node | null) {
  if (node === null) return false;
  const root = node.getRootNode();
  if (root instanceof ShadowRoot && root.host instanceof HTMLElement) {
    return root.host.id === clioRootId;
  }
  const element = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  return element?.closest(`#${clioRootId}`) !== null;
}

export function readSelectionContext(selectedText: string): SelectionContext {
  const pageText = normalizeText(document.body?.innerText ?? "");
  const selection = window.getSelection();
  const range =
    selection !== null && selection.rangeCount > 0 && !selection.isCollapsed
      ? selection.getRangeAt(0)
      : null;
  const xpath = range === null ? undefined : xpathForNode(range.startContainer);
  const context = selectAnchorContext(pageText, selectedText);
  return {
    selectedText,
    contextBefore: context.before,
    contextAfter: context.after,
    xpath,
    textFragment: buildTextFragmentUrl(location.href, selectedText),
  };
}

export function readLiveSelectionSnapshot(pageContext: PageContext): SelectionSnapshot | null {
  const liveSelection = readCurrentSelection();
  const selectedText = normalizeText(liveSelection?.text ?? "");
  if (selectedText.length === 0) return null;
  const context = readSelectionContext(selectedText);
  return {
    text: selectedText,
    sourceUrl: pageContext.url,
    sourceTitle: pageContext.title,
    contextBefore: context.contextBefore,
    contextAfter: context.contextAfter,
    capturedAt: new Date().toISOString(),
    ...(context.xpath === undefined ? {} : { xpath: context.xpath }),
    ...(context.textFragment === undefined ? {} : { textFragment: context.textFragment }),
  };
}

function xpathForNode(node: Node) {
  const element =
    node.nodeType === Node.ELEMENT_NODE ? (node as Element) : (node.parentElement ?? null);
  if (element === null) return undefined;
  const parts: string[] = [];
  let current: Element | null = element;
  while (current !== null && current !== document.documentElement) {
    const tag = current.localName;
    let index = 1;
    let previous = current.previousElementSibling;
    while (previous !== null) {
      if (previous.localName === tag) index += 1;
      previous = previous.previousElementSibling;
    }
    parts.unshift(`${tag}[${index}]`);
    current = current.parentElement;
  }
  return `/html/${parts.join("/")}`;
}
