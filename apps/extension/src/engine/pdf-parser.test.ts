import { hashText } from "@/src/shared/text";
import { describe, expect, it, vi } from "vitest";
import {
  extractPdfFigureVisionImageInput,
  parsePdfDocument,
  pdfCapturePayloadFromParsedDocument,
} from "./pdf-parser";

describe("pdf parser", () => {
  it("configures the bundled PDF.js worker before loading a document", async () => {
    const workerOptions = { workerSrc: "" };
    const pdfjs = {
      ...fakePdfJs({ pages: [["Worker-backed PDF"]] }),
      GlobalWorkerOptions: workerOptions,
    };

    await parsePdfDocument(new Uint8Array([1, 2, 3]), pdfjs);

    expect(workerOptions.workerSrc).toContain("pdf.worker");
  });

  it("extracts normalized text and page ranges from a PDF.js document", async () => {
    const destroy = vi.fn(async () => undefined);
    const pdfjs = fakePdfJs({
      pages: [
        ["First", "page", "evidence"],
        ["Second", "page", "anchors"],
      ],
      pageSizes: {
        1: { width: 612, height: 792 },
        2: { width: 612, height: 792 },
      },
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
        pageWidth: 612,
        pageHeight: 792,
        pageUnit: "pdf_user_space",
      },
      {
        pageNumber: 2,
        text: "Second page anchors",
        charStart: 21,
        charEnd: 40,
        pageWidth: 612,
        pageHeight: 792,
        pageUnit: "pdf_user_space",
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
    expect(parsed.parseProfile).toEqual({
      parser: "pdfjs",
      parserVersion: "clio-pdf-structure-v2",
      pageCount: 2,
      textHash: hashText(parsed.text),
      ocrStatus: "not_required",
      warnings: ["section_outline_unavailable"],
    });
    expect(parsed.pageLabels).toEqual([
      {
        pageNumber: 1,
        label: "Page 1",
        charStart: 0,
        charEnd: 19,
        pageWidth: 612,
        pageHeight: 792,
        pageUnit: "pdf_user_space",
      },
      {
        pageNumber: 2,
        label: "Page 2",
        charStart: 21,
        charEnd: 40,
        pageWidth: 612,
        pageHeight: 792,
        pageUnit: "pdf_user_space",
      },
    ]);
    expect(parsed.rawFile).toEqual({
      status: "not_persisted",
      reason: "raw_file_persistence_pending",
      byteLength: 3,
    });
    expect(parsed.parseQuality).toMatchObject({
      version: "clio-pdf-parse-quality-v1",
      status: "needs_review",
      metrics: {
        pageCount: 2,
        textPageCoverage: 1,
        sectionCount: 0,
        referenceCount: 0,
        figureCaptionCount: 0,
        imageArtifactCount: 0,
        tableCaptionCount: 0,
        tableStructureCount: 0,
        tableSemanticCount: 0,
        figureAnalysisQueueCount: 0,
        figureVisionReadyCount: 0,
        citationLinkCount: 0,
        linkedReferenceRatio: null,
      },
      warnings: ["section_outline_unavailable"],
    });
    expect(destroy).toHaveBeenCalledOnce();
  });

  it("extracts scientific PDF structure for downstream metadata consumers", async () => {
    const parsed = await parsePdfDocument(
      new Uint8Array([1, 2, 3, 4]),
      fakePdfJs({
        pages: [
          [
            [
              "Abstract",
              "This paper studies parser-backed local RAG.",
              "1 Introduction",
              "Prior local-memory systems cite related work [1].",
              "Figure 1: System overview for bounded evidence.",
              "Table 1: Retrieval quality metrics.",
            ].join("\n"),
          ],
          [
            [
              "2 Method",
              "The parser records page anchors and source metadata.",
              "References",
              "[1] Ada Lovelace. Notes on local memory. 2024. doi:10.1234/clio.1",
              "[2] Grace Hopper. Debugging evidence systems. 2025.",
            ].join("\n"),
          ],
        ],
        info: {
          Title: "Structured Parser PDF",
        },
        ops: { paintImageXObject: 85 },
        operatorLists: {
          1: { fnArray: [85], argsArray: [["figure_image_1"]] },
        },
      }),
    );

    expect(parsed.sections.map((section) => section.text)).toEqual([
      "Abstract",
      "Introduction",
      "Method",
      "References",
    ]);
    expect(parsed.sections.map((section) => section.kind)).toEqual([
      "abstract",
      "introduction",
      "method",
      "references",
    ]);
    expect(parsed.references).toMatchObject([
      {
        index: 0,
        label: "[1]",
        text: "Ada Lovelace. Notes on local memory. 2024. doi:10.1234/clio.1",
        pageStart: 2,
        pageEnd: 2,
        doi: "10.1234/clio.1",
        year: 2024,
      },
      {
        index: 1,
        label: "[2]",
        text: "Grace Hopper. Debugging evidence systems. 2025.",
        pageStart: 2,
        pageEnd: 2,
        year: 2025,
      },
    ]);
    expect(parsed.figures).toMatchObject([
      {
        id: "figure:1",
        kind: "figure",
        label: "Figure 1",
        caption: "System overview for bounded evidence.",
        pageNumber: 1,
        confidence: "medium",
      },
    ]);
    expect(parsed.tables).toMatchObject([
      {
        id: "table:1",
        kind: "table",
        label: "Table 1",
        caption: "Retrieval quality metrics.",
        pageNumber: 1,
        confidence: "medium",
      },
    ]);
    expect(parsed.images).toMatchObject([
      {
        pageNumber: 1,
        label: "Figure 1",
        caption: "System overview for bounded evidence.",
        objectRef: "figure_image_1",
        source: "pdfjs_operator_list",
        extractionStatus: "operator_detected",
        visionAnalysis: {
          status: "requires_visual_model",
          modelInput: "image",
          inputRequirement: "bounded_image_or_page_crop",
          inputStatus: "needs_bounded_crop",
          promptBoundary: "no_full_pdf_prompt",
          providerBoundary: "trusted_runtime_required",
        },
      },
    ]);
    expect(parsed.figureAnalyses).toMatchObject([
      {
        imageId: "image:1",
        pageNumber: 1,
        label: "Figure 1",
        status: "requires_visual_model",
        modelInput: "image",
        inputStatus: "needs_bounded_crop",
        reason: "bounded_image_crop_required",
      },
    ]);
    expect(parsed.citationLinks).toMatchObject([
      {
        marker: "[1]",
        normalizedTargetLabel: "[1]",
        targetReferenceIndex: 0,
        targetReferenceLabel: "[1]",
        pageNumber: 1,
        citationStyle: "numeric_bracket",
        confidence: "high",
      },
    ]);
    expect(parsed.parseQuality).toMatchObject({
      status: "pass",
      metrics: {
        referenceCount: 2,
        figureCaptionCount: 1,
        imageArtifactCount: 1,
        tableCaptionCount: 1,
        tableStructureCount: 0,
        figureAnalysisQueueCount: 1,
        figureVisionReadyCount: 1,
        citationLinkCount: 1,
        linkedReferenceRatio: 0.5,
      },
      warnings: ["table_caption_without_structure", "figure_visual_model_required"],
    });

    const payload = pdfCapturePayloadFromParsedDocument({
      parsed,
      sourceUrl: "https://example.test/structured.pdf",
      sourceTitle: "structured.pdf",
    });

    expect(payload.metadata.sectionOutline).toEqual([
      { level: 1, text: "Abstract" },
      { level: 1, text: "Introduction" },
      { level: 1, text: "Method" },
      { level: 1, text: "References" },
    ]);
    expect(payload.metadata.pdf_sections).toHaveLength(4);
    expect(payload.metadata.pdf_references).toHaveLength(2);
    expect(payload.metadata.pdf_figures).toHaveLength(1);
    expect(payload.metadata.pdf_images).toHaveLength(1);
    expect(payload.metadata.pdf_figure_analyses).toHaveLength(1);
    expect(payload.metadata.pdf_tables).toHaveLength(1);
    expect(payload.metadata.pdf_citation_links).toHaveLength(1);
    expect(payload.metadata.pdf_parse_profile).toMatchObject({
      parser: "pdfjs",
      parserVersion: "clio-pdf-structure-v2",
      pageCount: 2,
      ocrStatus: "not_required",
      warnings: [],
    });
    expect(payload.metadata.pdf_parse_quality).toMatchObject({
      version: "clio-pdf-parse-quality-v1",
      metrics: {
        citationLinkCount: 1,
        imageArtifactCount: 1,
      },
    });
    expect(payload.metadata.pdf_raw_file).toEqual({
      status: "not_persisted",
      reason: "raw_file_persistence_pending",
      byteLength: 4,
    });
  });

  it("converts parsed output into a PDF capture payload without bypassing source adapters", async () => {
    const parsed = await parsePdfDocument(
      new ArrayBuffer(1),
      fakePdfJs({
        pages: [
          ["Payload", "page"],
          ["Second", "payload", "page"],
        ],
        pageSizes: {
          1: { width: 640, height: 900 },
          2: { width: 640, height: 900 },
        },
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

    expect(payload).toMatchObject({
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
          {
            pageNumber: 1,
            charStart: 0,
            charEnd: 12,
            pageWidth: 640,
            pageHeight: 900,
            pageUnit: "pdf_user_space",
          },
          {
            pageNumber: 2,
            charStart: 14,
            charEnd: 33,
            pageWidth: 640,
            pageHeight: 900,
            pageUnit: "pdf_user_space",
          },
        ],
        author: "Grace Hopper",
      },
    });
    expect(payload.metadata.pdf_parse_profile).toMatchObject({
      parser: "pdfjs",
      parserVersion: "clio-pdf-structure-v2",
      pageCount: 2,
      ocrStatus: "not_required",
      warnings: ["section_outline_unavailable"],
    });
    expect(payload.metadata.pdf_page_labels).toEqual([
      {
        pageNumber: 1,
        label: "Page 1",
        charStart: 0,
        charEnd: 12,
        pageWidth: 640,
        pageHeight: 900,
        pageUnit: "pdf_user_space",
      },
      {
        pageNumber: 2,
        label: "Page 2",
        charStart: 14,
        charEnd: 33,
        pageWidth: 640,
        pageHeight: 900,
        pageUnit: "pdf_user_space",
      },
    ]);
    expect(payload.metadata.pdf_sections).toEqual([]);
    expect(payload.metadata.pdf_references).toEqual([]);
    expect(payload.metadata.pdf_figures).toEqual([]);
    expect(payload.metadata.pdf_images).toEqual([]);
    expect(payload.metadata.pdf_figure_analyses).toEqual([]);
    expect(payload.metadata.pdf_tables).toEqual([]);
    expect(payload.metadata.pdf_table_structures).toEqual([]);
    expect(payload.metadata.pdf_citation_links).toEqual([]);
    expect(payload.metadata.pdf_parse_quality).toMatchObject({
      status: "needs_review",
      metrics: {
        pageCount: 2,
        textPageCoverage: 1,
      },
      warnings: ["section_outline_unavailable"],
    });
  });

  it("extracts bounded table structures from positioned text items", async () => {
    const parsed = await parsePdfDocument(
      new Uint8Array([1, 2]),
      fakePdfJs({
        pages: [
          [
            { str: "Metric", x: 40, y: 700 },
            { str: "Value", x: 160, y: 700 },
            { str: "Precision", x: 40, y: 680 },
            { str: "0.91", x: 160, y: 680 },
            { str: "Recall", x: 40, y: 660 },
            { str: "0.88", x: 160, y: 660 },
          ],
        ],
      }),
    );

    expect(parsed.tableStructures).toMatchObject([
      {
        id: "table-structure:1",
        pageNumber: 1,
        rowCount: 3,
        columnCount: 2,
        rows: [
          ["Metric", "Value"],
          ["Precision", "0.91"],
          ["Recall", "0.88"],
        ],
        cells: [
          { rowIndex: 0, columnIndex: 0, text: "Metric", rowSpan: 1, columnSpan: 1 },
          { rowIndex: 0, columnIndex: 1, text: "Value", rowSpan: 1, columnSpan: 1 },
          { rowIndex: 1, columnIndex: 0, text: "Precision", rowSpan: 1, columnSpan: 1 },
          { rowIndex: 1, columnIndex: 1, text: "0.91", rowSpan: 1, columnSpan: 1 },
          { rowIndex: 2, columnIndex: 0, text: "Recall", rowSpan: 1, columnSpan: 1 },
          { rowIndex: 2, columnIndex: 1, text: "0.88", rowSpan: 1, columnSpan: 1 },
        ],
        semanticVersion: "clio-pdf-table-semantics-v1",
        headerRowCount: 1,
        headerRows: [0],
        columnTypes: ["text", "numeric"],
        columnSemantics: [
          {
            columnIndex: 0,
            header: "Metric",
            type: "text",
            nonEmptyCellCount: 2,
            numericCellRatio: 0,
            sampleValues: ["Precision", "Recall"],
          },
          {
            columnIndex: 1,
            header: "Value",
            type: "numeric",
            nonEmptyCellCount: 2,
            numericCellRatio: 1,
            sampleValues: ["0.91", "0.88"],
          },
        ],
        mergedCellHints: [],
        sparseRowIndexes: [],
        multiPageContinuation: {
          status: "single_page",
          confidence: "low",
        },
        semanticWarnings: [],
        markdownPreview: [
          "| Metric | Value |",
          "| --- | --- |",
          "| Precision | 0.91 |",
          "| Recall | 0.88 |",
        ].join("\n"),
        csvPreview: ["Metric,Value", "Precision,0.91", "Recall,0.88"].join("\n"),
        bbox: {
          xMin: 40,
          yMin: 660,
          xMax: 190,
          yMax: 710,
          unit: "pdf_user_space",
        },
        source: "coordinate_text_items",
        confidence: "low",
      },
    ]);
    expect(parsed.parseQuality.metrics.tableStructureCount).toBe(1);
    expect(parsed.parseQuality.metrics.tableSemanticCount).toBe(1);

    const payload = pdfCapturePayloadFromParsedDocument({
      parsed,
      sourceUrl: "https://example.test/table.pdf",
      sourceTitle: "table.pdf",
    });
    expect(payload.metadata.pdf_table_structures).toEqual(parsed.tableStructures);
  });

  it("records merged/sparse table hints without fabricating cell spans", async () => {
    const parsed = await parsePdfDocument(
      new Uint8Array([1, 2]),
      fakePdfJs({
        pages: [
          [
            { str: "Ablation Summary", x: 40, y: 720, width: 250 },
            { str: "Metric", x: 40, y: 700 },
            { str: "Base", x: 140, y: 700 },
            { str: "Full", x: 240, y: 700 },
            { str: "Precision", x: 40, y: 680 },
            { str: "0.81", x: 140, y: 680 },
            { str: "0.91", x: 240, y: 680 },
            { str: "Recall", x: 40, y: 660 },
            { str: "0.74", x: 140, y: 660 },
            { str: "0.88", x: 240, y: 660 },
          ],
        ],
      }),
    );

    expect(parsed.tableStructures[0]).toMatchObject({
      mergedCellHints: [
        {
          rowIndex: 0,
          columnIndex: 0,
          text: "Ablation Summary",
          columnSpan: 3,
          reason: "sparse_row",
          confidence: "low",
        },
      ],
      sparseRowIndexes: [0],
      semanticWarnings: ["table_merged_cell_hints", "table_sparse_rows"],
    });
    expect(parsed.tableStructures[0]?.cells[0]).toMatchObject({
      rowIndex: 0,
      columnIndex: 0,
      rowSpan: 1,
      columnSpan: 1,
    });
    expect(parsed.parseQuality.warnings).toContain("table_semantics_need_review");
  });

  it("extracts an exact bbox crop for figure vision analysis input", async () => {
    const renderCalls: Array<{ pageNumber: number; width: number; height: number }> = [];
    const canvasSizes: Array<{ width: number; height: number }> = [];
    const drawImage = vi.fn();
    const destroy = vi.fn(async () => undefined);
    const pdfjs = {
      getDocument(input: { data: Uint8Array }) {
        structuredClone(input.data, { transfer: [input.data.buffer] });
        return {
          promise: Promise.resolve({
            numPages: 2,
            async getPage(pageNumber: number) {
              return {
                async getTextContent() {
                  return { items: [] };
                },
                getViewport({ scale }: { scale: number }) {
                  return {
                    width: 2_000 * scale,
                    height: 1_000 * scale,
                    convertToViewportRectangle(rect: [number, number, number, number]) {
                      return [
                        rect[0] * scale,
                        (1_000 - rect[1]) * scale,
                        rect[2] * scale,
                        (1_000 - rect[3]) * scale,
                      ];
                    },
                  };
                },
                render({ viewport }: { viewport: { width: number; height: number } }) {
                  renderCalls.push({
                    pageNumber,
                    width: viewport.width,
                    height: viewport.height,
                  });
                  return { promise: Promise.resolve() };
                },
              };
            },
            destroy,
          }),
        };
      },
    };

    const bytes = new Uint8Array([1, 2, 3]);
    const result = await extractPdfFigureVisionImageInput({
      bytes,
      pageNumber: 2,
      maxWidth: 500,
      maxHeight: 500,
      bbox: { xMin: 10, yMin: 20, xMax: 110, yMax: 220, unit: "pdf_user_space" },
      pdfjsModule: pdfjs,
      canvasFactory: (width, height) => {
        const canvasIndex = canvasSizes.length;
        canvasSizes.push({ width, height });
        return {
          width,
          height,
          getContext: () => ({ drawImage }),
          toDataURL: () =>
            canvasIndex === 1 ? "data:image/png;base64,Q1JPUA==" : "data:image/png;base64,UEFHRQ==",
        };
      },
    });

    expect(result).toEqual({
      status: "ready",
      pageNumber: 2,
      image: {
        base64: "Q1JPUA==",
        mimeType: "image/png",
        byteLength: 4,
      },
      crop: {
        kind: "exact_bbox_crop",
        pageNumber: 2,
        width: 34,
        height: 61,
        scale: 0.25,
        maxWidth: 500,
        maxHeight: 500,
        bbox: { xMin: 10, yMin: 20, xMax: 110, yMax: 220, unit: "pdf_user_space" },
        sourcePage: {
          width: 500,
          height: 250,
        },
        cropRect: {
          x: 0,
          y: 189,
          width: 34,
          height: 61,
          marginPx: 6,
        },
      },
    });
    expect(renderCalls).toEqual([{ pageNumber: 2, width: 500, height: 250 }]);
    expect(canvasSizes).toEqual([
      { width: 500, height: 250 },
      { width: 34, height: 61 },
    ]);
    expect(drawImage).toHaveBeenCalledOnce();
    expect(drawImage.mock.calls[0]?.slice(1)).toEqual([0, 189, 34, 61, 0, 0, 34, 61]);
    expect(destroy).toHaveBeenCalledOnce();
    expect(Array.from(bytes)).toEqual([1, 2, 3]);
  });

  it("falls back to bounded page render when bbox crop is unavailable", async () => {
    const pdfjs = {
      getDocument() {
        return {
          promise: Promise.resolve({
            numPages: 1,
            async getPage() {
              return {
                async getTextContent() {
                  return { items: [] };
                },
                getViewport({ scale }: { scale: number }) {
                  return {
                    width: 800 * scale,
                    height: 600 * scale,
                  };
                },
                render() {
                  return { promise: Promise.resolve() };
                },
              };
            },
          }),
        };
      },
    };

    const result = await extractPdfFigureVisionImageInput({
      bytes: new Uint8Array([1]),
      pageNumber: 1,
      maxWidth: 400,
      maxHeight: 400,
      pdfjsModule: pdfjs,
      canvasFactory: (width, height) => ({
        width,
        height,
        getContext: () => ({}),
        toDataURL: () => "data:image/png;base64,UEFHRQ==",
      }),
    });

    expect(result).toEqual({
      status: "ready",
      pageNumber: 1,
      image: {
        base64: "UEFHRQ==",
        mimeType: "image/png",
        byteLength: 4,
      },
      crop: {
        kind: "bounded_page_render",
        pageNumber: 1,
        width: 400,
        height: 300,
        scale: 0.5,
        maxWidth: 400,
        maxHeight: 400,
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

type FakePdfItem = string | { str: string; x: number; y: number; width?: number; height?: number };

function fakePdfJs(input: {
  pages: FakePdfItem[][];
  info?: Record<string, unknown>;
  ops?: Record<string, unknown>;
  operatorLists?: Record<number, { fnArray: unknown[]; argsArray?: unknown[] }>;
  pageSizes?: Record<number, { width: number; height: number }>;
  destroy?: () => Promise<void>;
}) {
  return {
    OPS: input.ops,
    getDocument() {
      return {
        promise: Promise.resolve({
          numPages: input.pages.length,
          async getPage(pageNumber: number) {
            const page = input.pages[pageNumber - 1] ?? [];
            return {
              async getTextContent() {
                return {
                  items: page.map((item) =>
                    typeof item === "string"
                      ? { str: item }
                      : {
                          str: item.str,
                          transform: [1, 0, 0, 1, item.x, item.y],
                          width: item.width,
                          height: item.height,
                        },
                  ),
                };
              },
              async getOperatorList() {
                return input.operatorLists?.[pageNumber] ?? { fnArray: [], argsArray: [] };
              },
              ...(input.pageSizes?.[pageNumber] === undefined
                ? {}
                : {
                    getViewport({ scale }: { scale: number }) {
                      const pageSize = input.pageSizes?.[pageNumber] ?? { width: 1, height: 1 };
                      return {
                        width: pageSize.width * scale,
                        height: pageSize.height * scale,
                      };
                    },
                  }),
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
