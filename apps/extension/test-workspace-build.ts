import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { basename, extname, resolve } from "node:path";
import {
  type TestWorkspaceBuildConfig,
  isCorpusId,
  testWorkspaceBuildConfigSchemaVersion,
  testWorkspaceSourceNamespace,
} from "./src/test-workspace/contracts";

interface LocalTestWorkspaceConfigFile {
  schemaVersion: typeof testWorkspaceBuildConfigSchemaVersion;
  corpusId: string;
  pdfs: string[];
}

export interface LocalTestWorkspaceBuildInput {
  runtime: TestWorkspaceBuildConfig;
  assets: Array<{
    absoluteSrc: string;
    relativeDest: string;
  }>;
}

export function loadLocalTestWorkspaceBuildInput(
  configPath: string,
): LocalTestWorkspaceBuildInput | undefined {
  if (!existsSync(configPath)) return undefined;
  const config = parseLocalTestWorkspaceConfig(readFileSync(configPath, "utf8"), configPath);
  const configDirectory = resolve(configPath, "..");
  const seenPaths = new Set<string>();
  const seenNames = new Set<string>();
  const assets = config.pdfs.map((configuredPath, index) => {
    const absolutePath = resolve(configDirectory, configuredPath);
    if (!existsSync(absolutePath)) {
      throw configError(configPath, `PDF does not exist: ${configuredPath}`);
    }
    const realPath = realpathSync(absolutePath);
    const stats = statSync(realPath);
    if (!stats.isFile()) {
      throw configError(configPath, `PDF path is not a file: ${configuredPath}`);
    }
    if (extname(realPath).toLowerCase() !== ".pdf") {
      throw configError(configPath, `Only PDF files are supported: ${configuredPath}`);
    }
    const normalizedPath = realPath.toLowerCase();
    if (seenPaths.has(normalizedPath)) {
      throw configError(configPath, `Duplicate PDF path: ${configuredPath}`);
    }
    seenPaths.add(normalizedPath);

    const fileName = basename(realPath);
    const normalizedName = fileName.toLowerCase();
    if (seenNames.has(normalizedName)) {
      throw configError(configPath, `Duplicate PDF filename: ${fileName}`);
    }
    seenNames.add(normalizedName);

    const relativeDest = `assets/test-workspace/${String(index + 1).padStart(2, "0")}-${safePdfFileName(fileName)}`;
    return {
      asset: { absoluteSrc: realPath, relativeDest },
      runtime: {
        fileName,
        assetPath: relativeDest,
        byteLength: stats.size,
      },
    };
  });

  return {
    assets: assets.map((item) => item.asset),
    runtime: {
      schemaVersion: testWorkspaceBuildConfigSchemaVersion,
      corpusId: config.corpusId,
      namespace: testWorkspaceSourceNamespace,
      pdfs: assets.map((item) => item.runtime),
    },
  };
}

function parseLocalTestWorkspaceConfig(
  contents: string,
  configPath: string,
): LocalTestWorkspaceConfigFile {
  let value: unknown;
  try {
    value = JSON.parse(contents);
  } catch (error) {
    throw configError(
      configPath,
      `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!isRecord(value)) throw configError(configPath, "Expected a JSON object.");
  if (value.schemaVersion !== testWorkspaceBuildConfigSchemaVersion) {
    throw configError(
      configPath,
      `schemaVersion must be ${testWorkspaceBuildConfigSchemaVersion}.`,
    );
  }
  if (typeof value.corpusId !== "string" || !isCorpusId(value.corpusId)) {
    throw configError(
      configPath,
      "corpusId must contain 3-64 lowercase letters, numbers, dots, underscores, or hyphens.",
    );
  }
  if (
    !Array.isArray(value.pdfs) ||
    value.pdfs.length === 0 ||
    value.pdfs.length > 12 ||
    !value.pdfs.every((item) => typeof item === "string" && item.trim().length > 0)
  ) {
    throw configError(configPath, "pdfs must contain 1-12 non-empty file paths.");
  }
  return {
    schemaVersion: testWorkspaceBuildConfigSchemaVersion,
    corpusId: value.corpusId,
    pdfs: value.pdfs.map((item) => item.trim()),
  };
}

function safePdfFileName(fileName: string) {
  const stem = fileName.slice(0, -extname(fileName).length);
  const safeStem = stem
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160);
  return `${safeStem.length > 0 ? safeStem : "document"}.pdf`;
}

function configError(configPath: string, message: string) {
  return new Error(`Invalid local test workspace config at ${configPath}: ${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
