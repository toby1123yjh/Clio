import { describe, expect, it, vi } from "vitest";
import {
  type SlashCommandActions,
  createSlashCommands,
  executeSlashCommand,
  filterAvailableSlashCommands,
  parseSlashCommandInput,
} from "./slash-command-registry";

function actions(): SlashCommandActions {
  return {
    compact: vi.fn(),
    imageGen: vi.fn(),
  };
}

const idleContext = {
  activeSessionId: "session-1",
  active: false,
  hasQueuedMessages: false,
  hasUnresolvedInterruptedAnswer: false,
};

describe("slash command registry", () => {
  it("parses slash commands without trimming normal chat", () => {
    const commands = createSlashCommands(actions());

    expect(parseSlashCommandInput(" /compact", commands)).toEqual({ kind: "chat" });
    expect(parseSlashCommandInput("ask /compact", commands)).toEqual({ kind: "chat" });
    expect(parseSlashCommandInput("/compact", commands)).toMatchObject({
      kind: "exact",
      input: "/compact",
    });
    expect(parseSlashCommandInput("/image cat", commands)).toMatchObject({
      kind: "exact",
      input: "/image cat",
      argument: "cat",
    });
    expect(parseSlashCommandInput("/image-gen cat", commands)).toMatchObject({
      kind: "exact",
      input: "/image-gen cat",
      argument: "cat",
    });
    expect(parseSlashCommandInput("/compact ", commands)).toEqual({
      kind: "unknown",
      input: "/compact ",
    });
    expect(parseSlashCommandInput("/Compact", commands)).toEqual({
      kind: "query",
      input: "/Compact",
      hasArguments: false,
    });
  });

  it("filters visible commands by trigger prefix and availability only", () => {
    const commands = createSlashCommands(actions());

    expect(filterAvailableSlashCommands(commands, idleContext, "/").map((item) => item.id)).toEqual(
      ["compact", "image", "image-gen"],
    );
    expect(
      filterAvailableSlashCommands(commands, idleContext, "/co").map((item) => item.id),
    ).toEqual(["compact"]);
    expect(filterAvailableSlashCommands(commands, idleContext, "/Co")).toEqual([]);
    expect(filterAvailableSlashCommands(commands, idleContext, "/compact now")).toEqual([]);
    expect(
      filterAvailableSlashCommands(commands, { ...idleContext, active: true }, "/compact"),
    ).toEqual([]);
  });

  it("keeps compact available without an active session and executes through the dispatcher", () => {
    const registryActions = actions();
    const commands = createSlashCommands(registryActions);
    const compact = commands[0];
    if (compact === undefined) throw new Error("compact command missing");

    expect(
      filterAvailableSlashCommands(
        commands,
        {
          active: false,
          hasQueuedMessages: false,
          hasUnresolvedInterruptedAnswer: false,
        },
        "/",
      ),
    ).toEqual(commands);
    expect(executeSlashCommand(compact, idleContext)).toBe(true);
    expect(registryActions.compact).toHaveBeenCalledTimes(1);
    expect(executeSlashCommand(compact, { ...idleContext, hasQueuedMessages: true })).toBe(false);
  });

  it("executes image commands with a prompt argument", () => {
    const registryActions = actions();
    const commands = createSlashCommands(registryActions);
    const image = commands.find((command) => command.id === "image");
    const imageGen = commands.find((command) => command.id === "image-gen");
    if (image === undefined || imageGen === undefined) {
      throw new Error("image commands missing");
    }

    expect(executeSlashCommand(image, idleContext, "cat")).toBe(true);
    expect(executeSlashCommand(imageGen, idleContext, "city skyline")).toBe(true);
    expect(registryActions.imageGen).toHaveBeenNthCalledWith(1, "cat");
    expect(registryActions.imageGen).toHaveBeenNthCalledWith(2, "city skyline");
  });
});
