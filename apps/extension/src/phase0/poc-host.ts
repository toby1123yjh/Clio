import sqliteWasmUrl from "@sqlite.org/sqlite-wasm/sqlite3.wasm?url";
import pocWorkerUrl from "./poc-worker.ts?worker&url";

type PocResult = Record<string, unknown>;
type SqliteDb = {
  selectValue: (sql: string) => unknown;
  exec: (options: string | { sql: string; bind: unknown[] }) => void;
  close: () => void;
};
type SqliteApi = {
  oo1: {
    DB: new (filename: string, flags?: string) => SqliteDb;
  };
  version: {
    libVersion: string;
  };
};
type SqliteInitModule = (config?: {
  locateFile?: (path: string) => string;
}) => Promise<SqliteApi>;

declare global {
  interface Window {
    __clioPhase0Poc: {
      ping: () => PocResult;
      opfsWriteRead: (value: string) => Promise<PocResult>;
      opfsRead: () => Promise<PocResult>;
      sqliteFts5: () => Promise<PocResult>;
      indexedDbFallback: () => Promise<PocResult>;
      workerRuntimeCsp: () => Promise<PocResult>;
    };
  }
}

const opfsFileName = "clio-phase0-opfs.txt";
const oneMbText = "Clio browser worker CPU isolation retrieval memory evidence. ".repeat(
  Math.ceil((1024 * 1024) / 60),
);

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function toChineseBigrams(input: string) {
  return input.replace(/\p{Script=Han}+/gu, (segment) => {
    const chars = Array.from(segment);
    const bigrams = [];
    for (let index = 0; index < chars.length - 1; index += 1) {
      bigrams.push(`${chars[index]}${chars[index + 1]}`);
    }
    return `${segment} ${bigrams.join(" ")}`;
  });
}

function tokenize(text: string) {
  return Array.from(new Set(text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []));
}

function requestToPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function percentile(values: number[], p: number) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index] ?? 0;
}

function workerRequest<T>(worker: Worker, message: unknown, timeoutMs = 15_000) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Phase 0 worker timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
    };
    const onMessage = (event: MessageEvent<T>) => {
      cleanup();
      resolve(event.data);
    };
    const onError = (event: ErrorEvent) => {
      cleanup();
      reject(event.error ?? new Error(event.message));
    };
    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onError);
    worker.postMessage(message);
  });
}

async function wasmCompileSmoke() {
  const emptyModule = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
  await WebAssembly.instantiate(emptyModule);
  return true;
}

