import { testGeminiProviderConnection } from "@/src/agent-runtime/browser-pi-runtime";
import { hasGeminiHostPermission } from "@/src/agent-runtime/gemini-permission";
import {
  normalizeImageBaseUrl,
  readImageGenerationSettings,
  saveImageGenerationSettings,
} from "@/src/agent-runtime/image-generation-settings";
import {
  hasOpenAICompatibleHostPermission,
  hasOpenAIHostPermission,
} from "@/src/agent-runtime/openai-permission";
import {
  defaultOpenAIBaseUrl,
  defaultOpenAICompatibleBaseUrl,
  normalizeOpenAIBaseUrl,
  normalizeOpenAICompatibleBaseUrl,
} from "@/src/agent-runtime/openai-provider-config";
import {
  testOpenAICompatibleProviderConnection,
  testOpenAIProviderConnection,
} from "@/src/agent-runtime/provider-runtime";
import {
  getProviderSettings,
  normalizeApiKey,
  normalizeModel,
  normalizeProviderName,
  readActiveProviderConfig,
  readGeminiProviderConfig,
  readOpenAICompatibleProviderConfig,
  readOpenAIProviderConfig,
  saveActiveProviderId,
  saveGeminiProviderConfig,
  saveOpenAICompatibleProviderConfig,
  saveOpenAIProviderConfig,
} from "@/src/agent-runtime/provider-settings";
import {
  readSearchProviderSettings,
  saveSearchProviderSettings,
} from "@/src/agent-runtime/search-provider-settings";
import type { AgentStreamEvent } from "@/src/agent-runtime/types";
import {
  type AgentRunRequest,
  type AgentStreamEventMessage,
  CLIO_AGENT_RUN_REQUEST,
  CLIO_AGENT_STREAM_EVENT,
  CLIO_AGENT_STREAM_PORT,
  CLIO_CONTENT_COMMAND,
  CLIO_IMAGE_GENERATION_RUN_REQUEST,
  CLIO_IMAGE_GENERATION_STREAM_EVENT,
  CLIO_IMAGE_GENERATION_STREAM_PORT,
  CLIO_OFFSCREEN_REQUEST,
  CLIO_WEB_SEARCH_RUN_REQUEST,
  CLIO_WEB_SEARCH_STREAM_EVENT,
  CLIO_WEB_SEARCH_STREAM_PORT,
  type ContentCommand,
  type EngineRequest,
  type EngineResponse,
  EngineRpcError,
  type ImageGenerationRunRequest,
  type ImageGenerationStreamEventMessage,
  type ProviderRequest,
  type UiRequest,
  type WebSearchRunRequest,
  type WebSearchStreamEventMessage,
  engineErrorFromUnknown,
  isAgentRunEventMessage,
  isAgentStreamCancelMessage,
  isAgentStreamCompactMessage,
  isAgentStreamRequestMessage,
  isAgentStreamSubscribeMessage,
  isEngineRequestMessage,
  isImageGenerationRunEventMessage,
  isImageGenerationStreamCancelMessage,
  isImageGenerationStreamRequestMessage,
  isProviderConfigRequestMessage,
  isProviderRequestMessage,
  isUiRequestMessage,
  isWebSearchRunEventMessage,
  isWebSearchStreamRequestMessage,
} from "@/src/shared/rpc";

const menuIds = {
  saveSelection: "clio-save-selection",
  savePage: "clio-save-page",
} as const;

type RuntimeWithContexts = typeof chrome.runtime & {
  ContextType?: {
    OFFSCREEN_DOCUMENT: string;
  };
  getContexts?: (filter: { contextTypes?: string[]; documentUrls?: string[] }) => Promise<
    unknown[]
  >;
};

type OffscreenWithHasDocument = typeof chrome.offscreen & {
  hasDocument?: () => Promise<boolean>;
};

type SessionStorageWithAccess = chrome.storage.StorageArea & {
  setAccessLevel?: (options: {
    accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS";
  }) => Promise<void> | void;
};

const agentStreamSubscribers = new Map<string, Map<chrome.runtime.Port, string>>();
const webSearchStreamSubscribers = new Map<string, Map<chrome.runtime.Port, string>>();
const imageGenerationStreamSubscribers = new Map<string, Map<chrome.runtime.Port, string>>();
let pendingOffscreenCreation: Promise<void> | null = null;

