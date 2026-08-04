import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { env, pipeline } from "@huggingface/transformers";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const modelProfiles = {
  "e5-base-512": {
    profile: "e5-base-512",
    repository: "Xenova/multilingual-e5-base",
    revision: "1ec9243030a27d1a115d5c340572074c125b58b2",
    dtype: "int8",
    dimension: 768,
    maxInputTokens: 512,
    declaredTokenizerMaxInputTokens: 512,
    architectureMaxInputTokens: 512,
    queryPrefix: "query: ",
    passagePrefix: "passage: ",
    targetPassageTokens: 420,
    overlapTokens: 64,
    embeddingBatchSize: 8,
  },
  "jina-zh-1024": {
    profile: "jina-zh-1024",
    repository: "Xenova/jina-embeddings-v2-base-zh",
    revision: "7cb68f86f20ff10431b272eb2142f242d911ab5f",
    dtype: "int8",
    dimension: 768,
    maxInputTokens: 1024,
    declaredTokenizerMaxInputTokens: 512,
    architectureMaxInputTokens: 8192,
    queryPrefix: "",
    passagePrefix: "",
    targetPassageTokens: 850,
    overlapTokens: 112,
    embeddingBatchSize: 2,
  },
  "jina-zh-512": {
    profile: "jina-zh-512",
    repository: "Xenova/jina-embeddings-v2-base-zh",
    revision: "7cb68f86f20ff10431b272eb2142f242d911ab5f",
    dtype: "int8",
    dimension: 768,
    maxInputTokens: 512,
    declaredTokenizerMaxInputTokens: 512,
    architectureMaxInputTokens: 8192,
    queryPrefix: "",
    passagePrefix: "",
    targetPassageTokens: 420,
    overlapTokens: 64,
    embeddingBatchSize: 8,
  },
};
const modelProfile = process.env.CHUNK_CONTEXT_MODEL ?? "e5-base-512";
const model = modelProfiles[modelProfile];
if (model === undefined) {
  throw new Error(
    `Unknown CHUNK_CONTEXT_MODEL '${modelProfile}'. Expected one of: ${Object.keys(modelProfiles).join(", ")}.`,
  );
}
const assetDirectory = path.resolve(process.argv[2] ?? ".output/chrome-mv3/assets/test-workspace");
const outputPath = process.argv[3] === undefined ? undefined : path.resolve(process.argv[3]);
const targetPassageTokens = model.targetPassageTokens;
const overlapTokens = model.overlapTokens;
const maxSectionSummaryTokens = 96;
const embeddingBatchSize = model.embeddingBatchSize;

const paperDefinitions = [
  {
    filePrefix: "01-IDE_Native_",
    title: "IDE Native, Foundation Model Based Agents for Software Refactoring",
  },
  {
    filePrefix: "02-MUARF_",
    title: "MUARF: Leveraging Multi-Agent Workflows for Automated Code Refactoring",
  },
  {
    filePrefix: "03-2501.16692",
    title: "Optimizing Code Runtime Performance through Context-Aware RAG",
  },
  {
    filePrefix: "04-2510.03914",
    title: "Refactoring with LLMs: Bridging Human Expertise and Machine Understanding",
  },
  {
    filePrefix: "05-2511.04548",
    title: "Microservices Is Dying: Module Division Based on Universal Interfaces",
  },
  {
    filePrefix: "06-2511.22729",
    title: "Solving Context Window Overflow in AI Agents",
  },
  {
    filePrefix: "07-3295739",
    title: "Understanding and Analyzing Java Reflection",
  },
  {
    filePrefix: "08-applsci-15-02407",
    title: "Refactoring for Java-Structured Concurrency",
  },
  {
    filePrefix: "09-dacapo-asplos-2025",
    title: "Rethinking Java Performance Analysis",
  },
];

