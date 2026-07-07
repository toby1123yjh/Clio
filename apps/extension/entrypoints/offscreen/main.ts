import { AgentRunHost } from "@/src/agent-runtime/agent-run-host";
import { PiAgentCompactionRuntime } from "@/src/agent-runtime/compaction-context";
import { ClioEmbeddingProviderRuntime } from "@/src/agent-runtime/embedding-provider-runtime";
import { ProviderBackedFigureVisionAnalyzer } from "@/src/agent-runtime/figure-vision-analyzer";
import { ClioImageGenerationRuntime } from "@/src/agent-runtime/image-generation-runtime";
import { PiAgentCoreRunAdapter } from "@/src/agent-runtime/pi-agent-core-run-adapter";
import { type ProviderId, defaultActiveProvider } from "@/src/agent-runtime/provider-settings";
import { ProviderBackedSemanticCitationJudge } from "@/src/agent-runtime/semantic-citation-judge";
import { ClioWebToolRuntime } from "@/src/agent-runtime/web-search-runtime";
import engineWorkerUrl from "@/src/engine/local-engine.worker.ts?worker&url";
import { installPhase0PocHost } from "@/src/phase0/poc-host";
import { requestProvider, requestProviderConfig } from "@/src/shared/chrome-client";
import {
  type AgentRunRequest,
  CLIO_AGENT_RUN_EVENT,
  CLIO_IMAGE_GENERATION_RUN_EVENT,
  CLIO_WEB_SEARCH_RUN_EVENT,
  CLIO_WORKER_EMBEDDING_RESPONSE,
  CLIO_WORKER_REQUEST,
  CLIO_WORKER_VISION_ANALYSIS_RESPONSE,
  type ClioImageGenerationEvent,
  type ClioWebSearchEvent,
  type EngineRequest,
  type EngineResponse,
  type ImageGenerationRunRequest,
  type WebSearchRunRequest,
  createRequestId,
  engineErrorFromUnknown,
  isAgentRunRequestMessage,
  isImageGenerationRunRequestMessage,
  isOffscreenRequestMessage,
  isWebSearchRunRequestMessage,
  isWorkerEmbeddingRequestMessage,
  isWorkerResponseMessage,
  isWorkerVisionAnalysisRequestMessage,
  unwrapEngineResponse,
} from "@/src/shared/rpc";

console.info("clio:offscreen local engine host loaded");

installPhase0PocHost("offscreen");

