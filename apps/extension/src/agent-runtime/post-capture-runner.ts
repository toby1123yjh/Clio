import type {
  EngineRequest,
  RecoverPostCaptureJobsResult,
  RunNextPostCaptureJobResult,
} from "@/src/shared/rpc";

export interface PostCaptureRunnerOptions {
  requestEngine: (request: EngineRequest) => Promise<unknown>;
}

export class PostCaptureRunner {
  private readonly requestEngine: PostCaptureRunnerOptions["requestEngine"];
  private draining = false;
  private wakeQueued = false;

  constructor(options: PostCaptureRunnerOptions) {
    this.requestEngine = options.requestEngine;
  }

  async wake(): Promise<void> {
    if (this.draining) {
      this.wakeQueued = true;
      return;
    }
    this.draining = true;
    try {
      do {
        this.wakeQueued = false;
        await this.drainOnce();
      } while (this.wakeQueued);
    } finally {
      this.draining = false;
    }
  }

  private async drainOnce() {
    await this.request<"recoverPostCaptureJobs", RecoverPostCaptureJobsResult>({
      kind: "recoverPostCaptureJobs",
    });
    while (true) {
      const result = await this.request<"runNextPostCaptureJob", RunNextPostCaptureJobResult>({
        kind: "runNextPostCaptureJob",
      });
      if (result.status === "idle") return;
    }
  }

  private async request<K extends EngineRequest["kind"], T>(
    request: Extract<EngineRequest, { kind: K }>,
  ) {
    return (await this.requestEngine(request)) as T;
  }
}