const benchmarkQueries = [
  query("q01", "为什么集成开发环境适合作为自动重构代理的运行位置？", "01-IDE_Native_", [
    ["static analysis", "ideal place"],
  ]),
  query(
    "q02",
    "What risks arise when foundation-model agents propose refactorings?",
    "01-IDE_Native_",
    [["buggy or vulnerable code"], ["puzzling responses"]],
  ),
  query("q03", "哪个工具用于筛选纯重构样本，参考数据库又是怎样构建的？", "02-MUARF_", [
    ["puritychecker", "contextual rag construction"],
  ]),
  query("q04", "开发者代理和审查代理在多智能体重构中分别负责什么？", "02-MUARF_", [
    ["developer agent", "reviewer agent"],
  ]),
  query("q05", "Which components contributed most in the MUARF ablation study?", "02-MUARF_", [
    ["ablation results", "greatest contribution"],
  ]),
  query("q06", "怎样结合历史代码示例和控制流图来优化程序运行时性能？", "03-2501.16692", [
    ["historical code examples", "cfg analysis"],
  ]),
  query(
    "q07",
    "How much execution-efficiency improvement did AutoPatch achieve over GPT-4o?",
    "03-2501.16692",
    [["7 3", "gpt 4o"]],
  ),
  query("q08", "基于 Fowler 指南的规则式指令为什么能改进自动重构？", "04-2510.03914", [
    ["fowler", "rule based instructions"],
  ]),
  query(
    "q09",
    "How many refactoring types were encoded with motivations, steps, and objectives?",
    "04-2510.03914",
    [["61", "refactoring types"]],
  ),
  query("q10", "通用接口如何成为模块边界并消除模块之间的依赖？", "05-2511.04548", [
    ["universal interfaces", "boundary between modules"],
  ]),
  query(
    "q11",
    "What architecture permits runtime loading and unloading while remaining monolithic?",
    "05-2511.04548",
    [["eight", "dynamically load"]],
  ),
  query("q12", "工具输出太长时，如何用内存指针避免上下文窗口溢出？", "06-2511.22729", [
    ["memory pointers", "context window"],
  ]),
  query("q13", "How much did the pointer-based method reduce token consumption?", "06-2511.22729", [
    ["seven times fewer tokens"],
  ]),
  query("q14", "如何把 Java 非结构化并发自动转换成结构化并发？", "08-applsci-15-02407", [
    ["unstructured concurrency", "structured concurrency"],
  ]),
  query(
    "q15",
    "What analysis and precondition does ReStruct apply before transformation?",
    "08-applsci-15-02407",
    [["visitor pattern analysis", "precondition"]],
  ),
  query("q16", "新版 DaCapo 用多少工作负载和多少个维度来证明多样性？", "09-dacapo-asplos-2025", [
    ["22", "47 dimensions", "principal components analysis"],
  ]),
  query(
    "q17",
    "Why must benchmark methodology keep pace with systems innovation?",
    "09-dacapo-asplos-2025",
    [["methodologies", "innovation"]],
  ),
];

const variants = [
  { id: "A", label: "passage_only" },
  { id: "B", label: "title_passage" },
  { id: "C", label: "title_heading_passage" },
  { id: "D", label: "title_heading_section_summary_passage" },
];

env.allowRemoteModels = true;
env.allowLocalModels = true;
env.useFSCache = true;

console.log(`Loading ${model.repository}@${model.revision} (${model.dtype})...`);
const extractor = await pipeline("feature-extraction", model.repository, {
  revision: model.revision,
  dtype: model.dtype,
  device: "cpu",
});

