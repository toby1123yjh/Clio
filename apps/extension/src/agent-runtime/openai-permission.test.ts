import { afterEach, describe, expect, it, vi } from "vitest";
import { type ChromePermissionsLike, hasGeminiHostPermission } from "./gemini-permission";
import {
  hasOpenAICompatibleHostPermission,
  hasOpenAIHostPermission,
  openAICompatibleHostPermissionOrigins,
  openAICompatibleHostPermissionOriginsForBaseUrl,
  openAIHostPermissionOrigins,
  openAIHostPermissionOriginsForBaseUrl,
  requestOpenAICompatibleHostPermission,
  requestOpenAIHostPermission,
} from "./openai-permission";
import { normalizeOpenAICompatibleBaseUrl } from "./openai-provider-config";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OpenAI provider host permissions", () => {
  it("derives official and compatible host permission origins", () => {
    expect(openAIHostPermissionOrigins).toEqual(["https://api.openai.com/*"]);
    expect(openAIHostPermissionOriginsForBaseUrl("https://new-api.example.test/v1")).toEqual([
      "https://new-api.example.test/*",
    ]);
    expect(openAICompatibleHostPermissionOrigins).toEqual(["https://api.openai.com/*"]);
    expect(
      openAICompatibleHostPermissionOriginsForBaseUrl("https://new-api.example.test/v1"),
    ).toEqual(["https://new-api.example.test/*"]);
  });

  it("normalizes HTTPS OpenAI-compatible base URLs", () => {
    expect(normalizeOpenAICompatibleBaseUrl(" https://new-api.example.test/v1/ ")).toBe(
      "https://new-api.example.test/v1",
    );
    expect(normalizeOpenAICompatibleBaseUrl("")).toBeUndefined();
    expect(() => normalizeOpenAICompatibleBaseUrl("http://new-api.example.test/v1")).toThrow(
      "OpenAI-compatible Base URL must use HTTPS.",
    );
  });

  it("requests permission for the configured origin", async () => {
    let requestedOrigins: string[] | undefined;
    const permissions: ChromePermissionsLike = {
      async contains() {
        return false;
      },
      async request(details) {
        requestedOrigins = details.origins;
        return true;
      },
    };

    await expect(
      requestOpenAIHostPermission("https://new-api.example.test/v1", permissions),
    ).resolves.toBe(true);
    expect(requestedOrigins).toEqual(["https://new-api.example.test/*"]);

    await expect(
      requestOpenAICompatibleHostPermission("https://compatible.example.test/v1", permissions),
    ).resolves.toBe(true);
    expect(requestedOrigins).toEqual(["https://compatible.example.test/*"]);
  });

  it("uses manifest-declared host permissions when the permissions API is unavailable", async () => {
    vi.stubGlobal("chrome", {
      runtime: {
        getManifest() {
          return { host_permissions: ["<all_urls>"] };
        },
      },
    });

    await expect(hasOpenAIHostPermission("https://new-api.example.test/v1")).resolves.toBe(true);
    await expect(
      hasOpenAICompatibleHostPermission("https://new-api.example.test/v1"),
    ).resolves.toBe(true);
    await expect(hasGeminiHostPermission()).resolves.toBe(true);
  });

  it("returns false instead of throwing when host access is unavailable and permissions API is missing", async () => {
    vi.stubGlobal("chrome", {
      runtime: {
        getManifest() {
          return { host_permissions: [] };
        },
      },
    });

    await expect(hasOpenAIHostPermission("https://new-api.example.test/v1")).resolves.toBe(false);
    await expect(
      hasOpenAICompatibleHostPermission("https://new-api.example.test/v1"),
    ).resolves.toBe(false);
    await expect(hasGeminiHostPermission()).resolves.toBe(false);
  });
});