export default defineBackground(() => {
  console.info("clio:bg service worker loaded");
  setupSessionStorageAccess();
  chrome.runtime.onInstalled.addListener(() => {
    setupContextMenus();
  });
  setupContextMenus();

  chrome.action.onClicked.addListener((tab) => {
    void sendTabCommand(tab, { action: "toggleRail" });
  });

  chrome.commands.onCommand.addListener((command) => {
    if (command === "save_page") {
      void sendActiveTabCommand({ action: "savePage" });
      return;
    }
    if (command === "open_rail") {
      void sendActiveTabCommand({ action: "openRail" });
      return;
    }
    if (command === "command_palette") {
      void sendActiveTabCommand({ action: "openCommandPalette" });
    }
  });

  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === menuIds.saveSelection) {
      void sendTabCommand(tab, { action: "saveSelection" });
      return;
    }
    if (info.menuItemId === menuIds.savePage) {
      void sendTabCommand(tab, { action: "savePage" });
    }
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (isProviderConfigRequestMessage(message)) {
      readActiveProviderConfig()
        .then((value) => sendResponse({ ok: true, value }))
        .catch((error) =>
          sendResponse({
            ok: false,
            error: providerErrorFromUnknown(error),
          }),
        );
      return true;
    }

    if (isProviderRequestMessage(message)) {
      routeProviderRequest(message.request)
        .then((value) => sendResponse({ ok: true, value }))
        .catch((error) =>
          sendResponse({
            ok: false,
            error: providerErrorFromUnknown(error),
          }),
        );
      return true;
    }

    if (isAgentRunEventMessage(message)) {
      dispatchAgentRunEvent(message.event);
      return false;
    }

    if (isWebSearchRunEventMessage(message)) {
      dispatchWebSearchRunEvent(message.event);
      return false;
    }

    if (isImageGenerationRunEventMessage(message)) {
      dispatchImageGenerationRunEvent(message.event);
      return false;
    }

    if (isUiRequestMessage(message)) {
      routeUiRequest(message.request)
        .then((value) => sendResponse({ ok: true, value }))
        .catch((error) =>
          sendResponse({
            ok: false,
            error: engineErrorFromUnknown(error, "UI_ROUTE_ERROR"),
          }),
        );
      return true;
    }

    if (!isEngineRequestMessage(message)) return false;

    routeEngineRequest(message.request)
      .then((response) => sendResponse(response))
      .catch((error) =>
        sendResponse({
          ok: false,
          error: engineErrorFromUnknown(error, "BACKGROUND_ROUTE_ERROR"),
        }),
      );
    return true;
  });

  chrome.runtime.onConnect.addListener((port) => {
    if (port.name === CLIO_AGENT_STREAM_PORT) {
      handleAgentStreamPort(port);
      return;
    }
    if (port.name === CLIO_WEB_SEARCH_STREAM_PORT) {
      handleWebSearchStreamPort(port);
      return;
    }
    if (port.name === CLIO_IMAGE_GENERATION_STREAM_PORT) {
      handleImageGenerationStreamPort(port);
    }
  });
});

function handleAgentStreamPort(port: chrome.runtime.Port) {
  const subscriptions = new Map<string, string>();

  port.onMessage.addListener((message: unknown) => {
    if (isAgentStreamRequestMessage(message)) {
      subscribePortToRun(port, subscriptions, message.requestId, message.request.runId);
      void routeAgentRunRequest({
        kind: "start",
        request: message.request,
      }).catch((error) => {
        postAgentRunRouteError(port, message.requestId, message.request.runId, error);
      });
      return;
    }
    if (isAgentStreamSubscribeMessage(message)) {
      subscribePortToRun(port, subscriptions, message.requestId, message.runId);
      void routeAgentRunRequest({
        kind: "subscribe",
        runId: message.runId,
        sessionId: message.sessionId,
        assistantMessageId: message.assistantMessageId,
      }).catch((error) => {
        postAgentRunRouteError(port, message.requestId, message.runId, error);
      });
      return;
    }
    if (isAgentStreamCompactMessage(message)) {
      subscribePortToRun(port, subscriptions, message.requestId, message.runId);
      void routeAgentRunRequest({
        kind: "compact",
        runId: message.runId,
        sessionId: message.sessionId,
      }).catch((error) => {
        postAgentRunRouteError(port, message.requestId, message.runId, error);
      });
      return;
    }
    if (isAgentStreamCancelMessage(message)) {
      const runId = subscriptions.get(message.requestId);
      if (runId === undefined) return;
      void routeAgentRunRequest({ kind: "cancel", runId }).catch((error) => {
        console.debug("clio:bg agent cancel route failed", engineErrorFromUnknown(error).message);
      });
    }
  });

  port.onDisconnect.addListener(() => {
    for (const [requestId, runId] of subscriptions) {
      const runSubscribers = agentStreamSubscribers.get(runId);
      runSubscribers?.delete(port);
      if (runSubscribers?.size === 0) {
        agentStreamSubscribers.delete(runId);
      }
      subscriptions.delete(requestId);
    }
  });
}