try {
  const tokenizer = extractor.tokenizer;
  if (tokenizer === undefined)
    throw new Error("The embedding pipeline did not expose a tokenizer.");
  // The converted Jina tokenizer advertises 512 even though its ALiBi ONNX graph is dynamic.
  // Set the experiment's explicit window before the pipeline performs implicit truncation.
  tokenizer._tokenizerConfig.model_max_length = model.maxInputTokens;
  await verifyTokenizerWindow(tokenizer);
  const corpus = await loadCorpus(assetDirectory, tokenizer);
  const includedSources = corpus.sources.filter((source) => source.chunks.length > 0);
  const chunks = includedSources.flatMap((source) => source.chunks);
  const queries = benchmarkQueries.map((item) => ({
    ...item,
    expectedSourceId: resolveExpectedSourceId(item.expectedSourcePrefix, includedSources),
  }));
  validateBenchmark(queries, chunks);

  console.log(
    `Corpus: ${includedSources.length} PDFs, ${chunks.length} chunks, ${queries.length} queries`,
  );
  console.log(
    `Chunking: ${targetPassageTokens} tokenizer tokens, ${overlapTokens} overlap; model limit: ${model.maxInputTokens}`,
  );
  if (corpus.excluded.length > 0) {
    console.log("Excluded PDFs:", corpus.excluded);
  }

  const queryVectors = await embedInputs(
    extractor,
    queries.map((item) => formatQueryInput(item.text)),
    "queries",
  );
  const results = [];
  for (const variant of variants) {
    const rows = [];
    for (const chunk of chunks) rows.push(await variantRow(variant.id, chunk, tokenizer));
    const vectors = await embedInputs(
      extractor,
      rows.map((row) => formatPassageInput(row.embeddingInput)),
      `variant ${variant.id}`,
    );
    const evaluation = evaluateVariant(queries, queryVectors, rows, vectors);
    results.push({
      ...variant,
      tokenStats: summarizeTokenStats(rows),
      ...evaluation,
    });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    model,
    ...(model.profile === "e5-base-512"
      ? {
          requestedButInvalidMaxInputTokens: 1024,
          reasonRequestedLimitIsInvalid:
            "Xenova/multilingual-e5-base declares model_max_length=512 and max_position_embeddings=514.",
        }
      : {
          tokenizerLimitOverride: `The converted tokenizer declares 512, while the dynamic ALiBi ONNX graph was smoke-tested at 1024 and 1536 tokens. This run explicitly caps it at ${model.maxInputTokens}.`,
        }),
    corpus: {
      assetDirectory,
      includedSources: includedSources.map((source) => ({
        id: source.id,
        title: source.title,
        sectionCount: source.sectionCount,
        sectionPaths: source.sectionPaths,
        chunkCount: source.chunks.length,
      })),
      excluded: corpus.excluded,
      chunkCount: chunks.length,
    },
    benchmark: {
      queryCount: queries.length,
      queries: queries.map(({ expectedSourcePrefix: _prefix, ...item }) => item),
      relevanceRule:
        "A relevant evidence chunk must belong to the expected source and contain every normalized anchor in at least one anchor group.",
    },
    chunking: {
      targetPassageTokens,
      overlapTokens,
      maxSectionSummaryTokens,
      sectionSummaryFallback: "none",
    },
    results,
  };

  printSummary(report);
  if (outputPath !== undefined) {
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(`Wrote ${outputPath}`);
  }
} finally {
  await extractor.dispose();
}

function query(id, text, expectedSourcePrefix, anchorGroups) {
  return { id, text, expectedSourcePrefix, anchorGroups };
}

async function loadCorpus(directory, tokenizer) {
  const entries = (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".pdf"))
    .sort((left, right) => left.name.localeCompare(right.name));
  const sources = [];
  const excluded = [];
  for (const entry of entries) {
    const definition = paperDefinitions.find((item) => entry.name.startsWith(item.filePrefix));
    if (definition === undefined) {
      excluded.push({ id: entry.name, reason: "no_benchmark_definition" });
      continue;
    }
    const bytes = new Uint8Array(await readFile(path.join(directory, entry.name)));
    const parsed = await extractPdfLines(bytes);
    if (parsed.text.length < 500) {
      excluded.push({ id: entry.name, reason: "insufficient_extractable_text" });
      continue;
    }
    const sections = buildSections(parsed.text, parsed.lines);
    const chunks = [];
    for (const section of sections) {
      const sectionSummary =
        section.headingPath.length === 0
          ? ""
          : await extractSectionSummary(section.text, tokenizer);
      const sectionChunks = await chunkByTokenizer(section.text, tokenizer);
      for (const text of sectionChunks) {
        chunks.push({
          id: `${entry.name}:chunk:${chunks.length}`,
          sourceId: entry.name,
          title: definition.title,
          headingPath: section.headingPath,
          sectionSummary,
          text,
          passageTokens: await tokenLength(tokenizer, text, false),
        });
      }
    }
    sources.push({
      id: entry.name,
      title: definition.title,
      sectionCount: sections.filter((section) => section.headingPath.length > 0).length,
      sectionPaths: sections
        .map((section) => section.headingPath)
        .filter((headingPath) => headingPath.length > 0),
      chunks,
    });
  }
  return { sources, excluded };
}

