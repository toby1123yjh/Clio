import { describe, expect, it, vi } from "vitest";
import { PostCaptureRunner } from "./post-capture-runner";

describe("PostCaptureRunner", () => {
  it("recovers and drains automatic jobs sequentially", async () => {
    const requests: string[] = [];
    let runs = 0;
    const runner = new PostCaptureRunner({
      requestEngine: vi.fn(async (request) => {
        requests.push(request.kind);
        if (request.kind === "recoverPostCaptureJobs") return { requeued: 1, failed: 0 };
        if (request.kind === "runNextPostCaptureJob") {
          runs += 1;
          return runs <= 2
            ? {
                status: "ran",
                job: {
                  id: `job-${runs}`,
                  type: "post_capture_hardening",
                  status: "done",
                  attempts: 1,
                  maxAttempts: 3,
                  progressCurrent: 5,
                  progressTotal: 5,
                  cancelRequested: false,
                  createdAt: "2026-08-14T00:00:00.000Z",
                },
              }
            : { status: "idle" };
        }
        throw new Error(`Unexpected request: ${request.kind}`);
      }),
    });

    await runner.wake();

    expect(requests).toEqual([
      "recoverPostCaptureJobs",
      "runNextPostCaptureJob",
      "runNextPostCaptureJob",
      "runNextPostCaptureJob",
    ]);
  });

  it("coalesces concurrent wakes into one sequential drain", async () => {
    let releaseFirstRun: (() => void) | undefined;
    let runCalls = 0;
    const requestEngine = vi.fn(async (request) => {
      if (request.kind === "recoverPostCaptureJobs") return { requeued: 0, failed: 0 };
      if (request.kind === "runNextPostCaptureJob") {
        runCalls += 1;
        if (runCalls === 1) {
          await new Promise<void>((resolve) => {
            releaseFirstRun = resolve;
          });
        }
        return { status: "idle" };
      }
      throw new Error(`Unexpected request: ${request.kind}`);
    });
    const runner = new PostCaptureRunner({ requestEngine });

    const first = runner.wake();
    await vi.waitFor(() => expect(releaseFirstRun).toBeTypeOf("function"));
    const second = runner.wake();
    releaseFirstRun?.();
    await Promise.all([first, second]);

    expect(runCalls).toBe(2);
    expect(
      requestEngine.mock.calls.filter(([request]) => request.kind === "recoverPostCaptureJobs"),
    ).toHaveLength(2);
  });
});