function subscribePortToRun(
  port: chrome.runtime.Port,
  subscriptions: Map<string, string>,
  requestId: string,
  runId: string,
) {
  subscriptions.set(requestId, runId);
  let subscribers = agentStreamSubscribers.get(runId);
  if (subscribers === undefined) {
    subscribers = new Map();
    agentStreamSubscribers.set(runId, subscribers);
  }
  subscribers.set(port, requestId);
}

function dispatchAgentRunEvent(event: AgentStreamEvent) {
  const subscribers = agentStreamSubscribers.get(event.runId);
  if (subscribers === undefined) return;
  for (const [port, requestId] of subscribers) {
    postAgentStreamEvent(port, requestId, event);
  }
  if (isTerminalAgentEvent(event)) {
    agentStreamSubscribers.delete(event.runId);
  }
}

function postAgentRunRouteError(
  port: chrome.runtime.Port,
  requestId: string,
  runId: string,
  error: unknown,
) {
  const detail = engineErrorFromUnknown(error, "TRANSPORT_ERROR");
  postAgentStreamEvent(port, requestId, {
    type: "run_failed",
    runId,
    error: {
      code: "TRANSPORT_ERROR",
      message: detail.message,
      detail: detail.detail,
    },
  });
}

function postAgentStreamEvent(
  port: chrome.runtime.Port,
  requestId: string,
  event: AgentStreamEvent,
) {
  const message: AgentStreamEventMessage = {
    type: CLIO_AGENT_STREAM_EVENT,
    requestId,
    event,
  };
  try {
    port.postMessage(message);
  } catch {
    // The content script may have navigated away after starting a run.
  }
}

function isTerminalAgentEvent(event: AgentStreamEvent) {
  return (
    event.type === "run_completed" ||
    event.type === "run_failed" ||
    event.type === "run_cancelled" ||
    event.type === "run_resolved"
  );
}

function handleWebSearchStreamPort(port: chrome.runtime.Port) {
  const subscriptions = new Map<string, string>();

  port.onMessage.addListener((message: unknown) => {
    if (!isWebSearchStreamRequestMessage(message)) return;
    subscribePortToWebSearchRun(port, subscriptions, message.requestId, message.request.runId);
    void routeWebSearchRunRequest({
      kind: "start",
      request: message.request,
    }).catch((error) => {
      postWebSearchRunRouteError(port, message.requestId, message.request.runId, error);
    });
  });

  port.onDisconnect.addListener(() => {
    for (const [requestId, runId] of subscriptions) {
      const runSubscribers = webSearchStreamSubscribers.get(runId);
      runSubscribers?.delete(port);
      if (runSubscribers?.size === 0) {
        webSearchStreamSubscribers.delete(runId);
      }
      subscriptions.delete(requestId);
    }
  });
}

function subscribePortToWebSearchRun(
  port: chrome.runtime.Port,
  subscriptions: Map<string, string>,
  requestId: string,
  runId: string,
) {
  subscriptions.set(requestId, runId);
  let subscribers = webSearchStreamSubscribers.get(runId);
  if (subscribers === undefined) {
    subscribers = new Map();
    webSearchStreamSubscribers.set(runId, subscribers);
  }
  subscribers.set(port, requestId);
}