async function extractPdfLines(bytes) {
  const document = await getDocument({ data: bytes, verbosity: 0 }).promise;
  try {
    const lines = [];
    const textParts = [];
    let offset = 0;
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      let current = "";
      const flush = () => {
        const text = normalizeText(current);
        current = "";
        if (text.length === 0) return;
        const charStart = offset;
        textParts.push(text);
        offset += text.length;
        lines.push({ text, charStart, charEnd: offset, pageNumber });
        textParts.push("\n");
        offset += 1;
      };
      for (const item of content.items) {
        if (!("str" in item) || typeof item.str !== "string") continue;
        current += `${current.length > 0 && item.str.length > 0 ? " " : ""}${item.str}`;
        if (item.hasEOL === true) flush();
      }
      flush();
      textParts.push("\n");
      offset += 1;
    }
    return { text: textParts.join("").trim(), lines };
  } finally {
    await document.destroy();
  }
}

function buildSections(text, lines) {
  const headings = [];
  const stack = [];
  let insideReferences = false;
  for (const line of lines) {
    const heading = parseHeading(line.text);
    if (heading === undefined) continue;
    const normalizedTitle = heading.title.toLowerCase();
    if (insideReferences && !normalizedTitle.startsWith("appendix")) continue;
    if (normalizedTitle === "references") insideReferences = true;
    if (normalizedTitle.startsWith("appendix")) insideReferences = false;
    stack.length = Math.max(0, heading.level - 1);
    stack[heading.level - 1] = heading.title;
    headings.push({
      ...heading,
      charStart: line.charStart,
      headingPath: stack.filter(Boolean).join(" > "),
    });
  }

  const sections = [];
  const firstHeadingStart = headings[0]?.charStart ?? text.length;
  const preamble = normalizeText(text.slice(0, firstHeadingStart));
  if (preamble.length > 0) sections.push({ headingPath: "", text: preamble });
  headings.forEach((heading, index) => {
    const end = headings[index + 1]?.charStart ?? text.length;
    const sectionText = normalizeText(text.slice(heading.charStart, end));
    if (sectionText.length > 0) {
      sections.push({ headingPath: heading.headingPath, text: sectionText });
    }
  });
  if (sections.length === 0 && text.length > 0) sections.push({ headingPath: "", text });
  return sections;
}

