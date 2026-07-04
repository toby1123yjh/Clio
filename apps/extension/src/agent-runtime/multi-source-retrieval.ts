import type { ClioWebSource } from "../shared/rpc";
import { excerpt, hashText, normalizeText } from "../shared/text";
import type { EvidenceItem } from "./types";

export type RetrievalSourceKind = "local_kb" | "web_search";

export type RetrievalTrigger =
  | { kind: "ordinary_chat" }
  | { kind: "explicit_research" }
  | { kind: "explicit_web" }
  | { kind: "standalone_search" };

export type LocalEvidenceQuality = "none" | "weak" | "strong";

export type RetrieverTraceStatus = "used" | "skipped" | "unavailable";

export interface MultiSourceRetrievalRequest {
  query: string;
  trigger: RetrievalTrigger;
  maxEvidenceItems?: number;
  maxEvidenceChars?: number;
  allowExternal?: boolean;
  externalAvailable?: boolean;
}

export interface RetrieverTrace {
  id: string;
  sourceKind: RetrievalSourceKind;
  status: RetrieverTraceStatus;
  reason: string;
  candidateCount: number;
  evidenceCount: number;
  budget: number;
}

export interface SourceQualitySignals {
  lexicalMatch?: number;
  semanticMatch?: number;
  sourceAuthority?: number;
  freshness?: number;
  coverage?: number;
}

export interface MultiSourceCandidate {
  id: string;
  retrieverId: string;
  sourceKind: RetrievalSourceKind;
  rank: number;
  score?: number;
  title: string;
  url?: string;
  snippet: string;
  sourceId?: string;
  chunkId?: string;
  evidenceId?: string;
  quality: SourceQualitySignals;
}

export interface MultiSourceFusionTrace {
  mode: "local_only" | "external_allowed" | "external_suppressed";
  localEvidenceQuality: LocalEvidenceQuality;
  budget: Record<RetrievalSourceKind, number>;
  reasons: string[];
}

export interface MultiSourceRetrievalTrace {
  strategy: "multi_source_dynamic_v1";
  retrievers: RetrieverTrace[];
  fusion: MultiSourceFusionTrace;
}

export interface MultiSourceRetrievalResult {
  evidence: EvidenceItem[];
  candidates: MultiSourceCandidate[];
  trace: MultiSourceRetrievalTrace;
}

export interface BuildMultiSourceRetrievalInput {
  request: MultiSourceRetrievalRequest;
  localEvidence: EvidenceItem[];
  localCandidates?: MultiSourceCandidate[];
  webSources?: ClioWebSource[];
}

export const defaultMultiSourceEvidenceBudget = {
  maxEvidenceItems: 6,
  maxEvidenceChars: 4_800,
  maxWebEvidenceCharsPerItem: 700,
} as const;

export function buildMultiSourceRetrievalResult(
  input: BuildMultiSourceRetrievalInput,
): MultiSourceRetrievalResult {
  const localEvidence = boundedEvidence(
    input.localEvidence,
    positiveLimit(
      input.request.maxEvidenceItems,
      defaultMultiSourceEvidenceBudget.maxEvidenceItems,
    ),
    positiveLimit(
      input.request.maxEvidenceChars,
      defaultMultiSourceEvidenceBudget.maxEvidenceChars,
    ),
  );
  const localCandidates =
    input.localCandidates ??
    localEvidence.map((item, index) => localEvidenceCandidate(item, index));
  const policy = planMultiSourceFusion({
    request: input.request,
    localEvidence,
    localCandidateCount: localCandidates.length,
  });
  const webSources = input.webSources ?? [];
  const webEvidence =
    policy.budget.web_search > 0
      ? webSourcesToEvidence(webSources, {
          maxItems: policy.budget.web_search,
          maxCharsPerItem: defaultMultiSourceEvidenceBudget.maxWebEvidenceCharsPerItem,
        })
      : [];
  const webCandidates =
    policy.budget.web_search > 0
      ? webSources.map((source, index) => webSourceCandidate(source, index))
      : [];
  const evidence = boundedEvidence(
    [...localEvidence.slice(0, policy.budget.local_kb), ...webEvidence],
    positiveLimit(
      input.request.maxEvidenceItems,
      defaultMultiSourceEvidenceBudget.maxEvidenceItems,
    ),
    positiveLimit(
      input.request.maxEvidenceChars,
      defaultMultiSourceEvidenceBudget.maxEvidenceChars,
    ),
  );

  return {
    evidence,
    candidates: [...localCandidates, ...webCandidates],
    trace: {
      strategy: "multi_source_dynamic_v1",
      retrievers: [
        {
          id: "local_kb",
          sourceKind: "local_kb",
          status: localEvidence.length > 0 ? "used" : "skipped",
          reason: localEvidence.length > 0 ? "bounded_local_evidence_loaded" : "no_local_evidence",
          candidateCount: localCandidates.length,
          evidenceCount: evidence.filter((item) => item.sourceKind === "memory").length,
          budget: policy.budget.local_kb,
        },
        webTrace(policy, webSources.length, webEvidence.length),
      ],
      fusion: policy,
    },
  };
}