export function installPhase0PocHost(hostKind: "offscreen" | "extension-page") {
  window.__clioPhase0Poc = {
    ping: () => ({
      poc: "POC-04",
      hostKind,
      href: location.href,
      origin: location.origin,
      isSecureContext,
      hasOpfs: typeof navigator.storage?.getDirectory === "function",
      hasIndexedDb: typeof indexedDB !== "undefined",
    }),
    opfsWriteRead: async (value: string) => {
      assert(
        typeof navigator.storage?.getDirectory === "function",
        "OPFS getDirectory unavailable",
      );

      const root = await navigator.storage.getDirectory();
      const file = await root.getFileHandle(opfsFileName, { create: true });
      const writable = await file.createWritable();
      await writable.write(value);
      await writable.close();
      const stored = await (await file.getFile()).text();
      assert(stored === value, "OPFS immediate read mismatch");

      return {
        poc: "POC-02",
        hostKind,
        value: stored,
        context: {
          href: location.href,
          origin: location.origin,
          isSecureContext,
        },
      };
    },
    opfsRead: async () => {
      assert(
        typeof navigator.storage?.getDirectory === "function",
        "OPFS getDirectory unavailable",
      );

      const root = await navigator.storage.getDirectory();
      const file = await root.getFileHandle(opfsFileName);
      const stored = await (await file.getFile()).text();

      return {
        poc: "POC-02",
        hostKind,
        value: stored,
        context: {
          href: location.href,
          origin: location.origin,
          isSecureContext,
        },
      };
    },
    sqliteFts5: async () => {
      const { default: sqlite3InitModule } = (await import("@sqlite.org/sqlite-wasm")) as {
        default: SqliteInitModule;
      };
      const sqlite3 = await sqlite3InitModule({
        locateFile: (path: string) =>
          path === "sqlite3.wasm" ? new URL(sqliteWasmUrl, location.href).href : path,
      });
      const db = new sqlite3.oo1.DB("/phase0-browser.sqlite3", "ct");
      try {
        const integrity = db.selectValue("PRAGMA integrity_check");
        assert(integrity === "ok", `expected integrity_check=ok, got ${integrity}`);

        db.exec(
          "CREATE VIRTUAL TABLE docs USING fts5(content, tokenize='unicode61 remove_diacritics 2')",
        );
        db.exec({
          sql: "INSERT INTO docs(content) VALUES (?)",
          bind: [toChineseBigrams("浏览器记忆 系统")],
        });
        const hits = db.selectValue("SELECT count(*) FROM docs WHERE docs MATCH '浏览'");
        assert(hits === 1, `expected Chinese bigram MATCH hit, got ${hits}`);

        return {
          poc: "POC-01/POC-03",
          hostKind,
          sqliteVersion: sqlite3.version.libVersion,
          integrity,
          fts5ChineseBigramHits: hits,
        };
      } finally {
        db.close();
      }
    },
    workerRuntimeCsp: async () => {
      const worker = new Worker(new URL(pocWorkerUrl, location.href), {
        name: "clio-phase0-poc-worker",
        type: "module",
      });
      let terminated = false;
      try {
        const ping = await workerRequest<{ kind: string; ok: boolean }>(worker, { kind: "ping" });
        assert(ping.kind === "pong" && ping.ok, "worker heartbeat failed");

        let ticks = 0;
        let maxLagMs = 0;
        let expected = performance.now() + 10;
        const interval = setInterval(() => {
          const now = performance.now();
          maxLagMs = Math.max(maxLagMs, now - expected);
          expected = now + 10;
          ticks += 1;
        }, 10);
        let cpu: {
          kind: string;
          chunks: number;
          bytes: number;
          rounds: number;
          checksum: number;
          workerDurationMs: number;
        };
        try {
          cpu = await workerRequest(worker, {
            kind: "cpu",
            text: oneMbText.slice(0, 1024 * 1024),
            chunkSize: 2048,
            rounds: 32,
          });
        } finally {
          clearInterval(interval);
        }

        assert(cpu.kind === "cpu:done", "worker returned unexpected response");
        assert(cpu.chunks > 0, "worker returned no chunks");
        assert(ticks > 0, "main event loop did not tick during worker CPU task");
        assert(maxLagMs < 100, `main event loop max lag too high: ${maxLagMs.toFixed(1)}ms`);

        await wasmCompileSmoke();
        await worker.terminate();
        terminated = true;

        return {
          poc: "POC-04/POC-05/POC-06",
          hostKind,
          worker: {
            constructed: true,
            heartbeat: ping,
            terminated,
          },
          cpu: {
            chunks: cpu.chunks,
            bytes: cpu.bytes,
            rounds: cpu.rounds,
            checksum: cpu.checksum,
            workerDurationMs: Number(cpu.workerDurationMs.toFixed(1)),
            mainLoopTicks: ticks,
            maxMainLoopLagMs: Number(maxLagMs.toFixed(1)),
          },
          csp: {
            workerConstructed: true,
            wasmCompile: true,
            remoteFetch: "deferred: provider host permissions are manifest-declared",
          },
        };
      } finally {
        if (!terminated) await worker.terminate();
      }
    },
    indexedDbFallback: async () => {
      const db = await openIndexedDb();
      try {
        const writeTx = db.transaction(["chunks", "postings"], "readwrite");
        const chunks = writeTx.objectStore("chunks");
        const postings = writeTx.objectStore("postings");
        const index = new Map<string, number[]>();
        for (let id = 0; id < 1000; id += 1) {
          const text = `Clio browser memory chunk ${id} ${id % 10 === 0 ? "retrieval target" : "ordinary text"}`;
          chunks.put({ id, text });
          for (const term of tokenize(text)) {
            const ids = index.get(term) ?? [];
            ids.push(id);
            index.set(term, ids);
          }
        }
        for (const [term, ids] of index) postings.put({ term, ids });
        await transactionDone(writeTx);

        const timings = [];
        let hits = 0;
        for (let run = 0; run < 50; run += 1) {
          const started = performance.now();
          const readTx = db.transaction("postings", "readonly");
          const row = await requestToPromise<{ ids?: number[] }>(
            readTx.objectStore("postings").get("retrieval"),
          );
          await transactionDone(readTx);
          hits = row?.ids?.length ?? 0;
          timings.push(performance.now() - started);
        }
        const p95 = percentile(timings, 95);
        assert(hits === 100, `expected 100 hits, got ${hits}`);
        assert(p95 < 200, `expected P95 < 200ms, got ${p95.toFixed(1)}ms`);

        return {
          poc: "POC-10",
          hostKind,
          chunks: 1000,
          query: "retrieval",
          hits,
          p95Ms: Number(p95.toFixed(2)),
        };
      } finally {
        db.close();
      }
    },
  };
}

async function openIndexedDb() {
  const request = indexedDB.open(`clio-phase0-poc-${Date.now()}`, 1);
  request.onupgradeneeded = () => {
    const db = request.result;
    db.createObjectStore("chunks", { keyPath: "id" });
    db.createObjectStore("postings", { keyPath: "term" });
  };
  return requestToPromise(request);
}