function parseHeading(input) {
  const line = normalizeText(input);
  if (line.length < 2 || line.length > 140) return undefined;
  const normalizedLine = normalizeHeadingTitle(line);
  const abstract = normalizedLine.match(/^abstract\s*(?:[\u2014:\-]|$)/i);
  if (abstract !== null) return { level: 1, title: "Abstract" };
  const named = normalizedLine.match(
    /^(introduction|background|related work|method(?:ology)?|experiments?|experimental design|evaluation|results?|discussion|conclusions?|references)$/i,
  );
  if (named !== null) return { level: 1, title: normalizeHeadingTitle(named[1]) };
  const appendix = normalizedLine.match(/^appendix(?:\s+[A-Z0-9]+)?(?:\s*[:.-]\s*.+)?$/i);
  if (appendix !== null) return heading(1, normalizedLine, true);
  const roman = line.match(/^([IVXLCDM]+)\.\s+(.+)$/);
  if (roman !== null) return heading(1, roman[2], looksLikeMainHeading(roman[2]));
  const letter = line.match(/^([A-Z])\.\s+(.+)$/);
  if (letter !== null) return heading(2, letter[2], looksLikeSubheading(letter[2]));
  const numbered = line.match(/^(\d+(?:\.\d+){0,3})\.?\s+(.+)$/);
  if (numbered !== null) {
    const numberedTitle = normalizeHeadingTitle(numbered[2]);
    const wordCount = numberedTitle.split(/\s+/).filter(Boolean).length;
    return heading(
      numbered[1].split(".").length,
      numbered[2],
      looksLikeSubheading(numbered[2]) && (wordCount >= 2 || isKnownSectionTitle(numberedTitle)),
    );
  }
  return undefined;
}

function heading(level, rawTitle, accepted) {
  if (!accepted) return undefined;
  const title = normalizeHeadingTitle(rawTitle);
  if (title.length < 2 || title.split(/\s+/).length > 14) return undefined;
  return { level, title };
}

function normalizeHeadingTitle(rawTitle) {
  return normalizeText(rawTitle)
    .replace(/\b([A-Z])\s+([A-Z]{2,})\b/g, "$1$2")
    .replace(/[.:\-\s]+$/g, "")
    .trim();
}

function looksLikeMainHeading(rawTitle) {
  const title = normalizeHeadingTitle(rawTitle);
  if (!isPlausibleHeadingText(title)) return false;
  return title === title.toUpperCase() || isKnownSectionTitle(title);
}

function looksLikeSubheading(rawTitle) {
  const title = normalizeHeadingTitle(rawTitle);
  if (!isPlausibleHeadingText(title)) return false;
  if (isKnownSectionTitle(title)) return true;
  const words = title.split(/\s+/).filter(Boolean);
  const titleCaseWords = words.filter((word) => /^[A-Z][\p{L}\p{N}-]*$/u.test(word));
  return words.length > 0 && titleCaseWords.length / words.length >= 0.6;
}

function isPlausibleHeadingText(title) {
  const words = title.split(/\s+/).filter(Boolean);
  return (
    title.length >= 2 &&
    title.length <= 110 &&
    words.length >= 1 &&
    words.length <= 14 &&
    /\p{L}/u.test(title) &&
    !/[;,{}=<>]/u.test(title) &&
    !/[.!?]$/u.test(title) &&
    !/\bet\s+al\b/i.test(title) &&
    !/(?:https?:\/\/|www\.|\.(?:com|org|edu|io)\b)/i.test(title) &&
    !/^(?:return|if|else|for|while|class|public|private|protected)\b/i.test(title)
  );
}

function isKnownSectionTitle(title) {
  return /^(?:abstract|introduction|background|related work|motivation|overview|method(?:ology)?|approach|architecture|system design|implementation|data(?:set)?|experimental setup|experimental design|experiments?|evaluation|analysis|results?|findings|discussion|limitations?|threats to validity|future work|conclusions?|references|appendix)(?:\b|\s*[:.-])/i.test(
    title,
  );
}

async function chunkByTokenizer(text, tokenizer) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    let end = await findLargestTextEnd(text, start, text.length, targetPassageTokens, tokenizer);
    if (end < text.length) end = moveToPreviousWordBoundary(text, start, end);
    if (end <= start) end = Math.min(text.length, start + 1);
    const chunk = normalizeText(text.slice(start, end));
    if (chunk.length > 0) chunks.push(chunk);
    if (end >= text.length) break;

    let nextStart = await findOverlapStart(text, start, end, overlapTokens, tokenizer);
    nextStart = moveToPreviousWordStart(text, start, nextStart);
    start = nextStart > start && nextStart < end ? nextStart : end;
  }
  return chunks;
}

