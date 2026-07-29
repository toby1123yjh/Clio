export const testWorkspaceBuildConfigSchemaVersion = 1 as const;
export const testWorkspaceSourceNamespace = "clio://test-fixture/v1/" as const;

export interface TestWorkspacePdfAsset {
  fileName: string;
  assetPath: string;
  byteLength: number;
}

export interface TestWorkspaceBuildConfig {
  schemaVersion: typeof testWorkspaceBuildConfigSchemaVersion;
  corpusId: string;
  namespace: typeof testWorkspaceSourceNamespace;
  pdfs: TestWorkspacePdfAsset[];
}

export function isTestWorkspaceBuildConfig(value: unknown): value is TestWorkspaceBuildConfig {
  return (
    isRecord(value) &&
    value.schemaVersion === testWorkspaceBuildConfigSchemaVersion &&
    typeof value.corpusId === "string" &&
    isCorpusId(value.corpusId) &&
    value.namespace === testWorkspaceSourceNamespace &&
    Array.isArray(value.pdfs) &&
    value.pdfs.length > 0 &&
    value.pdfs.length <= 12 &&
    value.pdfs.every(isTestWorkspacePdfAsset)
  );
}

function isTestWorkspacePdfAsset(value: unknown): value is TestWorkspacePdfAsset {
  return (
    isRecord(value) &&
    typeof value.fileName === "string" &&
    value.fileName.length > 0 &&
    value.fileName.length <= 240 &&
    typeof value.assetPath === "string" &&
    /^assets\/test-workspace\/[A-Za-z0-9._-]+\.pdf$/i.test(value.assetPath) &&
    typeof value.byteLength === "number" &&
    Number.isSafeInteger(value.byteLength) &&
    value.byteLength > 0
  );
}

export function isCorpusId(value: string) {
  return /^[a-z0-9][a-z0-9._-]{2,63}$/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
