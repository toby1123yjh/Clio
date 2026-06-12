import { describe, expect, it } from "vitest";
import {
  modelCapabilityProfileFor,
  providerFamilyCapabilities,
  searchCapabilityForProviderModel,
} from "./provider-capabilities";

describe("provider capability registry", () => {
  it("routes OpenAI dedicated search models to Chat Completions search", () => {
    expect(searchCapabilityForProviderModel("openai", "gpt-5-search-api")).toMatchObject({
      protocol: "openai-chat-completions-search",
      sourceReturning: true,
    });
  });

  it("routes ordinary OpenAI models to Responses web_search", () => {
    expect(searchCapabilityForProviderModel("openai", "gpt-5.5")).toMatchObject({
      protocol: "openai-responses-web-search",
      hostedTool: true,
    });
  });

  it("allows arbitrary OpenAI Compatible model names through Responses web_search", () => {
    expect(searchCapabilityForProviderModel("openai-compatible", "vendor-model-x")).toMatchObject({
      protocol: "openai-responses-web-search",
      sourceMetadata: true,
    });
  });

  it("keeps future provider families as explicit extension points", () => {
    expect(providerFamilyCapabilities.anthropic.searchProtocols).toEqual([]);
    expect(providerFamilyCapabilities.gemini.searchProtocols).toEqual([]);
    expect(modelCapabilityProfileFor("qwen", "qwen-plus")).toMatchObject({
      family: "qwen",
      modelId: "qwen-plus",
    });
  });
});
