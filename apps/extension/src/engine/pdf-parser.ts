import { excerpt, hashText, normalizeText } from "@/src/shared/text";

export type ParsedPdfOcrStatus = "not_required" | "partial_text" | "not_available";

export type ParsedPdfSectionKind =
  | "abstract"
  | "introduction"
  | "related_work"
  | "background"
  | "method"
  | "experiments"
  | "results"
  | "discussion"
  | "conclusion"
  | "references"
  | "appendix"
  | "unknown";

export interface ParsedPdfPage {
  pageNumber: number;
  text: string;
  charStart: number;
  charEnd: number;
  pageWidth?: number;
  pageHeight?: number;
  pageUnit?: "pdf_user_space";
}

export interface ParsedPdfBoundingBox {
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
  unit: "pdf_user_space";
}

export interface ParsedPdfSection {
  level: number;
  text: string;
  kind: ParsedPdfSectionKind;
  charStart: number;
  charEnd: number;
  pageStart: number | null;
  pageEnd: number | null;
}

export interface ParsedPdfReference {
  index: number;
  label?: string;
  text: string;
  charStart: number;
  charEnd: number;
  pageStart: number | null;
  pageEnd: number | null;
  doi?: string;
  year?: number;
}

export interface ParsedPdfCaptionMarker {
  id: string;
  kind: "figure" | "table";
  label: string;
  caption: string;
  charStart: number;
  charEnd: number;
  pageNumber: number | null;
  bbox?: ParsedPdfBoundingBox;
  confidence: "low" | "medium";
}

export interface ParsedPdfTableCell {
  rowIndex: number;
  columnIndex: number;
  text: string;
  rowSpan: 1;
  columnSpan: 1;
}

export type ParsedPdfTableColumnType = "empty" | "numeric" | "text" | "mixed";

export interface ParsedPdfTableColumnSemantics {
  columnIndex: number;
  header?: string;
  type: ParsedPdfTableColumnType;
  nonEmptyCellCount: number;
  numericCellRatio: number;
  sampleValues: string[];
}

export interface ParsedPdfTableMergedCellHint {
  rowIndex: number;
  columnIndex: number;
  text: string;
  columnSpan: number;
  reason: "wide_text_item" | "sparse_row";
  confidence: "low" | "medium";
}

export interface ParsedPdfTableContinuation {
  status:
    | "single_page"
    | "possible_continuation"
    | "continued_from_previous_page"
    | "continues_on_next_page";
  previousTableId?: string;
  nextTableId?: string;
  reason?: "matching_header_signature" | "matching_column_types" | "row_limit_truncated";
  confidence: "low" | "medium";
}

export interface ParsedPdfTableStructure {
  id: string;
  pageNumber: number;
  charStart: number;
  charEnd: number;
  rowCount: number;
  columnCount: number;
  rows: string[][];
  cells: ParsedPdfTableCell[];
  markdownPreview: string;
  csvPreview: string;
  semanticVersion: "clio-pdf-table-semantics-v1";
  headerRowCount: number;
  headerRows: number[];
  columnTypes: ParsedPdfTableColumnType[];
  columnSemantics: ParsedPdfTableColumnSemantics[];
  mergedCellHints: ParsedPdfTableMergedCellHint[];
  sparseRowIndexes: number[];
  multiPageContinuation: ParsedPdfTableContinuation;
  semanticWarnings: string[];
  bbox?: ParsedPdfBoundingBox;
  captionLabel?: string;
  caption?: string;
  captionCharStart?: number;
  captionCharEnd?: number;
  source: "coordinate_text_items";
  confidence: "low" | "medium";
}

export interface ParsedPdfImageVisionAnalysisRequirement {
  analysisId: string;
  status: "requires_visual_model";
  modelInput: "image";
  inputRequirement: "bounded_image_or_page_crop";
  inputStatus: "needs_bounded_crop" | "image_pixels_unavailable";
  promptBoundary: "no_full_pdf_prompt";
  providerBoundary: "trusted_runtime_required";
}

export interface ParsedPdfImageArtifact {
  id: string;
  pageNumber: number;
  label?: string;
  caption?: string;
  captionCharStart?: number;
  captionCharEnd?: number;
  bbox?: ParsedPdfBoundingBox;
  objectRef?: string;
  source: "pdfjs_operator_list" | "caption_marker";
  extractionStatus: "operator_detected" | "caption_anchor_only";
  visionAnalysis?: ParsedPdfImageVisionAnalysisRequirement;
  confidence: "low" | "medium";
}

export interface ParsedPdfFigureAnalysis {
  id: string;
  imageId: string;
  pageNumber: number;
  label?: string;
  caption?: string;
  source: ParsedPdfImageArtifact["source"];
  status: "requires_visual_model";
  modelInput: "image";
  inputRequirement: "bounded_image_or_page_crop";
  inputStatus: ParsedPdfImageVisionAnalysisRequirement["inputStatus"];
  promptBoundary: "no_full_pdf_prompt";
  providerBoundary: "trusted_runtime_required";
  reason: "bounded_image_crop_required" | "image_pixels_unavailable";
  confidence: "low" | "medium";
}

export interface ParsedPdfCitationLink {
  id: string;
  marker: string;
  citationStyle: "numeric_bracket";
  normalizedTargetLabel: string;
  targetReferenceIndex: number | null;
  targetReferenceLabel?: string;
  charStart: number;
  charEnd: number;
  pageNumber: number | null;
  context: string;
  confidence: "low" | "high";
}

export interface ParsedPdfPageLabel {
  pageNumber: number;
  label: string;
  charStart: number;
  charEnd: number;
  pageWidth?: number;
  pageHeight?: number;
  pageUnit?: "pdf_user_space";
}

export interface ParsedPdfParseProfile {
  parser: "pdfjs";
  parserVersion: "clio-pdf-structure-v2";
  pageCount: number;
  textHash: string;
  ocrStatus: ParsedPdfOcrStatus;
  warnings: string[];
}

export interface ParsedPdfRawFileStatus {
  status: "not_persisted";
  reason: "raw_file_persistence_pending";
  byteLength: number;
}

export interface ParsedPdfParseQuality {
  version: "clio-pdf-parse-quality-v1";
  status: "pass" | "needs_review" | "insufficient";
  score: number;
  metrics: {
    pageCount: number;
    textPageCoverage: number;
    sectionCount: number;
    referenceCount: number;
    figureCaptionCount: number;
    imageArtifactCount: number;
    tableCaptionCount: number;
    tableStructureCount: number;
    tableSemanticCount: number;
    figureAnalysisQueueCount: number;
    figureVisionReadyCount: number;
    citationLinkCount: number;
    linkedReferenceRatio: number | null;
  };
  warnings: string[];
}

export interface ParsedPdfDocument {
  text: string;
  pages: ParsedPdfPage[];
  sections: ParsedPdfSection[];
  references: ParsedPdfReference[];
  figures: ParsedPdfCaptionMarker[];
  tables: ParsedPdfCaptionMarker[];
  images: ParsedPdfImageArtifact[];
  tableStructures: ParsedPdfTableStructure[];
  figureAnalyses: ParsedPdfFigureAnalysis[];
  citationLinks: ParsedPdfCitationLink[];
  pageLabels: ParsedPdfPageLabel[];
  parseProfile: ParsedPdfParseProfile;
  parseQuality: ParsedPdfParseQuality;
  rawFile: ParsedPdfRawFileStatus;
  metadata: {
    title?: string;
    author?: string;
    subject?: string;
    keywords?: string[];
    pageCount: number;
    parser: "pdfjs";
    textHash: string;
  };
}

export interface PdfCapturePayloadInput {
  bytes: Uint8Array | ArrayBuffer;
  sourceUrl: string;
  sourceTitle: string;
  capturedAt?: string;
  metadata?: Record<string, unknown>;
}

export interface PdfCapturePayload {
  sourceUrl: string;
  sourceTitle: string;
  normalizedText: string;
  capturedAt?: string;
  metadata: Record<string, unknown>;
}

interface PdfJsTextItem {
  str?: unknown;
  transform?: unknown;
  width?: unknown;
  height?: unknown;
}

interface PdfJsOperatorList {
  fnArray?: unknown;
  argsArray?: unknown;
}

interface PdfJsDocument {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfJsPage>;
  getMetadata?(): Promise<{
    info?: Record<string, unknown>;
    metadata?: { get(name: string): unknown };
  }>;
  destroy?(): Promise<void>;
}

interface PdfJsPage {
  getTextContent(): Promise<{ items: PdfJsTextItem[] }>;
  getOperatorList?(): Promise<PdfJsOperatorList>;
  getViewport?(input: { scale: number }): PdfJsViewport;
  render?(input: { canvasContext: unknown; viewport: PdfJsViewport }): { promise: Promise<void> };
}

interface PdfJsViewport {
  width: number;
  height: number;
  convertToViewportRectangle?(rect: [number, number, number, number]): number[];
}

interface PdfJsModule {
  OPS?: Record<string, unknown>;
  getDocument(input: {
    data: Uint8Array;
    disableWorker: true;
    verbosity: number;
  }): { promise: Promise<PdfJsDocument> };
}

interface TextLineRange {
  text: string;
  charStart: number;
  charEnd: number;
}