let worker: Worker | null = null;
const agentRunHost = new AgentRunHost({
  runtime: new PiAgentCoreRunAdapter({
    loadConfig: () => requestProviderConfig(),
    loadProviderId: async () => (await requestProviderConfig())?.provider ?? defaultActiveProvider,
    ensureProviderPermission: (provider, config) => hasProviderHostPermission(provider, config),
  }),
  semanticCitationJudge: new ProviderBackedSemanticCitationJudge({
    loadConfig: () => requestProviderConfig(),
    loadProviderId: async () => (await requestProviderConfig())?.provider ?? defaultActiveProvider,
    ensureProviderPermission: (provider, config) => hasProviderHostPermission(provider, config),
  }),
  compactionRuntime: new PiAgentCompactionRuntime({
    loadConfig: () => requestProviderConfig(),
    loadProviderId: async () => (await requestProviderConfig())?.provider ?? defaultActiveProvider,
    ensureProviderPermission: (provider, config) => hasProviderHostPermission(provider, config),
  }),
  requestEngine: requestEngineValue,
  emitEvent: (event) => {
    void chrome.runtime
      .sendMessage({
        type: CLIO_AGENT_RUN_EVENT,
        event,
      })
      .catch((error) => {
        console.debug(
          "clio:offscreen agent event route failed",
          engineErrorFromUnknown(error).message,
        );
      });
  },
});
const webToolRuntime = new ClioWebToolRuntime({
  loadSearchProviderSettings: () => requestProvider({ kind: "getSearchProviderSettings" }),
  loadActiveProviderConfig: () => requestProviderConfig(),
  ensureOpenAIHostPermission: (baseUrl) =>
    requestProvider({ kind: "ensureOpenAIHostPermission", baseUrl })
      .then(() => true)
      .catch(() => false),
  ensureOpenAICompatibleHostPermission: (baseUrl) =>
    requestProvider({ kind: "ensureOpenAICompatibleHostPermission", baseUrl })
      .then(() => true)
      .catch(() => false),
});
const imageGenerationRuntime = new ClioImageGenerationRuntime({
  loadImageGenerationSettings: () => requestProvider({ kind: "getImageGenerationSettings" }),
  loadActiveProviderConfig: () => requestProviderConfig(),
  ensureImageHostPermission: (baseUrl) =>
    requestProvider({ kind: "ensureImageGenerationHostPermission", baseUrl })
      .then(() => true)
      .catch(() => false),
});
const embeddingProviderRuntime = new ClioEmbeddingProviderRuntime({
  loadEmbeddingProviderSettings: () => requestProvider({ kind: "getEmbeddingProviderSettings" }),
  ensureOpenAIHostPermission: (baseUrl) =>
    requestProvider({
      kind: "ensureEmbeddingProviderHostPermission",
      provider: "openai",
      baseUrl,
    })
      .then(() => true)
      .catch(() => false),
  ensureOpenAICompatibleHostPermission: (baseUrl) =>
    requestProvider({
      kind: "ensureEmbeddingProviderHostPermission",
      provider: "openai-compatible",
      baseUrl,
    })
      .then(() => true)
      .catch(() => false),
});
const figureVisionAnalyzer = new ProviderBackedFigureVisionAnalyzer({
  loadVisionProviderSettings: () => requestProvider({ kind: "getVisionProviderSettings" }),
  loadActiveProviderConfig: () => requestProviderConfig(),
  ensureProviderPermission: (provider, config) => hasVisionProviderHostPermission(provider, config),
});
const activeImageGenerationRuns = new Map<string, AbortController>();

function hasProviderHostPermission(
  provider: ProviderId,
  config?: Awaited<ReturnType<typeof requestProviderConfig>>,
) {
  if (provider === "openai") {
    return requestProvider({
      kind: "ensureOpenAIHostPermission",
      baseUrl: config?.provider === "openai" ? config.baseUrl : undefined,
    })
      .then(() => true)
      .catch(() => false);
  }
  if (provider === "openai-compatible") {
    return requestProvider({
      kind: "ensureOpenAICompatibleHostPermission",
      baseUrl: config?.provider === "openai-compatible" ? config.baseUrl : undefined,
    })
      .then(() => true)
      .catch(() => false);
  }
  return requestProvider({ kind: "ensureGeminiHostPermission" })
    .then(() => true)
    .catch(() => false);
}

function hasVisionProviderHostPermission(
  provider: ProviderId,
  config?: Awaited<ReturnType<typeof requestProviderConfig>>,
) {
  const baseUrl =
    provider === "openai" && config?.provider === "openai"
      ? config.baseUrl
      : provider === "openai-compatible" && config?.provider === "openai-compatible"
        ? config.baseUrl
        : undefined;
  return requestProvider({
    kind: "ensureVisionProviderHostPermission",
    provider,
    ...(baseUrl === undefined ? {} : { baseUrl }),
  })
    .then(() => true)
    .catch(() => false);
}

const pending = new Map<
  string,
  {
    resolve: (response: EngineResponse) => void;
    reject: (error: Error) => void;
    timer: number;
  }