export function planMultiSourceFusion(input: {
  request: MultiSourceRetrievalRequest;
  localEvidence: EvidenceItem[];
  localCandidateCount?: number;
}): MultiSourceFusionTrace {
  const maxEvidenceItems = positiveLimit(
    input.request.maxEvidenceItems,
    defaultMultiSourceEvidenceBudget.maxEvidenceItems,
  );
  const localEvidenceQuality = evaluateLocalEvidenceQuality(input.localEvidence, {
    query: input.request.query,
    candidateCount: input.localCandidateCount,
  });
  const baseLocalBudget = Math.min(maxEvidenceItems, input.localEvidence.length);
  const reasons: string[] = [];

  if (!isExternalTrigger(input.request.trigger)) {
    reasons.push("ordinary_chat_requires_explicit_external_trigger");
    return {
      mode: "local_only",
      localEvidenceQuality,
      budget: { local_kb: baseLocalBudget, web_search: 0 },
      reasons,
    };
  }

  if (input.request.allowExternal !== true) {
    reasons.push("external_disabled");
    return {
      mode: "local_only",
      localEvidenceQuality,
      budget: { local_kb: baseLocalBudget, web_search: 0 },
      reasons,
    };
  }

  if (input.request.externalAvailable === false) {
    reasons.push("external_unavailable");
    return {
      mode: "local_only",
      localEvidenceQuality,
      budget: { local_kb: baseLocalBudget, web_search: 0 },
      reasons,
    };
  }

  if (localEvidenceQuality === "strong") {
    reasons.push("local_evidence_strong");
    return {
      mode: "external_suppressed",
      localEvidenceQuality,
      budget: { local_kb: baseLocalBudget, web_search: 0 },
      reasons,
    };
  }

  const localBudget = Math.min(baseLocalBudget, Math.max(0, Math.ceil(maxEvidenceItems / 2)));
  const webBudget = Math.max(0, maxEvidenceItems - localBudget);
  reasons.push(localEvidenceQuality === "none" ? "no_local_evidence" : "local_evidence_weak");
  reasons.push("explicit_external_trigger");
  return {
    mode: "external_allowed",
    localEvidenceQuality,
    budget: { local_kb: localBudget, web_search: webBudget },
    reasons,
  };
}

export function evaluateLocalEvidenceQuality(
  evidence: EvidenceItem[],
  options: { query?: string; candidateCount?: number } = {},
): LocalEvidenceQuality {
  if (evidence.length === 0) return "none";
  const queryTerms = queryTermSet(options.query ?? "");
  const coverage = evidenceCoverage(evidence, queryTerms);
  const candidateCount = positiveLimit(options.candidateCount, evidence.length);
  const totalTextLength = evidence.reduce(
    (total, item) => total + normalizeText(item.text).length,
    0,
  );

  if (
    evidence.length >= 3 &&
    candidateCount >= 3 &&
    totalTextLength >= 900 &&
    (queryTerms.size === 0 || coverage >= 0.45)
  ) {
    return "strong";
  }
  if (evidence.length >= 2 && totalTextLength >= 360 && queryTerms.size === 0) return "strong";
  return "weak";
}

export function webSourcesToEvidence(
  sources: ClioWebSource[],
  options: { maxItems?: number; maxCharsPerItem?: number } = {},
): EvidenceItem[] {
  const maxItems = positiveLimit(
    options.maxItems,
    defaultMultiSourceEvidenceBudget.maxEvidenceItems,
  );
  const maxCharsPerItem = positiveLimit(
    options.maxCharsPerItem,
    defaultMultiSourceEvidenceBudget.maxWebEvidenceCharsPerItem,
  );
  if (maxItems === 0 || maxCharsPerItem === 0) return [];

  const seen = new Set<string>();
  return sources.flatMap((source) => {
    const url = normalizeText(source.url);
    const snippet = normalizeText(source.snippet);
    if (url.length === 0 || snippet.length === 0 || seen.size >= maxItems) return [];
    const key = webEvidenceKey(source);
    if (seen.has(key)) return [];
    seen.add(key);
    const text = truncateEvidenceText(snippet, maxCharsPerItem);
    return [
      {
        id: `web:${hashText(key)}`,
        sourceKind: "web",
        sourceUrl: url,
        sourceTitle: normalizeText(source.title) || source.domain || url,
        text,
        excerpt: excerpt(text, Math.min(220, text.length)),
      } satisfies EvidenceItem,
    ];
  });
}

export function webSourcesToCandidates(sources: ClioWebSource[]): MultiSourceCandidate[] {
  return sources.map((source, index) => webSourceCandidate(source, index));
}

