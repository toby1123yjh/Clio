import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadLocalTestWorkspaceBuildInput } from "./test-workspace-build";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("local test workspace build input", () => {
  it("is disabled when the ignored local config is absent", () => {
    const directory = temporaryDirectory();
    expect(loadLocalTestWorkspaceBuildInput(join(directory, "missing.json"))).toBeUndefined();
  });

  it("validates and projects local PDFs without leaking absolute paths", () => {
    const directory = temporaryDirectory();
    const corpusDirectory = join(directory, "corpus");
    mkdirSync(corpusDirectory);
    writeFileSync(join(corpusDirectory, "paper one.pdf"), "%PDF-test-one");
    writeFileSync(join(corpusDirectory, "paper-two.pdf"), "%PDF-test-two");
    const configPath = writeConfig(directory, {
      schemaVersion: 1,
      corpusId: "clio-validation-v1",
      pdfs: ["./corpus/paper one.pdf", "./corpus/paper-two.pdf"],
    });

    const input = loadLocalTestWorkspaceBuildInput(configPath);

    expect(input?.runtime).toEqual({
      schemaVersion: 1,
      corpusId: "clio-validation-v1",
      namespace: "clio://test-fixture/v1/",
      pdfs: [
        {
          fileName: "paper one.pdf",
          assetPath: "assets/test-workspace/01-paper-one.pdf",
          byteLength: 13,
        },
        {
          fileName: "paper-two.pdf",
          assetPath: "assets/test-workspace/02-paper-two.pdf",
          byteLength: 13,
        },
      ],
    });
    expect(JSON.stringify(input?.runtime)).not.toContain(directory);
    expect(input?.assets[0]?.absoluteSrc).toContain("paper one.pdf");
  });

  it.each([
    ["invalid schema", { schemaVersion: 2, corpusId: "clio-validation-v1", pdfs: ["a.pdf"] }],
    ["invalid corpus id", { schemaVersion: 1, corpusId: "Clio Validation", pdfs: ["a.pdf"] }],
    ["empty corpus", { schemaVersion: 1, corpusId: "clio-validation-v1", pdfs: [] }],
  ])("rejects %s", (_label, config) => {
    const directory = temporaryDirectory();
    const configPath = writeConfig(directory, config);
    expect(() => loadLocalTestWorkspaceBuildInput(configPath)).toThrow(
      "Invalid local test workspace config",
    );
  });

  it("rejects missing, non-PDF, and duplicate corpus entries", () => {
    const missingDirectory = temporaryDirectory();
    const missingConfig = writeConfig(missingDirectory, validConfig(["missing.pdf"]));
    expect(() => loadLocalTestWorkspaceBuildInput(missingConfig)).toThrow("PDF does not exist");

    const textDirectory = temporaryDirectory();
    writeFileSync(join(textDirectory, "notes.txt"), "notes");
    const textConfig = writeConfig(textDirectory, validConfig(["notes.txt"]));
    expect(() => loadLocalTestWorkspaceBuildInput(textConfig)).toThrow(
      "Only PDF files are supported",
    );

    const duplicateDirectory = temporaryDirectory();
    writeFileSync(join(duplicateDirectory, "paper.pdf"), "%PDF-test");
    const duplicateConfig = writeConfig(
      duplicateDirectory,
      validConfig(["paper.pdf", "./paper.pdf"]),
    );
    expect(() => loadLocalTestWorkspaceBuildInput(duplicateConfig)).toThrow("Duplicate PDF path");
  });
});

function temporaryDirectory() {
  const directory = mkdtempSync(join(tmpdir(), "clio-test-workspace-"));
  temporaryDirectories.push(directory);
  return directory;
}

function writeConfig(directory: string, value: unknown) {
  const configPath = join(directory, "test-workspace.local.json");
  writeFileSync(configPath, JSON.stringify(value), "utf8");
  return configPath;
}

function validConfig(pdfs: string[]) {
  return { schemaVersion: 1, corpusId: "clio-validation-v1", pdfs };
}