>();

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (isAgentRunRequestMessage(message)) {
    handleAgentRunRequest(message.request)
      .then(() => sendResponse({ ok: true, value: { accepted: true } }))
      .catch((error) =>
        sendResponse({
          ok: false,
          error: engineErrorFromUnknown(error, "OFFSCREEN_AGENT_RUN_ERROR"),
        }),
      );
    return true;
  }

  if (isWebSearchRunRequestMessage(message)) {
    handleWebSearchRunRequest(message.request)
      .then(() => sendResponse({ ok: true, value: { accepted: true } }))
      .catch((error) =>
        sendResponse({
          ok: false,
          error: engineErrorFromUnknown(error, "OFFSCREEN_WEB_SEARCH_ERROR"),
        }),
      );
    return true;
  }

  if (isImageGenerationRunRequestMessage(message)) {
    handleImageGenerationRunRequest(message.request)
      .then(() => sendResponse({ ok: true, value: { accepted: true } }))
      .catch((error) =>
        sendResponse({
          ok: false,
          error: engineErrorFromUnknown(error, "OFFSCREEN_IMAGE_GENERATION_ERROR"),
        }),
      );
    return true;
  }

  if (!isOffscreenRequestMessage(message)) return false;

  requestEngine(message.request)
    .then((response) => sendResponse(response))
    .catch((error) =>
      sendResponse({
        ok: false,
        error: engineErrorFromUnknown(error, "OFFSCREEN_ENGINE_ERROR"),
      }),
    );
  return true;
});

function handleAgentRunRequest(request: AgentRunRequest) {
  switch (request.kind) {
    case "start":
      agentRunHost.start(request.request);
      return Promise.resolve();
    case "subscribe":
      return agentRunHost.subscribe({
        runId: request.runId,
        sessionId: request.sessionId,
        assistantMessageId: request.assistantMessageId,
      });
    case "compact":
      agentRunHost.startManualCompact({
        runId: request.runId,
        sessionId: request.sessionId,
      });
      return Promise.resolve();
    case "cancel":
      agentRunHost.cancel(request.runId);
      return Promise.resolve();
    default:
      return assertNever(request);
  }
}

function handleWebSearchRunRequest(request: WebSearchRunRequest) {
  switch (request.kind) {
    case "start":
      void pumpWebSearch(request.request);
      return Promise.resolve();
  }
}

function handleImageGenerationRunRequest(request: ImageGenerationRunRequest) {
  switch (request.kind) {
    case "start":
      if (activeImageGenerationRuns.has(request.request.runId)) {
        return Promise.resolve();
      }
      void pumpImageGeneration(request.request);
      return Promise.resolve();
    case "cancel":
      activeImageGenerationRuns.get(request.runId)?.abort();
      return Promise.resolve();
    default:
      return assertNever(request);
  }
}

async function pumpWebSearch(request: import("@/src/shared/rpc").ClioWebSearchRequest) {
  for await (const event of webToolRuntime.searchWeb(request)) {
    if (event.type === "completed") {
      await requestEngineValue({
        kind: "appendWebSearchHistory",
        payload: {
          id: event.result.id,
          query: event.result.query,
          answer: event.result.answer,
          sources: event.result.sources,
          provider: event.result.provider,
          createdAt: event.result.createdAt,
        },
      }).catch(() => undefined);
    }
    emitWebSearchEvent(event);
  }
}

async function pumpImageGeneration(request: import("@/src/shared/rpc").ClioImageGenerationRequest) {
  const controller = new AbortController();
  activeImageGenerationRuns.set(request.runId, controller);
  try {
    for await (const event of imageGenerationRuntime.generateImage(request, {
      signal: controller.signal,
    })) {
      if (event.type === "completed") {
        await requestEngineValue({
          kind: "appendImageGenerationHistory",
          payload: {
            id: event.result.id,
            mode: event.result.mode,
            prompt: event.result.prompt,
            model: event.result.model,
            size: event.result.size,
            provider: event.result.provider,
            createdAt: event.result.createdAt,
            output: event.result.output,
            ...(event.result.input === undefined ? {} : { input: event.result.input }),
          },
        }).catch(() => undefined);
      }
      emitImageGenerationEvent(event);
    }
  } finally {
    activeImageGenerationRuns.delete(request.runId);
  }
}