async function findLargestTextEnd(text, start, maximumEnd, tokenBudget, tokenizer) {
  let searchWidth = Math.max(64, tokenBudget * 4);
  let high = Math.min(maximumEnd, start + searchWidth);
  while (
    high < maximumEnd &&
    (await tokenLength(tokenizer, text.slice(start, high), false)) <= tokenBudget
  ) {
    searchWidth *= 2;
    high = Math.min(maximumEnd, start + searchWidth);
  }
  let low = start + 1;
  let best = start;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const tokens = await tokenLength(tokenizer, text.slice(start, middle), false);
    if (tokens <= tokenBudget) {
      best = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return best;
}

async function findOverlapStart(text, minimumStart, end, tokenBudget, tokenizer) {
  let low = minimumStart + 1;
  let high = end;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const tokens = await tokenLength(tokenizer, text.slice(middle, end), false);
    if (tokens <= tokenBudget) high = middle;
    else low = middle + 1;
  }
  return low;
}

function moveToPreviousWordBoundary(text, minimum, position) {
  let cursor = position;
  while (cursor > minimum && !/\s/u.test(text[cursor - 1])) cursor -= 1;
  return cursor > minimum ? cursor : position;
}

function moveToPreviousWordStart(text, minimum, position) {
  let cursor = position;
  while (cursor > minimum && !/\s/u.test(text[cursor - 1])) cursor -= 1;
  return cursor;
}

async function extractSectionSummary(sectionText, tokenizer) {
  const candidates = normalizeText(sectionText)
    .split(/(?<=[.!?])\s+/u)
    .map(normalizeText)
    .filter((sentence) => sentence.length >= 50 && sentence.length <= 700)
    .slice(0, 2);
  if (candidates.length === 0) return "";
  const summary = candidates.join(" ");
  const end = await findLargestTextEnd(
    summary,
    0,
    summary.length,
    maxSectionSummaryTokens,
    tokenizer,
  );
  return normalizeText(summary.slice(0, moveToPreviousWordBoundary(summary, 0, end)));
}

async function variantRow(variantId, chunk, tokenizer) {
  const prefixParts = [];
  if (variantId !== "A") prefixParts.push(`Title: ${chunk.title}`);
  if ((variantId === "C" || variantId === "D") && chunk.headingPath.length > 0) {
    prefixParts.push(`Section: ${chunk.headingPath}`);
  }
  if (variantId === "D" && chunk.sectionSummary.length > 0) {
    prefixParts.push(`Section summary: ${chunk.sectionSummary}`);
  }
  const prefix = prefixParts.join("\n");
  const embeddingInput = prefix.length === 0 ? chunk.text : `${prefix}\n\n${chunk.text}`;
  const fullTokens = await tokenLength(tokenizer, formatPassageInput(embeddingInput), true);
  const prefixTokens =
    prefix.length === 0
      ? await tokenLength(tokenizer, model.passagePrefix, true)
      : await tokenLength(tokenizer, formatPassageInput(`${prefix}\n\n`), true);
  const estimatedPassageBudget = Math.max(0, model.maxInputTokens - prefixTokens + 1);
  return {
    ...chunk,
    embeddingInput,
    fullTokens,
    prefixTokens,
    estimatedRetainedPassageTokens: Math.min(chunk.passageTokens, estimatedPassageBudget),
    truncated: fullTokens > model.maxInputTokens,
  };
}

function formatQueryInput(text) {
  return `${model.queryPrefix}${text}`;
}

function formatPassageInput(text) {
  return `${model.passagePrefix}${text}`;
}

async function verifyTokenizerWindow(tokenizer) {
  const probe = "long context verification token ".repeat(model.maxInputTokens);
  const encoded = await tokenizer(probe, { truncation: true });
  const observedTokens = encoded.input_ids.dims.at(-1);
  if (observedTokens !== model.maxInputTokens) {
    throw new Error(
      `Tokenizer window verification failed: expected ${model.maxInputTokens}, received ${observedTokens}.`,
    );
  }
  encoded.input_ids.dispose?.();
  encoded.attention_mask?.dispose?.();
  encoded.token_type_ids?.dispose?.();
}

