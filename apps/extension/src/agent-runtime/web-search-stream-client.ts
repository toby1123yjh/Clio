import {
  CLIO_WEB_SEARCH_STREAM_PORT,
  CLIO_WEB_SEARCH_STREAM_REQUEST,
  type ClioWebSearchEvent,
  type ClioWebSearchRequest,
  type WebSearchStreamRequestMessage,
  createRequestId,
  isWebSearchStreamEventMessage,
} from "../shared/rpc";
import type { AgentErrorInfo } from "./types";

export interface WebSearchStreamController {
  requestId: string;
  close: () => void;
}

export interface WebSearchStreamHandlers {
  onEvent: (event: ClioWebSearchEvent) => void;
  onTransportError: (error: AgentErrorInfo) => void;
}

export function openWebSearchStream(
  request: ClioWebSearchRequest,
  handlers: WebSearchStreamHandlers,
): WebSearchStreamController {
  const port = chrome.runtime.connect({ name: CLIO_WEB_SEARCH_STREAM_PORT });
  const startMessage: WebSearchStreamRequestMessage = {
    type: CLIO_WEB_SEARCH_STREAM_REQUEST,
    requestId: createRequestId(),
    request,
  };
  let terminalEventReceived = false;
  let closedByClient = false;

  port.onMessage.addListener((message: unknown) => {
    if (!isWebSearchStreamEventMessage(message) || message.requestId !== startMessage.requestId) {
      return;
    }
    handlers.onEvent(message.event);
    if (isTerminalWebSearchEvent(message.event)) {
      terminalEventReceived = true;
      closedByClient = true;
      port.disconnect();
    }
  });

  port.onDisconnect.addListener(() => {
    if (terminalEventReceived || closedByClient) return;
    handlers.onTransportError({
      code: "TRANSPORT_ERROR",
      message: "Clio lost the local search stream. Retry the search.",
    });
  });

  port.postMessage(startMessage);

  return {
    requestId: startMessage.requestId,
    close: () => {
      if (terminalEventReceived || closedByClient) return;
      closedByClient = true;
      port.disconnect();
    },
  };
}

function isTerminalWebSearchEvent(event: ClioWebSearchEvent) {
  return event.type === "completed" || event.type === "failed";
}
