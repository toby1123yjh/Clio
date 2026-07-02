import { hashText } from "@/src/shared/text";
import { describe, expect, it, vi } from "vitest";
import { parsePdfDocument, pdfCapturePayloadFromParsedDocument } from "./pdf-parser";

describe("pdf parser", () => {
  it("extracts normalized text and page ranges from a PDF.js document", async () => {
    const destroy = vi.fn(async () => undefined);
    const pdfjs = fakePdfJs({
      pages: [
        ["First", "page", "evidence"],
        ["Second", "page", "anchors"],
      ],
      info: {
        Title: "Parser PDF",
        Author: "Ada Lovelace",
        Subject: "RAG evidence",
        Keywords: "rag; pdf, anchors",
      },
      destroy,
    });

    const parsed = await parsePdfDocument(new Uint8Array([1, 2, 3]), pdfjs);

    expect(parsed.text).toBe("First page evidence\n\nSecond page anchors");
    expect(parsed.pages).toEqual([
      {
        pageNumber: 1,
        text: "First page evidence",
        charStart: 0,
        charEnd: 19,
      },
      {
        pageNumber: 2,
        text: "Second page anchors",
        charStart: 21,
        charEnd: 40,
      },
    ]);
    expect(parsed.metadata).toMatchObject({
      title: "Parser PDF",
      author: "Ada Lovelace",
      subject: "RAG evidence",
      keywords: ["rag", "pdf", "anchors"],
      pageCount: 2,
      parser: "pdfjs",
      textHash: hashText(parsed.text),
    });
    expect(destroy).toHaveBeenCalledOnce();
  });

  it("converts parsed output into a PDF capture payload without bypassing source adapters", async () => {
    const parsed = await parsePdfDocument(
      new ArrayBuffer(1),
      fakePdfJs({
        pages: [
          ["Payload", "page"],
          ["Second", "payload", "page"],
        ],
        info: {
          Title: "Parsed Payload Title",
          Author: "Grace Hopper",
        },
      }),
    );

    const payload = pdfCapturePayloadFromParsedDocument({
      parsed,
      sourceUrl: "https://example.test/file.pdf",
      sourceTitle: "Caller Title",
      capturedAt: "2026-07-02T00:00:00.000Z",
      metadata: {
        title: "Explicit Caller Title",
        project: "clio",
      },
    });

    expect(payload).toEqual({
      sourceUrl: "https://example.test/file.pdf",
      sourceTitle: "Parsed Payload Title",
      normalizedText: "Payload page\n\nSecond payload page",
      capturedAt: "2026-07-02T00:00:00.000Z",
      metadata: {
        title: "Explicit Caller Title",
        project: "clio",
        adapter: "pdf",
        source_type: "pdf",
        mime_type: "application/pdf",
        parser: "pdfjs",
        pdf_page_count: 2,
        pdf_text_hash: hashText("Payload page\n\nSecond payload page"),
        pdf_pages: [
          { pageNumber: 1, charStart: 0, charEnd: 12 },
          { pageNumber: 2, charStart: 14, charEnd: 33 },
        ],
        author: "Grace Hopper",
      },
    });
  });

  it("rejects PDFs with no readable text", async () => {
    await expect(
      parsePdfDocument(
        new Uint8Array([1]),
        fakePdfJs({
          pages: [["   "], [""]],
        }),
      ),
    ).rejects.toThrow("PDF_EMPTY_TEXT");
  });
});

function fakePdfJs(input: {
  pages: string[][];
  info?: Record<string, unknown>;
  destroy?: () => Promise<void>;
}) {
  return {
    getDocument() {
      return {
        promise: Promise.resolve({
          numPages: input.pages.length,
          async getPage(pageNumber: number) {
            const page = input.pages[pageNumber - 1] ?? [];
            return {
              async getTextContent() {
                return {
                  items: page.map((str) => ({ str })),
                };
              },
            };
          },
          async getMetadata() {
            return {
              info: input.info ?? {},
            };
          },
          destroy: input.destroy,
        }),
      };
    },
  };
}