interface PdfTextItemLayout {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PdfPageLayout {
  pageNumber: number;
  items: PdfTextItemLayout[];
}

interface PdfImageOperatorMarker {
  pageNumber: number;
  objectRef?: string;
}

interface PdfTableRowLayout {
  y: number;
  items: PdfTextItemLayout[];
}

interface PageRange {
  pageStart: number | null;
  pageEnd: number | null;
}

export type PdfFigureVisionImageMimeType = "image/png" | "image/jpeg" | "image/webp";

export interface PdfFigureVisionImageExtractionInput {
  bytes: Uint8Array | ArrayBuffer;
  pageNumber: number;
  bbox?: ParsedPdfBoundingBox;
  maxWidth?: number;
  maxHeight?: number;
  mimeType?: PdfFigureVisionImageMimeType;
  pdfjsModule?: PdfJsModule;
  canvasFactory?: PdfRenderCanvasFactory;
}

export type PdfFigureVisionImageExtractionResult =
  | {
      status: "ready";
      pageNumber: number;
      image: {
        base64: string;
        mimeType: PdfFigureVisionImageMimeType;
        byteLength: number;
      };
      crop: {
        kind: "bounded_page_render" | "exact_bbox_crop";
        pageNumber: number;
        width: number;
        height: number;
        scale: number;
        maxWidth: number;
        maxHeight: number;
        bbox?: ParsedPdfBoundingBox;
        sourcePage?: {
          width: number;
          height: number;
        };
        cropRect?: {
          x: number;
          y: number;
          width: number;
          height: number;
          marginPx: number;
        };
      };
    }
  | {
      status: "unavailable";
      pageNumber: number;
      reason: string;
    };

export interface PdfRenderCanvas {
  width: number;
  height: number;
  getContext(contextId: "2d"): unknown;
  convertToBlob?(options: { type: string; quality?: number }): Promise<Blob>;
  toDataURL?(type?: string, quality?: number): string;
}

export type PdfRenderCanvasFactory = (width: number, height: number) => PdfRenderCanvas;

interface PdfRenderCanvas2dContext {
  drawImage?(
    image: unknown,
    sourceX: number,
    sourceY: number,
    sourceWidth: number,
    sourceHeight: number,
    targetX: number,
    targetY: number,
    targetWidth: number,
    targetHeight: number,
  ): void;
}

const pdfPageSeparator = "\n\n";
const maxPdfSections = 80;
const maxPdfReferences = 120;
const maxPdfCaptions = 80;
const maxPdfWarnings = 20;
const maxPdfTableStructures = 40;
const maxPdfImageArtifacts = 80;
const maxPdfCitationLinks = 200;
const maxPdfCitationTargetsPerMarker = 6;
const maxPdfTableRows = 24;
const maxPdfTableColumns = 8;
const maxPdfTableCellTextLength = 160;
const maxPdfTableSemanticWarnings = 8;
const maxPdfTableMergedCellHints = 12;
const maxPdfTableSampleValues = 3;
const maxReferenceTextLength = 500;
const maxCaptionTextLength = 260;
const pdfTableRowYTolerance = 3;
const pdfTableColumnXTolerance = 12;
const defaultFigureVisionPageMaxWidth = 1024;
const defaultFigureVisionPageMaxHeight = 1024;
const figureVisionExactCropMarginRatio = 0.08;
const figureVisionExactCropMinMarginPx = 6;
const figureVisionExactCropMaxMarginPx = 48;

export async function parsePdfDocument(
  bytes: Uint8Array | ArrayBuffer,
  pdfjsModule?: PdfJsModule,
): Promise<ParsedPdfDocument> {
  const byteLength = byteLengthOfPdfInput(bytes);
  const pdfjs =
    pdfjsModule ?? ((await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as PdfJsModule);
  const document = await pdfjs.getDocument({
    data: bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes),
    disableWorker: true,
    verbosity: 0,
  }).promise;

  try {
    const pages: ParsedPdfPage[] = [];
    const pageLayouts: PdfPageLayout[] = [];
    const imageOperators: PdfImageOperatorMarker[] = [];
    const pageTexts: string[] = [];
    let offset = 0;

    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const operatorList = await page.getOperatorList?.();
      const textItems = textContent.items.flatMap((item) =>
        typeof item.str === "string" ? [item.str] : [],
      );
      const pageText = normalizeText(textItems.join(" "));
      const pageDimensions = pdfPageDimensions(page);
      const charStart = offset;
      const charEnd = charStart + pageText.length;
      pages.push({ pageNumber, text: pageText, charStart, charEnd, ...pageDimensions });
      pageLayouts.push({ pageNumber, items: extractPdfTextItemLayout(textContent.items) });
      imageOperators.push(...extractPdfImageOperators(pageNumber, operatorList, pdfjs.OPS));
      pageTexts.push(pageText);
      offset = charEnd + pdfPageSeparator.length;
    }

    const text = normalizeText(pageTexts.join(pdfPageSeparator));
    if (text.length === 0) {
      throw new Error("PDF_EMPTY_TEXT");
    }

    const textHash = hashText(text);
    const sections = extractPdfSections(text, pages);
    const references = extractPdfReferences(text, pages, sections);
    const captions = extractPdfCaptionMarkers(text, pages);
    const figures = attachCaptionBoundingBoxes(captions.figures, pageLayouts);
    const tables = attachCaptionBoundingBoxes(captions.tables, pageLayouts);
    const tableStructures = linkPdfTablesToCaptions(
      extractPdfTableStructures(pageLayouts, pages),
      tables,
    );
    const images = extractPdfImageArtifacts(figures, imageOperators);
    const figureAnalyses = buildPdfFigureAnalyses(images);
    const citationLinks = extractPdfCitationLinks(text, pages, sections, references);
    const parseQuality = buildPdfParseQuality({
      pages,
      sections,
      references,
      figures,
      tables,
      images,
      tableStructures,
      figureAnalyses,
      citationLinks,
    });
    const warnings = buildPdfParseWarnings({ pages, sections });
    const metadata = await readPdfMetadata(document);

    return {
      text,
      pages,
      sections,
      references,
      figures,
      tables,
      images,
      tableStructures,
      figureAnalyses,
      citationLinks,
      pageLabels: pages.map((page) => ({
        pageNumber: page.pageNumber,
        label: `Page ${page.pageNumber}`,
        charStart: page.charStart,
        charEnd: page.charEnd,
        ...(page.pageWidth === undefined || page.pageHeight === undefined
          ? {}
          : {
              pageWidth: page.pageWidth,
              pageHeight: page.pageHeight,
              pageUnit: page.pageUnit,
            }),
      })),
      parseProfile: {
        parser: "pdfjs",
        parserVersion: "clio-pdf-structure-v2",
        pageCount: document.numPages,
        textHash,
        ocrStatus: ocrStatusForPages(pages),
        warnings,
      },
      parseQuality,
      rawFile: {
        status: "not_persisted",
        reason: "raw_file_persistence_pending",
        byteLength,
      },
      metadata: {
        ...metadata,
        pageCount: document.numPages,
        parser: "pdfjs",
        textHash,
      },
    };
  } finally {
    await document.destroy?.();
  }
}

export async function extractPdfFigureVisionImageInput({
  bytes,
  pageNumber,
  bbox,
  maxWidth = defaultFigureVisionPageMaxWidth,
  maxHeight = defaultFigureVisionPageMaxHeight,
  mimeType = "image/png",
  pdfjsModule,
  canvasFactory,
}: PdfFigureVisionImageExtractionInput): Promise<PdfFigureVisionImageExtractionResult> {
  const pdfjs =
    pdfjsModule ?? ((await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as PdfJsModule);
  let document: PdfJsDocument | undefined;
  try {
    document = await pdfjs.getDocument({
      data: bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes),
      disableWorker: true,
      verbosity: 0,
    }).promise;
    if (
      !Number.isInteger(pageNumber) ||
      pageNumber < 1 ||
      pageNumber > document.numPages ||
      !Number.isFinite(maxWidth) ||
      !Number.isFinite(maxHeight) ||
      maxWidth <= 0 ||
      maxHeight <= 0
    ) {
      return { status: "unavailable", pageNumber, reason: "invalid_pdf_page_crop_request" };
    }

    const page = await document.getPage(pageNumber);
    if (page.getViewport === undefined || page.render === undefined) {
      return { status: "unavailable", pageNumber, reason: "pdf_page_render_unavailable" };
    }
    const baseViewport = page.getViewport({ scale: 1 });
    const pageWidth = Math.max(1, baseViewport.width);
    const pageHeight = Math.max(1, baseViewport.height);
    const scale = Math.min(1, maxWidth / pageWidth, maxHeight / pageHeight);
    const viewport = page.getViewport({ scale });
    const width = Math.max(1, Math.ceil(viewport.width));
    const height = Math.max(1, Math.ceil(viewport.height));
    const canvas = (canvasFactory ?? defaultPdfRenderCanvasFactory)(width, height);
    const canvasContext = canvas.getContext("2d");
    if (canvasContext === null || canvasContext === undefined) {
      return { status: "unavailable", pageNumber, reason: "pdf_page_canvas_unavailable" };
    }
    await page.render({ canvasContext, viewport }).promise;
    const exactCrop = await exactPdfBboxCrop({
      bbox,
      canvas,
      canvasFactory: canvasFactory ?? defaultPdfRenderCanvasFactory,
      maxHeight,
      maxWidth,
      mimeType,
      pageHeight,
      pageNumber,
      pageWidth,
      renderedHeight: height,
      renderedWidth: width,
      scale,
      viewport,
    });
    if (exactCrop !== undefined) return exactCrop;
    const imageBytes = await pdfCanvasToBytes(canvas, mimeType);
    if (imageBytes.byteLength === 0) {
      return { status: "unavailable", pageNumber, reason: "pdf_page_render_empty" };
    }
    return {
      status: "ready",
      pageNumber,
      image: {
        base64: bytesToBase64(imageBytes),
        mimeType,
        byteLength: imageBytes.byteLength,
      },
      crop: {
        kind: "bounded_page_render",
        pageNumber,
        width,
        height,
        scale,
        maxWidth,
        maxHeight,
        ...(bbox === undefined ? {} : { bbox }),
      },
    };
  } catch {
    return { status: "unavailable", pageNumber, reason: "pdf_page_render_failed" };
  } finally {
    await document?.destroy?.();
  }
}

