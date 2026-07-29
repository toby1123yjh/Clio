import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { env, pipeline } from "@huggingface/transformers";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const repository = "Xenova/multilingual-e5-small";
const revision = "761b726dd34fb83930e26aab4e9ac3899aa1fa78";
const query = normalizeText(process.argv[2] ?? "PurityChecker");
const assetDirectory = path.resolve(process.argv[3] ?? ".output/chrome-mv3/assets/test-workspace");
const maxSampledChunksPerSource = 48;

if (query.length === 0) throw new Error("The semantic diagnostic query must not be empty.");

env.allowRemoteModels = true;
env.allowLocalModels = true;
env.useFSCache = true;

const sources = [...builtInSources(), ...(await loadPdfSources(assetDirectory))];
const extractor = await pipeline("feature-extraction", repository, {
  revision,
  dtype: "int8",
  device: "cpu",
});

try {
  const queryVector = (await embed(extractor, [`query: ${query}`]))[0];
  if (queryVector === undefined) throw new Error("The query embedding was not produced.");

  const metaVectors = await embed(
    extractor,
    sources.map((source) => `passage: ${source.metaText}`),
  );
  const chunkRows = sources.flatMap((source) =>
    sampleChunks(chunkText(source.text, 900, 120), query, maxSampledChunksPerSource).map(
      (chunk) => ({
        sourceId: source.id,
        text: chunk,
        embeddingText: `passage: ${source.metaText}\n\n${chunk}`,
      }),
    ),
  );
  const chunkVectors = await embed(
    extractor,
    chunkRows.map((row) => row.embeddingText),
  );

  const chunkScoresBySource = new Map();
  chunkRows.forEach((row, index) => {
    const vector = chunkVectors[index];
    if (vector === undefined) return;
    const score = cosineSimilarity(queryVector, vector);
    const current = chunkScoresBySource.get(row.sourceId);
    if (current === undefined || score > current.score) {
      chunkScoresBySource.set(row.sourceId, { score, text: row.text });
    }
  });

  const rows = sources
    .map((source, index) => ({
      id: source.id,
      exactTextMatch: source.text.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
      metaScore: cosineSimilarity(queryVector, metaVectors[index] ?? []),
      chunkScore: chunkScoresBySource.get(source.id)?.score ?? Number.NEGATIVE_INFINITY,
      bestChunk: chunkScoresBySource.get(source.id)?.text ?? "",
    }))
    .sort((left, right) => right.chunkScore - left.chunkScore);

  const metaSelected = selectedSourceIds(rows, "metaScore");
  const chunkSelected = selectedSourceIds(rows, "chunkScore");
  const union = new Set([...metaSelected, ...chunkSelected]);
  const selected = pruneCrossTrackSourceIds(rows, metaSelected, chunkSelected);

  console.log(`Query: ${query}`);
  console.log(`Corpus: ${rows.length} sources (${chunkRows.length} sampled chunks)`);
  console.log(
    `Current Clio fallback: ceil(sqrt(${rows.length})) = ${Math.ceil(Math.sqrt(rows.length))} sources per vector track`,
  );
  console.log(
    `Selected: meta=${metaSelected.size}, chunks=${chunkSelected.size}, union=${union.size}/${rows.length}, final=${selected.size}`,
  );
  console.table(
    rows.map((row) => ({
      source: row.id,
      exact: row.exactTextMatch ? "yes" : "no",
      meta: roundScore(row.metaScore),
      chunk: roundScore(row.chunkScore),
      metaSelected: metaSelected.has(row.id) ? "yes" : "",
      chunkSelected: chunkSelected.has(row.id) ? "yes" : "",
      crossTrackSelected: selected.has(row.id) ? "yes" : "",
    })),
  );
  console.log("Meta score distribution:", scoreDistribution(rows.map((row) => row.metaScore)));
  console.log("Chunk score distribution:", scoreDistribution(rows.map((row) => row.chunkScore)));
} finally {
  await extractor.dispose();
}

async function loadPdfSources(directory) {
  const entries = (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.toLocaleLowerCase().endsWith(".pdf"))
    .sort((left, right) => left.name.localeCompare(right.name));
  const sources = [];
  for (const entry of entries) {
    const filePath = path.join(directory, entry.name);
    const bytes = new Uint8Array(await readFile(filePath));
    const text = normalizeText(await extractPdfText(bytes));
    const title = entry.name.replace(/\.pdf$/i, "");
    sources.push({
      id: entry.name,
      text,
      metaText: [title, extractAbstract(text), "pdf"].filter(Boolean).join("\n\n"),
    });
  }
  return sources;
}

async function extractPdfText(bytes) {
  const document = await getDocument({ data: bytes }).promise;
  try {
    const pages = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(
        content.items
          .flatMap((item) => ("str" in item && typeof item.str === "string" ? [item.str] : []))
          .join(" "),
      );
    }
    return pages.join("\n\n");
  } finally {
    await document.destroy();
  }
}

async function embed(extractor, inputs) {
  const vectors = [];
  for (let offset = 0; offset < inputs.length; offset += 16) {
    const batch = inputs.slice(offset, offset + 16);
    const tensor = await extractor(batch, {
      pooling: "mean",
      normalize: true,
      truncation: true,
      max_length: 512,
    });
    try {
      const dimension = tensor.dims.at(-1);
      if (dimension === undefined) throw new Error("Embedding tensor has no final dimension.");
      const data = Array.from(tensor.data, Number);
      for (let index = 0; index < batch.length; index += 1) {
        vectors.push(data.slice(index * dimension, (index + 1) * dimension));
      }
    } finally {
      tensor.dispose?.();
    }
  }
  return vectors;
}