function dispatchWebSearchRunEvent(event: import("@/src/shared/rpc").ClioWebSearchEvent) {
  const subscribers = webSearchStreamSubscribers.get(event.runId);
  if (subscribers === undefined) return;
  for (const [port, requestId] of subscribers) {
    postWebSearchStreamEvent(port, requestId, event);
  }
  if (event.type === "completed" || event.type === "failed") {
    webSearchStreamSubscribers.delete(event.runId);
  }
}

function postWebSearchRunRouteError(
  port: chrome.runtime.Port,
  requestId: string,
  runId: string,
  error: unknown,
) {
  const detail = engineErrorFromUnknown(error, "TRANSPORT_ERROR");
  postWebSearchStreamEvent(port, requestId, {
    type: "failed",
    runId,
    error: {
      code: "TRANSPORT_ERROR",
      message: detail.message,
      detail: detail.detail,
    },
  });
}

function postWebSearchStreamEvent(
  port: chrome.runtime.Port,
  requestId: string,
  event: import("@/src/shared/rpc").ClioWebSearchEvent,
) {
  const message: WebSearchStreamEventMessage = {
    type: CLIO_WEB_SEARCH_STREAM_EVENT,
    requestId,
    event,
  };
  try {
    port.postMessage(message);
  } catch {
    // The content script may have navigated away after starting a search.
  }
}

function handleImageGenerationStreamPort(port: chrome.runtime.Port) {
  const subscriptions = new Map<string, string>();

  port.onMessage.addListener((message: unknown) => {
    if (isImageGenerationStreamRequestMessage(message)) {
      subscribePortToImageGenerationRun(
        port,
        subscriptions,
        message.requestId,
        message.request.runId,
      );
      void routeImageGenerationRunRequest({
        kind: "start",
        request: message.request,
      }).catch((error) => {
        postImageGenerationRunRouteError(port, message.requestId, message.request.runId, error);
      });
      return;
    }
    if (isImageGenerationStreamCancelMessage(message)) {
      const runId = subscriptions.get(message.requestId);
      if (runId === undefined) return;
      void routeImageGenerationRunRequest({ kind: "cancel", runId }).catch((error) => {
        console.debug(
          "clio:bg image generation cancel route failed",
          engineErrorFromUnknown(error).message,
        );
      });
    }
  });

  port.onDisconnect.addListener(() => {
    for (const [requestId, runId] of subscriptions) {
      const runSubscribers = imageGenerationStreamSubscribers.get(runId);
      runSubscribers?.delete(port);
      if (runSubscribers?.size === 0) {
        imageGenerationStreamSubscribers.delete(runId);
      }
      subscriptions.delete(requestId);
    }
  });
}

function subscribePortToImageGenerationRun(
  port: chrome.runtime.Port,
  subscriptions: Map<string, string>,
  requestId: string,
  runId: string,
) {
  subscriptions.set(requestId, runId);
  let subscribers = imageGenerationStreamSubscribers.get(runId);
  if (subscribers === undefined) {
    subscribers = new Map();
    imageGenerationStreamSubscribers.set(runId, subscribers);
  }
  subscribers.set(port, requestId);
}

function dispatchImageGenerationRunEvent(
  event: import("@/src/shared/rpc").ClioImageGenerationEvent,
) {
  const subscribers = imageGenerationStreamSubscribers.get(event.runId);
  if (subscribers === undefined) return;
  for (const [port, requestId] of subscribers) {
    postImageGenerationStreamEvent(port, requestId, event);
  }
  if (event.type === "completed" || event.type === "failed" || event.type === "cancelled") {
    imageGenerationStreamSubscribers.delete(event.runId);
  }
}

function postImageGenerationRunRouteError(
  port: chrome.runtime.Port,
  requestId: string,
  runId: string,
  error: unknown,
) {
  const detail = engineErrorFromUnknown(error, "TRANSPORT_ERROR");
  postImageGenerationStreamEvent(port, requestId, {
    type: "failed",
    runId,
    error: {
      code: "TRANSPORT_ERROR",
      message: detail.message,
      detail: detail.detail,
    },
  });
}

function postImageGenerationStreamEvent(
  port: chrome.runtime.Port,
  requestId: string,
  event: import("@/src/shared/rpc").ClioImageGenerationEvent,
) {
  const message: ImageGenerationStreamEventMessage = {
    type: CLIO_IMAGE_GENERATION_STREAM_EVENT,
    requestId,
    event,
  };
  try {
    port.postMessage(message);
  } catch {
    // The content script may have navigated away after starting image generation.
  }
}

