import type {
  RetrieveSourceCoarseLaneName,
  RetrieveSourceCoarseLaneSignal,
  RetrieveSourceCoarseSignals,
  RetrieveTrackName,
} from "@/src/shared/rpc";
import { expandChineseBigrams, normalizeText } from "@/src/shared/text";

type RetrievalTrack = Exclude<RetrieveTrackName, "recent_sources">;

export interface SourceCoarseRankHit {
  chunkId: string;
  ord: number;
  snippet: string;
  track: "fts_chunks" | "vector_chunks";
  rank: number;
  rawScore?: number;
  sectionPath?: string;
}

export interface SourceCoarseRankCandidate<T> {
  id: string;
  item: T;
  title: string;
  abstract: string;
  keywords: string[];
  headings: string[];
  capturedAt: string;
  trackRanks: Partial<Record<RetrievalTrack, number>>;
  hits: SourceCoarseRankHit[];
  totalChunkCount: number;
  totalSectionCount: number;
  fallbackScore: number;
  bestRank: number;
}

export interface SourceCoarseRankedCandidate<T> {
  candidate: SourceCoarseRankCandidate<T>;
  score: number;
  signals: RetrieveSourceCoarseSignals;
}

export interface SourceFineRanker<T> {
  rerank(input: { query: string; candidates: readonly T[] }): Promise<readonly T[]>;
}

export interface SourceFineRankResult<T> {
  items: T[];
  status: "not_configured" | "applied" | "failed";
  reason?: string;
}

const laneNames: readonly RetrieveSourceCoarseLaneName[] = [
  "topic",
  "local_peak",
  "breadth",
  "specificity",
  "agreement",
];

const stopTerms = new Set([
  "a",
  "an",
  "and",
  "are",
  "for",
  "in",
  "is",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
]);

