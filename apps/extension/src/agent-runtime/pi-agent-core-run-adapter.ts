import {
  Agent,
  type AgentEvent,
  type AgentMessage,
  type StreamFn,
  type ThinkingLevel,
} from "@earendil-works/pi-agent-core";
import type { AssistantMessage, Message } from "@earendil-works/pi-ai";
import { streamSimpleGoogle } from "@earendil-works/pi-ai/google";
import { streamSimpleOpenAICompletions } from "@earendil-works/pi-ai/openai-completions";
import { streamSimpleOpenAIResponses } from "@earendil-works/pi-ai/openai-responses";
import { CitationMarkerParser } from "./citation-markers";
import { buildClioUserPrompt, clioAgentSystemPrompt } from "./clio-context";
import { classifyProviderError } from "./provider-errors";
import { modelForProvider, providerLabel } from "./provider-runtime";
import {
  type ProviderId,
  type StoredProviderConfig,
  defaultActiveProvider,
} from "./provider-settings";
import type { AgentChatRequest, AgentStreamEvent, IAgentRuntime } from "./types";

export interface PiAgentCoreRunAdapterOptions {
  loadConfig: () => Promise<StoredProviderConfig | undefined>;
  loadProviderId?: () => Promise<ProviderId>;
  ensureProviderPermission: (
    provider: ProviderId,
    config?: StoredProviderConfig,
  ) => Promise<boolean>;
  streamFn?: StreamFn;
}

const defaultStreamFn: StreamFn = (model, context, options) => {
  const streamOptions = {
    ...options,
    maxRetries: 0,
    maxTokens: 1200,
    temperature: 0.2,
  };
  if (model.api === "openai-completions") {
    return streamSimpleOpenAICompletions(
      model as Parameters<typeof streamSimpleOpenAICompletions>[0],
      context,
      streamOptions,
    );
  }
  if (model.api === "openai-responses") {
    return streamSimpleOpenAIResponses(
      model as Parameters<typeof streamSimpleOpenAIResponses>[0],
      context,
      streamOptions,
    );
  }
  return streamSimpleGoogle(
    model as Parameters<typeof streamSimpleGoogle>[0],
    context,
    streamOptions,
  );
};

export class PiAgentCoreRunAdapter implements IAgentRuntime {
  private readonly loadConfig: PiAgentCoreRunAdapterOptions["loadConfig"];
  private readonly loadProviderId: () => Promise<ProviderId>;
  private readonly ensureProviderPermission: PiAgentCoreRunAdapterOptions["ensureProviderPermission"];
  private readonly streamFn: StreamFn;

  constructor(options: PiAgentCoreRunAdapterOptions) {
    this.loadConfig = options.loadConfig;
    this.loadProviderId = options.loadProviderId ?? (async () => defaultActiveProvider);
    this.ensureProviderPermission = options.ensureProviderPermission;
    this.streamFn = options.streamFn ?? defaultStreamFn;
  }

  async *streamChat(
    request: AgentChatRequest,
    options: { signal?: AbortSignal } = {},
  ): AsyncIterable<AgentStreamEvent> {
    yield { type: "run_started", runId: request.runId };

    const config = await this.loadConfig();
    const provider = config?.provider ?? (await this.loadProviderId());
    const label = providerLabel(provider);
    if (config === undefined) {
      yield {
        type: "run_failed",
        runId: request.runId,
        error: {
          code: "PROVIDER_CONFIG_REQUIRED",
          message: `Set up ${label} in Clio Settings, then retry.`,
        },
      };
      return;
    }

    const permissionGranted = await this.ensureProviderPermission(provider, config);
    if (!permissionGranted) {
      yield {
        type: "run_failed",
        runId: request.runId,
        error: {
          code: "PROVIDER_PERMISSION_REQUIRED",
          message: `Provider host access for ${label} is unavailable in this extension build.`,
        },
      };
      return;
    }

    const queue = new AsyncEventQueue<AgentStreamEvent>();
    const markerParser = new CitationMarkerParser(
      request.providerContext?.evidence ?? request.evidence,
    );
    let terminalEventEmitted = false;

    const emit = (event: AgentStreamEvent) => {
      if (isTerminalAgentEvent(event)) terminalEventEmitted = true;
      queue.push(event);
    };
    const flushMarkers = () => {
      for (const event of markerParser.flush(request.runId)) {
        emit(event);
      }
    };
    const emitTerminal = (event: AgentStreamEvent) => {
      if (terminalEventEmitted) return;
      flushMarkers();
      emit(event);
    };

    const model = modelForProvider(config);
    const agent = new Agent({
      sessionId: request.sessionId,
      streamFn: this.streamFn,
      getApiKey: async () => config.apiKey,
      followUpMode: "one-at-a-time",
      steeringMode: "one-at-a-time",
      convertToLlm,
      initialState: {
        systemPrompt: clioAgentSystemPrompt,
        model,
        thinkingLevel: thinkingLevelForModel(model),
        messages: [],
        tools: [],
      },
    });

    const unsubscribe = agent.subscribe((event) => {
      handleAgentEvent(request.runId, event, markerParser, emit, emitTerminal, label);
    });
    const abort = () => agent.abort();
    options.signal?.addEventListener("abort", abort, { once: true });

    void agent
      .prompt({
        role: "user",
        content: buildClioUserPrompt(request),
        timestamp: Date.parse(request.createdAt) || Date.now(),
      })
      .catch((error) => {
        emitTerminal({
          type: "run_failed",
          runId: request.runId,
          error: classifyProviderError(error, label),
        });
      })
      .finally(() => {
        unsubscribe();
        options.signal?.removeEventListener("abort", abort);
        queue.close();
      });

    for await (const event of queue) {
      yield event;
    }
  }
}

