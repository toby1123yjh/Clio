import { describe, expect, it } from "vitest";
import { openAIResponsesModel } from "./openai-model";

describe("openAIResponsesModel", () => {
  it("maps gpt-5.5 minimal thinking to the lowest accepted upstream effort", () => {
    const model = openAIResponsesModel("gpt-5.5", "https://new-api.example.test/v1");

    expect(model.reasoning).toBe(true);
    expect(model.thinkingLevelMap?.minimal).toBe("low");
  });

  it("leaves other OpenAI reasoning models on Pi defaults", () => {
    const model = openAIResponsesModel("gpt-5.1", "https://api.openai.example.test/v1");

    expect(model.reasoning).toBe(true);
    expect(model.thinkingLevelMap).toBeUndefined();
  });
});
