type WorkerRequest =
  | { kind: "ping" }
  | {
      kind: "cpu";
      text: string;
      chunkSize: number;
      rounds: number;
    };

function hashRange(text: string, start: number, end: number, seed: number) {
  let hash = 2166136261 ^ seed;
  for (let index = start; index < end; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

self.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  if (request.kind === "ping") {
    self.postMessage({ kind: "pong", ok: true });
    return;
  }

  const started = performance.now();
  let chunks = 0;
  let checksum = 0;
  for (let round = 0; round < request.rounds; round += 1) {
    for (let offset = 0; offset < request.text.length; offset += request.chunkSize) {
      const end = Math.min(offset + request.chunkSize, request.text.length);
      checksum ^= hashRange(request.text, offset, end, round + offset);
      if (round === 0) chunks += 1;
    }
  }

  self.postMessage({
    kind: "cpu:done",
    chunks,
    bytes: request.text.length,
    rounds: request.rounds,
    checksum: checksum >>> 0,
    workerDurationMs: performance.now() - started,
  });
});
