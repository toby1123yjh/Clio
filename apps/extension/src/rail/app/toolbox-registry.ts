import type { ComposerSkillMode } from "./rail-state";

export type ToolboxSkillId =
  | "translate"
  | "search"
  | "summarize"
  | "extract"
  | "rewrite"
  | "find-related"
  | "image-gen";

export type ToolboxLaunchMode = "composer" | "page" | "knowledge-related";

export type ToolboxSkillIcon =
  | "message-square"
  | "search"
  | "file-text"
  | "book-open"
  | "sparkles"
  | "image";

export interface ToolboxSkill {
  id: ToolboxSkillId;
  label: string;
  description: string;
  icon: ToolboxSkillIcon;
  launchMode: ToolboxLaunchMode;
  composerMode?: ComposerSkillMode;
}

export const toolboxSkills: ToolboxSkill[] = [
  {
    id: "translate",
    label: "Translate",
    description: "Translate text or attached context",
    icon: "message-square",
    launchMode: "composer",
    composerMode: {
      id: "translate",
      label: "Translate",
      placeholder: "Add text or attach Page/Selection",
      instruction:
        "Translate the user's text or attached context. If the user names a target language, use it; otherwise choose the most useful target language.",
    },
  },
  {
    id: "search",
    label: "Search",
    description: "Web and AI search",
    icon: "search",
    launchMode: "page",
  },
  {
    id: "image-gen",
    label: "Image Gen",
    description: "Generate or edit images",
    icon: "image",
    launchMode: "page",
  },
  {
    id: "summarize",
    label: "Summarize",
    description: "Summarize text or context",
    icon: "file-text",
    launchMode: "composer",
    composerMode: {
      id: "summarize",
      label: "Summarize",
      placeholder: "Add text or attach Page/Selection",
      instruction: "Summarize the user's text or attached context clearly and concisely.",
    },
  },
  {
    id: "extract",
    label: "Extract",
    description: "Pull structured points",
    icon: "book-open",
    launchMode: "composer",
    composerMode: {
      id: "extract",
      label: "Extract",
      placeholder: "Add text or attach Page/Selection",
      instruction:
        "Extract the important facts, entities, tasks, links, and decisions from the user's text or attached context.",
    },
  },
  {
    id: "rewrite",
    label: "Rewrite",
    description: "Improve wording",
    icon: "sparkles",
    launchMode: "composer",
    composerMode: {
      id: "rewrite",
      label: "Rewrite",
      placeholder: "Add text to rewrite",
      instruction:
        "Rewrite the user's text or attached context according to any style, tone, or format instruction the user provides.",
    },
  },
  {
    id: "find-related",
    label: "Find related",
    description: "Search local memories",
    icon: "book-open",
    launchMode: "knowledge-related",
  },
];

export function getComposerToolboxSkills() {
  return toolboxSkills.filter(
    (skill): skill is ToolboxSkill & { composerMode: ComposerSkillMode } =>
      skill.launchMode === "composer" && skill.composerMode !== undefined,
  );
}
