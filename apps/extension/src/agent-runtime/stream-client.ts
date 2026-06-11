import {
  type AgentStreamCancelMessage,
  type AgentStreamCompactMessage,
  type AgentStreamRequestMessage,
  type AgentStreamSubscribeMessage,
  CLIO_AGENT_STREAM_CANCEL,
  CLIO_AGENT_STREAM_COMPACT,
  CLIO_AGENT_STREAM_PORT,
  CLIO_AGENT_STREAM_REQUEST,
  CLIO_AGENT_STREAM_SUBSCRIBE,
  createRequestId,
  isAgentStreamEventMessage,
} from "@/src/shared/rpc";
import type { AgentChatRequest, AgentErrorInfo, AgentStreamEvent } from "./types";

export interface AgentStreamController {
  requestId: string;
  cancel: () => void;
  close: () => void;
}

export interface AgentStreamHandlers {
  onEvent: (event: AgentStreamEvent) => void;
  onTransportError: (error: AgentErrorInfo) => void;
}

export function openAgentStream(
  request: AgentChatRequest,
  handlers: AgentStreamHandlers,
): AgentStreamController {
  return connectAgentStream(
    {
      type: CLIO_AGENT_STREAM_REQUEST,
      requestId: createRequestId(),
      request,
    },
    handlers,
  );
}

export function subscribeAgentStream(
  input: {
    runId: string;
    sessionId: string;
    assistantMessageId: string;
  },
  handlers: AgentStreamHandlers,
): AgentStreamController {
  return connectAgentStream(
    {
      type: CLIO_AGENT_STREAM_SUBSCRIBE,
      requestId: createRequestId(),
      runId: input.runId,
      sessionId: input.sessionId,
      assistantMessageId: input.assistantMessageId,
    },
    handlers,
  );
}

export function openManualCompactStream(
  input: {
    runId: string;
    sessionId?: string;
  },
  handlers: AgentStreamHandlers,
): AgentStreamController {
  return connectAgentStream(
    {
      type: CLIO_AGENT_STREAM_COMPACT,
      requestId: createRequestId(),
      runId: input.runId,
      ...(input.sessionId === undefined ? {} : { sessionId: input.sessionId }),
    },
    handlers,
  );
}

function connectAgentStream(
  startMessage: AgentStreamRequestMessage | AgentStreamSubscribeMessage | AgentStreamCompactMessage,
  handlers: AgentStreamHandlers,
): AgentStreamController {
  const port = chrome.runtime.connect({ name: CLIO_AGENT_STREAM_PORT });
  let terminalEventReceived = false;
  let closedByClient = false;

  port.onMessage.addListener((message: unknown) => {
    if (!isAgentStreamEventMessage(message) || message.requestId !== startMessage.requestId) return;
    handlers.onEvent(message.event);
    if (isTerminalAgentEvent(message.event)) {
      terminalEventReceived = true;
      closedByClient = true;
      port.disconnect();
    }
  });

  port.onDisconnect.addListener(() => {
    if (terminalEventReceived || closedByClient) return;
    handlers.onTransportError({
      code: "TRANSPORT_ERROR",
      message: "Clio lost the local agent stream. Retry the question.",
    });
  });

  port.postMessage(startMessage);

  return {
    requestId: startMessage.requestId,
    cancel: () => {
      if (terminalEventReceived || closedByClient) return;
      const cancelMessage: AgentStreamCancelMessage = {
        type: CLIO_AGENT_STREAM_CANCEL,
        requestId: startMessage.requestId,
      };
      port.postMessage(cancelMessage);
    },
    close: () => {
      if (terminalEventReceived || closedByClient) return;
      closedByClient = true;
      port.disconnect();
    },
  };
}

function isTerminalAgentEvent(event: AgentStreamEvent) {
  return (
    event.type === "run_completed" ||
    event.type === "run_failed" ||
    event.type === "run_cancelled" ||
    event.type === "run_resolved"
  );
}
