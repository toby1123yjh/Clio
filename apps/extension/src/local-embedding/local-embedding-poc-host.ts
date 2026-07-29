import workerUrl from "./local-embedding-poc.worker.ts?worker&url";
import {
  type LocalEmbeddingPocModelKey,
  type LocalEmbeddingPocRequest,
  type LocalEmbeddingPocResponse,
  isLocalEmbeddingPocModelKey,
  localEmbeddingPocModels,
} from "./poc-models";

const pocTimeoutMs = 20 * 60 * 1000;

export function runLocalEmbeddingPoc(modelKey: LocalEmbeddingPocModelKey | "all" = "all") {
  if (modelKey === "all") {
    return runAllLocalEmbeddingPocs();
  }
  if (!isLocalEmbeddingPocModelKey(modelKey)) {
    return Promise.reject(new Error(`Unknown local embedding POC model: ${String(modelKey)}`));
  }
  return runOneLocalEmbeddingPoc(modelKey);
}

async function runAllLocalEmbeddingPocs() {
  const granite = await runOneLocalEmbeddingPoc("granite");
  const e5 = await runOneLocalEmbeddingPoc("e5");
  return {
    poc: "POC-08-local-embedding",
    status: granite.status === "pass" && e5.status === "pass" ? "pass" : "fail",
    models: { granite, e5 },
  };
}

function runOneLocalEmbeddingPoc(modelKey: LocalEmbeddingPocModelKey) {
  const worker = new Worker(new URL(workerUrl, location.href), {
    name: `clio-local-embedding-poc-${modelKey}`,
    type: "module",
  });
  const requestId = crypto.randomUUID();
  const request: LocalEmbeddingPocRequest = {
    kind: "run",
    requestId,
    model: localEmbeddingPocModels[modelKey],
    wasmPaths: {
      wasm: chrome.runtime.getURL("assets/ort-wasm-simd-threaded.wasm"),
      mjs: chrome.runtime.getURL("assets/ort-wasm-simd-threaded.mjs"),
      jsepWasm: chrome.runtime.getURL("assets/ort-wasm-simd-threaded.jsep.wasm"),
      jsepMjs: chrome.runtime.getURL("assets/ort-wasm-simd-threaded.jsep.mjs"),
    },
  };

  return new Promise<Record<string, unknown>>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      worker.terminate();
      reject(new Error(`${localEmbeddingPocModels[modelKey].label} POC timed out.`));
    }, pocTimeoutMs);
    const cleanup = () => {
      window.clearTimeout(timer);
      worker.terminate();
    };
    worker.addEventListener("message", (event: MessageEvent<LocalEmbeddingPocResponse>) => {
      if (event.data.kind !== "result" || event.data.requestId !== requestId) return;
      cleanup();
      if (event.data.ok && event.data.value !== undefined) {
        resolve(event.data.value);
        return;
      }
      reject(new Error(event.data.error ?? "Local embedding POC failed."));
    });
    worker.addEventListener("error", (event) => {
      cleanup();
      reject(event.error ?? new Error(event.message));
    });
    worker.postMessage(request);
  });
}
