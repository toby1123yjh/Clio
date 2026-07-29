import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { LocalEmbeddingBackend } from "./contracts";
import { LocalEmbeddingRuntimeHost } from "./runtime-host";
import type {
  LocalEmbeddingRuntimeRequest,
  LocalEmbeddingRuntimeResponse,
} from "./runtime-protocol";

const workerSource = readFileSync(
  fileURLToPath(new URL("./local-embedding.worker.ts", import.meta.url)),
  "utf8",
);

describe("local embedding runtime host", () => {
  it("enables local cache resolution without permitting remote model fallback", () => {
    expect(workerSource).toContain("env.allowLocalModels = true");
    expect(workerSource).toContain("env.allowRemoteModels = false");
    expect(workerSource).toContain("env.useCustomCache = true");
    expect(workerSource).toContain("env.localModelPath = localEmbeddingTransformersModelPath");
    expect(workerSource).toContain("await runtimeCache.match(configCacheKey)");
    expect(workerSource).toContain("local_files_only: true");
    expect(workerSource).not.toContain("env.allowLocalModels = false");
  });

  it("terminates a failed WebGPU worker before creating the WASM fallback", async () => {
    const workers: FakeWorker[] = [];
    const host = new LocalEmbeddingRuntimeHost({
      hasWebGpu: () => true,
      getWasmPaths: () => ({
        wasm: "wasm.wasm",
        mjs: "wasm.mjs",
        jsepWasm: "jsep.wasm",
        jsepMjs: "jsep.mjs",
      }),
      createWorker: (backend) => {
        const worker = new FakeWorker(backend);
        workers.push(worker);
        return worker as unknown as Worker;
      },
    });

    const health = await host.load("local-transformers:test-model");

    expect(health).toMatchObject({
      backend: "wasm",
      ready: true,
      fallbackReason: "WebGPU smoke failed",
    });
    expect(workers.map((worker) => worker.backend)).toEqual(["webgpu", "wasm"]);
    expect(workers[0]?.terminated).toBe(true);
    expect(workers[1]?.terminated).toBe(false);
    await expect(
      host.embed("local-transformers:test-model", "query", ["bounded query"]),
    ).resolves.toEqual([[1, 0, 0]]);

    await host.dispose();
    expect(workers[1]?.terminated).toBe(true);
  });
});

class FakeWorker extends EventTarget {
  terminated = false;

  constructor(readonly backend: LocalEmbeddingBackend) {
    super();
  }

  postMessage(request: LocalEmbeddingRuntimeRequest) {
    queueMicrotask(() => {
      if (this.terminated) return;
      if (request.kind === "load" && this.backend === "webgpu") {
        this.respond({
          kind: "result",
          requestId: request.requestId,
          ok: false,
          error: { code: "WEBGPU_SMOKE_FAILED", message: "WebGPU smoke failed" },
        });
        return;
      }
      this.respond({
        kind: "result",
        requestId: request.requestId,
        ok: true,
        value:
          request.kind === "embed"
            ? [[1, 0, 0]]
            : request.kind === "load"
              ? { ready: true, backend: this.backend }
              : { disposed: true },
      });
    });
  }

  terminate() {
    this.terminated = true;
  }

  private respond(response: LocalEmbeddingRuntimeResponse) {
    this.dispatchEvent(new MessageEvent("message", { data: response }));
  }
}
