import { describe, expect, it, vi } from "vitest";
import {
  type RailCommandActions,
  createRailCommands,
  executeRailCommand,
  filterRailCommands,
} from "./command-registry";

function actions(): RailCommandActions {
  return {
    openKnowledgeBase: vi.fn(),
    openChatHistory: vi.fn(),
    savePage: vi.fn(),
    saveSelection: vi.fn(),
    searchSelection: vi.fn(),
    askSelection: vi.fn(),
    noteSelection: vi.fn(),
  };
}

describe("rail command registry", () => {
  it("keeps selection commands visible but disabled without selection context", () => {
    const registryActions = actions();
    const commands = createRailCommands({
      hasSelectionContext: false,
      actions: registryActions,
    });

    expect(commands.find((command) => command.id === "open-knowledge-base")?.availability).toEqual({
      status: "enabled",
    });
    expect(commands.find((command) => command.id === "save-selection")?.availability).toEqual({
      status: "disabled",
      reason: "Select text first.",
    });

    const saveSelection = commands.find((command) => command.id === "save-selection");
    expect(saveSelection).toBeDefined();
    if (saveSelection === undefined) throw new Error("save-selection command missing");
    expect(executeRailCommand(saveSelection)).toBe(false);
    expect(registryActions.saveSelection).not.toHaveBeenCalled();
  });

  it("enables selection commands when a live selection or snapshot exists", () => {
    const registryActions = actions();
    const commands = createRailCommands({
      hasSelectionContext: true,
      actions: registryActions,
    });
    const askSelection = commands.find((command) => command.id === "ask-selection");

    expect(askSelection?.availability).toEqual({ status: "enabled" });
    if (askSelection === undefined) throw new Error("ask-selection command missing");
    expect(executeRailCommand(askSelection)).toBe(true);
    expect(registryActions.askSelection).toHaveBeenCalledTimes(1);
  });

  it("filters commands by title, subtitle, group, or id", () => {
    const commands = createRailCommands({
      hasSelectionContext: true,
      actions: actions(),
    });

    expect(filterRailCommands(commands, "ask").map((command) => command.id)).toEqual([
      "ask-selection",
    ]);
    expect(filterRailCommands(commands, "local memories").map((command) => command.id)).toEqual([
      "search-selection",
    ]);
    expect(filterRailCommands(commands, "current page").map((command) => command.id)).toEqual([
      "save-current-page",
    ]);
    expect(filterRailCommands(commands, "  ").map((command) => command.id)).toEqual(
      commands.map((command) => command.id),
    );
  });
});