export function pdfCapturePayloadFromParsedDocument(
  input: Omit<PdfCapturePayloadInput, "bytes"> & { parsed: ParsedPdfDocument },
): PdfCapturePayload {
  const metadata: Record<string, unknown> = {
    ...input.metadata,
    adapter: "pdf",
    source_type: "pdf",
    mime_type: "application/pdf",
    parser: "pdfjs",
    pdf_page_count: input.parsed.metadata.pageCount,
    pdf_text_hash: input.parsed.metadata.textHash,
    pdf_pages: input.parsed.pages.map((page) => ({
      pageNumber: page.pageNumber,
      charStart: page.charStart,
      charEnd: page.charEnd,
      ...(page.pageWidth === undefined || page.pageHeight === undefined
        ? {}
        : {
            pageWidth: page.pageWidth,
            pageHeight: page.pageHeight,
            pageUnit: page.pageUnit,
          }),
    })),
    pdf_parse_profile: input.parsed.parseProfile,
    pdf_sections: input.parsed.sections,
    pdf_references: input.parsed.references,
    pdf_figures: input.parsed.figures,
    pdf_images: input.parsed.images,
    pdf_figure_analyses: input.parsed.figureAnalyses,
    pdf_tables: input.parsed.tables,
    pdf_table_structures: input.parsed.tableStructures,
    pdf_citation_links: input.parsed.citationLinks,
    pdf_parse_quality: input.parsed.parseQuality,
    pdf_page_labels: input.parsed.pageLabels,
    pdf_raw_file: input.parsed.rawFile,
  };

  setMetadataDefault(metadata, "title", input.parsed.metadata.title);
  setMetadataDefault(metadata, "author", input.parsed.metadata.author);
  setMetadataDefault(metadata, "subject", input.parsed.metadata.subject);
  setMetadataDefault(metadata, "keywords", input.parsed.metadata.keywords);
  if (input.parsed.sections.length > 0) {
    setMetadataDefault(
      metadata,
      "sectionOutline",
      input.parsed.sections.map((section) => ({
        level: section.level,
        text: section.text,
      })),
    );
  }

  return {
    sourceUrl: input.sourceUrl,
    sourceTitle: input.parsed.metadata.title ?? input.sourceTitle,
    normalizedText: input.parsed.text,
    ...(input.capturedAt === undefined ? {} : { capturedAt: input.capturedAt }),
    metadata,
  };
}

async function readPdfMetadata(document: PdfJsDocument) {
  const raw = await document.getMetadata?.();
  const info = raw?.info ?? {};
  const title = metadataString(info.Title) ?? metadataString(raw?.metadata?.get("dc:title"));
  const author = metadataString(info.Author) ?? metadataString(raw?.metadata?.get("dc:creator"));
  const subject =
    metadataString(info.Subject) ?? metadataString(raw?.metadata?.get("dc:description"));
  const keywords = parseKeywords(info.Keywords ?? raw?.metadata?.get("pdf:Keywords"));
  return {
    ...(title === undefined ? {} : { title }),
    ...(author === undefined ? {} : { author }),
    ...(subject === undefined ? {} : { subject }),
    ...(keywords.length === 0 ? {} : { keywords }),
  };
}

function extractPdfSections(text: string, pages: ParsedPdfPage[]): ParsedPdfSection[] {
  const headings = textLineRanges(text)
    .flatMap((line) => {
      const heading = parseSectionHeading(line.text);
      if (heading === null) return [];
      return [{ ...heading, charStart: line.charStart }];
    })
    .slice(0, maxPdfSections);

  return headings.map((heading, index) => {
    const nextHeading = headings[index + 1];
    const charEnd = nextHeading?.charStart ?? text.length;
    const pageRange = pageRangeForChars(heading.charStart, charEnd, pages);
    return {
      level: heading.level,
      text: heading.text,
      kind: heading.kind,
      charStart: heading.charStart,
      charEnd,
      pageStart: pageRange.pageStart,
      pageEnd: pageRange.pageEnd,
    };
  });
}

function parseSectionHeading(lineText: string) {
  const cleaned = normalizeText(lineText).replace(/\s+/g, " ");
  if (cleaned.length === 0 || cleaned.length > 180) return null;

  const withoutNumber = cleaned.replace(/^(?:section\s+)?\d+(?:\.\d+)*\.?\s+/i, "");
  const match =
    /^(abstract|introduction|related work|background|method|methods|approach|materials and methods|experiments|experimental setup|evaluation|results|discussion|limitations|conclusion|references|bibliography|appendix(?:\s+[a-z0-9]+)?)(?:\s*[:.\-]\s*)?$/i.exec(
      withoutNumber,
    );
  const prefixMatch =
    cleaned.length <= 120
      ? /^(abstract|introduction|references|bibliography|appendix)(?:\s*[:.\-]\s+).+/i.exec(
          withoutNumber,
        )
      : null;
  const title = match?.[1] ?? prefixMatch?.[1];
  if (title === undefined) return null;
  const kind = sectionKindForTitle(title);
  return {
    level: title.toLowerCase().startsWith("appendix") ? 1 : 1,
    text: normalizeSectionTitle(title, kind),
    kind,
  };
}

function normalizeSectionTitle(title: string, kind: ParsedPdfSectionKind) {
  switch (kind) {
    case "abstract":
      return "Abstract";
    case "introduction":
      return "Introduction";
    case "related_work":
      return "Related Work";
    case "background":
      return "Background";
    case "method":
      return "Method";
    case "experiments":
      return "Experiments";
    case "results":
      return "Results";
    case "discussion":
      return "Discussion";
    case "conclusion":
      return "Conclusion";
    case "references":
      return "References";
    case "appendix":
      return "Appendix";
    case "unknown":
      return title;
  }
}

function sectionKindForTitle(title: string): ParsedPdfSectionKind {
  const normalized = title.toLowerCase();
  if (normalized === "abstract") return "abstract";
  if (normalized === "introduction") return "introduction";
  if (normalized === "related work") return "related_work";
  if (normalized === "background") return "background";
  if (
    normalized === "method" ||
    normalized === "methods" ||
    normalized === "approach" ||
    normalized === "materials and methods"
  ) {
    return "method";
  }
  if (
    normalized === "experiments" ||
    normalized === "experimental setup" ||
    normalized === "evaluation"
  ) {
    return "experiments";
  }
  if (normalized === "results") return "results";
  if (normalized === "discussion" || normalized === "limitations") return "discussion";
  if (normalized === "conclusion") return "conclusion";
  if (normalized === "references" || normalized === "bibliography") return "references";
  if (normalized.startsWith("appendix")) return "appendix";
  return "unknown";
}

function extractPdfReferences(
  text: string,
  pages: ParsedPdfPage[],
  sections: ParsedPdfSection[],
): ParsedPdfReference[] {
  const referenceSection = sections.find((section) => section.kind === "references");
  const candidateRange =
    referenceSection === undefined
      ? { charStart: 0, charEnd: text.length }
      : { charStart: referenceSection.charStart, charEnd: referenceSection.charEnd };
  const lines = textLineRanges(text).filter(
    (line) => line.charEnd > candidateRange.charStart && line.charStart < candidateRange.charEnd,
  );
  const entries = materializeReferenceEntries(lines, referenceSection).slice(0, maxPdfReferences);

  return entries.map((entry, index) => {
    const pageRange = pageRangeForChars(entry.charStart, entry.charEnd, pages);
    return {
      index,
      ...(entry.label === undefined ? {} : { label: entry.label }),
      text: excerpt(entry.text, maxReferenceTextLength),
      charStart: entry.charStart,
      charEnd: entry.charEnd,
      pageStart: pageRange.pageStart,
      pageEnd: pageRange.pageEnd,
      ...referenceHints(entry.text),
    };
  });
}

function materializeReferenceEntries(
  lines: TextLineRange[],
  referenceSection: ParsedPdfSection | undefined,
) {
  const entries: Array<{ label?: string; text: string; charStart: number; charEnd: number }> = [];
  let current: { label?: string; text: string; charStart: number; charEnd: number } | null = null;

  for (const line of lines) {
    if (referenceSection !== undefined && line.charStart === referenceSection.charStart) continue;
    const referenceStart = referenceStartFromLine(line.text);
    if (referenceStart !== null) {
      if (current !== null) entries.push(current);
      current = {
        ...(referenceStart.label === undefined ? {} : { label: referenceStart.label }),
        text: referenceStart.text,
        charStart: line.charStart,
        charEnd: line.charEnd,
      };
      continue;
    }
    if (current !== null && line.text.length > 0) {
      current = {
        ...current,
        text: normalizeText(`${current.text} ${line.text}`),
        charEnd: line.charEnd,
      };
    }
  }
  if (current !== null) entries.push(current);
  return entries.filter((entry) => entry.text.length > 12);
}

