import type {
  ClioWebSearchEvent,
  ClioWebSearchRequest,
  ClioWebSearchResult,
  ClioWebSource,
} from "../shared/rpc";
import { EngineRpcError } from "../shared/rpc";
import { classifyProviderError } from "./provider-errors";
import type { StoredProviderConfig } from "./provider-settings";
import {
  type SearchProviderSettings,
  resolveOpenAIWebSearchConfig,
} from "./search-provider-settings";

export interface ClioWebToolRuntimeOptions {
  loadSearchProviderSettings: () => Promise<SearchProviderSettings>;
  loadActiveProviderConfig: () => Promise<StoredProviderConfig | undefined>;
  ensureOpenAIHostPermission: (baseUrl: string) => Promise<boolean>;
  fetchFn?: typeof fetch;
}

export class ClioWebToolRuntime {
  private readonly loadSearchProviderSettings: () => Promise<SearchProviderSettings>;
  private readonly loadActiveProviderConfig: () => Promise<StoredProviderConfig | undefined>;
  private readonly ensureOpenAIHostPermission: (baseUrl: string) => Promise<boolean>;
  private readonly fetchFn: typeof fetch;

  constructor(options: ClioWebToolRuntimeOptions) {
    this.loadSearchProviderSettings = options.loadSearchProviderSettings;
    this.loadActiveProviderConfig = options.loadActiveProviderConfig;
    this.ensureOpenAIHostPermission = options.ensureOpenAIHostPermission;
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async *searchWeb(
    request: ClioWebSearchRequest,
    options: { signal?: AbortSignal } = {},
  ): AsyncIterable<ClioWebSearchEvent> {
    const query = request.query.trim();
    if (query.length === 0) {
      yield failedEvent(
        request.runId,
        new EngineRpcError("EMPTY_SEARCH_QUERY", "Enter a search query first."),
      );
      return;
    }

    try {
      const searchSettings = await this.loadSearchProviderSettings();
      const activeConfig = await this.loadActiveProviderConfig();
      const config = resolveOpenAIWebSearchConfig(searchSettings, activeConfig);
      if (!(await this.ensureOpenAIHostPermission(config.baseUrl))) {
        throw new EngineRpcError(
          "PROVIDER_PERMISSION_REQUIRED",
          "OpenAI host access is unavailable in this extension build.",
        );
      }

      yield {
        type: "started",
        runId: request.runId,
        query,
        provider: "OpenAI Search",
        createdAt: request.createdAt,
      };

      yield* streamOpenAIWebSearch(request, config, this.fetchFn, options.signal);
    } catch (error) {
      yield failedEvent(request.runId, error);
    }
  }
}

interface OpenAIWebSearchConfig {
  apiKey: string;
  model: string;
  baseUrl: string;
}

async function* streamOpenAIWebSearch(
  request: ClioWebSearchRequest,
  config: OpenAIWebSearchConfig,
  fetchFn: typeof fetch,
  signal?: AbortSignal,
): AsyncIterable<ClioWebSearchEvent> {
  const response = await fetchFn(`${config.baseUrl.replace(/\/$/, "")}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      input: request.query,
      include: ["web_search_call.action.sources"],
      tools: [{ type: "web_search" }],
      tool_choice: "required",
      stream: true,
    }),
    signal,
  });

  if (!response.ok) {
    throw new EngineRpcError(
      response.status === 401 || response.status === 403 ? "PROVIDER_AUTH_ERROR" : "PROVIDER_ERROR",
      `OpenAI Search failed with HTTP ${response.status}.`,
      await safeReadText(response),
    );
  }

  const collector = createResponseCollector(request);
  if (response.body === null) {
    const parsed = parseOpenAIResponseJson(await safeReadText(response));
    collector.applyFinalResponse(parsed);
    yield completedEvent(collector);
    return;
  }

  for await (const event of parseSseStream(response.body)) {
    if (event === "[DONE]") continue;
    const parsed = safeJsonParse(event);
    if (!isRecord(parsed)) continue;
    const deltas = collector.applyEvent(parsed);
    for (const delta of deltas) {
      yield { type: "answer_delta", runId: request.runId, delta };
    }
  }

  yield completedEvent(collector);
}

function createResponseCollector(request: ClioWebSearchRequest) {
  let answer = "";
  const sources = new Map<string, ClioWebSource>();

  function addDelta(delta: string) {
    answer += delta;
    return delta;
  }

  function addSources(nextSources: ClioWebSource[]) {
    for (const source of nextSources) {
      if (!sources.has(source.url)) sources.set(source.url, source);
    }
  }

  return {
    applyEvent(event: Record<string, unknown>) {
      const deltas: string[] = [];
      const type = typeof event.type === "string" ? event.type : "";
      if (type === "response.output_text.delta" && typeof event.delta === "string") {
        deltas.push(addDelta(event.delta));
      }
      if (type === "response.output_text.annotation.added") {
        addSources(extractSources(event.annotation));
      }
      if (type === "response.completed" || type === "response.done") {
        this.applyFinalResponse(event.response);
      }
      if (type === "response.failed" || type === "error") {
        throw new EngineRpcError(
          "PROVIDER_ERROR",
          "OpenAI Search could not complete the search.",
          stringifyUnknown(event.error ?? event),
        );
      }
      return deltas;
    },
    applyFinalResponse(response: unknown) {
      const finalText = extractOutputText(response);
      if (finalText.length > answer.length) answer = finalText;
      addSources(extractSources(response));
    },
    result(): ClioWebSearchResult {
      return {
        id: `search_${request.runId}`,
        runId: request.runId,
        query: request.query.trim(),
        answer: answer.trim(),
        sources: Array.from(sources.values()),
        provider: "OpenAI Search",
        createdAt: request.createdAt,
        completedAt: new Date().toISOString(),
      };
    },
  };
}

function completedEvent(collector: ReturnType<typeof createResponseCollector>): ClioWebSearchEvent {
  return {
    type: "completed",
    runId: collector.result().runId,
    result: collector.result(),
  };
}

async function* parseSseStream(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split(/\r?\n\r?\n/);
      buffer = parts.pop() ?? "";
      for (const part of parts) {
        const data = part
          .split(/\r?\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n")
          .trim();
        if (data.length > 0) yield data;
      }
    }
    buffer += decoder.decode();
    if (buffer.trim().length > 0) {
      const data = buffer
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n")
        .trim();
      if (data.length > 0) yield data;
    }
  } finally {
    reader.releaseLock();
  }
}

function extractOutputText(value: unknown): string {
  if (!isRecord(value)) return "";
  if (typeof value.output_text === "string") return value.output_text;
  const output = value.output;
  if (!Array.isArray(output)) return "";
  return output
    .flatMap((item) => {
      if (!isRecord(item) || !Array.isArray(item.content)) return [];
      return item.content.flatMap((part) => {
        if (!isRecord(part)) return [];
        if (typeof part.text === "string") return [part.text];
        if (typeof part.output_text === "string") return [part.output_text];
        return [];
      });
    })
    .join("");
}

function extractSources(value: unknown): ClioWebSource[] {
  const sourceCandidates = [...collectAnnotations(value), ...collectSourceObjects(value)];
  return sourceCandidates.flatMap((candidate, index) => {
    const citation = normalizeUrlCitation(candidate);
    if (citation === undefined) return [];
    return [
      {
        id: `src_${index + 1}_${hashSourceUrl(citation.url)}`,
        title: citation.title || fallbackSourceTitle(citation.url),
        url: citation.url,
        domain: domainFromUrl(citation.url),
        snippet: citation.snippet,
      },
    ];
  });
}

function collectAnnotations(value: unknown): Record<string, unknown>[] {
  const annotations: Record<string, unknown>[] = [];
  const visit = (item: unknown) => {
    if (Array.isArray(item)) {
      for (const child of item) visit(child);
      return;
    }
    if (!isRecord(item)) return;
    if (Array.isArray(item.annotations)) visit(item.annotations);
    if (item.type === "url_citation" || isRecord(item.url_citation)) annotations.push(item);
    for (const key of ["action", "content", "message", "output", "response"]) {
      if (key in item) visit(item[key]);
    }
  };
  visit(value);
  return annotations;
}

function collectSourceObjects(value: unknown): Record<string, unknown>[] {
  const sources: Record<string, unknown>[] = [];
  const visit = (item: unknown) => {
    if (Array.isArray(item)) {
      for (const child of item) visit(child);
      return;
    }
    if (!isRecord(item)) return;
    if (Array.isArray(item.sources)) visit(item.sources);
    if (typeof item.url === "string") sources.push(item);
    for (const key of ["action", "content", "message", "output", "response"]) {
      if (key in item) visit(item[key]);
    }
  };
  visit(value);
  return sources;
}

function normalizeUrlCitation(annotation: Record<string, unknown>) {
  const nested = isRecord(annotation.url_citation) ? annotation.url_citation : annotation;
  const url = typeof nested.url === "string" ? nested.url : undefined;
  if (url === undefined || !isHttpUrl(url)) return undefined;
  return {
    url,
    title: typeof nested.title === "string" ? nested.title : "",
    snippet:
      typeof nested.snippet === "string"
        ? nested.snippet
        : typeof nested.text === "string"
          ? nested.text
          : "",
  };
}

function failedEvent(runId: string, error: unknown): ClioWebSearchEvent {
  if (error instanceof EngineRpcError) {
    return {
      type: "failed",
      runId,
      error: { code: error.code, message: error.message, detail: error.detail },
    };
  }
  const info = classifyProviderError(error, "OpenAI Search");
  return { type: "failed", runId, error: info };
}

async function safeReadText(response: Response) {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

function parseOpenAIResponseJson(value: string) {
  return safeJsonParse(value);
}

function safeJsonParse(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function stringifyUnknown(value: unknown) {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function isHttpUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function domainFromUrl(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
}

function fallbackSourceTitle(value: string) {
  return domainFromUrl(value) || "Source";
}

function hashSourceUrl(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
