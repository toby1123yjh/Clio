import { type ChromePermissionsLike, manifestGrantsHostOrigins } from "./gemini-permission";
import {
  defaultOpenAIBaseUrl,
  defaultOpenAICompatibleBaseUrl,
  hostPermissionOriginForBaseUrl,
} from "./openai-provider-config";

export const openAIHostPermissionOrigins = [
  hostPermissionOriginForBaseUrl(defaultOpenAIBaseUrl, defaultOpenAIBaseUrl),
] as const;

export const openAICompatibleHostPermissionOrigins = [
  hostPermissionOriginForBaseUrl(defaultOpenAICompatibleBaseUrl, defaultOpenAICompatibleBaseUrl),
] as const;

export function openAIHostPermissionOriginsForBaseUrl(baseUrl?: string) {
  return [hostPermissionOriginForBaseUrl(baseUrl, defaultOpenAIBaseUrl)] as const;
}

export function openAICompatibleHostPermissionOriginsForBaseUrl(baseUrl?: string) {
  return [hostPermissionOriginForBaseUrl(baseUrl, defaultOpenAICompatibleBaseUrl)] as const;
}

export async function hasOpenAIHostPermission(
  baseUrl?: string,
  permissions: ChromePermissionsLike | undefined = getChromePermissions(),
) {
  const origins = openAIHostPermissionOriginsForBaseUrl(baseUrl);
  if (manifestGrantsHostOrigins(origins)) return true;
  return (await permissions?.contains?.({ origins: [...origins] })) ?? false;
}

export async function hasOpenAICompatibleHostPermission(
  baseUrl?: string,
  permissions: ChromePermissionsLike | undefined = getChromePermissions(),
) {
  const origins = openAICompatibleHostPermissionOriginsForBaseUrl(baseUrl);
  if (manifestGrantsHostOrigins(origins)) return true;
  return (await permissions?.contains?.({ origins: [...origins] })) ?? false;
}

export async function requestOpenAIHostPermission(
  baseUrl?: string,
  permissions: ChromePermissionsLike | undefined = getChromePermissions(),
) {
  const origins = openAIHostPermissionOriginsForBaseUrl(baseUrl);
  if (manifestGrantsHostOrigins(origins)) return true;
  return (await permissions?.request?.({ origins: [...origins] })) ?? false;
}

export async function requestOpenAICompatibleHostPermission(
  baseUrl?: string,
  permissions: ChromePermissionsLike | undefined = getChromePermissions(),
) {
  const origins = openAICompatibleHostPermissionOriginsForBaseUrl(baseUrl);
  if (manifestGrantsHostOrigins(origins)) return true;
  return (await permissions?.request?.({ origins: [...origins] })) ?? false;
}

function getChromePermissions(): ChromePermissionsLike | undefined {
  if (typeof chrome === "undefined") return undefined;
  return chrome.permissions as ChromePermissionsLike | undefined;
}