function referenceStartFromLine(lineText: string) {
  const line = normalizeText(lineText).replace(/\s+/g, " ");
  const match = /^(\[\d+\]|\d+\.|\d+\))\s*(.+)$/.exec(line);
  if (match === null) return null;
  const text = normalizeText(match[2] ?? "");
  if (text.length === 0) return null;
  return { label: match[1], text };
}

function referenceHints(text: string) {
  const doiMatch = /\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+\b/i.exec(text);
  const yearMatch = /\b(19|20)\d{2}\b/.exec(text);
  const year = yearMatch?.[0] === undefined ? undefined : Number.parseInt(yearMatch[0], 10);
  return {
    ...(doiMatch?.[0] === undefined ? {} : { doi: doiMatch[0] }),
    ...(Number.isFinite(year) ? { year } : {}),
  };
}

function extractPdfCaptionMarkers(text: string, pages: ParsedPdfPage[]) {
  const figures: ParsedPdfCaptionMarker[] = [];
  const tables: ParsedPdfCaptionMarker[] = [];

  for (const line of textLineRanges(text)) {
    const marker = parseCaptionMarker(line.text);
    if (marker === null) continue;
    const pageRange = pageRangeForChars(line.charStart, line.charEnd, pages);
    const target = marker.kind === "figure" ? figures : tables;
    if (target.length >= maxPdfCaptions) continue;
    target.push({
      id: `${marker.kind}:${target.length + 1}`,
      kind: marker.kind,
      label: marker.label,
      caption: excerpt(marker.caption, maxCaptionTextLength),
      charStart: line.charStart,
      charEnd: line.charEnd,
      pageNumber: pageRange.pageStart,
      confidence: "medium",
    });
  }

  return { figures, tables };
}

function parseCaptionMarker(lineText: string) {
  const line = normalizeText(lineText).replace(/\s+/g, " ");
  const match = /^(fig\.?|figure|table)\s*([0-9]+[a-z]?)\s*[:.\-]\s*(.+)$/i.exec(line);
  if (match === null) return null;
  const kind: ParsedPdfCaptionMarker["kind"] = (match[1] ?? "").toLowerCase().startsWith("t")
    ? "table"
    : "figure";
  const number = match[2] ?? "";
  const caption = normalizeText(match[3] ?? "");
  if (caption.length === 0) return null;
  return {
    kind,
    label: `${kind === "figure" ? "Figure" : "Table"} ${number}`,
    caption,
  };
}

function extractPdfTextItemLayout(items: PdfJsTextItem[]): PdfTextItemLayout[] {
  return items.flatMap((item) => {
    if (typeof item.str !== "string") return [];
    const text = normalizeText(item.str);
    if (text.length === 0) return [];
    const point = pdfTextItemPoint(item.transform);
    if (point === undefined) return [];
    return [
      {
        text,
        x: point.x,
        y: point.y,
        width: finiteNumber(item.width) ?? Math.max(8, text.length * 6),
        height: finiteNumber(item.height) ?? 10,
      },
    ];
  });
}

function pdfTextItemPoint(transform: unknown) {
  if (!Array.isArray(transform)) return undefined;
  const x = finiteNumber(transform[4]);
  const y = finiteNumber(transform[5]);
  if (x === undefined || y === undefined) return undefined;
  return { x, y };
}

function extractPdfImageOperators(
  pageNumber: number,
  operatorList: PdfJsOperatorList | undefined,
  ops: Record<string, unknown> | undefined,
): PdfImageOperatorMarker[] {
  if (!Array.isArray(operatorList?.fnArray)) return [];
  const imageOps = new Set(
    [
      ops?.paintImageXObject,
      ops?.paintInlineImageXObject,
      ops?.paintJpegXObject,
      ops?.paintImageMaskXObject,
    ].filter(
      (value): value is number | string => typeof value === "number" || typeof value === "string",
    ),
  );
  const argsArray = Array.isArray(operatorList.argsArray) ? operatorList.argsArray : [];
  return operatorList.fnArray.flatMap((fn, index): PdfImageOperatorMarker[] => {
    const isNamedImageOp = typeof fn === "string" && /image/i.test(fn);
    const isNumericImageOp = imageOps.has(fn as number | string);
    if (!isNamedImageOp && !isNumericImageOp) return [];
    const args = argsArray[index];
    const objectRef = Array.isArray(args) && typeof args[0] === "string" ? args[0] : undefined;
    return [
      {
        pageNumber,
        ...(objectRef === undefined ? {} : { objectRef }),
      },
    ];
  });
}

function extractPdfTableStructures(
  pageLayouts: PdfPageLayout[],
  pages: ParsedPdfPage[],
): ParsedPdfTableStructure[] {
  const structures: ParsedPdfTableStructure[] = [];
  for (const layout of pageLayouts) {
    const page = pages.find((candidate) => candidate.pageNumber === layout.pageNumber);
    if (page === undefined) continue;
    const rows = groupPdfItemsIntoRows(layout.items).filter((row) => row.items.length > 0);
    const table = tableStructureFromRows(
      `table-structure:${structures.length + 1}`,
      layout.pageNumber,
      page,
      rows,
    );
    if (table === null) continue;
    structures.push(table);
    if (structures.length >= maxPdfTableStructures) break;
  }
  return structures;
}

function groupPdfItemsIntoRows(items: PdfTextItemLayout[]): PdfTableRowLayout[] {
  const rows: PdfTableRowLayout[] = [];
  for (const item of [...items].sort(comparePdfTextItemLayout)) {
    const previous = rows[rows.length - 1];
    if (previous !== undefined && Math.abs(previous.y - item.y) <= pdfTableRowYTolerance) {
      previous.items.push(item);
      previous.y = (previous.y * (previous.items.length - 1) + item.y) / previous.items.length;
      continue;
    }
    rows.push({ y: item.y, items: [item] });
  }
  return rows.map((row) => ({ ...row, items: [...row.items].sort((a, b) => a.x - b.x) }));
}

function comparePdfTextItemLayout(a: PdfTextItemLayout, b: PdfTextItemLayout) {
  if (Math.abs(a.y - b.y) > pdfTableRowYTolerance) return b.y - a.y;
  return a.x - b.x;
}

function tableStructureFromRows(
  id: string,
  pageNumber: number,
  page: ParsedPdfPage,
  rows: PdfTableRowLayout[],
): ParsedPdfTableStructure | null {
  if (rows.length < 2) return null;
  const columns = inferPdfTableColumns(rows).slice(0, maxPdfTableColumns);
  if (columns.length < 2) return null;
  const selectedRows = rows.slice(0, maxPdfTableRows);
  const materialized = selectedRows
    .map((rowLayout) => ({ rowLayout, cells: tableCellsForRow(rowLayout, columns) }))
    .filter(({ rowLayout, cells }) => shouldKeepPdfTableRow(cells, rowLayout, columns));
  const materializedRows = materialized.map((row) => row.cells);
  if (materializedRows.length < 2) return null;
  const cells = tableCellsFromRows(materializedRows);
  const semantics = inferPdfTableSemantics({
    rows: materializedRows,
    rowLayouts: materialized.map((row) => row.rowLayout),
    columns,
  });
  return {
    id,
    pageNumber,
    charStart: page.charStart,
    charEnd: page.charEnd,
    rowCount: materializedRows.length,
    columnCount: columns.length,
    rows: materializedRows,
    cells,
    markdownPreview: tableRowsToMarkdown(materializedRows),
    csvPreview: tableRowsToCsv(materializedRows),
    ...semantics,
    bbox: bboxForItems(materialized.flatMap((row) => row.rowLayout.items)),
    source: "coordinate_text_items",
    confidence:
      materializedRows.length >= 3 && columns.length >= 3 && semantics.semanticWarnings.length <= 2
        ? "medium"
        : "low",
  };
}

function shouldKeepPdfTableRow(cells: string[], rowLayout: PdfTableRowLayout, columns: number[]) {
  const nonEmptyCount = cells.filter((cell) => cell.length > 0).length;
  if (nonEmptyCount >= 2) return true;
  if (nonEmptyCount !== 1 || columns.length < 3) return false;
  return rowLayout.items.some((item) => isWidePdfTableItem(item, columns));
}

function inferPdfTableSemantics(input: {
  rows: string[][];
  rowLayouts: PdfTableRowLayout[];
  columns: number[];
}): Pick<
  ParsedPdfTableStructure,
  | "semanticVersion"
  | "headerRowCount"
  | "headerRows"
  | "columnTypes"
  | "columnSemantics"
  | "mergedCellHints"
  | "sparseRowIndexes"
  | "multiPageContinuation"
  | "semanticWarnings"
> {
  const headerRowCount = inferPdfTableHeaderRowCount(input.rows);
  const headerRows = Array.from({ length: headerRowCount }, (_, index) => index);
  const columnSemantics = inferPdfTableColumnSemantics(input.rows, headerRowCount);
  const mergedCellHints = inferPdfTableMergedCellHints(input).slice(0, maxPdfTableMergedCellHints);
  const sparseRowIndexes = sparsePdfTableRowIndexes(input.rows);
  const semanticWarnings = pdfTableSemanticWarnings({
    rows: input.rows,
    headerRowCount,
    mergedCellHints,
    sparseRowIndexes,
  });

  return {
    semanticVersion: "clio-pdf-table-semantics-v1",
    headerRowCount,
    headerRows,
    columnTypes: columnSemantics.map((column) => column.type),
    columnSemantics,
    mergedCellHints,
    sparseRowIndexes,
    multiPageContinuation: {
      status: input.rows.length >= maxPdfTableRows ? "continues_on_next_page" : "single_page",
      ...(input.rows.length >= maxPdfTableRows ? { reason: "row_limit_truncated" as const } : {}),
      confidence: "low",
    },
    semanticWarnings,
  };
}

