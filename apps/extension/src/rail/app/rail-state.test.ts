import { describe, expect, it } from "vitest";
import {
  type ComposerSkillMode,
  type PageContext,
  type RailSkillRequestDisplay,
  type SelectionSnapshot,
  createInitialRailState,
  getComposerScope,
  hasUnresolvedInterruptedAnswer,
  reduceRailState,
} from "./rail-state";

const pageA: PageContext = { url: "https://example.com/a", title: "A" };
const pageB: PageContext = { url: "https://example.com/b", title: "B" };
const pageC: PageContext = { url: "https://example.com/c", title: "C" };
const translateMode: ComposerSkillMode = {
  id: "translate",
  label: "Translate",
  placeholder: "Add text or attach Page/Selection",
  instruction: "Translate the user's text or attached context.",
};
const translateRequest: RailSkillRequestDisplay = {
  skillId: "translate",
  skillLabel: "Translate",
  source: "Page",
};

function snapshot(text = "selected text"): SelectionSnapshot {
  return {
    text,
    sourceUrl: pageA.url,
    sourceTitle: pageA.title,
    contextBefore: "before",
    contextAfter: "after",
    capturedAt: "2026-05-21T00:00:00.000Z",
    xpath: "/html/body/p[1]",
    textFragment: "https://example.com/a#:~:text=selected%20text",
  };
}

