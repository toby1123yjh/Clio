import type { CaptureResult, EngineResponse, EngineTransportRequest } from "@/src/shared/rpc";
import { describe, expect, it } from "vitest";
import { wikiAutoCompileSourceId } from "./wiki-auto-compile";

const captureRequest = {
  kind: "capturePage",
  payload: {
    sourceUrl: "https://example.test/source",
    sourceTitle: "Source",
    normalizedText: "Captured text",
    capturedAt: "2026-08-12T00:00:00.000Z",
  },
} satisfies EngineTransportRequest;

function captureResponse(status: CaptureResult["status"]): EngineResponse<CaptureResult> {
  return {
    ok: true,
    value: {
      status,
      memory: {
        id: "source-1",
        sourceKind: "page",
        sourceUrl: "https://example.test/source",
        sourceTitle: "Source",
        capturedAt: "2026-08-12T00:00:00.000Z",
        excerpt: "Captured text",
        version: {
          groupKey: "page:https://example.test/source",
          versionNo: 1,
          isCurrent: true,
        },
      },
    },
  };
}

describe("Wiki auto compile capture observer", () => {
  it("selects only newly saved capture results", () => {
    expect(wikiAutoCompileSourceId(captureRequest, captureResponse("saved"))).toBe("source-1");
    expect(wikiAutoCompileSourceId(captureRequest, captureResponse("duplicate"))).toBeUndefined();
  });

  it("ignores failed responses and non-capture requests", () => {
    expect(
      wikiAutoCompileSourceId(captureRequest, {
        ok: false,
        error: { code: "CAPTURE_FAILED", message: "failed" },
      }),
    ).toBeUndefined();
    expect(wikiAutoCompileSourceId({ kind: "health" }, captureResponse("saved"))).toBeUndefined();
  });
});
