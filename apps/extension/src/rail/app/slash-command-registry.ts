export type SlashCommandId = "compact" | "image" | "image-gen";

export type SlashCommandArgumentPolicy = "none" | "rest";

export interface SlashCommandContext {
  activeSessionId?: string;
  active: boolean;
  hasQueuedMessages: boolean;
  hasUnresolvedInterruptedAnswer: boolean;
}

export interface SlashCommandActions {
  compact: () => void;
  imageGen: (prompt?: string) => void;
}

export interface SlashCommand {
  id: SlashCommandId;
  trigger: string;
  title: string;
  description: string;
  argumentPolicy: SlashCommandArgumentPolicy;
  isAvailable: (context: SlashCommandContext) => boolean;
  execute: (argument?: string) => void;
}

export type SlashCommandParseResult =
  | { kind: "chat" }
  | { kind: "query"; input: string; hasArguments: boolean }
  | { kind: "exact"; input: string; command: SlashCommand; argument?: string }
  | { kind: "unknown"; input: string };

export function createSlashCommands(actions: SlashCommandActions): SlashCommand[] {
  return [
    {
      id: "compact",
      trigger: "/compact",
      title: "Compact",
      description: "Compress older context",
      argumentPolicy: "none",
      isAvailable: compactAvailable,
      execute: actions.compact,
    },
    {
      id: "image",
      trigger: "/image",
      title: "Image",
      description: "Open Image Gen",
      argumentPolicy: "rest",
      isAvailable: alwaysAvailable,
      execute: actions.imageGen,
    },
    {
      id: "image-gen",
      trigger: "/image-gen",
      title: "Image Gen",
      description: "Open Image Gen",
      argumentPolicy: "rest",
      isAvailable: alwaysAvailable,
      execute: actions.imageGen,
    },
  ];
}

export function parseSlashCommandInput(
  input: string,
  commands: SlashCommand[],
): SlashCommandParseResult {
  if (!isSlashCommandInput(input)) return { kind: "chat" };
  const exact = commands.find((command) => command.trigger === input);
  if (exact !== undefined) return { kind: "exact", input, command: exact };
  const withArgument = commands.find((command) => input.startsWith(`${command.trigger} `));
  if (withArgument !== undefined) {
    if (withArgument.argumentPolicy !== "rest") return { kind: "unknown", input };
    return {
      kind: "exact",
      input,
      command: withArgument,
      argument: input.slice(withArgument.trigger.length + 1),
    };
  }
  return { kind: "query", input, hasArguments: false };
}

export function filterAvailableSlashCommands(
  commands: SlashCommand[],
  context: SlashCommandContext,
  input: string,
) {
  if (!isSlashCommandInput(input) || slashInputHasArguments(input)) return [];
  const available = commands.filter((command) => command.isAvailable(context));
  if (input === "/") return available;
  return available.filter((command) => command.trigger.startsWith(input));
}

export function slashInputHasArguments(input: string) {
  return /\s/.test(input);
}

export function isSlashCommandInput(input: string) {
  return input.startsWith("/");
}

export function executeSlashCommand(
  command: SlashCommand,
  context: SlashCommandContext,
  argument?: string,
) {
  if (!command.isAvailable(context)) return false;
  command.execute(argument);
  return true;
}

function compactAvailable(context: SlashCommandContext) {
  if (context.activeSessionId === undefined) return true;
  return !context.active && !context.hasQueuedMessages && !context.hasUnresolvedInterruptedAnswer;
}

function alwaysAvailable() {
  return true;
}