async function tokenLength(tokenizer, text, addSpecialTokens) {
  const encoded = await tokenizer(text, {
    add_special_tokens: addSpecialTokens,
    truncation: false,
  });
  return encoded.input_ids.data.length;
}

async function embedInputs(extractor, inputs, label) {
  const vectors = [];
  for (let offset = 0; offset < inputs.length; offset += embeddingBatchSize) {
    const batch = inputs.slice(offset, offset + embeddingBatchSize);
    const tensor = await extractor(batch, {
      pooling: "mean",
      normalize: true,
    });
    try {
      const dimension = tensor.dims.at(-1);
      if (dimension !== model.dimension) {
        throw new Error(`Expected embedding dimension ${model.dimension}, received ${dimension}.`);
      }
      const data = Array.from(tensor.data, Number);
      for (let index = 0; index < batch.length; index += 1) {
        vectors.push(data.slice(index * dimension, (index + 1) * dimension));
      }
    } finally {
      tensor.dispose?.();
    }
    const done = Math.min(inputs.length, offset + embeddingBatchSize);
    if (done === inputs.length || done % 80 === 0)
      console.log(`${label}: ${done}/${inputs.length}`);
  }
  return vectors;
}

function evaluateVariant(queries, queryVectors, rows, vectors) {
  const perQuery = queries.map((item, queryIndex) => {
    const queryVector = queryVectors[queryIndex];
    const ranked = rows
      .map((row, index) => ({ row, score: dot(queryVector, vectors[index]) }))
      .sort((left, right) => right.score - left.score || left.row.id.localeCompare(right.row.id));
    const sourceOrder = [];
    const seenSources = new Set();
    for (const hit of ranked) {
      if (seenSources.has(hit.row.sourceId)) continue;
      seenSources.add(hit.row.sourceId);
      sourceOrder.push(hit.row.sourceId);
    }
    const sourceRank = sourceOrder.indexOf(item.expectedSourceId) + 1;
    const evidenceIndex = ranked.findIndex(
      (hit) =>
        hit.row.sourceId === item.expectedSourceId &&
        matchesAnchorGroup(hit.row.text, item.anchorGroups),
    );
    const evidenceRank = evidenceIndex < 0 ? null : evidenceIndex + 1;
    const top = ranked[0];
    return {
      id: item.id,
      query: item.text,
      expectedSourceId: item.expectedSourceId,
      sourceRank,
      evidenceRank,
      topSourceId: top?.row.sourceId ?? null,
      topHeadingPath: top?.row.headingPath ?? null,
      topScore: round(top?.score ?? 0),
    };
  });
  return {
    metrics: {
      sourceRecallAt1: ratio(
        perQuery.filter((item) => item.sourceRank <= 1).length,
        perQuery.length,
      ),
      sourceRecallAt3: ratio(
        perQuery.filter((item) => item.sourceRank <= 3).length,
        perQuery.length,
      ),
      sourceMrr: average(perQuery.map((item) => 1 / item.sourceRank)),
      evidenceHitAt1: ratio(
        perQuery.filter((item) => item.evidenceRank !== null && item.evidenceRank <= 1).length,
        perQuery.length,
      ),
      evidenceHitAt5: ratio(
        perQuery.filter((item) => item.evidenceRank !== null && item.evidenceRank <= 5).length,
        perQuery.length,
      ),
      evidenceHitAt10: ratio(
        perQuery.filter((item) => item.evidenceRank !== null && item.evidenceRank <= 10).length,
        perQuery.length,
      ),
      evidenceMrr: average(
        perQuery.map((item) => (item.evidenceRank === null ? 0 : 1 / item.evidenceRank)),
      ),
    },
    perQuery,
  };
}