describe("rail state reducer", () => {
  it("opens, collapses, and toggles through Agent Home by default", () => {
    const initial = createInitialRailState(pageA);
    expect(initial.mode).toBe("collapsed");

    const opened = reduceRailState(initial, { type: "TOGGLE" });
    expect(opened.mode).toBe("agent-home");

    const collapsed = reduceRailState(opened, { type: "TOGGLE" });
    expect(collapsed.mode).toBe("collapsed");
    expect(collapsed.previousMode).toBe("agent-home");

    expect(reduceRailState(collapsed, { type: "OPEN_HOME" }).mode).toBe("agent-home");
  });

  it("opens Knowledge Base with query and highlight, then detail with back context intact", () => {
    const state = reduceRailState(createInitialRailState(pageA), {
      type: "SHOW_KNOWLEDGE_BASE",
      query: "memory",
      highlightedMemoryId: "mem-1",
    });

    expect(state.mode).toBe("knowledge-base");
    expect(state.query).toBe("memory");
    expect(state.highlightedMemoryId).toBe("mem-1");

    const detail = reduceRailState(state, { type: "SHOW_DETAIL", memoryId: "mem-2" });
    expect(detail.mode).toBe("memory-detail");
    expect(detail.detailMemoryId).toBe("mem-2");
    expect(detail.highlightedMemoryId).toBe("mem-2");
  });

  it("opens the web search tool page and clears composer skill mode", () => {
    const withSkill = reduceRailState(createInitialRailState(pageA), {
      type: "SET_COMPOSER_SKILL_MODE",
      mode: translateMode,
    });
    const search = reduceRailState(withSkill, { type: "SHOW_WEB_SEARCH" });

    expect(search.mode).toBe("web-search");
    expect(search.composerSkillMode).toBeUndefined();
    expect(search.detailMemoryId).toBeUndefined();
  });

  it("opens the image generation tool page with one-shot prompt prefill", () => {
    const withSkill = reduceRailState(createInitialRailState(pageA), {
      type: "SET_COMPOSER_SKILL_MODE",
      mode: translateMode,
    });
    const imageGen = reduceRailState(withSkill, {
      type: "SHOW_IMAGE_GEN",
      prompt: "  city skyline  ",
      idSeed: "image-prefill-1",
    });

    expect(imageGen.mode).toBe("image-gen");
    expect(imageGen.composerSkillMode).toBeUndefined();
    expect(imageGen.detailMemoryId).toBeUndefined();
    expect(imageGen.imagePromptPrefill).toEqual({
      id: "image-prefill-1",
      content: "city skyline",
    });

    const consumed = reduceRailState(imageGen, { type: "CLEAR_IMAGE_PROMPT_PREFILL" });
    expect(consumed.imagePromptPrefill).toBeUndefined();

    const reopenedWithoutPrompt = reduceRailState(imageGen, { type: "SHOW_IMAGE_GEN" });
    expect(reopenedWithoutPrompt.mode).toBe("image-gen");
    expect(reopenedWithoutPrompt.imagePromptPrefill).toBeUndefined();
  });

  it("opens and closes a reducer-owned Markdown Preview page", () => {
    const started = reduceRailState(createInitialRailState(pageA), {
      type: "START_AGENT_RUN",
      content: "Explain",
      now: "2026-05-21T00:00:00.000Z",
      idSeed: "run-1",
      scope: "current-page",
    });
    const preview = reduceRailState(started, {
      type: "SHOW_MARKDOWN_PREVIEW",
      messageId: "run-1:assistant",
    });

    expect(preview.mode).toBe("markdown-preview");
    expect(preview.previewMessageId).toBe("run-1:assistant");
    expect(preview.commandPaletteOpen).toBe(false);

    const closed = reduceRailState(preview, { type: "CLOSE_MARKDOWN_PREVIEW" });
    expect(closed.mode).toBe("agent-home");
    expect(closed.previewMessageId).toBeUndefined();
  });

  it("clears Markdown Preview state when navigating to another top-level Rail page", () => {
    const preview = reduceRailState(createInitialRailState(pageA), {
      type: "SHOW_MARKDOWN_PREVIEW",
      messageId: "assistant-1",
    });
    const settings = reduceRailState(preview, { type: "SHOW_SETTINGS" });

    expect(settings.mode).toBe("settings");
    expect(settings.previewMessageId).toBeUndefined();
  });

  it("opens settings as an in-Rail view and closes transient action state", () => {
    const withPalette = reduceRailState(
      reduceRailState(createInitialRailState(pageA), {
        type: "OPEN_COMMAND_PALETTE",
      }),
      {
        type: "SET_COMMAND_PALETTE_QUERY",
        query: "save",
      },
    );

    const settings = reduceRailState(withPalette, { type: "SHOW_SETTINGS" });

    expect(settings.mode).toBe("settings");
    expect(settings.commandPaletteOpen).toBe(false);
    expect(settings.commandPaletteQuery).toBe("");
    expect(settings.composerSkillMode).toBeUndefined();
  });

  it("sets and clears composer skill mode without touching textarea prefill", () => {
    const withSkill = reduceRailState(createInitialRailState(pageA), {
      type: "SET_COMPOSER_SKILL_MODE",
      mode: translateMode,
    });

    expect(withSkill.mode).toBe("agent-home");
    expect(withSkill.composerSkillMode).toEqual(translateMode);
    expect(withSkill.composerPrefill).toBeUndefined();

    const cleared = reduceRailState(withSkill, { type: "CLEAR_COMPOSER_SKILL_MODE" });
    expect(cleared.composerSkillMode).toBeUndefined();
  });

  it("opens and closes the command palette without persisting query", () => {
    const opened = reduceRailState(createInitialRailState(pageA), {
      type: "OPEN_COMMAND_PALETTE",
    });

    expect(opened.mode).toBe("agent-home");
    expect(opened.commandPaletteOpen).toBe(true);

    const queried = reduceRailState(opened, {
      type: "SET_COMMAND_PALETTE_QUERY",
      query: "save",
    });
    expect(queried.commandPaletteQuery).toBe("save");

    const closed = reduceRailState(queried, { type: "CLOSE_COMMAND_PALETTE" });
    expect(closed.commandPaletteOpen).toBe(false);
    expect(closed.commandPaletteQuery).toBe("");
  });

  it("toggles and collapses the command palette with the Rail", () => {
    const opened = reduceRailState(createInitialRailState(pageA), { type: "OPEN_HOME" });
    const palette = reduceRailState(opened, { type: "TOGGLE_COMMAND_PALETTE" });
    expect(palette.commandPaletteOpen).toBe(true);

    const hidden = reduceRailState(palette, { type: "TOGGLE_COMMAND_PALETTE" });
    expect(hidden.commandPaletteOpen).toBe(false);

    const queried = reduceRailState(
      reduceRailState(palette, { type: "SET_COMMAND_PALETTE_QUERY", query: "ask" }),
      { type: "COLLAPSE" },
    );
    expect(queried.mode).toBe("collapsed");
    expect(queried.commandPaletteOpen).toBe(false);
    expect(queried.commandPaletteQuery).toBe("");
  });

  it("keeps a selection snapshot without changing default composer scope", () => {
    expect(getComposerScope()).toBe("general");

    const withSnapshot = reduceRailState(createInitialRailState(pageA), {
      type: "SET_SELECTION_SNAPSHOT",
      snapshot: snapshot(),
    });

    expect(getComposerScope()).toBe("general");

    const kb = reduceRailState(withSnapshot, { type: "SHOW_KNOWLEDGE_BASE" });
    const home = reduceRailState(kb, { type: "OPEN_HOME" });
    expect(home.selectionSnapshot?.text).toBe("selected text");
    expect(getComposerScope()).toBe("general");
  });

  it("attaches an explicit selection action to the next composer turn", () => {
    const attached = reduceRailState(createInitialRailState(pageA), {
      type: "ATTACH_SELECTION_TO_COMPOSER",
      snapshot: snapshot(),
      idSeed: "attach-1",
    });

    expect(attached.mode).toBe("agent-home");
    expect(attached.selectionSnapshot?.text).toBe("selected text");
    expect(attached.composerAttachmentRequest).toEqual({
      id: "attach-1",
      kind: "selection",
    });

    const consumed = reduceRailState(attached, { type: "CLEAR_COMPOSER_ATTACHMENT_REQUEST" });
    expect(consumed.selectionSnapshot?.text).toBe("selected text");
    expect(consumed.composerAttachmentRequest).toBeUndefined();
  });

  it("starts an agent run without clearing selection snapshot", () => {
    const withSnapshot = reduceRailState(createInitialRailState(pageA), {
      type: "SET_SELECTION_SNAPSHOT",
      snapshot: snapshot(),
    });
    const submitted = reduceRailState(withSnapshot, {
      type: "START_AGENT_RUN",
      content: "Explain this",
      now: "2026-05-21T00:00:00.000Z",
      idSeed: "msg-1",
      scope: "selection",
      selectionText: "selected text",
    });

    expect(submitted.dialogueMessages).toHaveLength(2);
    expect(submitted.dialogueMessages[0]?.scope).toBe("selection");
    expect(submitted.dialogueMessages[1]?.content).toBe("");
    expect(submitted.dialogueMessages[1]?.status).toBe("streaming");
    expect(submitted.activeAgentRun?.runId).toBe("msg-1");
    expect(submitted.selectionSnapshot?.text).toBe("selected text");
  });

  it("stores skill request display metadata and clears composer skill mode after submit", () => {
    const withSkill = reduceRailState(createInitialRailState(pageA), {
      type: "SET_COMPOSER_SKILL_MODE",
      mode: translateMode,
    });
    const submitted = reduceRailState(withSkill, {
      type: "START_AGENT_RUN",
      content: "Translate page",
      now: "2026-05-21T00:00:00.000Z",
      idSeed: "skill-1",
      scope: "current-page",
      skillRequest: translateRequest,
    });

    expect(submitted.composerSkillMode).toBeUndefined();
    expect(submitted.dialogueMessages[0]?.skillRequest).toEqual(translateRequest);
    expect(submitted.dialogueMessages[0]?.content).toBe("Translate page");
  });

  it("applies streaming events to the active assistant message", () => {
    const started = reduceRailState(createInitialRailState(pageA), {
      type: "START_AGENT_RUN",
      content: "Summarize this",
      now: "2026-05-21T00:00:00.000Z",
      idSeed: "run-1",
      scope: "current-page",
    });
    const withText = reduceRailState(started, {
      type: "APPLY_AGENT_EVENT",
      event: { type: "text_delta", runId: "run-1", delta: "Mock answer. " },
    });
    const withCitation = reduceRailState(withText, {
      type: "APPLY_AGENT_EVENT",
      event: {
        type: "citation",
        runId: "run-1",
        citation: {
          id: "cite-1",
          evidenceId: "page:0",
          label: "Page",
          sourceKind: "page",
          sourceUrl: pageA.url,
          sourceTitle: pageA.title,
          excerpt: "Evidence excerpt",
        },
      },
    });
    const completed = reduceRailState(withCitation, {
      type: "APPLY_AGENT_EVENT",
      event: { type: "run_completed", runId: "run-1" },
    });

    const assistant = completed.dialogueMessages[1];
    expect(assistant?.content).toBe("Mock answer. ");
    expect(assistant?.citations).toHaveLength(1);
    expect(assistant?.status).toBe("completed");
    expect(completed.activeAgentRun).toBeUndefined();
  });

  it("tracks assistant thinking and tool traces as transient message state", () => {
    const started = reduceRailState(createInitialRailState(pageA), {
      type: "START_AGENT_RUN",
      content: "Find related notes",
      now: "2026-05-21T00:00:00.000Z",
      idSeed: "run-1",
      scope: "current-page",
    });
    const withThinking = reduceRailState(started, {
      type: "APPLY_AGENT_EVENT",
      event: {
        type: "thinking_delta",
        runId: "run-1",
        delta: "Checking whether local context is relevant. ",
      },
    });
    const withTool = reduceRailState(withThinking, {
      type: "APPLY_AGENT_EVENT",
      event: {
        type: "tool_trace",
        runId: "run-1",
        trace: {
          toolCallId: "tool-1",
          toolName: "search_memory",
          status: "running",
        },
      },
    });
    const completedTool = reduceRailState(withTool, {
      type: "APPLY_AGENT_EVENT",
      event: {
        type: "tool_trace",
        runId: "run-1",
        trace: {
          toolCallId: "tool-1",
          toolName: "search_memory",
          status: "completed",
          summary: "Found 2 related memories.",
        },
      },
    });

    const assistant = completedTool.dialogueMessages[1];
    expect(assistant?.thinkingTrace).toBe("Checking whether local context is relevant. ");
    expect(assistant?.toolTraces).toEqual([
      {
        toolCallId: "tool-1",
        toolName: "search_memory",
        status: "completed",
        summary: "Found 2 related memories.",
      },
    ]);
  });

  it("attaches and clears reply suggestions only on assistant messages", () => {
    const started = reduceRailState(createInitialRailState(pageA), {
      type: "START_AGENT_RUN",
      content: "Can you look up more?",
      now: "2026-05-21T00:00:00.000Z",
      idSeed: "run-1",
      scope: "general",
    });
    const withSuggestion = reduceRailState(started, {
      type: "SET_REPLY_SUGGESTIONS",
      messageId: "run-1:assistant",
      suggestions: [
        {
          id: "sug-1",
          kind: "web_search",
          label: "Open Search",
          reason: "The user asked to search.",
          confidence: 0.95,
          route: "web_search",
          query: "look up more",
          messageId: "run-1:assistant",
          sessionId: "sess-1",
        },
      ],
    });
    const ignoredUser = reduceRailState(withSuggestion, {
      type: "SET_REPLY_SUGGESTIONS",
      messageId: "run-1:user",
      suggestions: [
        {
          id: "sug-user",
          kind: "web_search",
          label: "Open Search",
          reason: "ignored",
          confidence: 0.95,
          route: "web_search",
          messageId: "run-1:user",
        },
      ],
    });
    const cleared = reduceRailState(ignoredUser, {
      type: "CLEAR_REPLY_SUGGESTIONS",
      messageId: "run-1:assistant",
    });

    expect(withSuggestion.dialogueMessages[1]?.replySuggestions).toHaveLength(1);
    expect(ignoredUser.dialogueMessages[0]?.replySuggestions).toBeUndefined();
    expect(cleared.dialogueMessages[1]?.replySuggestions).toBeUndefined();
  });

  it("records explicit tool traces only on assistant messages and upserts by id", () => {
    const started = reduceRailState(createInitialRailState(pageA), {
      type: "START_AGENT_RUN",
      content: "Search this",
      now: "2026-05-21T00:00:00.000Z",
      idSeed: "run-1",
      scope: "general",
    });
    const withTrace = reduceRailState(started, {
      type: "ADD_EXPLICIT_TOOL_TRACE",
      messageId: "run-1:assistant",
      trace: {
        id: "trace-1",
        route: "web_search",
        trigger: "reply_chip",
        status: "completed",
        inputSummary: "Search this",
        sourceSummary: "Opened Search",
        messageId: "run-1:assistant",
        sessionId: "sess-1",
        createdAt: "2026-05-21T00:00:01.000Z",
        completedAt: "2026-05-21T00:00:01.000Z",
      },
    });
    const updated = reduceRailState(withTrace, {
      type: "ADD_EXPLICIT_TOOL_TRACE",
      messageId: "run-1:assistant",
      trace: {
        id: "trace-1",
        route: "web_search",
        trigger: "reply_chip",
        status: "failed",
        inputSummary: "Search this",
        sourceSummary: "Could not open Search",
        messageId: "run-1:assistant",
        sessionId: "sess-1",
        createdAt: "2026-05-21T00:00:01.000Z",
        completedAt: "2026-05-21T00:00:02.000Z",
      },
    });
    const ignoredUser = reduceRailState(updated, {
      type: "ADD_EXPLICIT_TOOL_TRACE",
      messageId: "run-1:user",
      trace: {
        id: "trace-user",
        route: "web_search",
        trigger: "reply_chip",
        status: "completed",
        inputSummary: "ignored",
        createdAt: "2026-05-21T00:00:03.000Z",
      },
    });

    expect(withTrace.dialogueMessages[1]?.explicitToolTraces).toHaveLength(1);
    expect(updated.dialogueMessages[1]?.explicitToolTraces).toEqual([
      expect.objectContaining({
        id: "trace-1",
        status: "failed",
        sourceSummary: "Could not open Search",
      }),
    ]);
    expect(ignoredUser.dialogueMessages[0]?.explicitToolTraces).toBeUndefined();
  });

  it("keeps loaded chat session messages free of generated suggestions and traces", () => {
    const loaded = reduceRailState(createInitialRailState(pageA), {
      type: "LOAD_CHAT_SESSION",
      sessionId: "sess-1",
      messages: [
        {
          id: "run-1:assistant",
          role: "assistant",
          content: "Answer",
          createdAt: "2026-05-21T00:00:00.000Z",
          scope: "general",
          status: "completed",
          citations: [],
          worldKnowledge: [],
        },
      ],
    });

    expect(loaded.dialogueMessages[0]?.replySuggestions).toBeUndefined();
    expect(loaded.dialogueMessages[0]?.explicitToolTraces).toBeUndefined();
  });

  it("tracks runtime status without writing transcript messages", () => {
    const started = reduceRailState(createInitialRailState(pageA), {
      type: "SET_ACTIVE_AGENT_RUN",
      activeRun: {
        runId: "compact-1",
        userMessageId: "compact-1:operation",
        assistantMessageId: "compact-1:operation",
      },
    });
    const compacting = reduceRailState(started, {
      type: "APPLY_AGENT_EVENT",
      event: {
        type: "runtime_status",
        runId: "compact-1",
        message: "Compacting...",
        running: true,
      },
    });
    const resolved = reduceRailState(compacting, {
      type: "APPLY_AGENT_EVENT",
      event: { type: "run_resolved", runId: "compact-1", message: "Compacted" },
    });

    expect(compacting.runtimeStatus).toEqual({ message: "Compacting...", running: true });
    expect(compacting.dialogueMessages).toHaveLength(0);
    expect(resolved.activeAgentRun).toBeUndefined();
    expect(resolved.runtimeStatus).toEqual({ message: "Compacted", running: false });
    expect(resolved.dialogueMessages).toHaveLength(0);
  });

  it("removes a deleted assistant placeholder on local resolved failures", () => {
    const started = reduceRailState(createInitialRailState(pageA), {
      type: "START_AGENT_RUN",
      content: "Explain",
      now: "2026-05-21T00:00:00.000Z",
      idSeed: "run-1",
      scope: "current-page",
    });
    const resolved = reduceRailState(started, {
      type: "APPLY_AGENT_EVENT",
      event: {
        type: "run_resolved",
        runId: "run-1",
        message: "Context too large",
        removeAssistantMessageId: "run-1:assistant",
      },
    });

    expect(resolved.activeAgentRun).toBeUndefined();
    expect(resolved.runtimeStatus).toEqual({ message: "Context too large", running: false });
    expect(resolved.dialogueMessages.map((message) => message.id)).toEqual(["run-1:user"]);
  });

  it("preserves partial text when an active run is cancelled", () => {
    const started = reduceRailState(createInitialRailState(pageA), {
      type: "START_AGENT_RUN",
      content: "Explain",
      now: "2026-05-21T00:00:00.000Z",
      idSeed: "run-1",
      scope: "current-page",
    });
    const withText = reduceRailState(started, {
      type: "APPLY_AGENT_EVENT",
      event: { type: "text_delta", runId: "run-1", delta: "Partial" },
    });
    const cancelled = reduceRailState(withText, {
      type: "APPLY_AGENT_EVENT",
      event: { type: "run_cancelled", runId: "run-1", reason: "Stopped" },
    });

    const assistant = cancelled.dialogueMessages[1];
    expect(assistant?.content).toBe("Partial");
    expect(assistant?.status).toBe("cancelled");
    expect(assistant?.retryRequest).toBeUndefined();
    expect(cancelled.activeAgentRun).toBeUndefined();
  });

  it("records failed runs as retryable assistant turns", () => {
    const started = reduceRailState(createInitialRailState(pageA), {
      type: "START_AGENT_RUN",
      content: "Explain",
      now: "2026-05-21T00:00:00.000Z",
      idSeed: "run-1",
      scope: "current-page",
    });
    const failed = reduceRailState(started, {
      type: "AGENT_TRANSPORT_ERROR",
      runId: "run-1",
      error: {
        code: "LOW_CONFIDENCE_EXTRACTION",
        message: "Select text first.",
      },
    });

    const assistant = failed.dialogueMessages[1];
    expect(assistant?.status).toBe("failed");
    expect(assistant?.error?.message).toBe("Select text first.");
    expect(assistant?.retryRequest?.scope).toBe("current-page");
    expect(failed.activeAgentRun).toBeUndefined();
  });

  it("detects unresolved retryable assistant answers", () => {
    const loaded = reduceRailState(createInitialRailState(pageA), {
      type: "LOAD_CHAT_SESSION",
      sessionId: "sess-1",
      messages: [
        {
          id: "run-1:assistant",
          role: "assistant",
          content: "Partial",
          createdAt: "2026-05-21T00:00:00.000Z",
          scope: "current-page",
          status: "interrupted",
          citations: [],
          worldKnowledge: [],
          retryRequest: {
            question: "Explain",
            scope: "current-page",
          },
        },
      ],
    });

    expect(hasUnresolvedInterruptedAnswer(loaded)).toBe(true);
    expect(
      hasUnresolvedInterruptedAnswer({
        ...loaded,
        dialogueMessages: loaded.dialogueMessages.map((message) => ({
          ...message,
          status: "cancelled",
          retryRequest: undefined,
        })),
      }),
    ).toBe(false);
  });

  it("clears only dialogue messages and active agent state", () => {
    const started = reduceRailState(createInitialRailState(pageA), {
      type: "START_AGENT_RUN",
      content: "Explain",
      now: "2026-05-21T00:00:00.000Z",
      idSeed: "run-1",
      scope: "current-page",
    });
    const cleared = reduceRailState(started, { type: "CLEAR_DIALOGUE" });

    expect(cleared.dialogueMessages).toHaveLength(0);
    expect(cleared.activeAgentRun).toBeUndefined();
    expect(cleared.activePageContext).toEqual(pageA);
  });

  it("loads a persisted chat session and clears the active pointer locally", () => {
    const loaded = reduceRailState(createInitialRailState(pageA), {
      type: "LOAD_CHAT_SESSION",
      sessionId: "sess-1",
      activeRun: {
        runId: "run-1",
        userMessageId: "run-1:user",
        assistantMessageId: "run-1:assistant",
      },
      messages: [
        {
          id: "run-1:evidence:1",
          role: "evidence",
          content: 'Used selection: "selected text"',
          createdAt: "2026-05-21T00:00:00.000Z",
          scope: "selection",
          status: "completed",
          citations: [],
          worldKnowledge: [],
        },
        {
          id: "run-1:user",
          role: "user",
          content: "Explain",
          createdAt: "2026-05-21T00:00:00.000Z",
          scope: "selection",
          status: "completed",
          citations: [],
          worldKnowledge: [],
        },
      ],
    });

    expect(loaded.mode).toBe("agent-home");
    expect(loaded.activeSessionId).toBe("sess-1");
    expect(loaded.activeAgentRun?.runId).toBe("run-1");
    expect(loaded.dialogueMessages[0]?.role).toBe("evidence");

    const cleared = reduceRailState(loaded, { type: "CLEAR_DIALOGUE" });
    expect(cleared.activeSessionId).toBeUndefined();
    expect(cleared.activeAgentRun).toBeUndefined();
    expect(cleared.dialogueMessages).toHaveLength(0);
  });

  it("toggles citation fallback excerpt per assistant message", () => {
    const started = reduceRailState(createInitialRailState(pageA), {
      type: "START_AGENT_RUN",
      content: "Explain",
      now: "2026-05-21T00:00:00.000Z",
      idSeed: "run-1",
      scope: "current-page",
    });
    const withCitation = reduceRailState(started, {
      type: "APPLY_AGENT_EVENT",
      event: {
        type: "citation",
        runId: "run-1",
        citation: {
          id: "cite-1",
          evidenceId: "page:0",
          label: "Page",
          sourceKind: "page",
          sourceUrl: pageA.url,
          sourceTitle: pageA.title,
          excerpt: "Evidence excerpt",
        },
      },
    });
    const expanded = reduceRailState(withCitation, {
      type: "TOGGLE_CITATION_EXCERPT",
      messageId: "run-1:assistant",
      citationId: "cite-1",
    });
    const collapsed = reduceRailState(expanded, {
      type: "TOGGLE_CITATION_EXCERPT",
      messageId: "run-1:assistant",
      citationId: "cite-1",
    });

    expect(expanded.dialogueMessages[1]?.expandedCitationId).toBe("cite-1");
    expect(collapsed.dialogueMessages[1]?.expandedCitationId).toBeUndefined();
  });

  it("prefills composer for selection without submitting a dialogue message", () => {
    const withSnapshot = reduceRailState(createInitialRailState(pageA), {
      type: "SET_SELECTION_SNAPSHOT",
      snapshot: snapshot(),
    });
    const prefilled = reduceRailState(withSnapshot, {
      type: "PREFILL_COMPOSER",
      content: " Explain this selection ",
      idSeed: "prefill-1",
    });

    expect(prefilled.mode).toBe("agent-home");
    expect(prefilled.composerPrefill).toEqual({
      id: "prefill-1",
      content: "Explain this selection",
    });
    expect(prefilled.dialogueMessages).toHaveLength(0);
    expect(prefilled.selectionSnapshot?.text).toBe("selected text");

    const consumed = reduceRailState(prefilled, { type: "CLEAR_COMPOSER_PREFILL" });
    expect(consumed.composerPrefill).toBeUndefined();
    expect(consumed.selectionSnapshot?.text).toBe("selected text");
  });

  it("observes page changes without switching active context until accepted", () => {
    const opened = reduceRailState(
      reduceRailState(createInitialRailState(pageA), {
        type: "ATTACH_SELECTION_TO_COMPOSER",
        snapshot: snapshot(),
        idSeed: "attach-1",
      }),
      { type: "OPEN_HOME" },
    );
    const observed = reduceRailState(opened, { type: "OBSERVE_PAGE_CHANGE", page: pageB });

    expect(observed.activePageContext).toEqual(pageA);
    expect(observed.observedPageContext).toEqual(pageB);
    expect(observed.pendingPageChange).toEqual(pageB);

    const accepted = reduceRailState(observed, { type: "ACCEPT_PAGE_CHANGE" });
    expect(accepted.activePageContext).toEqual(pageB);
    expect(accepted.pendingPageChange).toBeUndefined();
    expect(accepted.selectionSnapshot).toBeUndefined();
    expect(accepted.composerAttachmentRequest).toBeUndefined();
    expect(accepted.composerPrefill).toBeUndefined();
    expect(accepted.imagePromptPrefill).toBeUndefined();
    expect(accepted.commandPaletteOpen).toBe(false);
    expect(accepted.commandPaletteQuery).toBe("");
  });

  it("updates active page immediately while collapsed", () => {
    const withSnapshot = reduceRailState(createInitialRailState(pageA), {
      type: "SET_SELECTION_SNAPSHOT",
      snapshot: snapshot(),
    });
    const observed = reduceRailState(withSnapshot, { type: "OBSERVE_PAGE_CHANGE", page: pageB });

    expect(observed.mode).toBe("collapsed");
    expect(observed.activePageContext).toEqual(pageB);
    expect(observed.observedPageContext).toEqual(pageB);
    expect(observed.pendingPageChange).toBeUndefined();
    expect(observed.selectionSnapshot).toBeUndefined();
  });

  it("keeps previous page context and retargets later switch action to latest page", () => {
    const observed = reduceRailState(
      reduceRailState(createInitialRailState(pageA), { type: "OPEN_HOME" }),
      { type: "OBSERVE_PAGE_CHANGE", page: pageB },
    );
    const kept = reduceRailState(observed, { type: "KEEP_PREVIOUS_PAGE" });
    expect(kept.activePageContext).toEqual(pageA);
    expect(kept.observedPageContext).toEqual(pageB);
    expect(kept.pendingPageChange).toBeUndefined();
    expect(kept.preservingPreviousPageContext).toBe(true);

    const later = reduceRailState(kept, { type: "OBSERVE_PAGE_CHANGE", page: pageC });
    expect(later.activePageContext).toEqual(pageA);
    expect(later.observedPageContext).toEqual(pageC);
    expect(later.pendingPageChange).toBeUndefined();
  });
});