function setupSessionStorageAccess() {
  const sessionStorage = chrome.storage.session as SessionStorageWithAccess | undefined;
  try {
    const result = sessionStorage?.setAccessLevel?.({
      accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS",
    });
    if (result instanceof Promise) {
      void result.catch((error) => {
        console.debug(
          "clio:bg storage session access failed",
          engineErrorFromUnknown(error).message,
        );
      });
    }
  } catch (error) {
    console.debug("clio:bg storage session access failed", engineErrorFromUnknown(error).message);
  }
}

async function routeEngineRequest(request: EngineRequest) {
  await ensureOffscreen();
  return (await chrome.runtime.sendMessage({
    type: CLIO_OFFSCREEN_REQUEST,
    request,
  })) as EngineResponse;
}

async function routeUiRequest(request: UiRequest) {
  if (request.kind === "openOptions") {
    await chrome.tabs.create({
      active: true,
      url: chrome.runtime.getURL("options.html"),
    });
    return { opened: true as const };
  }
  throw new Error(`Unhandled UI request: ${JSON.stringify(request)}`);
}

async function routeAgentRunRequest(request: AgentRunRequest) {
  await ensureOffscreen();
  const response = (await chrome.runtime.sendMessage({
    type: CLIO_AGENT_RUN_REQUEST,
    request,
  })) as EngineResponse<{ accepted: true }> | undefined;
  if (response === undefined) {
    throw new EngineRpcError("AGENT_RUN_ROUTE_ERROR", "Offscreen agent host did not respond.");
  }
  if (!response.ok) {
    throw new EngineRpcError(response.error.code, response.error.message, response.error.detail);
  }
  return response.value;
}

async function routeWebSearchRunRequest(request: WebSearchRunRequest) {
  await ensureOffscreen();
  const response = (await chrome.runtime.sendMessage({
    type: CLIO_WEB_SEARCH_RUN_REQUEST,
    request,
  })) as EngineResponse<{ accepted: true }> | undefined;
  if (response === undefined) {
    throw new EngineRpcError("WEB_SEARCH_ROUTE_ERROR", "Offscreen search runtime did not respond.");
  }
  if (!response.ok) {
    throw new EngineRpcError(response.error.code, response.error.message, response.error.detail);
  }
  return response.value;
}

async function routeImageGenerationRunRequest(request: ImageGenerationRunRequest) {
  await ensureOffscreen();
  const response = (await chrome.runtime.sendMessage({
    type: CLIO_IMAGE_GENERATION_RUN_REQUEST,
    request,
  })) as EngineResponse<{ accepted: true }> | undefined;
  if (response === undefined) {
    throw new EngineRpcError(
      "IMAGE_GENERATION_ROUTE_ERROR",
      "Offscreen image generation runtime did not respond.",
    );
  }
  if (!response.ok) {
    throw new EngineRpcError(response.error.code, response.error.message, response.error.detail);
  }
  return response.value;
}

