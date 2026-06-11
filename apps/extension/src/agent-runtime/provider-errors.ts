import type { AgentErrorCode, AgentErrorInfo } from "./types";

export function classifyProviderError(error: unknown, providerLabel = "Gemini"): AgentErrorInfo {
  const message = normalizeErrorMessage(error);
  const lower = message.toLowerCase();
  let code: AgentErrorCode = "PROVIDER_ERROR";

  if (lower.includes("abort") || lower.includes("cancel")) {
    code = "PROVIDER_INTERRUPTED";
  } else if (
    lower.includes("api key") ||
    lower.includes("unauthorized") ||
    lower.includes("authentication") ||
    lower.includes("permission denied") ||
    lower.includes("401") ||
    lower.includes("403")
  ) {
    code = "PROVIDER_AUTH_ERROR";
  } else if (
    lower.includes("quota") ||
    lower.includes("rate limit") ||
    lower.includes("resource_exhausted") ||
    lower.includes("429")
  ) {
    code = "PROVIDER_RATE_LIMIT";
  } else if (
    lower.includes("network") ||
    lower.includes("fetch") ||
    lower.includes("timeout") ||
    lower.includes("econn")
  ) {
    code = "PROVIDER_NETWORK_ERROR";
  }

  return {
    code,
    message: providerMessageForCode(code, providerLabel),
    detail: message,
  };
}

function providerMessageForCode(code: AgentErrorCode, providerLabel: string) {
  switch (code) {
    case "PROVIDER_INTERRUPTED":
      return `${providerLabel} stopped before finishing. Retry when ready.`;
    case "PROVIDER_AUTH_ERROR":
      return `${providerLabel} rejected the API key. Update it in Clio Settings and retry.`;
    case "PROVIDER_RATE_LIMIT":
      return `${providerLabel} quota or rate limit was reached. Retry later.`;
    case "PROVIDER_NETWORK_ERROR":
      return `Clio could not reach ${providerLabel}. Check the network and retry.`;
    default:
      return `${providerLabel} could not answer right now. Retry the question.`;
  }
}

function normalizeErrorMessage(error: unknown) {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (isRecord(error) && typeof error.message === "string") return error.message;
  return "Unknown provider error";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
