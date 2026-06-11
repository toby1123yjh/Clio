export const geminiHostPermissionOrigins = ["https://generativelanguage.googleapis.com/*"] as const;

export interface ChromePermissionsLike {
  contains?(details: chrome.permissions.Permissions): Promise<boolean>;
  request?(details: chrome.permissions.Permissions): Promise<boolean>;
}

export async function hasGeminiHostPermission(
  permissions: ChromePermissionsLike | undefined = getChromePermissions(),
) {
  if (manifestGrantsHostOrigins(geminiHostPermissionOrigins)) return true;
  return (await permissions?.contains?.({ origins: [...geminiHostPermissionOrigins] })) ?? false;
}

export async function requestGeminiHostPermission(
  permissions: ChromePermissionsLike | undefined = getChromePermissions(),
) {
  if (manifestGrantsHostOrigins(geminiHostPermissionOrigins)) return true;
  return (await permissions?.request?.({ origins: [...geminiHostPermissionOrigins] })) ?? false;
}

export function manifestGrantsHostOrigins(origins: readonly string[]) {
  if (typeof chrome === "undefined" || chrome.runtime?.getManifest === undefined) return false;
  let hostPermissions: string[];
  try {
    hostPermissions = chrome.runtime.getManifest().host_permissions ?? [];
  } catch {
    return false;
  }
  return (
    hostPermissions.includes("<all_urls>") ||
    origins.every((origin) => hostPermissions.includes(origin))
  );
}

function getChromePermissions(): ChromePermissionsLike | undefined {
  if (typeof chrome === "undefined") return undefined;
  return chrome.permissions as ChromePermissionsLike | undefined;
}
