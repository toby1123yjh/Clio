export const defaultOpenAIBaseUrl = "https://api.openai.com/v1";
export const defaultOpenAICompatibleBaseUrl = "https://api.openai.com/v1";
export const openAIApiKeyBuildTimeConstant = "__CLIO_DEFAULT_OPENAI_API_KEY__";
export const openAIBaseUrlBuildTimeConstant = "__CLIO_DEFAULT_OPENAI_BASE_URL__";
export const openAIModelBuildTimeConstant = "__CLIO_DEFAULT_OPENAI_MODEL__";
export const defaultOpenAIApiKey = readBuildTimeOpenAIApiKey();
export const defaultOpenAIConfigBaseUrl =
  readBuildTimeOpenAIBaseUrl() ?? defaultOpenAICompatibleBaseUrl;
export const defaultOpenAIConfigModel = readBuildTimeOpenAIModel();

declare const __CLIO_DEFAULT_OPENAI_API_KEY__: string | undefined;
declare const __CLIO_DEFAULT_OPENAI_BASE_URL__: string | undefined;
declare const __CLIO_DEFAULT_OPENAI_MODEL__: string | undefined;

export function normalizeProviderBaseUrl(
  value: unknown,
  label = "Provider Base URL",
): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`${label} must be a valid HTTPS URL.`);
  }

  if (parsed.protocol !== "https:") {
    throw new Error(`${label} must use HTTPS.`);
  }

  parsed.hash = "";
  parsed.search = "";
  return parsed.toString().replace(/\/$/, "");
}

export function normalizeOpenAIBaseUrl(value: unknown): string | undefined {
  return normalizeProviderBaseUrl(value, "OpenAI Base URL");
}

export function normalizeOpenAICompatibleBaseUrl(value: unknown): string | undefined {
  return normalizeProviderBaseUrl(value, "OpenAI-compatible Base URL");
}

export function resolveOpenAIBaseUrl(value: unknown, fallback = defaultOpenAIBaseUrl) {
  return normalizeOpenAIBaseUrl(value) ?? fallback;
}

export function resolveOpenAICompatibleBaseUrl(
  value: unknown,
  fallback = defaultOpenAICompatibleBaseUrl,
) {
  return normalizeOpenAICompatibleBaseUrl(value) ?? fallback;
}

export function hostPermissionOriginForBaseUrl(value: unknown, fallback = defaultOpenAIBaseUrl) {
  const baseUrl = normalizeProviderBaseUrl(value, "Provider Base URL") ?? fallback;
  return `${new URL(baseUrl).origin}/*`;
}

export function readBuildTimeOpenAIApiKey() {
  return normalizeBuildTimeApiKey(
    typeof __CLIO_DEFAULT_OPENAI_API_KEY__ === "string"
      ? __CLIO_DEFAULT_OPENAI_API_KEY__
      : undefined,
  );
}

export function readBuildTimeOpenAIBaseUrl() {
  return normalizeBuildTimeBaseUrl(
    typeof __CLIO_DEFAULT_OPENAI_BASE_URL__ === "string"
      ? __CLIO_DEFAULT_OPENAI_BASE_URL__
      : undefined,
  );
}

export function readBuildTimeOpenAIModel() {
  return normalizeBuildTimeModel(
    typeof __CLIO_DEFAULT_OPENAI_MODEL__ === "string" ? __CLIO_DEFAULT_OPENAI_MODEL__ : undefined,
  );
}

function normalizeBuildTimeApiKey(value: unknown) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeBuildTimeBaseUrl(value: unknown) {
  try {
    return normalizeOpenAIBaseUrl(value);
  } catch {
    return undefined;
  }
}

function normalizeBuildTimeModel(value: unknown) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
