import { Readability } from "@mozilla/readability";
import { EngineRpcError } from "../../shared/rpc";
import { normalizeText } from "../../shared/text";

export function extractReadablePage() {
  const clone = document.cloneNode(true) as Document;
  const article = new Readability(clone).parse();
  const text = normalizeText(article?.textContent ?? "");
  const bodyText = normalizeText(document.body?.innerText ?? "");
  const ratio = bodyText.length === 0 ? 0 : text.length / bodyText.length;
  const enoughText = text.length >= 300;
  const enoughSignal = bodyText.length < 1000 || ratio >= 0.08;

  if (!article || !enoughText || !enoughSignal) {
    throw new EngineRpcError(
      "LOW_CONFIDENCE_EXTRACTION",
      "Clio could not identify a clean main article. Save a selected passage instead.",
    );
  }

  return {
    title: article.title || document.title || location.hostname,
    byline: article.byline ?? undefined,
    text,
    ratio,
  };
}