function handleAgentEvent(
  runId: string,
  event: AgentEvent,
  markerParser: CitationMarkerParser,
  emit: (event: AgentStreamEvent) => void,
  emitTerminal: (event: AgentStreamEvent) => void,
  label: string,
) {
  if (event.type === "message_update") {
    if (event.assistantMessageEvent.type === "text_delta") {
      for (const next of markerParser.push(runId, event.assistantMessageEvent.delta)) {
        emit(next);
      }
      return;
    }
    if (event.assistantMessageEvent.type === "thinking_delta") {
      emit({ type: "thinking_delta", runId, delta: event.assistantMessageEvent.delta });
      return;
    }
    if (event.assistantMessageEvent.type === "toolcall_end") {
      emit({
        type: "tool_trace",
        runId,
        trace: {
          toolCallId: event.assistantMessageEvent.toolCall.id,
          toolName: event.assistantMessageEvent.toolCall.name,
          status: "running",
        },
      });
      return;
    }
  }

  if (event.type === "tool_execution_start") {
    emit({
      type: "tool_trace",
      runId,
      trace: {
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        status: "running",
      },
    });
    return;
  }

  if (event.type === "tool_execution_update") {
    emit({
      type: "tool_trace",
      runId,
      trace: {
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        status: "running",
        summary: summarizeToolOutput(event.partialResult),
      },
    });
    return;
  }

  if (event.type === "tool_execution_end") {
    emit({
      type: "tool_trace",
      runId,
      trace: {
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        status: event.isError ? "failed" : "completed",
        summary: summarizeToolOutput(event.result),
      },
    });
    return;
  }

  if (event.type !== "message_end" || !isAssistantMessage(event.message)) return;

  if (event.message.stopReason === "aborted") {
    emitTerminal({
      type: "run_cancelled",
      runId,
      reason: "User stopped the response.",
    });
    return;
  }

  if (event.message.stopReason === "error") {
    emitTerminal({
      type: "run_failed",
      runId,
      error: classifyProviderError(event.message.errorMessage, label),
    });
    return;
  }

  emitTerminal({ type: "run_completed", runId });
}

function thinkingLevelForModel(model: ReturnType<typeof modelForProvider>): ThinkingLevel {
  return model.reasoning ? "minimal" : "off";
}

function summarizeToolOutput(value: unknown) {
  if (typeof value === "string") return truncateTraceSummary(value);
  if (!isRecord(value)) return undefined;

  const content = value.content;
  if (Array.isArray(content)) {
    const text = content
      .map((item) => {
        if (!isRecord(item) || item.type !== "text" || typeof item.text !== "string") return "";
        return item.text;
      })
      .filter((item) => item.length > 0)
      .join(" ");
    if (text.length > 0) return truncateTraceSummary(text);
  }

  const message = value.message;
  if (typeof message === "string") return truncateTraceSummary(message);
  return undefined;
}

function truncateTraceSummary(value: string) {
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length <= 120) return text;
  return `${text.slice(0, 117).trimEnd()}...`;
}

function convertToLlm(messages: AgentMessage[]): Message[] {
  return messages.filter(isLlmMessage);
}

function isLlmMessage(message: AgentMessage): message is Message {
  if (!isRecord(message) || typeof message.role !== "string") return false;
  return message.role === "user" || message.role === "assistant" || message.role === "toolResult";
}

function isAssistantMessage(message: AgentMessage): message is AssistantMessage {
  return isRecord(message) && message.role === "assistant";
}

function isTerminalAgentEvent(event: AgentStreamEvent) {
  return (
    event.type === "run_completed" || event.type === "run_failed" || event.type === "run_cancelled"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

class AsyncEventQueue<T> implements AsyncIterable<T> {
  private readonly values: T[] = [];
  private readonly waiters: Array<(result: IteratorResult<T>) => void> = [];
  private closed = false;

  push(value: T) {
    if (this.closed) return;
    const waiter = this.waiters.shift();
    if (waiter !== undefined) {
      waiter({ value, done: false });
      return;
    }
    this.values.push(value);
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    for (const waiter of this.waiters.splice(0)) {
      waiter({ value: undefined as T, done: true });
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => {
        const value = this.values.shift();
        if (value !== undefined) {
          return Promise.resolve({ value, done: false });
        }
        if (this.closed) {
          return Promise.resolve({ value: undefined as T, done: true });
        }
        return new Promise<IteratorResult<T>>((resolve) => {
          this.waiters.push(resolve);
        });
      },
    };
  }
}
