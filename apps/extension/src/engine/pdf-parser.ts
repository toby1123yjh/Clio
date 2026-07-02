import { hashText, normalizeText } from "@/src/shared/text";

export interface ParsedPdfPage {
  pageNumber: number;
  text: string;
  charStart: number;
  charEnd: number;
}

export interface ParsedPdfDocument {
  text: string;
  pages: ParsedPdfPage[];
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
}

interface PdfJsDocument {
  numPages: number;
  getPage(pageNumber: number): Promise<{
    getTextContent(): Promise<{ items: PdfJsTextItem[] }>;
  }>;
  getMetadata?(): Promise<{
    info?: Record<string, unknown>;
    metadata?: { get(name: string): unknown };
  }>;
  destroy?(): Promise<void>;
}

interface PdfJsModule {
  getDocument(input: {
    data: Uint8Array;
    disableWorker: true;
    verbosity: number;
  }): { promise: Promise<PdfJsDocument> };
}

const pdfPageSeparator = "\n\n";

export async function parsePdfDocument(
  bytes: Uint8Array | ArrayBuffer,
  pdfjsModule?: PdfJsModule,
): Promise<ParsedPdfDocument> {
  const pdfjs =
    pdfjsModule ?? ((await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as PdfJsModule);
  const document = await pdfjs.getDocument({
    data: bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes),
    disableWorker: true,
    verbosity: 0,
  }).promise;

  try {
    const pages: ParsedPdfPage[] = [];
    const pageTexts: string[] = [];
    let offset = 0;

    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const pageText = normalizeText(
        textContent.items
          .flatMap((item) => (typeof item.str === "string" ? [item.str] : []))
          .join(" "),
      );
      const charStart = offset;
      const charEnd = charStart + pageText.length;
      pages.push({ pageNumber, text: pageText, charStart, charEnd });
      pageTexts.push(pageText);
      offset = charEnd + pdfPageSeparator.length;
    }

    const text = normalizeText(pageTexts.join(pdfPageSeparator));
    if (text.length === 0) {
      throw new Error("PDF_EMPTY_TEXT");
    }

    const metadata = await readPdfMetadata(document);
    return {
      text,
      pages,
      metadata: {
        ...metadata,
        pageCount: document.numPages,
        parser: "pdfjs",
        textHash: hashText(text),
      },
    };
  } finally {
    await document.destroy?.();
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
    })),
  };

  setMetadataDefault(metadata, "title", input.parsed.metadata.title);
  setMetadataDefault(metadata, "author", input.parsed.metadata.author);
  setMetadataDefault(metadata, "subject", input.parsed.metadata.subject);
  setMetadataDefault(metadata, "keywords", input.parsed.metadata.keywords);

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