function inferPdfTableHeaderRowCount(rows: string[][]) {
  if (rows.length < 2) return 0;
  const first = rows[0] ?? [];
  const second = rows[1] ?? [];
  const firstNonEmpty = first.filter((cell) => cell.length > 0).length;
  const secondNonEmpty = second.filter((cell) => cell.length > 0).length;
  if (
    firstNonEmpty === 1 &&
    rows.length >= 3 &&
    secondNonEmpty >= 2 &&
    numericCellRatio(second) <= 0.25 &&
    numericCellRatio(rows[2] ?? []) >= 0.25
  ) {
    return 2;
  }
  if (firstNonEmpty < 2) return 0;
  const firstNumericRatio = numericCellRatio(first);
  const secondNumericRatio = numericCellRatio(second);
  const firstLooksLikeHeader =
    firstNumericRatio <= 0.25 &&
    (secondNumericRatio >= 0.25 || first.some((cell) => /[a-z]/iu.test(cell)));
  if (!firstLooksLikeHeader) return 0;

  const secondLooksLikeHeader =
    rows.length >= 3 &&
    secondNumericRatio <= 0.25 &&
    numericCellRatio(rows[2] ?? []) >= 0.25 &&
    secondNonEmpty >= Math.max(2, Math.ceil(first.length * 0.5));

  return secondLooksLikeHeader ? 2 : 1;
}

function inferPdfTableColumnSemantics(
  rows: string[][],
  headerRowCount: number,
): ParsedPdfTableColumnSemantics[] {
  const columnCount = Math.max(...rows.map((row) => row.length), 0);
  return Array.from({ length: columnCount }, (_, columnIndex) => {
    const header = mergeHeaderCells(rows.slice(0, headerRowCount).map((row) => row[columnIndex]));
    const bodyValues = rows
      .slice(headerRowCount)
      .map((row) => normalizeText(row[columnIndex] ?? ""))
      .filter((cell) => cell.length > 0);
    const numericCount = bodyValues.filter(isNumericTableCell).length;
    const numericRatio = bodyValues.length === 0 ? 0 : numericCount / bodyValues.length;
    return {
      columnIndex,
      ...(header.length === 0 ? {} : { header }),
      type: tableColumnType(bodyValues.length, numericRatio),
      nonEmptyCellCount: bodyValues.length,
      numericCellRatio: Math.round(numericRatio * 100) / 100,
      sampleValues: bodyValues.slice(0, maxPdfTableSampleValues),
    };
  });
}

function mergeHeaderCells(cells: Array<string | undefined>) {
  return normalizeText(cells.filter((cell): cell is string => cell !== undefined).join(" / "));
}

function tableColumnType(valueCount: number, numericRatio: number): ParsedPdfTableColumnType {
  if (valueCount === 0) return "empty";
  if (numericRatio >= 0.8) return "numeric";
  if (numericRatio <= 0.2) return "text";
  return "mixed";
}

function numericCellRatio(cells: string[]) {
  const values = cells.filter((cell) => cell.length > 0);
  if (values.length === 0) return 0;
  return values.filter(isNumericTableCell).length / values.length;
}

function isNumericTableCell(cell: string) {
  const text = normalizeText(cell)
    .replace(/[,%±~≈<>≤≥]/gu, "")
    .replace(/\s+/g, "");
  return /^[-+]?(\d+(\.\d+)?|\.\d+)(e[-+]?\d+)?$/iu.test(text);
}

function inferPdfTableMergedCellHints(input: {
  rows: string[][];
  rowLayouts: PdfTableRowLayout[];
  columns: number[];
}): ParsedPdfTableMergedCellHint[] {
  const hints: ParsedPdfTableMergedCellHint[] = [];
  input.rowLayouts.forEach((rowLayout, rowIndex) => {
    const materializedRow = tableCellsForRow(rowLayout, input.columns);
    const nonEmptyIndexes = materializedRow
      .map((cell, columnIndex) => ({ cell, columnIndex }))
      .filter(({ cell }) => cell.length > 0);
    if (nonEmptyIndexes.length !== 1 || materializedRow.length < 3) return;
    const only = nonEmptyIndexes[0];
    if (only === undefined) return;
    hints.push({
      rowIndex,
      columnIndex: only.columnIndex,
      text: excerpt(only.cell, maxPdfTableCellTextLength),
      columnSpan: materializedRow.length,
      reason: "sparse_row",
      confidence: "low",
    });
  });
  input.rows.forEach((row, rowIndex) => {
    const nonEmptyIndexes = row
      .map((cell, columnIndex) => ({ cell, columnIndex }))
      .filter(({ cell }) => cell.length > 0);
    if (nonEmptyIndexes.length === 1 && row.length >= 3) {
      const only = nonEmptyIndexes[0];
      if (only !== undefined) {
        hints.push({
          rowIndex,
          columnIndex: only.columnIndex,
          text: excerpt(only.cell, maxPdfTableCellTextLength),
          columnSpan: row.length,
          reason: "sparse_row",
          confidence: "low",
        });
      }
    }
  });

  input.rowLayouts.forEach((rowLayout, rowIndex) => {
    for (const item of rowLayout.items) {
      const columnIndex = nearestPdfColumnIndex(item.x, input.columns);
      if (columnIndex === -1) continue;
      if (!isWidePdfTableItem(item, input.columns)) continue;
      hints.push({
        rowIndex,
        columnIndex,
        text: excerpt(item.text, maxPdfTableCellTextLength),
        columnSpan: Math.min(2, input.columns.length - columnIndex),
        reason: "wide_text_item",
        confidence: "medium",
      });
    }
  });

  return dedupePdfTableMergedCellHints(hints);
}

function isWidePdfTableItem(item: PdfTextItemLayout, columns: number[]) {
  const columnIndex = nearestPdfColumnIndex(item.x, columns);
  if (columnIndex === -1) return false;
  const currentColumn = columns[columnIndex];
  const nextColumn = columns[columnIndex + 1];
  if (currentColumn === undefined || nextColumn === undefined) return false;
  return item.width >= (nextColumn - currentColumn) * 1.35;
}

function sparsePdfTableRowIndexes(rows: string[][]) {
  return rows.flatMap((row, rowIndex) => {
    const nonEmpty = row.filter((cell) => cell.length > 0).length;
    return row.length >= 3 && nonEmpty > 0 && nonEmpty <= Math.max(1, Math.floor(row.length / 3))
      ? [rowIndex]
      : [];
  });
}

