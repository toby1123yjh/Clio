import type { EvidenceItem, LocalCitation } from "@/src/agent-runtime/types";
import type {
  CreateTopicPagePayload,
  CreateWikiCompileJobPayload,
  TopicGraphEdge,
  TopicGraphEdgeInput,
  TopicPageDetail,
  TopicPageSourceRef,
  TopicPageSummary,
  UpdateTopicPagePayload,
  WikiCompileJobSummary,
  WikiCompileResultPayload,
} from "@/src/shared/rpc";
import { excerpt, normalizeText } from "@/src/shared/text";

export type TopicFormMode = "create" | "edit";

export interface TopicPageFormState {
  title: string;
  summary: string;
  content: string;
  sourceRefsText: string;
}

export const emptyTopicPageForm: TopicPageFormState = {
  title: "",
  summary: "",
  content: "",
  sourceRefsText: "",
};

export interface WikiCompileFormState {
  query: string;
  instructions: string;
}

export const emptyWikiCompileForm: WikiCompileFormState = {
  query: "",
  instructions: "",
};

export function topicSummaryLabel(page: TopicPageSummary) {
  if (page.sourceCount === 0) return "No sources";
  if (page.sourceCount === 1) return "1 source";
  return `${page.sourceCount} sources`;
}

export function wikiJobStatusLabel(job: WikiCompileJobSummary) {
  if (job.status === "queued") return "Queued";
  if (job.status === "running") return "Running";
  if (job.status === "done") return "Done";
  return "Failed";
}

export function topicGraphEdgeLabel(edge: TopicGraphEdge) {
  if (edge.kind === "source") return edge.label || "Source memory";
  if (edge.kind === "related") return edge.label || "Related topic";
  return edge.label || "Mention";
}

export function topicDetailToForm(page: TopicPageDetail): TopicPageFormState {
  return {
    title: page.title,
    summary: page.summary,
    content: page.content,
    sourceRefsText: formatTopicSourceRefs(page.sourceRefs),
  };
}

export function topicDetailToWikiCompileForm(page: TopicPageDetail): WikiCompileFormState {
  return {
    query: page.title,
    instructions: page.summary,
  };
}

export function createWikiCompilePayloadFromForm(
  form: WikiCompileFormState,
  topicId?: string,
  sourceMemoryIds: string[] = [],
): CreateWikiCompileJobPayload {
  return {
    ...(topicId === undefined ? {} : { topicId }),
    query: form.query,
    instructions: form.instructions,
    sourceMemoryIds,
  };
}

export function createTopicPayloadFromForm(form: TopicPageFormState): CreateTopicPagePayload {
  return {
    title: form.title,
    summary: form.summary,
    content: form.content,
    sourceRefs: parseTopicSourceRefsText(form.sourceRefsText),
  };
}

export function updateTopicPayloadFromForm(form: TopicPageFormState): UpdateTopicPagePayload {
  return {
    title: form.title,
    summary: form.summary,
    content: form.content,
    sourceRefs: parseTopicSourceRefsText(form.sourceRefsText),
  };
}

export function buildWikiCompileQuestion(input: {
  query: string;
  instructions: string;
  evidence: EvidenceItem[];
}) {
  const sourceList =
    input.evidence.length === 0
      ? "No source memories were selected."
      : input.evidence
          .map(
            (item, index) =>
              `${index + 1}. ${item.sourceTitle}\nMemory id: ${item.id}\n${item.excerpt}`,
          )
          .join("\n\n");
  return [
    "Compile a Clio Topic page from the attached local memory evidence.",
    "Return concise Markdown. Start with a one-paragraph summary, then sections for key facts, open questions, and useful next actions when available.",
    "Do not invent facts that are not supported by the attached memories.",
    "When a claim depends on a source memory, include [source] near that sentence.",
    `Topic query: ${input.query}`,
    input.instructions.length === 0 ? "" : `Extra instructions: ${input.instructions}`,
    `Candidate source memories:\n${sourceList}`,
  ]
    .filter((part) => part.length > 0)
    .join("\n\n");
}

export function buildWikiCompileResult(input: {
  job: WikiCompileJobSummary;
  text: string;
  evidence: EvidenceItem[];
  citations: LocalCitation[];
}): WikiCompileResultPayload {
  const content = normalizeText(input.text);
  const sourceRefs = sourceRefsFromCompileOutput(input.evidence, input.citations, content);
  return {
    topic: {
      title: input.job.query,
      summary: summarizeCompiledTopic(content),
      content,
      sourceRefs,
    },
    sourceRefs,
    edges: sourceRefs.map(
      (ref): TopicGraphEdgeInput => ({
        kind: "source",
        memoryId: ref.memoryId,
        chunkId: ref.chunkId,
        weight: 1,
        label: ref.quote,
      }),
    ),
  };
}

export function parseTopicSourceRefsText(value: string): TopicPageSourceRef[] {
  const seen = new Set<string>();
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .flatMap((line) => {
      if (line.length === 0) return [];
      const [memoryId = "", chunkId = "", ...quoteParts] = line
        .split("|")
        .map((part) => part.trim());
      if (memoryId.length === 0) return [];
      const key = `${memoryId}:${chunkId}`;
      if (seen.has(key)) return [];
      seen.add(key);
      const quote = quoteParts.join("|").trim();
      return [
        {
          memoryId,
          ...(chunkId.length === 0 ? {} : { chunkId }),
          ...(quote.length === 0 ? {} : { quote }),
        },
      ];
    });
}

function summarizeCompiledTopic(content: string) {
  const firstParagraph = content
    .split(/\n{2,}/)
    .map((part) => normalizeText(part.replace(/^#+\s*/, "")))
    .find((part) => part.length > 0);
  return excerpt(firstParagraph ?? content, 220);
}

function sourceRefsFromCompileOutput(
  evidence: EvidenceItem[],
  citations: LocalCitation[],
  content: string,
): TopicPageSourceRef[] {
  const citationRefs = citations.flatMap((citation) => {
    const item = evidence.find((candidate) => candidate.id === citation.evidenceId);
    if (item === undefined) return [];
    return [
      {
        memoryId: item.id,
        quote: citation.excerpt,
      },
    ];
  });
  if (citationRefs.length > 0) return dedupeSourceRefs(citationRefs);
  return dedupeSourceRefs(
    evidence.slice(0, 8).map((item) => ({
      memoryId: item.id,
      quote: excerpt(item.text || item.excerpt || content, 180),
    })),
  );
}

function dedupeSourceRefs(refs: TopicPageSourceRef[]) {
  const seen = new Set<string>();
  return refs.flatMap((ref) => {
    const memoryId = normalizeText(ref.memoryId);
    if (memoryId.length === 0) return [];
    const chunkId = ref.chunkId === undefined ? undefined : normalizeText(ref.chunkId);
    const key = `${memoryId}:${chunkId ?? ""}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [
      {
        memoryId,
        ...(chunkId === undefined || chunkId.length === 0 ? {} : { chunkId }),
        ...(ref.quote === undefined ? {} : { quote: excerpt(ref.quote, 180) }),
      },
    ];
  });
}

function formatTopicSourceRefs(refs: TopicPageSourceRef[]) {
  return refs
    .map((ref) =>
      [ref.memoryId, ref.chunkId ?? "", ref.quote ?? ""]
        .map((part) => part.replace(/\s+/g, " ").trim())
        .join("|")
        .replace(/\|+$/g, ""),
    )
    .join("\n");
}
