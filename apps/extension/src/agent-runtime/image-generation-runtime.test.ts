import { describe, expect, it } from "vitest";
import type { ClioImageGenerationEvent } from "../shared/rpc";
import { ClioImageGenerationRuntime } from "./image-generation-runtime";
import type { ImageGenerationSettings } from "./image-generation-settings";
import type { StoredProviderConfig } from "./provider-settings";

const pngB64 = "iVBORw0KGgo=";
const createdAt = "2026-06-09T00:00:00.000Z";

const mainOpenAIConfig: StoredProviderConfig = {
  provider: "openai",
  apiKey: "main-image-key",
  model: "gpt-main",
  baseUrl: "https://images.example.test/v1",
  updatedAt: createdAt,
};

async function collect(events: AsyncIterable<ClioImageGenerationEvent>) {
  const collected: ClioImageGenerationEvent[] = [];
  for await (const event of events) collected.push(event);
  return collected;
}

function imageResponse(payload: unknown = { data: [{ b64_json: pngB64 }] }, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function createRuntime(options: {
  settings?: ImageGenerationSettings;
  activeProviderConfig?: StoredProviderConfig;
  fetchFn: typeof fetch;
}) {
  return new ClioImageGenerationRuntime({
    async loadImageGenerationSettings() {
      return options.settings ?? { size: "1024x1024" };
    },
    async loadActiveProviderConfig() {
      return options.activeProviderConfig ?? mainOpenAIConfig;
    },
    async ensureImageHostPermission(baseUrl) {
      return baseUrl === "https://images.example.test/v1";
    },
    fetchFn: options.fetchFn,
  });
}

describe("ClioImageGenerationRuntime", () => {
  it("calls the Image2 generations endpoint with JSON and normalizes b64 output", async () => {
    let requestedUrl = "";
    let requestedBody: unknown;
    let authorization = "";
    const fetchFn: typeof fetch = async (input, init) => {
      requestedUrl = String(input);
      requestedBody = JSON.parse(String(init?.body)) as unknown;
      authorization = String((init?.headers as Record<string, string> | undefined)?.Authorization);
      return imageResponse();
    };

    const runtime = createRuntime({ fetchFn });
    const events = await collect(
      runtime.generateImage({
        runId: "image-run-1",
        mode: "generate",
        prompt: "  a clean browser toolbox UI  ",
        createdAt,
      }),
    );

    expect(requestedUrl).toBe("https://images.example.test/v1/images/generations");
    expect(authorization).toBe("Bearer main-image-key");
    expect(requestedBody).toEqual({
      model: "gpt-image-2",
      prompt: "a clean browser toolbox UI",
      size: "1024x1024",
      response_format: "b64_json",
    });
    expect(events.map((event) => event.type)).toEqual(["started", "completed"]);
    expect(events[0]).toMatchObject({
      type: "started",
      model: "gpt-image-2",
      size: "1024x1024",
    });
    expect(events[1]).toMatchObject({
      type: "completed",
      result: {
        id: "image_image-run-1",
        mode: "generate",
        prompt: "a clean browser toolbox UI",
        output: {
          mimeType: "image/png",
          b64Json: pngB64,
          dataUrl: `data:image/png;base64,${pngB64}`,
        },
      },
    });
  });

  it("calls the Image2 edits endpoint with multipart form data for reference images", async () => {
    let requestedUrl = "";
    let requestedBody: FormData | undefined;
    const fetchFn: typeof fetch = async (input, init) => {
      requestedUrl = String(input);
      requestedBody = init?.body as FormData;
      return imageResponse();
    };

    const runtime = createRuntime({
      settings: {
        apiKey: "image-key",
        baseUrl: "https://images.example.test/v1",
        model: "gpt-image-custom",
        size: "1536x1024",
      },
      fetchFn,
    });
    const input = {
      kind: "data_url" as const,
      value: `data:image/png;base64,${pngB64}`,
      name: "reference.png",
    };

    const events = await collect(
      runtime.generateImage({
        runId: "image-run-2",
        mode: "edit",
        prompt: "make it warmer",
        input,
        createdAt,
      }),
    );

    expect(requestedUrl).toBe("https://images.example.test/v1/images/edits");
    expect(requestedBody).toBeInstanceOf(FormData);
    expect(requestedBody?.get("model")).toBe("gpt-image-custom");
    expect(requestedBody?.get("prompt")).toBe("make it warmer");
    expect(requestedBody?.get("size")).toBe("1536x1024");
    expect(requestedBody?.get("response_format")).toBe("b64_json");
    const image = requestedBody?.get("image");
    expect(image).toBeInstanceOf(Blob);
    expect((image as Blob).type).toBe("image/png");
    expect(events[1]).toMatchObject({
      type: "completed",
      result: {
        mode: "edit",
        model: "gpt-image-custom",
        input,
      },
    });
  });

  it("returns a malformed-response failure when b64_json is absent", async () => {
    const runtime = createRuntime({
      fetchFn: (async () =>
        imageResponse({ data: [{ url: "https://example.test/image.png" }] })) as typeof fetch,
    });

    const events = await collect(
      runtime.generateImage({
        runId: "image-run-3",
        mode: "generate",
        prompt: "missing b64 result",
        createdAt,
      }),
    );

    expect(events.map((event) => event.type)).toEqual(["started", "failed"]);
    expect(events[1]).toMatchObject({
      type: "failed",
      error: {
        code: "MALFORMED_IMAGE_RESPONSE",
      },
    });
  });

  it("rejects local filesystem path strings as image URL inputs before fetch", async () => {
    let fetchCalled = false;
    const runtime = createRuntime({
      fetchFn: (async () => {
        fetchCalled = true;
        return imageResponse();
      }) as typeof fetch,
    });

    const events = await collect(
      runtime.generateImage({
        runId: "image-run-4",
        mode: "edit",
        prompt: "edit local path",
        input: {
          kind: "url",
          value: "C:\\Users\\me\\image.png",
        },
        createdAt,
      }),
    );

    expect(fetchCalled).toBe(false);
    expect(events.map((event) => event.type)).toEqual(["started", "failed"]);
    expect(events[1]).toMatchObject({
      type: "failed",
      error: {
        code: "UNSUPPORTED_IMAGE_INPUT",
      },
    });
  });
});