async function routeProviderRequest(request: ProviderRequest) {
  switch (request.kind) {
    case "getProviderSettings":
      return getProviderSettings();
    case "ensureGeminiHostPermission": {
      if (!(await hasGeminiHostPermission())) {
        throw new EngineRpcError(
          "PROVIDER_PERMISSION_REQUIRED",
          "Provider host access is not available in this extension build.",
        );
      }
      return getProviderSettings();
    }
    case "saveGeminiProvider": {
      await requireGeminiHostPermission("Gemini host access is unavailable in this build.");
      await saveGeminiProviderConfig({
        apiKey: request.apiKey,
        model: request.model,
      });
      return getProviderSettings();
    }
    case "testGeminiProvider": {
      await requireGeminiHostPermission("Gemini host access is unavailable in this build.");
      const existing = await readGeminiProviderConfig();
      const apiKey = normalizeApiKey(request.apiKey) ?? existing?.apiKey;
      const model = normalizeModel(request.model) ?? existing?.model;
      if (apiKey === undefined || model === undefined) {
        throw new EngineRpcError(
          "PROVIDER_CONFIG_REQUIRED",
          "Enter and save a Gemini API key before testing.",
        );
      }
      return testGeminiProviderConnection({ apiKey, model });
    }
    case "ensureOpenAIHostPermission": {
      const baseUrl = normalizeOpenAIBaseUrl(request.baseUrl) ?? defaultOpenAIBaseUrl;
      if (!(await hasOpenAIHostPermission(baseUrl))) {
        throw new EngineRpcError(
          "PROVIDER_PERMISSION_REQUIRED",
          "Provider host access is not available in this extension build.",
        );
      }
      return getProviderSettings();
    }
    case "saveOpenAIProvider": {
      const existing = await readOpenAIProviderConfig();
      const baseUrl =
        normalizeOpenAIBaseUrl(request.baseUrl) ?? existing?.baseUrl ?? defaultOpenAIBaseUrl;
      await requireOpenAIHostPermission(
        baseUrl,
        "OpenAI host access is unavailable in this build.",
      );
      await saveOpenAIProviderConfig({
        apiKey: request.apiKey,
        model: request.model ?? existing?.model ?? "",
        baseUrl,
      });
      return getProviderSettings();
    }
    case "testOpenAIProvider": {
      const existing = await readOpenAIProviderConfig();
      const baseUrl =
        normalizeOpenAIBaseUrl(request.baseUrl) ?? existing?.baseUrl ?? defaultOpenAIBaseUrl;
      await requireOpenAIHostPermission(
        baseUrl,
        "OpenAI host access is unavailable in this build.",
      );
      const apiKey = normalizeApiKey(request.apiKey) ?? existing?.apiKey;
      const model = normalizeModel(request.model) ?? existing?.model;
      if (apiKey === undefined || model === undefined) {
        throw new EngineRpcError(
          "PROVIDER_CONFIG_REQUIRED",
          "Enter and save an OpenAI API key before testing.",
        );
      }
      return testOpenAIProviderConnection({ apiKey, model, baseUrl });
    }
    case "ensureOpenAICompatibleHostPermission": {
      const baseUrl =
        normalizeOpenAICompatibleBaseUrl(request.baseUrl) ?? defaultOpenAICompatibleBaseUrl;
      if (!(await hasOpenAICompatibleHostPermission(baseUrl))) {
        throw new EngineRpcError(
          "PROVIDER_PERMISSION_REQUIRED",
          "Provider host access is not available in this extension build.",
        );
      }
      return getProviderSettings();
    }
    case "saveOpenAICompatibleProvider": {
      const existing = await readOpenAICompatibleProviderConfig();
      const baseUrl =
        normalizeOpenAICompatibleBaseUrl(request.baseUrl) ??
        existing?.baseUrl ??
        defaultOpenAICompatibleBaseUrl;
      await requireOpenAICompatibleHostPermission(
        baseUrl,
        "OpenAI-compatible host access is unavailable in this build.",
      );
      await saveOpenAICompatibleProviderConfig({
        apiKey: request.apiKey,
        model: request.model,
        baseUrl,
        providerName: request.providerName,
      });
      return getProviderSettings();
    }
    case "testOpenAICompatibleProvider": {
      const existing = await readOpenAICompatibleProviderConfig();
      const baseUrl =
        normalizeOpenAICompatibleBaseUrl(request.baseUrl) ??
        existing?.baseUrl ??
        defaultOpenAICompatibleBaseUrl;
      await requireOpenAICompatibleHostPermission(
        baseUrl,
        "OpenAI-compatible host access is unavailable in this build.",
      );
      const apiKey = normalizeApiKey(request.apiKey) ?? existing?.apiKey;
      const model = normalizeModel(request.model) ?? existing?.model;
      const providerName = normalizeProviderName(request.providerName) ?? existing?.providerName;
      if (apiKey === undefined || model === undefined) {
        throw new EngineRpcError(
          "PROVIDER_CONFIG_REQUIRED",
          "Enter and save an OpenAI-compatible API key before testing.",
        );
      }
      return testOpenAICompatibleProviderConnection({ apiKey, model, baseUrl, providerName });
    }
    case "setActiveProvider":
      await saveActiveProviderId(request.provider);
      return getProviderSettings();
    case "getSearchProviderSettings":
      return readSearchProviderSettings();
    case "saveSearchProviderSettings":
      return saveSearchProviderSettings({
        provider: request.provider,
        openai: request.openai,
        openaiCompatible: request.openaiCompatible,
      });
    case "getImageGenerationSettings":
      return readImageGenerationSettings();
    case "saveImageGenerationSettings":
      return saveImageGenerationSettings(request.settings);
    case "ensureImageGenerationHostPermission": {
      const baseUrl = normalizeImageBaseUrl(request.baseUrl) ?? defaultOpenAIBaseUrl;
      await requireOpenAIHostPermission(
        baseUrl,
        "Image provider host access is unavailable in this build.",
      );
      return getProviderSettings();
    }
    default:
      return assertNever(request);
  }
}