function webTrace(
  policy: MultiSourceFusionTrace,
  candidateCount: number,
  evidenceCount: number,
): RetrieverTrace {
  if (policy.reasons.includes("external_unavailable")) {
    return {
      id: "web_search",
      sourceKind: "web_search",
      status: "unavailable",
      reason: "external_unavailable",
      candidateCount: 0,
      evidenceCount: 0,
      budget: 0,
    };
  }

  if (policy.budget.web_search === 0) {
    return {
      id: "web_search",
      sourceKind: "web_search",
      status: "skipped",
      reason: policy.reasons[0] ?? "external_not_selected",
      candidateCount: 0,
      evidenceCount: 0,
      budget: 0,
    };
  }

  return {
    id: "web_search",
    sourceKind: "web_search",
    status: candidateCount > 0 ? "used" : "skipped",
    reason: candidateCount > 0 ? "bounded_web_snippets_loaded" : "no_web_candidates",
    candidateCount,
    evidenceCount,
    budget: policy.budget.web_search,
  };
}

function isExternalTrigger(trigger: RetrievalTrigger) {
  return trigger.kind === "explicit_research" || trigger.kind === "explicit_web";
}

function localEvidenceCandidate(item: EvidenceItem, index: number): MultiSourceCandidate {
  return {
    id: `local_kb:${item.id}`,
    retrieverId: "local_kb",
    sourceKind: "local_kb",
    rank: index + 1,
    title: item.sourceTitle,
    url: item.sourceUrl,
    snippet: item.excerpt,
    sourceId: sourceIdFromMemoryEvidenceId(item.id),
    chunkId: chunkIdFromMemoryEvidenceId(item.id),
    evidenceId: item.id,
    quality: {
      coverage: 1,
    },
  };
}

function webSourceCandidate(source: ClioWebSource, index: number): MultiSourceCandidate {
  const key = webEvidenceKey(source);
  return {
    id: `web_search:${hashText(key)}`,
    retrieverId: "web_search",
    sourceKind: "web_search",
    rank: index + 1,
    title: normalizeText(source.title) || normalizeText(source.domain) || normalizeText(source.url),
    url: normalizeText(source.url),
    snippet: normalizeText(source.snippet),
    evidenceId: `web:${hashText(key)}`,
    quality: {
      coverage: normalizeText(source.snippet).length > 0 ? 0.5 : 0,
      sourceAuthority: normalizeText(source.domain).length > 0 ? 0.5 : 0,
    },
  };
}

function boundedEvidence(evidence: EvidenceItem[], maxItems: number, maxChars: number) {
  if (maxItems <= 0 || maxChars <= 0) return [];
  const bounded: EvidenceItem[] = [];
  const seen = new Set<string>();
  let totalChars = 0;
  for (const item of evidence) {
    if (bounded.length >= maxItems || seen.has(item.id)) continue;
    const text = normalizeText(item.text);
    if (text.length === 0) continue;
    const remaining = maxChars - totalChars;
    if (remaining <= 0) break;
    const nextText = truncateEvidenceText(text, remaining);
    totalChars += nextText.length;
    seen.add(item.id);
    bounded.push({
      ...item,
      text: nextText,
      excerpt: excerpt(nextText, Math.min(260, nextText.length)),
    });
  }
  return bounded;
}

function evidenceCoverage(evidence: EvidenceItem[], queryTerms: Set<string>) {
  if (queryTerms.size === 0) return 0;
  const textTerms = new Set(
    Array.from(
      evidence
        .map((item) => item.text)
        .join("\n")
        .toLowerCase()
        .match(queryTokenPattern) ?? [],
    ),
  );
  let matched = 0;
  for (const term of queryTerms) {
    if (textTerms.has(term)) matched += 1;
  }
  return matched / queryTerms.size;
}

const queryTokenPattern = /\p{Script=Han}|[\p{L}\p{N}_]+/gu;

function queryTermSet(query: string) {
  return new Set(
    Array.from(normalizeText(query).toLowerCase().match(queryTokenPattern) ?? []).filter(
      (term) => term.length > 0,
    ),
  );
}

function webEvidenceKey(source: ClioWebSource) {
  return normalizeText(source.url) || normalizeText(source.id) || normalizeText(source.title);
}

function sourceIdFromMemoryEvidenceId(id: string) {
  const match = /^memory:([^:]+)(?::chunk:.+)?$/u.exec(id);
  return match?.[1];
}

function chunkIdFromMemoryEvidenceId(id: string) {
  const match = /^memory:[^:]+:chunk:(.+)$/u.exec(id);
  return match?.[1];
}

function positiveLimit(value: number | undefined, fallback: number) {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.floor(value));
}

function truncateEvidenceText(input: string, maxChars: number) {
  const text = normalizeText(input).replace(/\s+/g, " ");
  if (text.length <= maxChars) return text;
  if (maxChars <= 3) return text.slice(0, maxChars);
  return `${text.slice(0, maxChars - 3).trimEnd()}...`;
}