export function rankSourceCoarseCandidates<T>(
  query: string,
  candidates: readonly SourceCoarseRankCandidate<T>[],
  rrfK = 60,
): SourceCoarseRankedCandidate<T>[] {
  if (candidates.length === 0) return [];
  const queryProfile = buildQueryProfile(query);
  const candidateTexts = candidates.map(searchableCandidateText);
  const specificityContext = buildSpecificityContext(queryProfile, candidateTexts);
  const drafts = candidates.map((candidate, index) => {
    const draft = buildSignalDraft(
      candidate,
      queryProfile,
      candidateTexts[index] ?? "",
      specificityContext,
    );
    return {
      ...draft,
      fusionStrengths: fusionStrengths(draft.laneScores),
    };
  });
  const laneRankByCandidate = new Map<string, Map<RetrieveSourceCoarseLaneName, number>>();

  for (const lane of laneNames) {
    const ranked = drafts
      .filter((draft) => draft.fusionStrengths[lane] > 0)
      .sort(
        (left, right) =>
          right.fusionStrengths[lane] - left.fusionStrengths[lane] || compareDrafts(left, right),
      );
    ranked.forEach((draft, index) => {
      const ranks = laneRankByCandidate.get(draft.candidate.id) ?? new Map();
      ranks.set(lane, index + 1);
      laneRankByCandidate.set(draft.candidate.id, ranks);
    });
  }

  return drafts
    .map((draft) => {
      const laneRanks = laneRankByCandidate.get(draft.candidate.id) ?? new Map();
      const lanes: RetrieveSourceCoarseLaneSignal[] = laneNames.map((name) => {
        const rawScore = draft.laneScores[name];
        const fusionStrength = draft.fusionStrengths[name];
        const rank = laneRanks.get(name);
        return {
          name,
          eligible: rank !== undefined,
          rawScore,
          fusionStrength,
          ...(rank === undefined ? {} : { rank }),
        };
      });
      const score = lanes.reduce(
        (total, lane) =>
          total +
          (lane.rank === undefined ? 0 : lane.fusionStrength * reciprocalRank(lane.rank, rrfK)),
        0,
      );
      return {
        candidate: draft.candidate,
        score,
        signals: {
          topicEvidence: draft.laneScores.topic,
          localPeak: draft.laneScores.local_peak,
          breadth: draft.laneScores.breadth,
          specificity: draft.laneScores.specificity,
          agreement: draft.laneScores.agreement,
          uniqueHitChunkCount: draft.uniqueHits.length,
          totalChunkCount: draft.candidate.totalChunkCount,
          hitChunkRatio: draft.hitChunkRatio,
          evidenceRegionCount: draft.evidenceRegionCount,
          distinctSectionCount: draft.distinctSectionCount,
          totalSectionCount: draft.candidate.totalSectionCount,
          matchedMetadataFields: draft.matchedMetadataFields,
          lanes,
        },
      } satisfies SourceCoarseRankedCandidate<T>;
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.candidate.fallbackScore - left.candidate.fallbackScore ||
        compareCandidates(left.candidate, right.candidate),
    );
}

export function selectSourceCoarseCandidates<T>(
  ranked: readonly SourceCoarseRankedCandidate<T>[],
  limit: number,
): SourceCoarseRankedCandidate<T>[] {
  const boundedLimit = Math.max(0, Math.floor(limit));
  if (ranked.length <= boundedLimit) return [...ranked];
  if (boundedLimit < 3) return ranked.slice(0, boundedLimit);
  const selectedIds = new Set<string>();

  // Keep the three useful document shapes in the coarse pool before filling by fused score.
  for (const lane of ["topic", "breadth", "local_peak"] as const) {
    if (selectedIds.size >= boundedLimit) break;
    const best = ranked
      .filter((item) => laneSignal(item, lane)?.eligible === true)
      .sort((left, right) => {
        const leftLane = laneSignal(left, lane);
        const rightLane = laneSignal(right, lane);
        return (
          (leftLane?.rank ?? Number.MAX_SAFE_INTEGER) -
            (rightLane?.rank ?? Number.MAX_SAFE_INTEGER) || right.score - left.score
        );
      })[0];
    if (best !== undefined) selectedIds.add(best.candidate.id);
  }
  for (const item of ranked) {
    if (selectedIds.size >= boundedLimit) break;
    selectedIds.add(item.candidate.id);
  }
  return ranked.filter((item) => selectedIds.has(item.candidate.id));
}

export async function runSourceFineRanker<T>(
  query: string,
  candidates: readonly T[],
  ranker?: SourceFineRanker<T>,
): Promise<SourceFineRankResult<T>> {
  if (ranker === undefined) return { items: [...candidates], status: "not_configured" };
  try {
    return { items: [...(await ranker.rerank({ query, candidates }))], status: "applied" };
  } catch {
    return {
      items: [...candidates],
      status: "failed",
      reason: "fine_ranker_failed",
    };
  }
}

interface QueryProfile {
  normalized: string;
  terms: string[];
  identifiers: string[];
}

interface SpecificityContext {
  candidateCount: number;
  termWeights: Map<string, number>;
  totalTermWeight: number;
  phraseWeight: number;
}

interface SignalDraft<T> {
  candidate: SourceCoarseRankCandidate<T>;
  uniqueHits: SourceCoarseRankHit[];
  hitChunkRatio: number;
  evidenceRegionCount: number;
  distinctSectionCount: number;
  matchedMetadataFields: RetrieveSourceCoarseSignals["matchedMetadataFields"];
  laneScores: Record<RetrieveSourceCoarseLaneName, number>;
}

interface FusionSignalDraft<T> extends SignalDraft<T> {
  fusionStrengths: Record<RetrieveSourceCoarseLaneName, number>;
}

function buildSignalDraft<T>(
  candidate: SourceCoarseRankCandidate<T>,
  query: QueryProfile,
  candidateText: string,
  specificityContext: SpecificityContext,
): SignalDraft<T> {
  const uniqueHits = dedupeHits(candidate.hits);
  const distinctSectionCount = new Set(
    uniqueHits.map((hit) => normalizeText(hit.sectionPath ?? "")).filter(Boolean),
  ).size;
  const evidenceRegionCount = countEvidenceRegions(uniqueHits);
  const hitChunkRatio =
    candidate.totalChunkCount <= 0 ? 0 : Math.min(1, uniqueHits.length / candidate.totalChunkCount);
  const titleMatch = textMatchScore(candidate.title, query);
  const abstractMatch = textMatchScore(candidate.abstract, query);
  const keywordMatch = Math.max(
    0,
    ...candidate.keywords.map((value) => textMatchScore(value, query)),
  );
  const headingMatch = Math.max(
    0,
    ...candidate.headings.map((value) => textMatchScore(value, query)),
  );
  const matchedMetadataFields: RetrieveSourceCoarseSignals["matchedMetadataFields"] = [];
  if (titleMatch > 0) matchedMetadataFields.push("title");
  if (abstractMatch > 0) matchedMetadataFields.push("abstract");
  if (keywordMatch > 0) matchedMetadataFields.push("keywords");
  if (headingMatch > 0) matchedMetadataFields.push("heading");

  const metadataTrackPeak = Math.max(
    rankStrength(candidate.trackRanks.meta_sources),
    rankStrength(candidate.trackRanks.vector_meta),
  );
  const topicEvidence = clamp01(
    Math.max(titleMatch, abstractMatch * 0.9, keywordMatch * 0.85, headingMatch * 0.8) * 0.7 +
      metadataTrackPeak * 0.3,
  );
  const localPeak = candidate.hits.reduce((peak, hit) => {
    const rankScore = rankStrength(hit.rank);
    const contentScore = textMatchScore(hit.snippet, query);
    const vectorScore = hit.track === "vector_chunks" ? clamp01(hit.rawScore ?? 0) : 0;
    return Math.max(peak, clamp01(rankScore * 0.5 + contentScore * 0.35 + vectorScore * 0.15));
  }, 0);
  const breadth = breadthScore(
    uniqueHits.length,
    hitChunkRatio,
    evidenceRegionCount,
    distinctSectionCount,
    candidate.totalSectionCount,
  );
  const specificity = specificityScore(candidateText, query, specificityContext);
  const agreement = agreementScore(candidate.trackRanks);

  return {
    candidate,
    uniqueHits,
    hitChunkRatio,
    evidenceRegionCount,
    distinctSectionCount,
    matchedMetadataFields,
    laneScores: {
      topic: topicEvidence,
      local_peak: localPeak,
      breadth,
      specificity,
      agreement,
    },
  };
}

function buildQueryProfile(input: string): QueryProfile {
  const normalized = normalizeForMatch(input);
  const terms = Array.from(
    new Set(expandChineseBigrams(normalized).match(/[\p{L}\p{N}_-]+/gu) ?? []),
  ).filter((term) => term.length > 1 && !stopTerms.has(term));
  return {
    normalized,
    terms,
    identifiers: terms.filter((term) => /\d|[_-]/u.test(term)),
  };
}

function textMatchScore(input: string, query: QueryProfile) {
  const text = normalizeForMatch(input);
  if (text.length === 0 || query.normalized.length === 0) return 0;
  const matchedTerms = query.terms.filter((term) => text.includes(term));
  const coverage = query.terms.length === 0 ? 0 : matchedTerms.length / query.terms.length;
  const exactPhrase = text.includes(query.normalized) ? 1 : 0;
  const identifierCoverage =
    query.identifiers.length === 0
      ? 0
      : query.identifiers.filter((term) => text.includes(term)).length / query.identifiers.length;
  return clamp01(coverage * 0.55 + exactPhrase * 0.3 + identifierCoverage * 0.15);
}

function buildSpecificityContext(
  query: QueryProfile,
  candidateTexts: readonly string[],
): SpecificityContext {
  const termWeights = new Map(
    query.terms.map((term) => [term, inverseCandidateFrequency(term, candidateTexts)]),
  );
  return {
    candidateCount: candidateTexts.length,
    termWeights,
    totalTermWeight: Array.from(termWeights.values()).reduce((total, weight) => total + weight, 0),
    phraseWeight:
      query.terms.length < 2 ? 0 : inverseCandidateFrequency(query.normalized, candidateTexts),
  };
}

function specificityScore(candidateText: string, query: QueryProfile, context: SpecificityContext) {
  if (query.terms.length === 0 || context.candidateCount <= 1) return 0;
  const weightedMatches = query.terms.reduce(
    (total, term) =>
      total + (candidateText.includes(term) ? (context.termWeights.get(term) ?? 0) : 0),
    0,
  );
  const termCoverage = context.totalTermWeight <= 0 ? 0 : weightedMatches / context.totalTermWeight;
  const phraseWeight =
    query.terms.length < 2 || !candidateText.includes(query.normalized) ? 0 : context.phraseWeight;
  const identifierWeight =
    query.identifiers.length === 0
      ? 0
      : query.identifiers.reduce(
          (total, term) =>
            total + (candidateText.includes(term) ? (context.termWeights.get(term) ?? 0) : 0),
          0,
        ) / query.identifiers.length;
  return clamp01(termCoverage * 0.65 + phraseWeight * 0.25 + identifierWeight * 0.1);
}

function inverseCandidateFrequency(term: string, corpusTexts: readonly string[]) {
  const documentFrequency = corpusTexts.filter((text) => text.includes(term)).length;
  if (documentFrequency >= corpusTexts.length) return 0;
  return (
    Math.log((corpusTexts.length + 1) / (documentFrequency + 1)) / Math.log(corpusTexts.length + 1)
  );
}

function searchableCandidateText<T>(candidate: SourceCoarseRankCandidate<T>) {
  return normalizeForMatch(
    [
      candidate.title,
      candidate.abstract,
      ...candidate.keywords,
      ...candidate.headings,
      ...dedupeHits(candidate.hits).map((hit) => hit.snippet),
    ].join(" "),
  );
}

function breadthScore(
  uniqueHitCount: number,
  hitRatio: number,
  regionCount: number,
  sectionCount: number,
  totalSectionCount: number,
) {
  if (uniqueHitCount <= 1) return 0;
  const saturatedHits = 1 - Math.exp(-(uniqueHitCount - 1) / 3);
  const saturatedRegions = 1 - Math.exp(-Math.max(0, regionCount - 1) / 2);
  const sectionRatio = totalSectionCount <= 0 ? 0 : Math.min(1, sectionCount / totalSectionCount);
  return clamp01(
    saturatedHits * 0.4 + saturatedRegions * 0.35 + Math.sqrt(hitRatio) * 0.15 + sectionRatio * 0.1,
  );
}

function agreementScore(trackRanks: Partial<Record<RetrievalTrack, number>>) {
  const tracks = Object.entries(trackRanks).filter(([, rank]) => rank !== undefined);
  if (tracks.length < 2) return 0;
  const names = new Set(tracks.map(([name]) => name as RetrievalTrack));
  const metadataAndChunk =
    (names.has("meta_sources") || names.has("vector_meta")) &&
    (names.has("fts_chunks") || names.has("vector_chunks"));
  const lexicalAndVector =
    (names.has("meta_sources") || names.has("fts_chunks")) &&
    (names.has("vector_meta") || names.has("vector_chunks"));
  const rankQuality =
    tracks.reduce((total, [, rank]) => total + rankStrength(rank), 0) / tracks.length;
  return clamp01(
    ((tracks.length - 1) / 3) * 0.5 +
      (metadataAndChunk ? 0.2 : 0) +
      (lexicalAndVector ? 0.2 : 0) +
      rankQuality * 0.1,
  );
}

function fusionStrengths(
  laneScores: Readonly<Record<RetrieveSourceCoarseLaneName, number>>,
): Record<RetrieveSourceCoarseLaneName, number> {
  const relevanceAnchor = Math.max(laneScores.topic, laneScores.local_peak);
  return {
    topic: laneScores.topic,
    local_peak: laneScores.local_peak,
    breadth: laneScores.breadth * relevanceAnchor,
    specificity: laneScores.specificity,
    agreement: laneScores.agreement * relevanceAnchor,
  };
}

function dedupeHits(hits: readonly SourceCoarseRankHit[]) {
  const byChunk = new Map<string, SourceCoarseRankHit>();
  for (const hit of hits) {
    const existing = byChunk.get(hit.chunkId);
    if (existing === undefined || hit.rank < existing.rank) byChunk.set(hit.chunkId, hit);
  }
  return Array.from(byChunk.values()).sort((left, right) => left.ord - right.ord);
}

function countEvidenceRegions(hits: readonly SourceCoarseRankHit[]) {
  const sectionPaths = new Set<string>();
  const unsectionedOrds: number[] = [];
  for (const hit of hits) {
    const sectionPath = normalizeText(hit.sectionPath ?? "");
    if (sectionPath.length > 0) sectionPaths.add(sectionPath);
    else unsectionedOrds.push(hit.ord);
  }
  unsectionedOrds.sort((left, right) => left - right);
  let unsectionedRegions = 0;
  let previous: number | undefined;
  for (const ord of unsectionedOrds) {
    if (previous === undefined || ord > previous + 1) unsectionedRegions += 1;
    previous = ord;
  }
  return sectionPaths.size + unsectionedRegions;
}

function compareDrafts<T>(left: FusionSignalDraft<T>, right: FusionSignalDraft<T>) {
  return compareCandidates(left.candidate, right.candidate);
}

function compareCandidates<T>(
  left: SourceCoarseRankCandidate<T>,
  right: SourceCoarseRankCandidate<T>,
) {
  return (
    left.bestRank - right.bestRank ||
    right.capturedAt.localeCompare(left.capturedAt) ||
    left.title.localeCompare(right.title)
  );
}

function laneSignal<T>(item: SourceCoarseRankedCandidate<T>, lane: RetrieveSourceCoarseLaneName) {
  return item.signals.lanes.find((signal) => signal.name === lane);
}

function rankStrength(rank: number | undefined) {
  return rank === undefined || !Number.isFinite(rank) || rank <= 0 ? 0 : 1 / (1 + Math.log2(rank));
}

function reciprocalRank(rank: number, rrfK: number) {
  return 1 / (Math.max(0, rrfK) + Math.max(1, rank));
}

function normalizeForMatch(input: string) {
  return normalizeText(input).toLocaleLowerCase();
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}
