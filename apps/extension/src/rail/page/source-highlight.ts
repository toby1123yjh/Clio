import type { ToastState } from "@/src/rail/app/feedback";
import { sourceUrlsMatch } from "@/src/shared/reliability";
import type { AnchorInfo, AnchorResolveResult, MemoryDetail } from "@/src/shared/rpc";

const pendingHighlightStorageKey = "clio:pending-highlight";

interface PendingHighlight {
  memoryId: string;
  sourceUrl: string;
  selectedText: string;
  contextBefore: string;
  contextAfter: string;
  textFragment?: string;
  createdAt: string;
}

export interface HighlightableTextAnchor {
  selectedText: string;
  contextBefore: string;
  contextAfter: string;
  textFragment?: string;
}

export async function storePendingHighlight(result: AnchorResolveResult, memory: MemoryDetail) {
  if (result.anchor === undefined) {
    await chrome.storage.session.remove(pendingHighlightStorageKey);
    return;
  }
  await storePendingHighlightFromAnchor(
    result.anchor,
    memory,
    result.sourceUrl ?? memory.sourceUrl,
  );
}

export async function storePendingHighlightFromAnchor(
  anchor: HighlightableTextAnchor,
  memory: Pick<MemoryDetail, "id" | "sourceUrl">,
  sourceUrl = memory.sourceUrl,
) {
  const pending: PendingHighlight = {
    memoryId: memory.id,
    sourceUrl,
    selectedText: anchor.selectedText,
    contextBefore: anchor.contextBefore,
    contextAfter: anchor.contextAfter,
    ...(anchor.textFragment === undefined ? {} : { textFragment: anchor.textFragment }),
    createdAt: new Date().toISOString(),
  };
  await chrome.storage.session.set({ [pendingHighlightStorageKey]: pending });
}

export async function clearPendingHighlight() {
  await chrome.storage.session.remove(pendingHighlightStorageKey);
}

export async function consumePendingHighlight(
  currentUrl: string,
  showToast: (toast: ToastState) => void,
) {
  try {
    const stored = (await chrome.storage.session.get(pendingHighlightStorageKey)) as Record<
      string,
      unknown
    >;
    const pending = stored[pendingHighlightStorageKey];
    if (!isPendingHighlight(pending)) return;
    if (Date.now() - new Date(pending.createdAt).getTime() > 60_000) {
      await chrome.storage.session.remove(pendingHighlightStorageKey);
      return;
    }
    if (!sourceUrlsMatch(pending.sourceUrl, currentUrl)) return;
    await chrome.storage.session.remove(pendingHighlightStorageKey);
    if (highlightPending(pending)) {
      showToast({ tone: "success", message: "Source passage highlighted." });
      return;
    }
    showToast({
      tone: "warning",
      message: "Opened source, but Clio could not locate the saved passage on this page.",
    });
  } catch {
    // Content scripts can run before the background sets storage.session access.
  }
}

export function highlightAnchor(anchor: AnchorInfo) {
  return highlightText({
    selectedText: anchor.selectedText,
    contextBefore: anchor.contextBefore,
    contextAfter: anchor.contextAfter,
    textFragment: anchor.textFragment,
  });
}

export function highlightEvidenceAnchor(anchor: HighlightableTextAnchor) {
  return highlightText(anchor);
}

function isPendingHighlight(value: unknown): value is PendingHighlight {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<PendingHighlight>;
  return (
    typeof candidate.memoryId === "string" &&
    typeof candidate.sourceUrl === "string" &&
    typeof candidate.selectedText === "string" &&
    typeof candidate.contextBefore === "string" &&
    typeof candidate.contextAfter === "string" &&
    typeof candidate.createdAt === "string"
  );
}

function highlightPending(pending: PendingHighlight) {
  return highlightText(pending);
}

function highlightText(anchor: {
  selectedText: string;
  contextBefore: string;
  contextAfter: string;
  textFragment?: string;
}) {
  clearClioHighlights();
  const target = anchor.selectedText.trim();
  if (target.length === 0 || document.body === null) return false;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node !== null) {
    const text = node.textContent ?? "";
    const index = text.indexOf(target);
    if (index >= 0) {
      try {
        const range = document.createRange();
        range.setStart(node, index);
        range.setEnd(node, index + target.length);
        const mark = document.createElement("span");
        mark.dataset.clioHighlight = "true";
        mark.style.background = "#fef08a";
        mark.style.color = "inherit";
        mark.style.boxShadow = "0 0 0 2px rgba(250, 204, 21, 0.45)";
        mark.style.borderRadius = "2px";
        range.surroundContents(mark);
        mark.scrollIntoView({ block: "center", behavior: "smooth" });
        return true;
      } catch {
        // Continue searching for another exact text node match.
      }
    }
    node = walker.nextNode();
  }
  if (anchor.textFragment !== undefined) {
    location.href = anchor.textFragment;
    return true;
  }
  return false;
}

function clearClioHighlights() {
  for (const mark of Array.from(document.querySelectorAll("[data-clio-highlight='true']"))) {
    const text = document.createTextNode(mark.textContent ?? "");
    mark.replaceWith(text);
    text.parentElement?.normalize();
  }
}