async function requireGeminiHostPermission(message: string) {
  if (await hasGeminiHostPermission()) return;
  throw new EngineRpcError("PROVIDER_PERMISSION_REQUIRED", message);
}

async function requireOpenAIHostPermission(baseUrl: string, message: string) {
  if (await hasOpenAIHostPermission(baseUrl)) return;
  throw new EngineRpcError("PROVIDER_PERMISSION_REQUIRED", message);
}

async function requireOpenAICompatibleHostPermission(baseUrl: string, message: string) {
  if (await hasOpenAICompatibleHostPermission(baseUrl)) return;
  throw new EngineRpcError("PROVIDER_PERMISSION_REQUIRED", message);
}

function providerErrorFromUnknown(error: unknown) {
  if (error instanceof EngineRpcError) {
    return {
      code: error.code,
      message: error.message,
      detail: error.detail,
    };
  }
  if (error instanceof Error && error.name.startsWith("PROVIDER_")) {
    return {
      code: error.name,
      message: error.message,
      detail: error.stack,
    };
  }
  return engineErrorFromUnknown(error, "PROVIDER_ROUTE_ERROR");
}

function assertNever(value: never): never {
  throw new Error(`Unhandled provider request: ${JSON.stringify(value)}`);
}

async function ensureOffscreen() {
  if (await hasExistingOffscreenDocument()) return;

  pendingOffscreenCreation ??= createOffscreenDocument();
  try {
    await pendingOffscreenCreation;
  } finally {
    pendingOffscreenCreation = null;
  }
}

async function createOffscreenDocument() {
  if (await hasExistingOffscreenDocument()) return;

  try {
    await chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: [chrome.offscreen.Reason.DOM_PARSER],
      justification: "Host Clio local SQLite/OPFS memory engine and agent run host.",
    });
  } catch (error) {
    if (isSingleOffscreenDocumentError(error) && (await hasExistingOffscreenDocument())) return;
    throw error;
  }
}

async function hasExistingOffscreenDocument() {
  const offscreenUrl = chrome.runtime.getURL("offscreen.html");
  const runtime = chrome.runtime as RuntimeWithContexts;
  const contextType = runtime.ContextType?.OFFSCREEN_DOCUMENT ?? "OFFSCREEN_DOCUMENT";
  const contexts = await runtime.getContexts?.({
    contextTypes: [contextType],
    documentUrls: [offscreenUrl],
  });
  if (contexts !== undefined) return contexts.length > 0;

  const offscreen = chrome.offscreen as OffscreenWithHasDocument;
  return (await offscreen.hasDocument?.()) === true;
}

function isSingleOffscreenDocumentError(error: unknown) {
  return (
    error instanceof Error && error.message.toLowerCase().includes("single offscreen document")
  );
}

function setupContextMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: menuIds.saveSelection,
      title: "Save selection to Clio",
      contexts: ["selection"],
      documentUrlPatterns: ["http://*/*", "https://*/*"],
    });
    chrome.contextMenus.create({
      id: menuIds.savePage,
      title: "Save page to Clio",
      contexts: ["page"],
      documentUrlPatterns: ["http://*/*", "https://*/*"],
    });
  });
}

async function sendActiveTabCommand(command: ContentCommand) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await sendTabCommand(tab, command);
}

async function sendTabCommand(tab: chrome.tabs.Tab | undefined, command: ContentCommand) {
  if (tab?.id === undefined || !isSupportedTabUrl(tab.url)) return;
  try {
    await chrome.tabs.sendMessage(tab.id, {
      type: CLIO_CONTENT_COMMAND,
      command,
    });
  } catch (error) {
    console.debug("clio:bg content command failed", engineErrorFromUnknown(error).message);
  }
}

function isSupportedTabUrl(url: string | undefined) {
  if (url === undefined) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}