function dedupePdfTableMergedCellHints(hints: ParsedPdfTableMergedCellHint[]) {
  const seen = new Set<string>();
  return hints.filter((hint) => {
    const key = `${hint.rowIndex}:${hint.columnIndex}:${hint.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function pdfTableSemanticWarnings(input: {
  rows: string[][];
  headerRowCount: number;
  mergedCellHints: ParsedPdfTableMergedCellHint[];
  sparseRowIndexes: number[];
}) {
  const warnings: string[] = [];
  if (input.headerRowCount === 0) warnings.push("table_header_unresolved");
  if (input.mergedCellHints.length > 0) warnings.push("table_merged_cell_hints");
  if (input.sparseRowIndexes.length > 0) warnings.push("table_sparse_rows");
  if (input.rows.length >= maxPdfTableRows) warnings.push("table_rows_truncated");
  return warnings.slice(0, maxPdfTableSemanticWarnings);
}

function inferPdfTableColumns(rows: PdfTableRowLayout[]): number[] {
  const clusters: Array<{ x: number; count: number }> = [];
  for (const row of rows) {
    const seenClusterIndexes = new Set<number>();
    for (const item of row.items) {
      const index = nearestPdfColumnClusterIndex(item.x, clusters);
      if (index === -1) {
        clusters.push({ x: item.x, count: 1 });
        seenClusterIndexes.add(clusters.length - 1);
        continue;
      }
      if (seenClusterIndexes.has(index)) continue;
      const cluster = clusters[index];
      if (cluster === undefined) continue;
      cluster.x = (cluster.x * cluster.count + item.x) / (cluster.count + 1);
      cluster.count += 1;
      seenClusterIndexes.add(index);
    }
  }
  const minHits = Math.max(2, Math.ceil(rows.length * 0.5));
  return clusters
    .filter((cluster) => cluster.count >= minHits)
    .sort((a, b) => a.x - b.x)
    .map((cluster) => cluster.x);
}

function nearestPdfColumnClusterIndex(x: number, clusters: Array<{ x: number; count: number }>) {
  let nearestIndex = -1;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < clusters.length; index += 1) {
    const cluster = clusters[index];
    if (cluster === undefined) continue;
    const distance = Math.abs(cluster.x - x);
    if (distance < nearestDistance) {
      nearestIndex = index;
      nearestDistance = distance;
    }
  }
  return nearestDistance <= pdfTableColumnXTolerance ? nearestIndex : -1;
}

function tableCellsForRow(row: PdfTableRowLayout, columns: number[]) {
  const cells = columns.map(() => "");
  for (const item of row.items) {
    const columnIndex = nearestPdfColumnIndex(item.x, columns);
    if (columnIndex === -1) continue;
    cells[columnIndex] = excerpt(
      normalizeText(`${cells[columnIndex] ?? ""} ${item.text}`),
      maxPdfTableCellTextLength,
    );
  }
  return cells;
}

function nearestPdfColumnIndex(x: number, columns: number[]) {
  let nearestIndex = -1;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < columns.length; index += 1) {
    const column = columns[index];
    if (column === undefined) continue;
    const distance = Math.abs(column - x);
    if (distance < nearestDistance) {
      nearestIndex = index;
      nearestDistance = distance;
    }
  }
  return nearestDistance <= pdfTableColumnXTolerance * 1.5 ? nearestIndex : -1;
}

function attachCaptionBoundingBoxes(
  markers: ParsedPdfCaptionMarker[],
  pageLayouts: PdfPageLayout[],
): ParsedPdfCaptionMarker[] {
  return markers.map((marker) => ({
    ...marker,
    bbox: captionBoundingBox(marker, pageLayouts),
  }));
}

function captionBoundingBox(
  marker: ParsedPdfCaptionMarker,
  pageLayouts: PdfPageLayout[],
): ParsedPdfBoundingBox | undefined {
  if (marker.pageNumber === null) return undefined;
  const layout = pageLayouts.find((page) => page.pageNumber === marker.pageNumber);
  if (layout === undefined) return undefined;
  const haystack = normalizeText(`${marker.label} ${marker.caption}`).toLowerCase();
  const matchedItems = layout.items.filter((item) => {
    const text = normalizeText(item.text).toLowerCase();
    return text.length > 0 && haystack.includes(text);
  });
  return bboxForItems(matchedItems);
}

function linkPdfTablesToCaptions(
  structures: ParsedPdfTableStructure[],
  tableMarkers: ParsedPdfCaptionMarker[],
): ParsedPdfTableStructure[] {
  const usedCaptionIds = new Set<string>();
  return structures.map((structure) => {
    const caption = tableMarkers.find(
      (marker) => marker.pageNumber === structure.pageNumber && !usedCaptionIds.has(marker.id),
    );
    if (caption === undefined) return structure;
    usedCaptionIds.add(caption.id);
    return {
      ...structure,
      captionLabel: caption.label,
      caption: caption.caption,
      captionCharStart: caption.charStart,
      captionCharEnd: caption.charEnd,
    };
  });
}

function extractPdfImageArtifacts(
  figures: ParsedPdfCaptionMarker[],
  imageOperators: PdfImageOperatorMarker[],
): ParsedPdfImageArtifact[] {
  const artifacts: ParsedPdfImageArtifact[] = [];
  const usedFigureIds = new Set<string>();

  for (const operator of imageOperators) {
    if (artifacts.length >= maxPdfImageArtifacts) break;
    const figure = figures.find(
      (candidate) =>
        candidate.pageNumber === operator.pageNumber && !usedFigureIds.has(candidate.id),
    );
    if (figure !== undefined) usedFigureIds.add(figure.id);
    artifacts.push({
      id: `image:${artifacts.length + 1}`,
      pageNumber: operator.pageNumber,
      ...(figure?.label === undefined ? {} : { label: figure.label }),
      ...(figure?.caption === undefined ? {} : { caption: figure.caption }),
      ...(figure?.charStart === undefined ? {} : { captionCharStart: figure.charStart }),
      ...(figure?.charEnd === undefined ? {} : { captionCharEnd: figure.charEnd }),
      ...(figure?.bbox === undefined ? {} : { bbox: figure.bbox }),
      ...(operator.objectRef === undefined ? {} : { objectRef: operator.objectRef }),
      source: "pdfjs_operator_list",
      extractionStatus: "operator_detected",
      visionAnalysis: pdfImageVisionAnalysisRequirement(
        `figure-analysis:${artifacts.length + 1}`,
        "needs_bounded_crop",
      ),
      confidence: figure === undefined ? "low" : "medium",
    });
  }

  for (const figure of figures) {
    if (artifacts.length >= maxPdfImageArtifacts) break;
    if (usedFigureIds.has(figure.id) || figure.pageNumber === null) continue;
    artifacts.push({
      id: `image:${artifacts.length + 1}`,
      pageNumber: figure.pageNumber,
      label: figure.label,
      caption: figure.caption,
      captionCharStart: figure.charStart,
      captionCharEnd: figure.charEnd,
      ...(figure.bbox === undefined ? {} : { bbox: figure.bbox }),
      source: "caption_marker",
      extractionStatus: "caption_anchor_only",
      visionAnalysis: pdfImageVisionAnalysisRequirement(
        `figure-analysis:${artifacts.length + 1}`,
        "image_pixels_unavailable",
      ),
      confidence: "low",
    });
  }

  return artifacts;
}

function pdfImageVisionAnalysisRequirement(
  analysisId: string,
  inputStatus: ParsedPdfImageVisionAnalysisRequirement["inputStatus"],
): ParsedPdfImageVisionAnalysisRequirement {
  return {
    analysisId,
    status: "requires_visual_model",
    modelInput: "image",
    inputRequirement: "bounded_image_or_page_crop",
    inputStatus,
    promptBoundary: "no_full_pdf_prompt",
    providerBoundary: "trusted_runtime_required",
  };
}

function buildPdfFigureAnalyses(images: ParsedPdfImageArtifact[]): ParsedPdfFigureAnalysis[] {
  return images.map((image, index) => {
    const inputStatus =
      image.visionAnalysis?.inputStatus ??
      (image.extractionStatus === "operator_detected"
        ? "needs_bounded_crop"
        : "image_pixels_unavailable");
    return {
      id: image.visionAnalysis?.analysisId ?? `figure-analysis:${index + 1}`,
      imageId: image.id,
      pageNumber: image.pageNumber,
      ...(image.label === undefined ? {} : { label: image.label }),
      ...(image.caption === undefined ? {} : { caption: image.caption }),
      source: image.source,
      status: "requires_visual_model",
      modelInput: "image",
      inputRequirement: "bounded_image_or_page_crop",
      inputStatus,
      promptBoundary: "no_full_pdf_prompt",
      providerBoundary: "trusted_runtime_required",
      reason:
        inputStatus === "needs_bounded_crop"
          ? "bounded_image_crop_required"
          : "image_pixels_unavailable",
      confidence: image.confidence,
    };
  });
}

function extractPdfCitationLinks(
  text: string,
  pages: ParsedPdfPage[],
  sections: ParsedPdfSection[],
  references: ParsedPdfReference[],
): ParsedPdfCitationLink[] {
  const links: ParsedPdfCitationLink[] = [];
  const referencesStart = sections.find((section) => section.kind === "references")?.charStart;
  const searchableEnd = referencesStart ?? text.length;
  const referenceByLabel = new Map(
    references.flatMap((reference) => {
      const normalized = normalizeReferenceLabel(reference.label);
      return normalized === undefined ? [] : [[normalized, reference] as const];
    }),
  );

  for (const line of textLineRanges(text)) {
    if (line.charStart >= searchableEnd) break;
    const matches = line.text.matchAll(/\[((?:\d+\s*(?:[-,;]\s*)?)+)\]/g);
    for (const match of matches) {
      if (links.length >= maxPdfCitationLinks) return links;
      const marker = match[0] ?? "";
      const markerStart = line.charStart + (match.index ?? 0);
      const markerEnd = markerStart + marker.length;
      const pageRange = pageRangeForChars(markerStart, markerEnd, pages);
      const targets = numericCitationTargets(match[1] ?? "").slice(
        0,
        maxPdfCitationTargetsPerMarker,
      );
      for (const target of targets) {
        if (links.length >= maxPdfCitationLinks) return links;
        const normalizedTargetLabel = `[${target}]`;
        const reference = referenceByLabel.get(normalizedTargetLabel);
        links.push({
          id: `citation-link:${links.length + 1}`,
          marker,
          citationStyle: "numeric_bracket",
          normalizedTargetLabel,
          targetReferenceIndex: reference?.index ?? null,
          ...(reference?.label === undefined ? {} : { targetReferenceLabel: reference.label }),
          charStart: markerStart,
          charEnd: markerEnd,
          pageNumber: pageRange.pageStart,
          context: citationContext(text, markerStart, markerEnd),
          confidence: reference === undefined ? "low" : "high",
        });
      }
    }
  }

  return links;
}

function numericCitationTargets(input: string) {
  const targets: number[] = [];
  for (const part of input.split(/[;,]/)) {
    const trimmed = normalizeText(part);
    const rangeMatch = /^(\d+)\s*-\s*(\d+)$/.exec(trimmed);
    if (rangeMatch !== null) {
      const start = Number.parseInt(rangeMatch[1] ?? "", 10);
      const end = Number.parseInt(rangeMatch[2] ?? "", 10);
      if (Number.isFinite(start) && Number.isFinite(end) && end >= start && end - start <= 20) {
        for (let value = start; value <= end; value += 1) targets.push(value);
      }
      continue;
    }
    const value = Number.parseInt(trimmed, 10);
    if (Number.isFinite(value)) targets.push(value);
  }
  return Array.from(new Set(targets)).filter((value) => value > 0);
}

function normalizeReferenceLabel(label: string | undefined) {
  if (label === undefined) return undefined;
  const match = /\d+/.exec(label);
  if (match === null) return undefined;
  return `[${Number.parseInt(match[0], 10)}]`;
}

function citationContext(text: string, charStart: number, charEnd: number) {
  const start = Math.max(0, charStart - 120);
  const end = Math.min(text.length, charEnd + 120);
  return excerpt(text.slice(start, end), 260);
}

function buildPdfParseQuality(input: {
  pages: ParsedPdfPage[];
  sections: ParsedPdfSection[];
  references: ParsedPdfReference[];
  figures: ParsedPdfCaptionMarker[];
  tables: ParsedPdfCaptionMarker[];
  images: ParsedPdfImageArtifact[];
  tableStructures: ParsedPdfTableStructure[];
  figureAnalyses: ParsedPdfFigureAnalysis[];
  citationLinks: ParsedPdfCitationLink[];
}): ParsedPdfParseQuality {
  const textPageCount = input.pages.filter((page) => page.text.length > 0).length;
  const textPageCoverage = input.pages.length === 0 ? 0 : textPageCount / input.pages.length;
  const linkedReferences = new Set(
    input.citationLinks.flatMap((link) =>
      link.targetReferenceIndex === null ? [] : [link.targetReferenceIndex],
    ),
  );
  const linkedReferenceRatio =
    input.references.length === 0 ? null : linkedReferences.size / input.references.length;
  const warnings = pdfParseQualityWarnings({
    ...input,
    textPageCoverage,
    linkedReferenceRatio,
  });
  const score = pdfParseQualityScore({
    textPageCoverage,
    sections: input.sections,
    references: input.references,
    figures: input.figures,
    tables: input.tables,
    images: input.images,
    tableStructures: input.tableStructures,
    figureAnalyses: input.figureAnalyses,
    citationLinks: input.citationLinks,
    linkedReferenceRatio,
  });
  return {
    version: "clio-pdf-parse-quality-v1",
    status: score >= 0.8 ? "pass" : score >= 0.45 ? "needs_review" : "insufficient",
    score,
    metrics: {
      pageCount: input.pages.length,
      textPageCoverage,
      sectionCount: input.sections.length,
      referenceCount: input.references.length,
      figureCaptionCount: input.figures.length,
      imageArtifactCount: input.images.length,
      tableCaptionCount: input.tables.length,
      tableStructureCount: input.tableStructures.length,
      tableSemanticCount: input.tableStructures.filter(
        (table) => table.semanticVersion === "clio-pdf-table-semantics-v1",
      ).length,
      figureAnalysisQueueCount: input.figureAnalyses.length,
      figureVisionReadyCount: input.figureAnalyses.filter(
        (analysis) => analysis.inputStatus === "needs_bounded_crop",
      ).length,
      citationLinkCount: input.citationLinks.length,
      linkedReferenceRatio,
    },
    warnings,
  };
}

function pdfParseQualityWarnings(input: {
  pages: ParsedPdfPage[];
  sections: ParsedPdfSection[];
  references: ParsedPdfReference[];
  figures: ParsedPdfCaptionMarker[];
  tables: ParsedPdfCaptionMarker[];
  images: ParsedPdfImageArtifact[];
  tableStructures: ParsedPdfTableStructure[];
  figureAnalyses: ParsedPdfFigureAnalysis[];
  citationLinks: ParsedPdfCitationLink[];
  textPageCoverage: number;
  linkedReferenceRatio: number | null;
}) {
  const warnings: string[] = [];
  if (input.textPageCoverage < 1) warnings.push("partial_text_pages");
  if (input.sections.length === 0) warnings.push("section_outline_unavailable");
  if (input.references.length > 0 && input.citationLinks.length === 0) {
    warnings.push("citation_links_unavailable");
  }
  if (input.linkedReferenceRatio !== null && input.linkedReferenceRatio < 0.25) {
    warnings.push("low_reference_linkage");
  }
  if (input.tables.length > input.tableStructures.length) {
    warnings.push("table_caption_without_structure");
  }
  if (input.tableStructures.some((table) => table.semanticWarnings.length > 0)) {
    warnings.push("table_semantics_need_review");
  }
  if (
    input.figures.length > 0 &&
    input.images.every((image) => image.extractionStatus !== "operator_detected")
  ) {
    warnings.push("figure_image_operator_unavailable");
  }
  if (input.figureAnalyses.some((analysis) => analysis.status === "requires_visual_model")) {
    warnings.push("figure_visual_model_required");
  }
  if (
    input.figureAnalyses.some((analysis) => analysis.inputStatus === "image_pixels_unavailable")
  ) {
    warnings.push("figure_image_pixels_unavailable");
  }
  return warnings.slice(0, maxPdfWarnings);
}

function pdfParseQualityScore(input: {
  textPageCoverage: number;
  sections: ParsedPdfSection[];
  references: ParsedPdfReference[];
  figures: ParsedPdfCaptionMarker[];
  tables: ParsedPdfCaptionMarker[];
  images: ParsedPdfImageArtifact[];
  tableStructures: ParsedPdfTableStructure[];
  figureAnalyses: ParsedPdfFigureAnalysis[];
  citationLinks: ParsedPdfCitationLink[];
  linkedReferenceRatio: number | null;
}) {
  let score = Math.max(0, Math.min(1, input.textPageCoverage)) * 0.35;
  if (input.sections.length > 0) score += 0.15;
  if (input.references.length > 0) score += 0.12;
  if (input.references.length === 0 || input.citationLinks.length > 0) score += 0.12;
  if (input.linkedReferenceRatio !== null)
    score += Math.min(0.12, input.linkedReferenceRatio * 0.12);
  if (input.tables.length === 0 || input.tableStructures.length > 0) score += 0.08;
  if (input.figures.length === 0 || input.images.length > 0) score += 0.06;
  if (
    input.tableStructures.length > 0 &&
    input.tableStructures.every((table) => table.semanticVersion === "clio-pdf-table-semantics-v1")
  ) {
    score += 0.03;
  }
  if (
    input.figures.length === 0 ||
    input.figureAnalyses.some((analysis) => analysis.inputStatus === "needs_bounded_crop")
  ) {
    score += 0.02;
  }
  return Math.round(Math.min(1, score) * 100) / 100;
}

function tableCellsFromRows(rows: string[][]): ParsedPdfTableCell[] {
  return rows.flatMap((row, rowIndex) =>
    row.map((text, columnIndex) => ({
      rowIndex,
      columnIndex,
      text,
      rowSpan: 1,
      columnSpan: 1,
    })),
  );
}

function tableRowsToMarkdown(rows: string[][]) {
  if (rows.length === 0) return "";
  const header = rows[0] ?? [];
  const separator = header.map(() => "---");
  return [header, separator, ...rows.slice(1)]
    .map((row) => `| ${row.map(escapeMarkdownCell).join(" | ")} |`)
    .join("\n");
}

function escapeMarkdownCell(input: string) {
  return input.replace(/\|/g, "\\|");
}

function tableRowsToCsv(rows: string[][]) {
  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

function csvCell(input: string) {
  if (!/[",\n]/.test(input)) return input;
  return `"${input.replace(/"/g, '""')}"`;
}