function summarizeTokenStats(rows) {
  return {
    averagePassageTokens: average(rows.map((row) => row.passageTokens)),
    averagePrefixTokens: average(rows.map((row) => row.prefixTokens)),
    averageFullTokensBeforeTruncation: average(rows.map((row) => row.fullTokens)),
    truncatedInputs: rows.filter((row) => row.truncated).length,
    truncatedInputRate: ratio(rows.filter((row) => row.truncated).length, rows.length),
    averageRetainedPassageRatio: average(
      rows.map((row) => row.estimatedRetainedPassageTokens / row.passageTokens),
    ),
    chunksWithAvailableSectionSummary: rows.filter((row) => row.sectionSummary.length > 0).length,
  };
}

function validateBenchmark(queries, chunks) {
  for (const item of queries) {
    const sourceChunks = chunks.filter((chunk) => chunk.sourceId === item.expectedSourceId);
    const evidenceExists = sourceChunks.some((chunk) =>
      matchesAnchorGroup(chunk.text, item.anchorGroups),
    );
    if (!evidenceExists) {
      const diagnosticTerms = item.anchorGroups
        .flat()
        .flatMap((anchor) => normalizeMatchText(anchor).split(" "))
        .filter((term) => term.length >= 5);
      const nearbyChunks = sourceChunks
        .filter((chunk) => {
          const normalized = normalizeMatchText(chunk.text);
          return diagnosticTerms.some((term) => normalized.includes(term));
        })
        .slice(0, 3)
        .map((chunk) => ({
          headingPath: chunk.headingPath,
          text: chunk.text.slice(0, 500),
        }));
      throw new Error(
        `No evidence chunk matches the benchmark anchors for ${item.id}. Diagnostics: ${JSON.stringify(
          {
            anchorGroups: item.anchorGroups,
            sourceChunkCount: sourceChunks.length,
            nearbyChunks,
          },
        )}`,
      );
    }
  }
}

function resolveExpectedSourceId(prefix, sources) {
  const matches = sources.filter((source) => source.id.startsWith(prefix));
  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one included source for prefix ${prefix}, found ${matches.length}.`,
    );
  }
  return matches[0].id;
}

function matchesAnchorGroup(text, groups) {
  const normalized = normalizeMatchText(text);
  return groups.some((group) =>
    group.every((anchor) => normalized.includes(normalizeMatchText(anchor))),
  );
}

function normalizeMatchText(input) {
  return String(input)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/([\p{L}\p{N}])-\s+([\p{L}\p{N}])/gu, "$1$2")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeText(input) {
  return String(input ?? "")
    .normalize("NFKC")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function dot(left, right) {
  let score = 0;
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    score += left[index] * right[index];
  }
  return score;
}

function average(values) {
  if (values.length === 0) return 0;
  return round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function ratio(numerator, denominator) {
  return denominator === 0 ? 0 : round(numerator / denominator);
}

function round(value) {
  return Number(value.toFixed(4));
}

function printSummary(report) {
  console.log("\nAggregate metrics");
  console.table(
    report.results.map((result) => ({
      variant: result.id,
      sourceR1: result.metrics.sourceRecallAt1,
      sourceR3: result.metrics.sourceRecallAt3,
      sourceMRR: result.metrics.sourceMrr,
      evidenceH1: result.metrics.evidenceHitAt1,
      evidenceH5: result.metrics.evidenceHitAt5,
      evidenceH10: result.metrics.evidenceHitAt10,
      evidenceMRR: result.metrics.evidenceMrr,
      truncated: result.tokenStats.truncatedInputRate,
      retainedPassage: result.tokenStats.averageRetainedPassageRatio,
    })),
  );
  console.log("\nPer-query source/evidence ranks");
  console.table(
    report.benchmark.queries.map((item) => {
      const row = { id: item.id, query: item.text.slice(0, 46) };
      for (const result of report.results) {
        const hit = result.perQuery.find((candidate) => candidate.id === item.id);
        row[result.id] = `${hit?.sourceRank ?? "-"}/${hit?.evidenceRank ?? "-"}`;
      }
      return row;
    }),
  );
}
