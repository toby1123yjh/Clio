import { afterEach, describe, expect, it, vi } from "vitest";
import { requestEngine } from "./chrome-client";
import {
  type PdfRawFileResult,
  encodeEngineResponseForChrome,
  isEngineRequestMessage,
} from "./rpc";

describe("Chrome Engine client PDF transport", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("encodes PDF bytes before calling chrome.runtime.sendMessage", async () => {
    const sendMessage = vi.fn().mockResolvedValue({
      ok: true,
      value: {
        status: "saved",
        memory: {
          id: "source-pdf-1",
          sourceKind: "page",
          sourceUrl: "clio://upload/paper.pdf",
          sourceTitle: "paper.pdf",
          capturedAt: "2026-07-13T00:00:00.000Z",
          excerpt: "PDF evidence",
          version: { groupKey: "pdf:paper", versionNo: 1, isCurrent: true },
        },
      },
    });
    vi.stubGlobal("chrome", { runtime: { sendMessage } });

    await requestEngine({
      kind: "capturePdf",
      payload: {
        sourceUrl: "clio://upload/paper.pdf",
        sourceTitle: "paper.pdf",
        bytes: new Uint8Array([37, 80, 68, 70, 45]),
      },
    });

    const message: unknown = sendMessage.mock.calls[0]?.[0];
    expect(isEngineRequestMessage(message)).toBe(true);
    if (!isEngineRequestMessage(message) || message.request.kind !== "capturePdf") {
      throw new Error("Expected a Chrome-safe PDF capture message.");
    }
    expect(message.request.payload.bytesBase64).toBe("JVBERi0=");
    expect(message.request.payload.byteLength).toBe(5);
    expect("bytes" in message.request.payload).toBe(false);
  });

  it("decodes raw PDF bytes returned through Chrome messaging", async () => {
    const request = { kind: "getPdfRawFile", id: "source-pdf-1" } as const;
    const sendMessage = vi.fn().mockResolvedValue(
      encodeEngineResponseForChrome(request, {
        ok: true,
        value: {
          memoryId: "source-pdf-1",
          sourceTitle: "paper.pdf",
          sourceUrl: "clio://upload/paper.pdf",
          bytes: new Uint8Array([37, 80, 68, 70, 45]),
          byteLength: 5,
          contentType: "application/pdf",
        } satisfies PdfRawFileResult,
      }),
    );
    vi.stubGlobal("chrome", { runtime: { sendMessage } });

    const result = await requestEngine(request);

    expect(Array.from(result.bytes as Uint8Array)).toEqual([37, 80, 68, 70, 45]);
    expect(result.byteLength).toBe(5);
  });
});