function pdfPageDimensions(
  page: PdfJsPage,
): Pick<ParsedPdfPage, "pageHeight" | "pageUnit" | "pageWidth"> {
  const viewport = page.getViewport?.({ scale: 1 });
  if (viewport === undefined) return {};
  const pageWidth = finiteNumber(viewport.width);
  const pageHeight = finiteNumber(viewport.height);
  if (pageWidth === undefined || pageHeight === undefined || pageWidth <= 0 || pageHeight <= 0) {
    return {};
  }
  return { pageWidth, pageHeight, pageUnit: "pdf_user_space" };
}

async function exactPdfBboxCrop(input: {
  bbox: ParsedPdfBoundingBox | undefined;
  canvas: PdfRenderCanvas;
  canvasFactory: PdfRenderCanvasFactory;
  maxWidth: number;
  maxHeight: number;
  mimeType: PdfFigureVisionImageMimeType;
  pageHeight: number;
  pageNumber: number;
  pageWidth: number;
  renderedHeight: number;
  renderedWidth: number;
  scale: number;
  viewport: PdfJsViewport;
}): Promise<PdfFigureVisionImageExtractionResult | undefined> {
  if (input.bbox === undefined) return undefined;
  const cropRect = pdfBboxToCropRect({
    bbox: input.bbox,
    pageHeight: input.pageHeight,
    renderedHeight: input.renderedHeight,
    renderedWidth: input.renderedWidth,
    scale: input.scale,
    viewport: input.viewport,
  });
  if (cropRect === undefined) return undefined;
  const cropCanvas = input.canvasFactory(cropRect.width, cropRect.height);
  const cropContext = cropCanvas.getContext("2d");
  if (!isPdfRenderCanvas2dContext(cropContext) || cropContext.drawImage === undefined) {
    return undefined;
  }
  try {
    cropContext.drawImage(
      input.canvas,
      cropRect.x,
      cropRect.y,
      cropRect.width,
      cropRect.height,
      0,
      0,
      cropRect.width,
      cropRect.height,
    );
    const cropBytes = await pdfCanvasToBytes(cropCanvas, input.mimeType);
    if (cropBytes.byteLength === 0) return undefined;
    return {
      status: "ready",
      pageNumber: input.pageNumber,
      image: {
        base64: bytesToBase64(cropBytes),
        mimeType: input.mimeType,
        byteLength: cropBytes.byteLength,
      },
      crop: {
        kind: "exact_bbox_crop",
        pageNumber: input.pageNumber,
        width: cropRect.width,
        height: cropRect.height,
        scale: input.scale,
        maxWidth: input.maxWidth,
        maxHeight: input.maxHeight,
        bbox: input.bbox,
        sourcePage: {
          width: input.renderedWidth,
          height: input.renderedHeight,
        },
        cropRect,
      },
    };
  } catch {
    return undefined;
  }
}

