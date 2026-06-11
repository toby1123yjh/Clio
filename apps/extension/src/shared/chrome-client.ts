import {
  CLIO_CONTENT_COMMAND,
  CLIO_ENGINE_REQUEST,
  CLIO_PROVIDER_CONFIG_REQUEST,
  CLIO_PROVIDER_REQUEST,
  CLIO_UI_REQUEST,
  type ContentCommand,
  type EngineRequest,
  type EngineResponse,
  type EngineResultFor,
  type ProviderConfigResult,
  type ProviderRequest,
  type ProviderResponse,
  type ProviderResultFor,
  type UiRequest,
  type UiResponse,
  type UiResultFor,
  unwrapEngineResponse,
} from "./rpc";

export async function requestEngine<T extends EngineRequest>(
  request: T,
): Promise<EngineResultFor<T>> {
  const response = (await chrome.runtime.sendMessage({
    type: CLIO_ENGINE_REQUEST,
    request,
  })) as EngineResponse<EngineResultFor<T>>;
  return unwrapEngineResponse(response);
}

export async function sendCurrentTabCommand(command: ContentCommand) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) return;
  await chrome.tabs.sendMessage(tab.id, {
    type: CLIO_CONTENT_COMMAND,
    command,
  });
}

export async function requestProvider<T extends ProviderRequest>(
  request: T,
): Promise<ProviderResultFor<T>> {
  const response = (await chrome.runtime.sendMessage({
    type: CLIO_PROVIDER_REQUEST,
    request,
  })) as ProviderResponse<ProviderResultFor<T>>;
  return unwrapEngineResponse(response);
}

export async function requestProviderConfig(): Promise<ProviderConfigResult> {
  const response = (await chrome.runtime.sendMessage({
    type: CLIO_PROVIDER_CONFIG_REQUEST,
    request: { kind: "readActiveProviderConfig" },
  })) as EngineResponse<ProviderConfigResult>;
  return unwrapEngineResponse(response);
}

export async function requestUi<T extends UiRequest>(request: T): Promise<UiResultFor<T>> {
  const response = (await chrome.runtime.sendMessage({
    type: CLIO_UI_REQUEST,
    request,
  })) as UiResponse<UiResultFor<T>>;
  return unwrapEngineResponse(response);
}
