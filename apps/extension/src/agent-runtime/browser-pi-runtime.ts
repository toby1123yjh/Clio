import { streamGoogle } from "@earendil-works/pi-ai/google";
import { CitationMarkerParser } from "./citation-markers";
import { buildClioUserPrompt, clioAgentSystemPrompt } from "./clio-context";
import { googleModel } from "./google-model";
import { classifyProviderError } from "./provider-errors";
import type { AgentChatRequest, AgentErrorInfo, AgentStreamEvent, IAgentRuntime } from "./types";

interface PiUserMessage {
  role: "user";
  content: string;
  timestamp: number;
}

interface PiContext {
  systemPrompt?: string;
  messages: PiUserMessage[];
}

export type BrowserPiStreamEvent =
  | { type: "start" }
  | { type: "text_delta"; delta: string }
  | { type: "done" }
  | { type: "error"; reason: "aborted" | "error"; error?: { errorMessage?: string } }
  | { type: string; delta?: string; reason?: string; error?: { errorMessage?: string } };

export type BrowserPiStreamFn = (
  model: ReturnType<typeof googleModel>,
  context: PiContext,
  options?: {
    apiKey?: string;
    signal?: AbortSignal;
    maxRetries?: number;
    maxTokens?: number;
    temperature?: number;
  },
) => AsyncIterable<BrowserPiStreamEvent>;

export interface BrowserPiAgentRuntimeOptions {
  loadConfig: () => Promise<{ apiKey: string; model: string } | undefined>;
  ensureGeminiPermission: () => Promise<boolean>;
  streamFn?: BrowserPiStreamFn;
}

const defaultStreamFn = streamGoogle as unknown as BrowserPiStreamFn;

export class BrowserPiAgentRuntime implements IAgentRuntime {
  private readonly loadConfig: BrowserPiAgentRuntimeOptions["loadConfig"];
  private readonly ensureGeminiPermission: BrowserPiAgentRuntimeOptions["ensureGeminiPermission"];
  private readonly streamFn: BrowserPiStreamFn;

  constructor(options: BrowserPiAgentRuntimeOptions) {
    this.loadConfig = options.loadConfig;
    this.ensureGeminiPermission = options.ensureGeminiPermission;
    this.streamFn = options.streamFn ?? defaultStreamFn;
  }

  async *streamChat(
    request: AgentChatRequest,
    options: { signal?: AbortSignal } = {},
  ): AsyncIterable<AgentStreamEvent> {
    yield { type: "run_started", runId: request.runId };

    const config = await this.loadConfig();
    if (config === undefined) {
      yield {
        type: "run_failed",
        runId: request.runId,
        error: setupRequiredError(),
      };
      return;
    }

    const permissionGranted = await this.ensureGeminiPermission();
    if (!permissionGranted) {
      yield {
        type: "run_failed",
        runId: request.runId,
        error: {
          code: "PROVIDER_PERMISSION_REQUIRED",
          message: "Gemini host access is unavailable in this extension build.",
        },
      };
      return;
    }

    const markerParser = new CitationMarkerParser(
      request.providerContext?.evidence ?? request.evidence,
    );
    const context = buildGeminiContext(request);

    try {
      const stream = this.streamFn(googleModel(config.model), context, {
        apiKey: config.apiKey,
        signal: options.signal,
        maxRetries: 0,
        maxTokens: 1200,
        temperature: 0.2,
      });

      for await (const event of stream) {
        if (options.signal?.aborted) {
          yield {
            type: "run_cancelled",
            runId: request.runId,
            reason: "User stopped the response.",
          };
          return;
        }

        if (event.type === "text_delta" && typeof event.delta === "string") {
          yield* markerParser.push(request.runId, event.delta);
          continue;
        }

        if (event.type === "done") {
          yield* markerParser.flush(request.runId);
          yield { type: "run_completed", runId: request.runId };
          return;
        }

        if (event.type === "error") {
          if (event.reason === "aborted" || options.signal?.aborted) {
            yield {
              type: "run_cancelled",
              runId: request.runId,
              reason: "User stopped the response.",
            };
            return;
          }
          yield {
            type: "run_failed",
            runId: request.runId,
            error: classifyProviderError(event.error?.errorMessage),
          };
          return;
        }
      }

      yield* markerParser.flush(request.runId);
      yield { type: "run_completed", runId: request.runId };
    } catch (error) {
      if (options.signal?.aborted) {
        yield {
          type: "run_cancelled",
          runId: request.runId,
          reason: "User stopped the response.",
        };
        return;
      }
      yield {
        type: "run_failed",
        runId: request.runId,
        error: classifyProviderError(error),
      };
    }
  }
}

export async function testGeminiProviderConnection(options: {
  apiKey: string;
  model: string;
  streamFn?: BrowserPiStreamFn;
  signal?: AbortSignal;
}) {
  const streamFn = options.streamFn ?? defaultStreamFn;
  const stream = streamFn(
    googleModel(options.model),
    {
      systemPrompt: "You are a connection test. Reply with one short sentence.",
      messages: [
        {
          role: "user",
          content: "Reply with: Clio Gemini connection ok.",
          timestamp: Date.now(),
        },
      ],
    },
    {
      apiKey: options.apiKey,
      signal: options.signal,
      maxRetries: 0,
      maxTokens: 32,
      temperature: 0,
    },
  );

  for await (const event of stream) {
    if (event.type === "done") return { ok: true as const };
    if (event.type === "error") {
      throw providerErrorFromInfo(classifyProviderError(event.error?.errorMessage));
    }
  }
  return { ok: true as const };
}

export function buildGeminiContext(request: AgentChatRequest): PiContext {
  return {
    systemPrompt: clioAgentSystemPrompt,
    messages: [
      {
        role: "user",
        timestamp: Date.parse(request.createdAt) || Date.now(),
        content: buildClioUserPrompt(request),
      },
    ],
  };
}

function setupRequiredError(): AgentErrorInfo {
  return {
    code: "PROVIDER_CONFIG_REQUIRED",
    message: "Set up Gemini in Clio Settings, then retry.",
  };
}

function providerErrorFromInfo(info: AgentErrorInfo) {
  const error = new Error(info.message);
  error.name = info.code;
  return error;
}
