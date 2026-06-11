import { describe, expect, it } from "vitest";
import { getComposerToolboxSkills, toolboxSkills } from "./toolbox-registry";

describe("toolbox registry", () => {
  it("defines the browser-agent skills in stable order", () => {
    expect(toolboxSkills.map((skill) => skill.id)).toEqual([
      "translate",
      "search",
      "image-gen",
      "summarize",
      "extract",
      "rewrite",
      "find-related",
    ]);
  });

  it("keeps launch modes explicit for composer, page, and knowledge flows", () => {
    expect(toolboxSkills.map((skill) => [skill.id, skill.launchMode])).toEqual([
      ["translate", "composer"],
      ["search", "page"],
      ["image-gen", "page"],
      ["summarize", "composer"],
      ["extract", "composer"],
      ["rewrite", "composer"],
      ["find-related", "knowledge-related"],
    ]);
  });

  it("returns only composer-backed skills with composer metadata", () => {
    const composerSkills = getComposerToolboxSkills();

    expect(composerSkills.map((skill) => skill.id)).toEqual([
      "translate",
      "summarize",
      "extract",
      "rewrite",
    ]);
    expect(composerSkills.every((skill) => skill.composerMode.placeholder.length > 0)).toBe(true);
    expect(composerSkills.every((skill) => skill.composerMode.instruction.length > 0)).toBe(true);
  });
});
