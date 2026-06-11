import {
  CLIO_IMAGE_GENERATION_STREAM_CANCEL,
  CLIO_IMAGE_GENERATION_STREAM_PORT,
  CLIO_IMAGE_GENERATION_STREAM_REQUEST,
  type ClioImageGenerationEvent,
  type ClioImageGenerationRequest,
  type ImageGenerationStreamCancelMessage,
  type ImageGenerationStreamRequestMessage,
  createRequestId,
  isImageGenerationStreamEventMessage,
} from "../shared/rpc";
import type { AgentErrorInfo } from "./types";

export interface ImageGenerationStreamController {
  requestId: string;
  cancel: () => void;
  close: () => void;
}

export interface ImageGenerationStreamHandlers {
  onEvent: (event: ClioImageGenerationEvent) => void;
  onTransportError: (error: AgentErrorInfo) => void;
}

export function openImageGenerationStream(
  request: ClioImageGenerationRequest,
  handlers: ImageGenerationStreamHandlers,
): ImageGenerationStreamController {
  const port = chrome.runtime.connect({ name: CLIO_IMAGE_GENERATION_STREAM_PORT });
  const requestId = createRequestId();
  const startMessage: ImageGenerationStreamRequestMessage = {
    type: CLIO_IMAGE_GENERATION_STREAM_REQUEST,
    requestId,
    request,
  };
  let terminalEventReceived = false;
  let closedByClient = false;

  port.onMessage.addListener((message: unknown) => {
    if (!isImageGenerationStreamEventMessage(message) || message.requestId !== requestId) return;
    handlers.onEvent(message.event);
    if (isTerminalImageGenerationEvent(message.event)) {
      terminalEventReceived = true;
      closedByClient = true;
      port.disconnect();
    }
  });

  port.onDisconnect.addListener(() => {
    if (terminalEventReceived || closedByClient) return;
    handlers.onTransportError({
      code: "TRANSPORT_ERROR",
      message: "Clio lost the local image generation stream. Retry the request.",
    });
  });

  port.postMessage(startMessage);

  return {
    requestId,
    cancel: () => {
      if (terminalEventReceived || closedByClient) return;
      const cancelMessage: ImageGenerationStreamCancelMessage = {
        type: CLIO_IMAGE_GENERATION_STREAM_CANCEL,
        requestId,
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

function isTerminalImageGenerationEvent(event: ClioImageGenerationEvent) {
  return event.type === "completed" || event.type === "failed" || event.type === "cancelled";
}