function emitWebSearchEvent(event: ClioWebSearchEvent) {
  void chrome.runtime
    .sendMessage({
      type: CLIO_WEB_SEARCH_RUN_EVENT,
      event,
    })
    .catch(() => undefined);
}

function emitImageGenerationEvent(event: ClioImageGenerationEvent) {
  void chrome.runtime
    .sendMessage({
      type: CLIO_IMAGE_GENERATION_RUN_EVENT,
      event,
    })
    .catch(() => undefined);
}

function requestEngine(request: EngineRequest) {
  const engineWorker = ensureWorker();
  const requestId = createRequestId();
  return new Promise<EngineResponse>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      pending.delete(requestId);
      reject(new Error("Local engine request timed out."));
    }, 30_000);
    pending.set(requestId, { resolve, reject, timer });
    engineWorker.postMessage({
      type: CLIO_WORKER_REQUEST,
      requestId,
      request,
    });
  });
}

async function requestEngineValue<T>(request: EngineRequest) {
  const response = (await requestEngine(request)) as EngineResponse<T>;
  return unwrapEngineResponse(response);
}

function ensureWorker() {
  if (worker !== null) return worker;
  worker = new Worker(new URL(engineWorkerUrl, location.href), {
    name: "clio-local-engine",
    type: "module",
  });
  worker.addEventListener("message", (event: MessageEvent<unknown>) => {
    if (isWorkerEmbeddingRequestMessage(event.data)) {
      void handleWorkerEmbeddingRequest(worker as Worker, event.data);
      return;
    }
    if (isWorkerVisionAnalysisRequestMessage(event.data)) {
      void handleWorkerVisionAnalysisRequest(worker as Worker, event.data);
      return;
    }
    if (!isWorkerResponseMessage(event.data)) return;
    const entry = pending.get(event.data.requestId);
    if (entry === undefined) return;
    clearTimeout(entry.timer);
    pending.delete(event.data.requestId);
    entry.resolve(event.data.response);
  });
  worker.addEventListener("error", (event) => {
    for (const [requestId, entry] of pending) {
      clearTimeout(entry.timer);
      entry.reject(event.error ?? new Error(event.message));
      pending.delete(requestId);
    }
  });
  return worker;
}

async function handleWorkerEmbeddingRequest(
  engineWorker: Worker,
  message: import("@/src/shared/rpc").WorkerEmbeddingRequestMessage,
) {
  try {
    const vectors = await embeddingProviderRuntime.embedTexts(
      message.request.modelId,
      message.request.inputs,
    );
    engineWorker.postMessage({
      type: CLIO_WORKER_EMBEDDING_RESPONSE,
      requestId: message.requestId,
      response: { ok: true, value: vectors },
    });
  } catch (error) {
    engineWorker.postMessage({
      type: CLIO_WORKER_EMBEDDING_RESPONSE,
      requestId: message.requestId,
      response: {
        ok: false,
        error: engineErrorFromUnknown(error, "EMBEDDING_PROVIDER_ERROR"),
      },
    });
  }
}

async function handleWorkerVisionAnalysisRequest(
  engineWorker: Worker,
  message: import("@/src/shared/rpc").WorkerVisionAnalysisRequestMessage,
) {
  try {
    const result = await figureVisionAnalyzer.analyze(message.request);
    engineWorker.postMessage({
      type: CLIO_WORKER_VISION_ANALYSIS_RESPONSE,
      requestId: message.requestId,
      response: { ok: true, value: result },
    });
  } catch (error) {
    engineWorker.postMessage({
      type: CLIO_WORKER_VISION_ANALYSIS_RESPONSE,
      requestId: message.requestId,
      response: {
        ok: false,
        error: engineErrorFromUnknown(error, "FIGURE_VISION_PROVIDER_ERROR"),
      },
    });
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled agent run request: ${JSON.stringify(value)}`);
}