function selectedSourceIds(rows, scoreKey) {
  const ranked = rows
    .filter((row) => Number.isFinite(row[scoreKey]) && row[scoreKey] > 0)
    .sort((left, right) => right[scoreKey] - left[scoreKey]);
  const count = adaptiveVectorSourceCount(ranked.map((row) => row[scoreKey]));
  return new Set(ranked.slice(0, count).map((row) => row.id));
}

function pruneCrossTrackSourceIds(rows, metaSelected, chunkSelected) {
  const union = new Set([...metaSelected, ...chunkSelected]);
  const largestTrackSize = Math.max(metaSelected.size, chunkSelected.size);
  if (union.size <= largestTrackSize || largestTrackSize === 0) return union;
  const ranked = rows
    .filter((row) => union.has(row.id))
    .map((row) => ({ ...row, score: Math.max(row.metaScore, row.chunkScore) }))
    .filter((row) => Number.isFinite(row.score) && row.score > 0)
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
  const count = Math.min(
    largestTrackSize,
    adaptiveVectorSourceCount(ranked.map((row) => row.score)),
  );
  return new Set(ranked.slice(0, count).map((row) => row.id));
}

function adaptiveVectorSourceCount(scores) {
  if (scores.length <= 2) return scores.length;
  const fallbackCount = Math.max(1, Math.ceil(Math.sqrt(scores.length)));
  const consideredCount = Math.min(scores.length, fallbackCount * 2);
  const considered = scores.slice(0, consideredCount);
  const topScore = considered[0] ?? 0;
  const lastScore = considered.at(-1) ?? topScore;
  const totalSpread = topScore - lastScore;
  let largestGap = 0;
  let largestGapIndex = -1;
  for (let index = 0; index < considered.length - 1; index += 1) {
    const gap = (considered[index] ?? 0) - (considered[index + 1] ?? 0);
    if (gap > largestGap) {
      largestGap = gap;
      largestGapIndex = index;
    }
  }
  const remainingSpread = Math.max(0, totalSpread - largestGap);
  if (largestGapIndex >= 0 && largestGap > remainingSpread) return largestGapIndex + 1;
  return fallbackCount;
}

function chunkText(input, maxChars, overlapChars) {
  const text = normalizeText(input);
  if (text.length <= maxChars) return text.length === 0 ? [] : [text];
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(text.length, start + maxChars);
    if (end < text.length) {
      const breakAt = text.lastIndexOf(" ", end);
      if (breakAt > start + Math.floor(maxChars * 0.6)) end = breakAt;
    }
    const chunk = normalizeText(text.slice(start, end));
    if (chunk.length > 0) chunks.push(chunk);
    if (end >= text.length) break;
    start = Math.max(start + 1, end - overlapChars);
  }
  return chunks;
}

function sampleChunks(chunks, queryText, limit) {
  if (chunks.length <= limit) return chunks;
  const selected = new Map();
  chunks.forEach((chunk, index) => {
    if (chunk.toLocaleLowerCase().includes(queryText.toLocaleLowerCase()))
      selected.set(index, chunk);
  });
  const remaining = Math.max(0, limit - selected.size);
  for (let index = 0; index < remaining; index += 1) {
    const sourceIndex = Math.min(
      chunks.length - 1,
      Math.floor((index * (chunks.length - 1)) / Math.max(1, remaining - 1)),
    );
    selected.set(sourceIndex, chunks[sourceIndex]);
  }
  return Array.from(selected.entries())
    .sort((left, right) => left[0] - right[0])
    .map((entry) => entry[1]);
}

function extractAbstract(text) {
  const match = text.match(
    /\babstract\b\s*[:.-]?\s*([\s\S]{100,2400}?)(?:\b1\.?\s+introduction\b|\bintroduction\b)/i,
  );
  return normalizeText(match?.[1] ?? text.slice(0, 1_200));
}

function cosineSimilarity(left, right) {
  const length = Math.min(left.length, right.length);
  let score = 0;
  for (let index = 0; index < length; index += 1) score += left[index] * right[index];
  return score;
}

function scoreDistribution(scores) {
  const sorted = scores.filter(Number.isFinite).sort((left, right) => left - right);
  return {
    min: roundScore(sorted[0] ?? 0),
    median: roundScore(sorted[Math.floor(sorted.length / 2)] ?? 0),
    max: roundScore(sorted.at(-1) ?? 0),
    positive: `${sorted.filter((score) => score > 0).length}/${sorted.length}`,
  };
}

function roundScore(value) {
  return Number.isFinite(value) ? Number(value.toFixed(4)) : null;
}

function normalizeText(input) {
  return String(input ?? "")
    .replaceAll(String.fromCharCode(0), "")
    .replace(/\s+/g, " ")
    .trim();
}

function builtInSources() {
  return [
    {
      id: "web-evidence-ranking",
      metaText: "Evidence ranking for browser research\n\nretrieval\n\nwebpage",
      text: "Reciprocal rank fusion combines independently ranked keyword, vector, and metadata result lists without comparing incompatible raw scores. Bounded evidence windows keep retrieval precise while preventing an entire long document from entering the model context.",
    },
    {
      id: "selection-context-budget",
      metaText: "Selection fixture: context budget\n\ncontext-planning\n\nselection",
      text: "A source context pack should allocate depth dynamically and preserve citations to the original source chunks.",
    },
    {
      id: "markdown-evidence-v2",
      metaText: "Evidence Retrieval Notes\n\nLocal RAG Symposium\n\nmarkdown",
      text: "The second revision adds multilingual semantic retrieval, reciprocal rank fusion, and bounded evidence windows. Combine keyword, vector, and metadata candidate lists. Re-rank bounded chunks, then load only the source windows that fit the context budget. Citations must continue to point to the original source and chunk identifiers.",
    },
  ];
}