function pdfBboxToCropRect(input: {
  bbox: ParsedPdfBoundingBox;
  pageHeight: number;
  renderedHeight: number;
  renderedWidth: number;
  scale: number;
  viewport: PdfJsViewport;
}) {
  const bbox = normalizedPdfBoundingBox(input.bbox);
  if (bbox === undefined) return undefined;
  const viewportRect = pdfBboxToViewportRect({
    bbox,
    pageHeight: input.pageHeight,
    scale: input.scale,
    viewport: input.viewport,
  });
  if (viewportRect === undefined) return undefined;
  const width = viewportRect.right - viewportRect.left;
  const height = viewportRect.bottom - viewportRect.top;
  if (width <= 0 || height <= 0) return undefined;
  const marginPx = Math.min(
    figureVisionExactCropMaxMarginPx,
    Math.max(
      figureVisionExactCropMinMarginPx,
      Math.max(width, height) * figureVisionExactCropMarginRatio,
    ),
  );
  const left = Math.max(0, Math.floor(viewportRect.left - marginPx));
  const top = Math.max(0, Math.floor(viewportRect.top - marginPx));
  const right = Math.min(input.renderedWidth, Math.ceil(viewportRect.right + marginPx));
  const bottom = Math.min(input.renderedHeight, Math.ceil(viewportRect.bottom + marginPx));
  const cropWidth = right - left;
  const cropHeight = bottom - top;
  if (cropWidth <= 0 || cropHeight <= 0) return undefined;
  return {
    x: left,
    y: top,
    width: cropWidth,
    height: cropHeight,
    marginPx: Math.round(marginPx * 100) / 100,
  };
}

function pdfBboxToViewportRect(input: {
  bbox: ParsedPdfBoundingBox;
  pageHeight: number;
  scale: number;
  viewport: PdfJsViewport;
}) {
  const viewportRect = input.viewport.convertToViewportRectangle?.([
    input.bbox.xMin,
    input.bbox.yMin,
    input.bbox.xMax,
    input.bbox.yMax,
  ]);
  if (
    Array.isArray(viewportRect) &&
    viewportRect.length === 4 &&
    viewportRect.every((value) => Number.isFinite(value))
  ) {
    return {
      left: Math.min(viewportRect[0] ?? 0, viewportRect[2] ?? 0),
      top: Math.min(viewportRect[1] ?? 0, viewportRect[3] ?? 0),
      right: Math.max(viewportRect[0] ?? 0, viewportRect[2] ?? 0),
      bottom: Math.max(viewportRect[1] ?? 0, viewportRect[3] ?? 0),
    };
  }
  return {
    left: input.bbox.xMin * input.scale,
    top: (input.pageHeight - input.bbox.yMax) * input.scale,
    right: input.bbox.xMax * input.scale,
    bottom: (input.pageHeight - input.bbox.yMin) * input.scale,
  };
}

function normalizedPdfBoundingBox(bbox: ParsedPdfBoundingBox) {
  if (bbox.unit !== "pdf_user_space") return undefined;
  const values = [bbox.xMin, bbox.yMin, bbox.xMax, bbox.yMax];
  if (!values.every((value) => Number.isFinite(value))) return undefined;
  const xMin = Math.min(bbox.xMin, bbox.xMax);
  const xMax = Math.max(bbox.xMin, bbox.xMax);
  const yMin = Math.min(bbox.yMin, bbox.yMax);
  const yMax = Math.max(bbox.yMin, bbox.yMax);
  if (xMax <= xMin || yMax <= yMin) return undefined;
  return { xMin, yMin, xMax, yMax, unit: "pdf_user_space" as const };
}

function isPdfRenderCanvas2dContext(value: unknown): value is PdfRenderCanvas2dContext {
  return typeof value === "object" && value !== null;
}

function defaultPdfRenderCanvasFactory(width: number, height: number): PdfRenderCanvas {
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(width, height) as unknown as PdfRenderCanvas;
  }
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  throw new Error("PDF_RENDER_CANVAS_UNAVAILABLE");
}

async function pdfCanvasToBytes(
  canvas: PdfRenderCanvas,
  mimeType: PdfFigureVisionImageMimeType,
): Promise<Uint8Array> {
  if (typeof canvas.convertToBlob === "function") {
    return new Uint8Array(await (await canvas.convertToBlob({ type: mimeType })).arrayBuffer());
  }
  if (typeof canvas.toDataURL === "function") {
    return base64ToBytes(dataUrlBase64(canvas.toDataURL(mimeType)));
  }
  throw new Error("PDF_RENDER_CANVAS_EXPORT_UNAVAILABLE");
}

function dataUrlBase64(dataUrl: string) {
  const comma = dataUrl.indexOf(",");
  return comma < 0 ? dataUrl : dataUrl.slice(comma + 1);
}

function bytesToBase64(bytes: Uint8Array) {
  if (typeof btoa === "function") {
    let binary = "";
    for (let index = 0; index < bytes.length; index += 1) {
      binary += String.fromCharCode(bytes[index] ?? 0);
    }
    return btoa(binary);
  }
  const bufferCtor = (
    globalThis as { Buffer?: { from(input: Uint8Array): { toString(format: "base64"): string } } }
  ).Buffer;
  if (bufferCtor !== undefined) return bufferCtor.from(bytes).toString("base64");
  throw new Error("BASE64_ENCODER_UNAVAILABLE");
}

function base64ToBytes(input: string) {
  if (typeof atob === "function") {
    const binary = atob(input);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }
  const bufferCtor = (
    globalThis as { Buffer?: { from(input: string, encoding: "base64"): Uint8Array } }
  ).Buffer;
  if (bufferCtor !== undefined) return new Uint8Array(bufferCtor.from(input, "base64"));
  throw new Error("BASE64_DECODER_UNAVAILABLE");
}

function bboxForItems(items: PdfTextItemLayout[]): ParsedPdfBoundingBox | undefined {
  if (items.length === 0) return undefined;
  return {
    xMin: Math.min(...items.map((item) => item.x)),
    yMin: Math.min(...items.map((item) => item.y)),
    xMax: Math.max(...items.map((item) => item.x + item.width)),
    yMax: Math.max(...items.map((item) => item.y + item.height)),
    unit: "pdf_user_space",
  };
}

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function buildPdfParseWarnings(input: { pages: ParsedPdfPage[]; sections: ParsedPdfSection[] }) {
  const warnings: string[] = [];
  const emptyTextPageCount = input.pages.filter((page) => page.text.length === 0).length;
  if (emptyTextPageCount > 0) warnings.push(`empty_text_pages:${emptyTextPageCount}`);
  if (input.sections.length === 0) warnings.push("section_outline_unavailable");
  return warnings.slice(0, maxPdfWarnings);
}

function ocrStatusForPages(pages: ParsedPdfPage[]): ParsedPdfOcrStatus {
  if (pages.every((page) => page.text.length === 0)) return "not_available";
  if (pages.some((page) => page.text.length === 0)) return "partial_text";
  return "not_required";
}

function textLineRanges(input: string): TextLineRange[] {
  const lines: TextLineRange[] = [];
  const matches = input.matchAll(/[^\n]+/g);
  for (const match of matches) {
    const raw = match[0] ?? "";
    const text = normalizeText(raw);
    if (text.length === 0) continue;
    const charStart = match.index ?? 0;
    lines.push({
      text,
      charStart,
      charEnd: charStart + raw.length,
    });
  }
  return lines;
}

function pageRangeForChars(charStart: number, charEnd: number, pages: ParsedPdfPage[]): PageRange {
  const overlapping = pages.filter((page) => page.charEnd > charStart && page.charStart < charEnd);
  if (overlapping.length > 0) {
    return {
      pageStart: overlapping[0]?.pageNumber ?? null,
      pageEnd: overlapping[overlapping.length - 1]?.pageNumber ?? null,
    };
  }
  const nearest = pages.find((page) => page.charStart <= charStart && page.charEnd >= charStart);
  return {
    pageStart: nearest?.pageNumber ?? null,
    pageEnd: nearest?.pageNumber ?? null,
  };
}

function byteLengthOfPdfInput(bytes: Uint8Array | ArrayBuffer) {
  return bytes instanceof Uint8Array ? bytes.byteLength : bytes.byteLength;
}

function metadataString(value: unknown) {
  if (typeof value !== "string") return undefined;
  const normalized = normalizeText(value);
  return normalized.length === 0 ? undefined : normalized;
}

function parseKeywords(value: unknown) {
  const normalized = metadataString(value);
  if (normalized === undefined) return [];
  return normalized
    .split(/[;,]/)
    .map((item) => normalizeText(item))
    .filter((item) => item.length > 0)
    .slice(0, 50);
}

function setMetadataDefault(metadata: Record<string, unknown>, key: string, value: unknown) {
  if (value === undefined || metadata[key] !== undefined) return;
  metadata[key] = value;
}
