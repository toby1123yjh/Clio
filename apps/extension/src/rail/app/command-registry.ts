export type RailCommandId =
  | "open-knowledge-base"
  | "open-chat-history"
  | "save-current-page"
  | "save-selection"
  | "search-selection"
  | "ask-selection"
  | "note-selection";

export type RailCommandGroup = "Navigate" | "Capture" | "Selection";

export type RailCommandIcon =
  | "book-open"
  | "history"
  | "bookmark-plus"
  | "message-square"
  | "search"
  | "file-text";

export type RailCommandAvailability =
  | { status: "enabled" }
  | { status: "disabled"; reason: string };

export interface RailCommandActions {
  openKnowledgeBase: () => void;
  openChatHistory: () => void;
  savePage: () => void;
  saveSelection: () => void;
  searchSelection: () => void;
  askSelection: () => void;
  noteSelection: () => void;
}

export interface RailCommandContext {
  hasSelectionContext: boolean;
  actions: RailCommandActions;
}

export interface RailCommand {
  id: RailCommandId;
  group: RailCommandGroup;
  title: string;
  subtitle: string;
  icon: RailCommandIcon;
  availability: RailCommandAvailability;
  execute: () => void;
}

const selectTextFirst = "Select text first.";

export function createRailCommands(context: RailCommandContext): RailCommand[] {
  const selectionAvailability: RailCommandAvailability = context.hasSelectionContext
    ? { status: "enabled" }
    : { status: "disabled", reason: selectTextFirst };

  return [
    {
      id: "open-knowledge-base",
      group: "Navigate",
      title: "Open Knowledge Base",
      subtitle: "Saved pages, selections, and history",
      icon: "book-open",
      availability: { status: "enabled" },
      execute: context.actions.openKnowledgeBase,
    },
    {
      id: "open-chat-history",
      group: "Navigate",
      title: "Open Chat History",
      subtitle: "Conversation history placeholder",
      icon: "history",
      availability: { status: "enabled" },
      execute: context.actions.openChatHistory,
    },
    {
      id: "save-current-page",
      group: "Capture",
      title: "Save Current Page",
      subtitle: "Capture the page currently shown in the browser",
      icon: "bookmark-plus",
      availability: { status: "enabled" },
      execute: context.actions.savePage,
    },
    {
      id: "save-selection",
      group: "Selection",
      title: "Save Selection",
      subtitle: "Capture the selected text as a memory",
      icon: "bookmark-plus",
      availability: selectionAvailability,
      execute: context.actions.saveSelection,
    },
    {
      id: "search-selection",
      group: "Selection",
      title: "Search Selection",
      subtitle: "Search local memories with selected text",
      icon: "search",
      availability: selectionAvailability,
      execute: context.actions.searchSelection,
    },
    {
      id: "ask-selection",
      group: "Selection",
      title: "Ask About Selection",
      subtitle: "Prefill the Composer without sending",
      icon: "message-square",
      availability: selectionAvailability,
      execute: context.actions.askSelection,
    },
    {
      id: "note-selection",
      group: "Selection",
      title: "Note Selection",
      subtitle: "Selection notes are not connected yet",
      icon: "file-text",
      availability: selectionAvailability,
      execute: context.actions.noteSelection,
    },
  ];
}

export function filterRailCommands(commands: RailCommand[], query: string) {
  const normalized = normalizeCommandQuery(query);
  if (normalized.length === 0) return commands;

  return commands.filter((command) =>
    [command.title, command.subtitle, command.group, command.id].some((value) =>
      value.toLowerCase().includes(normalized),
    ),
  );
}

export function executeRailCommand(command: RailCommand) {
  if (command.availability.status === "disabled") return false;
  command.execute();
  return true;
}

function normalizeCommandQuery(query: string) {
  return query.trim().toLowerCase();
}
