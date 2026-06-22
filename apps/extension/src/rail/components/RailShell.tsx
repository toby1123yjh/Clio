import {
  type ImageGenerationSettings,
  type SaveImageGenerationSettingsInput,
  defaultImageGenerationModel,
  defaultImageGenerationSize,
  imageGenerationSizes,
} from "@/src/agent-runtime/image-generation-settings";
import {
  defaultOpenAIBaseUrl,
  defaultOpenAICompatibleBaseUrl,
} from "@/src/agent-runtime/openai-provider-config";
import {
  type GeminiProviderSettings,
  type OpenAICompatibleProviderSettings,
  type OpenAIProviderSettings,
  type ProviderId,
  type ProviderSettings,
  type SaveGeminiProviderInput,
  type SaveOpenAICompatibleProviderInput,
  type SaveOpenAIProviderInput,
  defaultActiveProvider,
  defaultGeminiModel,
  defaultOpenAICompatibleModel,
  defaultOpenAICompatibleProviderName,
  defaultOpenAIModel,
} from "@/src/agent-runtime/provider-settings";
import type {
  SaveSearchProviderInput,
  SearchProviderId,
  SearchProviderSettings,
} from "@/src/agent-runtime/search-provider-settings";
import type { AgentToolTrace } from "@/src/agent-runtime/types";
import type { ComposerContextAttachmentKind } from "@/src/rail/api/chat-session";
import { formatDate } from "@/src/rail/api/local-memory";
import {
  type TopicFormMode,
  type TopicPageFormState,
  type WikiCompileFormState,
  emptyTopicPageForm,
  topicGraphEdgeLabel,
  topicSummaryLabel,
  wikiCompileEventDetail,
  wikiCompileEventLabel,
  wikiJobStatusLabel,
} from "@/src/rail/api/local-topic";
import {
  buildAgentActivitySnapshot,
  formatExplicitToolTraceMeta,
  formatToolTraceStatus,
  normalizeActivityText,
} from "@/src/rail/app/agent-activity";
import {
  type RailCommand,
  type RailCommandIcon,
  filterRailCommands,
} from "@/src/rail/app/command-registry";
import { isComposerSubmitKeyEvent } from "@/src/rail/app/composer-keyboard";
import {
  type MarkdownSource,
  buildMarkdownSources,
  markdownToPlainText,
  stripLegacyCitationMarkers,
} from "@/src/rail/app/markdown-sources";
import type {
  CollapsedLauncherDragPoint,
  CollapsedLauncherSide,
  RailTheme,
} from "@/src/rail/app/preferences";
import {
  type RailDialogueMessage,
  type RailState,
  agentRuntimeStatusMessage,
  hasUnresolvedInterruptedAnswer,
  isUnresolvedInterruptedAssistantMessage,
} from "@/src/rail/app/rail-state";
import {
  type SlashCommand,
  type SlashCommandContext,
  executeSlashCommand,
  filterAvailableSlashCommands,
  isSlashCommandInput,
  parseSlashCommandInput,
  slashInputHasArguments,
} from "@/src/rail/app/slash-command-registry";
import {
  assistantThinkingDotIds,
  assistantThinkingIndicatorClassName,
} from "@/src/rail/app/thinking-indicator";
import {
  type ToolboxSkill,
  type ToolboxSkillIcon,
  toolboxSkills,
} from "@/src/rail/app/toolbox-registry";
import type {
  ChatSessionSummary,
  ClioImageGenerationMode,
  ClioImageGenerationResult,
  ClioImageInput,
  ClioWebSearchResult,
  EngineHealth,
  ImageGenerationHistoryRecord,
  MemoryDetail,
  SearchMemoryItem,
  TopicGraphEdge,
  TopicPageDetail,
  TopicPageSummary,
  WebSearchHistoryRecord,
  WikiCompileJobEvent,
  WikiCompileJobSummary,
} from "@/src/shared/rpc";
import type { ReplyActionSuggestion } from "@/src/suggestions/suggestion-types";
import {
  type ExplicitToolTrace,
  explicitToolRouteLabel,
} from "@/src/tool-routing/tool-route-types";
import { Badge } from "@/src/ui/components/badge";
import { Button } from "@/src/ui/components/button";
import { Input } from "@/src/ui/components/input";
import {
  ArrowLeft,
  ArrowUp,
  BookOpen,
  BookmarkPlus,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Command,
  Copy,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  History,
  Home,
  Image as ImageIcon,
  KeyRound,
  Library,
  Loader2,
  MessageSquare,
  Mic,
  Moon,
  PanelRightClose,
  Paperclip,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Square,
  Sun,
  Trash2,
  Upload,
  Wifi,
  X,
} from "lucide-react";
import * as React from "react";
import { MarkdownRenderer } from "./MarkdownRenderer";

export interface RailShellProps {
  state: RailState;
  health: EngineHealth | null;
  items: SearchMemoryItem[];
  topicPages: TopicPageSummary[];
  relatedItems: SearchMemoryItem[];
  chatSessions: ChatSessionSummary[];
  railCommands: RailCommand[];
  slashCommands: SlashCommand[];
  slashContext: SlashCommandContext;
  detail: MemoryDetail | null;
  topicDetail: TopicPageDetail | null;
  topicForm: TopicPageFormState;
  topicFormOpen: boolean;
  topicGraphEdges: TopicGraphEdge[];
  wikiCompileJobEvents: WikiCompileJobEvent[];
  railWidth: number;
  collapsedDragPoint: CollapsedLauncherDragPoint | null;
  collapsedSide: CollapsedLauncherSide;
  collapsedTopPx: number;
  providerSettings: ProviderSettings | null;
  searchProviderSettings: SearchProviderSettings | null;
  imageGenerationSettings: ImageGenerationSettings | null;
  imageGenerationHistory: ImageGenerationHistoryRecord[];
  imageGenerationState: ImageGenerationDisplayState;
  webSearchHistory: WebSearchHistoryRecord[];
  webSearchState: WebSearchDisplayState;
  wikiCompileForm: WikiCompileFormState;
  wikiCompileJobs: WikiCompileJobSummary[];
  wikiCompileRunning: boolean;
  providerLoading: boolean;
  providerMessage: string | null;
  railTheme: RailTheme;
  onAcceptPageChange: () => void;
  onBackToHome: () => void;
  onBackToKnowledgeBase: () => void;
  onCollapsedKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
  onCollapsedPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onCollapse: () => void;
  onCloseCommandPalette: () => void;
  onCommandPaletteQueryChange: (query: string) => void;
  onComposerInputChange: () => void;
  onRuntimeStatus: (message: string) => void;
  onCancelDialogue: () => void;
  onClearDialogue: () => void;
  onDelete: (id: string) => void;
  onDeleteTopicPage: (id: string) => void;
  onExecuteCommand: (command: RailCommand) => void;
  onKeepPreviousPage: () => void;
  onOpenChatHistory: () => void;
  onOpenChatSession: (sessionId: string) => void;
  onOpenDetail: (id: string) => void;
  onOpenKnowledgeBase: () => void;
  onOpenTopicPage: (id: string) => void;
  onCreateTopicPage: () => void;
  onCancelTopicForm: () => void;
  onEditTopicPage: (page: TopicPageDetail) => void;
  onSaveTopicPage: (form: TopicPageFormState, id?: string) => void;
  onTopicFormChange: (form: TopicPageFormState) => void;
  onWikiCompileFormChange: (form: WikiCompileFormState) => void;
  onCompileTopicWithAI: (form: WikiCompileFormState, topicId?: string) => void;
  onOpenTopicSource: (memoryId: string) => void;
  onOpenMarkdownPreview: (messageId: string) => void;
  onReplySuggestion: (suggestion: ReplyActionSuggestion) => void;
  onCloseMarkdownPreview: () => void;
  onCopyMarkdownPreview: (content: string) => void;
  onCopyMarkdownText: (content: string) => void;
  onOpenMarkdownSource: (source: MarkdownSource) => void;
  onOpenRelatedMemory: (id: string) => void;
  onOpenSettings: () => void;
  onOpenSource: (memory: MemoryDetail) => void;
  onQueryChange: (query: string) => void;
  onRefresh: () => void;
  onRefreshProvider: () => Promise<boolean>;
  onRetryDialogue: (messageId: string) => void;
  onResizePointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  onStopInterruptedDialogue: (messageId: string) => void;
  onAskSelection: () => void;
  onComposerPrefillConsumed: () => void;
  onNoteSelection: () => void;
  onSavePage: () => void;
  onSaveSelection: () => void;
  onSaveSelectionFromHome: () => void;
  onSearchSelection: () => void;
  onSubmitDialogue: (content: string, attachment?: ComposerContextAttachmentKind) => void;
  onSwitchToLatestPage: () => void;
  onThemeChange: (theme: RailTheme) => void;
  onToggleCommandPalette: () => void;
  onToolboxSkill: (skill: ToolboxSkill) => void;
  onComposerAttachmentRequestConsumed: () => void;
  onClearComposerSkillMode: () => void;
  onSelectProvider: (provider: ProviderId) => Promise<boolean>;
  onSaveGeminiProvider: (input: SaveGeminiProviderInput) => Promise<boolean>;
  onTestGeminiProvider: (input: { apiKey?: string; model?: string }) => Promise<boolean>;
  onSaveOpenAIProvider: (input: SaveOpenAIProviderInput) => Promise<boolean>;
  onTestOpenAIProvider: (input: {
    apiKey?: string;
    model?: string;
    baseUrl?: string;
  }) => Promise<boolean>;
  onSaveOpenAICompatibleProvider: (input: SaveOpenAICompatibleProviderInput) => Promise<boolean>;
  onTestOpenAICompatibleProvider: (input: {
    apiKey?: string;
    model?: string;
    baseUrl?: string;
    providerName?: string;
  }) => Promise<boolean>;
  onSaveSearchProvider: (input: SaveSearchProviderInput) => Promise<boolean>;
  onSaveImageGenerationSettings: (input: SaveImageGenerationSettingsInput) => Promise<boolean>;
  onSubmitWebSearch: (query: string) => void;
  onSubmitImageGeneration: (input: ImageGenerationSubmitInput) => void;
  onCancelImageGeneration: () => void;
  onImagePromptPrefillConsumed: () => void;
  onDeleteImageGenerationHistory: (id: string) => void;
  onOpenWebSearchHistory: (record: WebSearchHistoryRecord) => void;
  onDeleteWebSearchHistory: (id: string) => void;
  onClearWebSearchHistory: () => void;
  onOpenWebSearchSource: (url: string) => void;
}

interface WebSearchDisplayState {
  running: boolean;
  query: string;
  answer: string;
  sources: ClioWebSearchResult["sources"];
  provider?: string;
  createdAt?: string;
  error?: {
    code: string;
    message: string;
    detail?: string;
  };
}

export interface ImageGenerationDisplayState {
  running: boolean;
  mode: ClioImageGenerationMode;
  prompt: string;
  model?: string;
  size?: string;
  provider?: string;
  createdAt?: string;
  result?: ClioImageGenerationResult;
  error?: {
    code: string;
    message: string;
    detail?: string;
  };
}

export interface ImageGenerationSubmitInput {
  mode: ClioImageGenerationMode;
  prompt: string;
  input?: ClioImageInput;
}

export function RailShell(props: RailShellProps) {
  if (props.state.mode === "collapsed") {
    return (
      <CollapsedRailHandle
        dragPoint={props.collapsedDragPoint}
        onKeyDown={props.onCollapsedKeyDown}
        onPointerDown={props.onCollapsedPointerDown}
        side={props.collapsedSide}
        topPx={props.collapsedTopPx}
      />
    );
  }

  return (
    <aside
      className="fixed bottom-0 right-0 top-0 z-[2147483644] flex max-w-[92vw] flex-row overflow-hidden border-l border-border bg-background text-foreground shadow-[0_0_24px_rgba(15,15,15,0.06)]"
      data-clio-rail-state="expanded"
      data-clio-theme={props.railTheme}
      data-clio-view={props.state.mode}
      style={{ width: `${props.railWidth}px` }}
    >
      <div
        aria-label="Resize Clio Rail"
        className="absolute bottom-0 left-0 top-0 z-30 w-1 cursor-col-resize bg-transparent transition-colors hover:bg-border-strong"
        onPointerDown={props.onResizePointerDown}
        role="separator"
        tabIndex={0}
      />
      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        {props.state.mode === "agent-home" ? null : (
          <RailHeader onCollapse={props.onCollapse} onOpenSettings={props.onOpenSettings} />
        )}
        {renderMode(props)}
      </div>
      <RightNavigation
        commandPaletteOpen={props.state.commandPaletteOpen}
        mode={props.state.mode}
        onCollapse={props.onCollapse}
        onOpenChatHistory={props.onOpenChatHistory}
        onOpenHome={props.onBackToHome}
        onOpenKnowledgeBase={props.onOpenKnowledgeBase}
        onOpenSettings={props.onOpenSettings}
        onToggleCommandPalette={props.onToggleCommandPalette}
      />
      <CommandPalette
        commands={props.railCommands}
        onClose={props.onCloseCommandPalette}
        onExecute={props.onExecuteCommand}
        onQueryChange={props.onCommandPaletteQueryChange}
        open={props.state.commandPaletteOpen}
        query={props.state.commandPaletteQuery}
      />
    </aside>
  );
}

function CollapsedRailHandle({
  dragPoint,
  onKeyDown,
  onPointerDown,
  side,
  topPx,
}: {
  dragPoint: CollapsedLauncherDragPoint | null;
  onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
  onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
  side: CollapsedLauncherSide;
  topPx: number;
}) {
  const isDragging = dragPoint !== null;
  const edgeClass =
    side === "left"
      ? "-left-1.5 hover:left-0 focus:left-0"
      : "-right-1.5 hover:right-0 focus:right-0";
  const stemClass =
    side === "left" ? "left-0 rounded-l-none border-l-0" : "right-0 rounded-r-none border-r-0";
  const circleClass = side === "left" ? "left-2.5" : "right-2.5";
  const positionStyle = isDragging
    ? {
        left: `${dragPoint.x}px`,
        right: "auto",
        top: `${dragPoint.y}px`,
        transform: "translate(-50%, -50%)",
      }
    : {
        top: `${topPx}px`,
        transform: "translateY(-50%)",
      };

  return (
    <button
      aria-label="Open Clio"
      className={[
        "group fixed z-[2147483645] rounded-full bg-transparent text-foreground outline-none duration-150 focus-visible:ring-2 focus-visible:ring-primary",
        isDragging
          ? "cursor-grabbing transition-none"
          : `cursor-grab transition-[left,right,transform] ${edgeClass}`,
      ].join(" ")}
      data-clio-rail-state="collapsed"
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      style={{
        ...positionStyle,
        boxSizing: "border-box",
        contain: "layout paint style",
        fontSize: "16px",
        height: "50px",
        lineHeight: "1",
        transformOrigin: "center",
        width: "58px",
      }}
      title="Open Clio"
      type="button"
    >
      <span
        aria-hidden="true"
        className={[
          "absolute top-1/2 h-9 w-6 -translate-y-1/2 rounded-full border border-border bg-surface-subtle shadow-[0_8px_18px_rgba(15,15,15,0.08)] transition-colors group-hover:border-border-strong",
          stemClass,
        ].join(" ")}
      />
      <span
        className={[
          "absolute top-1/2 flex -translate-y-1/2 shrink-0 items-center justify-center rounded-full border border-border-strong bg-surface text-primary shadow-[0_8px_20px_rgba(15,15,15,0.14)] transition-colors group-hover:bg-surface-subtle",
          circleClass,
        ].join(" ")}
        style={{
          boxSizing: "border-box",
          fontSize: "16px",
          height: "42px",
          lineHeight: "1",
          width: "42px",
        }}
      >
        <Library size={16} strokeWidth={2} />
      </span>
    </button>
  );
}

function RailHeader({
  onCollapse,
  onOpenSettings,
}: { onCollapse: () => void; onOpenSettings: () => void }) {
  return (
    <header className="relative z-10 flex h-[72px] shrink-0 items-center justify-between border-b border-border bg-background px-6">
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-surface text-primary">
          <Library size={18} />
        </div>
        <div className="min-w-0 leading-tight">
          <h2 className="truncate text-[20px] font-semibold leading-7">Clio</h2>
          <p className="truncate text-[11px] text-muted-foreground">Browser companion</p>
        </div>
      </div>
      <div className="flex items-center gap-1 text-muted-foreground">
        <IconButton label="Settings" onClick={onOpenSettings}>
          <Settings size={17} />
        </IconButton>
        <IconButton label="Collapse Clio" onClick={onCollapse}>
          <PanelRightClose size={17} />
        </IconButton>
      </div>
    </header>
  );
}

function RightNavigation({
  commandPaletteOpen,
  mode,
  onCollapse,
  onOpenChatHistory,
  onOpenHome,
  onOpenKnowledgeBase,
  onOpenSettings,
  onToggleCommandPalette,
}: {
  commandPaletteOpen: boolean;
  mode: RailState["mode"];
  onCollapse: () => void;
  onOpenChatHistory: () => void;
  onOpenHome: () => void;
  onOpenKnowledgeBase: () => void;
  onOpenSettings: () => void;
  onToggleCommandPalette: () => void;
}) {
  return (
    <nav className="relative z-20 flex w-[72px] shrink-0 flex-col items-center justify-between border-l border-border bg-surface-subtle py-5">
      <div className="flex w-full flex-col items-center gap-3">
        <NavButton active={mode === "agent-home"} label="Home" onClick={onOpenHome}>
          <Home size={21} />
        </NavButton>
        <NavButton
          active={mode === "knowledge-base" || mode === "memory-detail"}
          label="Knowledge"
          onClick={onOpenKnowledgeBase}
        >
          <BookOpen size={21} />
        </NavButton>
        <NavButton active={mode === "chat-history"} label="History" onClick={onOpenChatHistory}>
          <History size={21} />
        </NavButton>
        <NavButton active={commandPaletteOpen} label="Actions" onClick={onToggleCommandPalette}>
          <Command size={21} />
        </NavButton>
      </div>
      <div className="flex w-full flex-col items-center gap-3">
        <NavButton active={false} disabled label="Privacy">
          <ShieldAlert size={21} />
        </NavButton>
        <NavButton active={mode === "settings"} label="Settings" onClick={onOpenSettings}>
          <Settings size={21} />
        </NavButton>
        <NavButton active={false} label="Collapse" onClick={onCollapse}>
          <PanelRightClose size={21} />
        </NavButton>
      </div>
    </nav>
  );
}

function NavButton({
  active,
  children,
  disabled = false,
  label,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  disabled?: boolean;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      aria-disabled={disabled}
      aria-label={disabled ? `${label} coming soon` : label}
      className={[
        "flex h-12 w-12 items-center justify-center rounded-lg border outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary",
        active
          ? "border-transparent bg-surface-hover text-foreground"
          : "border-transparent text-muted-foreground hover:bg-surface-hover hover:text-foreground",
        disabled
          ? "cursor-not-allowed opacity-35 hover:border-transparent hover:bg-transparent hover:text-muted-foreground"
          : "",
      ].join(" ")}
      disabled={disabled}
      onClick={onClick}
      title={disabled ? `${label} coming soon` : label}
      type="button"
    >
      {children}
    </button>
  );
}

function CommandPalette({
  commands,
  onClose,
  onExecute,
  onQueryChange,
  open,
  query,
}: {
  commands: RailCommand[];
  onClose: () => void;
  onExecute: (command: RailCommand) => void;
  onQueryChange: (query: string) => void;
  open: boolean;
  query: string;
}) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const visibleCommands = React.useMemo(
    () => filterRailCommands(commands, query),
    [commands, query],
  );

  React.useEffect(() => {
    if (!open) return;
    setSelectedIndex(0);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  if (!open) return null;

  const executeSelected = () => {
    const command = visibleCommands[selectedIndex];
    if (command === undefined) return;
    if (command.availability.status === "disabled") return;
    onExecute(command);
  };

  return (
    <>
      <button
        aria-label="Close actions"
        className="absolute bottom-0 left-0 right-[72px] top-0 z-30 bg-transparent"
        onClick={onClose}
        type="button"
      />
      <div
        aria-label="Clio actions"
        className="absolute left-5 right-[88px] top-[84px] z-40 overflow-hidden rounded-xl border border-border bg-surface shadow-[0_12px_32px_rgba(15,15,15,0.10)]"
        data-clio-command-palette="true"
      >
        <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-foreground-soft">
              <Command size={15} />
            </span>
            <div className="min-w-0 leading-tight">
              <h3 className="truncate text-sm font-semibold">Actions</h3>
              <p className="truncate text-[11px] text-muted-foreground">
                Choose what Clio does next
              </p>
            </div>
          </div>
          <IconButton label="Close actions" onClick={onClose}>
            <X size={16} />
          </IconButton>
        </div>
        <div className="border-b border-border px-3 py-2.5">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              size={15}
            />
            <Input
              aria-label="Search Clio actions"
              className="h-10 rounded-lg border-border bg-background pl-9 text-foreground placeholder:text-muted-foreground/70 focus-visible:ring-primary"
              onChange={(event) => {
                setSelectedIndex(0);
                onQueryChange(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  onClose();
                  return;
                }
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  if (visibleCommands.length === 0) return;
                  setSelectedIndex((index) => Math.min(index + 1, visibleCommands.length - 1));
                  return;
                }
                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setSelectedIndex((index) => Math.max(index - 1, 0));
                  return;
                }
                if (event.key === "Enter") {
                  event.preventDefault();
                  executeSelected();
                }
              }}
              placeholder="Search actions"
              ref={inputRef}
              value={query}
            />
          </div>
        </div>
        <div className="max-h-[360px] overflow-y-auto overflow-x-hidden p-2">
          {visibleCommands.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">
              No actions found.
            </div>
          ) : (
            <ul className="flex flex-col gap-1">
              {visibleCommands.map((command, index) => (
                <React.Fragment key={command.id}>
                  {index === 0 || visibleCommands[index - 1]?.group !== command.group ? (
                    <li className="px-2 pb-1 pt-2 text-[11px] font-medium text-muted-foreground">
                      {command.group}
                    </li>
                  ) : null}
                  <CommandPaletteRow
                    command={command}
                    onExecute={onExecute}
                    selected={index === selectedIndex}
                  />
                </React.Fragment>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}

function CommandPaletteRow({
  command,
  onExecute,
  selected,
}: {
  command: RailCommand;
  onExecute: (command: RailCommand) => void;
  selected: boolean;
}) {
  const disabled = command.availability.status === "disabled";
  const subtitle =
    command.availability.status === "disabled" ? command.availability.reason : command.subtitle;
  return (
    <li>
      <button
        aria-disabled={disabled}
        className={[
          "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary",
          selected ? "border-transparent bg-surface-hover" : "border-transparent bg-transparent",
          disabled
            ? "cursor-not-allowed text-muted-foreground/62"
            : "text-foreground hover:bg-muted",
        ].join(" ")}
        onClick={() => {
          if (disabled) return;
          onExecute(command);
        }}
        type="button"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-foreground-soft">
          {commandIcon(command.icon)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{command.title}</span>
          <span className="block truncate text-[11px] text-muted-foreground">{subtitle}</span>
        </span>
      </button>
    </li>
  );
}

function commandIcon(icon: RailCommandIcon) {
  switch (icon) {
    case "book-open":
      return <BookOpen size={15} />;
    case "history":
      return <History size={15} />;
    case "bookmark-plus":
      return <BookmarkPlus size={15} />;
    case "message-square":
      return <MessageSquare size={15} />;
    case "search":
      return <Search size={15} />;
    case "file-text":
      return <FileText size={15} />;
    default:
      return null;
  }
}

function renderMode(props: RailShellProps) {
  if (props.state.mode === "memory-detail") {
    return (
      <MemoryDetailPanel
        detail={props.detail}
        loading={props.state.loading}
        onBack={
          props.state.previousMode === "agent-home"
            ? props.onBackToHome
            : props.onBackToKnowledgeBase
        }
        onDelete={props.onDelete}
        onOpenSource={props.onOpenSource}
      />
    );
  }
  if (props.state.mode === "knowledge-base") {
    return <KnowledgeBasePanel {...props} />;
  }
  if (props.state.mode === "chat-history") {
    return (
      <ChatHistoryPanel
        items={props.chatSessions}
        onBack={props.onBackToHome}
        onOpenSession={props.onOpenChatSession}
        prompt={renderRoutePrompt(props)}
        previousMarker={renderPreviousPageMarker(props)}
      />
    );
  }
  if (props.state.mode === "web-search") {
    return <WebSearchPanel {...props} />;
  }
  if (props.state.mode === "image-gen") {
    return <ImageGenPanel {...props} />;
  }
  if (props.state.mode === "markdown-preview") {
    const message = props.state.dialogueMessages.find(
      (item) => item.id === props.state.previewMessageId && item.role === "assistant",
    );
    return (
      <MarkdownPreviewPanel
        activePageContext={props.state.activePageContext}
        message={message}
        onBack={props.onCloseMarkdownPreview}
        onCopyMarkdown={props.onCopyMarkdownPreview}
        onCopyText={props.onCopyMarkdownText}
        onSourceActivate={props.onOpenMarkdownSource}
      />
    );
  }
  if (props.state.mode === "settings") {
    return <SettingsPanel {...props} />;
  }
  return <AgentHomePanel {...props} />;
}

function AgentHomePanel(props: RailShellProps) {
  const hasDialogue = props.state.dialogueMessages.length > 0;

  return (
    <div className="relative z-10 flex min-h-0 flex-1 flex-col" data-clio-panel="agent-home">
      <div className="clio-scroll flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto overflow-x-hidden px-7 pb-[220px] pt-7">
        {renderRoutePrompt(props)}
        {renderPreviousPageMarker(props)}
        {hasDialogue ? (
          <ConversationStream
            activePageContext={props.state.activePageContext}
            messages={props.state.dialogueMessages}
            onClear={props.onClearDialogue}
            onOpenMarkdownPreview={props.onOpenMarkdownPreview}
            onReplySuggestion={props.onReplySuggestion}
            onSourceActivate={props.onOpenMarkdownSource}
            onRetry={props.onRetryDialogue}
            onStop={props.onStopInterruptedDialogue}
          />
        ) : (
          <>
            <HomeHero />
            <section className="shrink-0" data-clio-panel="toolbox">
              <SectionLabel>Toolbox</SectionLabel>
              <ToolboxGrid onActivate={props.onToolboxSkill} />
            </section>
            <SmartWorkflowList onActivate={props.onToolboxSkill} />
          </>
        )}
        <RelatedMemoryCards items={props.relatedItems} onOpenMemory={props.onOpenRelatedMemory} />
      </div>
      <Composer
        active={props.state.activeAgentRun !== undefined}
        blocked={hasUnresolvedInterruptedAnswer(props.state)}
        onCancel={props.onCancelDialogue}
        onClearComposerSkillMode={props.onClearComposerSkillMode}
        onInputChange={props.onComposerInputChange}
        onComposerAttachmentRequestConsumed={props.onComposerAttachmentRequestConsumed}
        onPrefillConsumed={props.onComposerPrefillConsumed}
        onRuntimeStatus={props.onRuntimeStatus}
        onSubmit={props.onSubmitDialogue}
        providerSettings={props.providerSettings}
        slashCommands={props.slashCommands}
        slashContext={props.slashContext}
        state={props.state}
      />
    </div>
  );
}

function HomeHero() {
  return (
    <section className="group relative flex min-h-[104px] shrink-0 flex-col justify-center overflow-hidden rounded-xl border border-border bg-surface p-5 transition-colors hover:border-border-strong">
      <div className="relative z-10">
        <h2 className="text-[19px] font-semibold leading-7 text-foreground">
          What do you want Clio to do today?
        </h2>
        <p className="mt-1 text-[13px] leading-5 text-muted-foreground">
          Pick a tool, or ask directly in the composer.
        </p>
      </div>
    </section>
  );
}

function ConversationStream({
  activePageContext,
  messages,
  onClear,
  onOpenMarkdownPreview,
  onReplySuggestion,
  onSourceActivate,
  onRetry,
  onStop,
}: {
  activePageContext: RailState["activePageContext"];
  messages: RailDialogueMessage[];
  onClear: () => void;
  onOpenMarkdownPreview: (messageId: string) => void;
  onReplySuggestion: (suggestion: ReplyActionSuggestion) => void;
  onSourceActivate: (source: MarkdownSource) => void;
  onRetry: (messageId: string) => void;
  onStop: (messageId: string) => void;
}) {
  return (
    <section className="flex min-h-[300px] flex-1 flex-col gap-3 px-0" data-clio-panel="dialogue">
      <div className="flex shrink-0 justify-end">
        <button
          aria-label="Clear conversation"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-surface-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary"
          onClick={onClear}
          title="Clear conversation"
          type="button"
        >
          <Trash2 size={13} />
        </button>
      </div>
      <div className="flex flex-1 flex-col gap-5">
        {messages.map((message) => (
          <DialogueMessage
            activePageContext={activePageContext}
            key={message.id}
            message={message}
            onOpenMarkdownPreview={onOpenMarkdownPreview}
            onReplySuggestion={onReplySuggestion}
            onSourceActivate={onSourceActivate}
            onRetry={onRetry}
            onStop={onStop}
          />
        ))}
      </div>
    </section>
  );
}

function MarkdownPreviewPanel({
  activePageContext,
  message,
  onBack,
  onCopyMarkdown,
  onCopyText,
  onSourceActivate,
}: {
  activePageContext: RailState["activePageContext"];
  message?: RailDialogueMessage;
  onBack: () => void;
  onCopyMarkdown: (content: string) => void;
  onCopyText: (content: string) => void;
  onSourceActivate: (source: MarkdownSource) => void;
}) {
  const markdown = stripLegacyCitationMarkers(message?.content ?? "");
  const text = markdownToPlainText(message?.content ?? "");
  const sources = message === undefined ? [] : buildMarkdownSources(message, activePageContext);

  return (
    <div className="relative z-10 flex min-h-0 flex-1 flex-col" data-clio-panel="markdown-preview">
      <div className="flex h-[64px] shrink-0 items-center justify-between border-b border-border bg-background px-5">
        <div className="flex min-w-0 items-center gap-2">
          <IconButton label="Back to chat" onClick={onBack}>
            <ArrowLeft size={17} />
          </IconButton>
          <div className="min-w-0 leading-tight">
            <h2 className="truncate text-[16px] font-semibold text-foreground">Markdown Preview</h2>
            <p className="truncate text-[11px] text-muted-foreground">
              {message === undefined ? "Message not found" : formatDate(message.createdAt)}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            disabled={message === undefined || markdown.length === 0}
            onClick={() => onCopyText(text)}
            size="sm"
            variant="ghost"
          >
            <Copy size={13} />
            Copy Text
          </Button>
          <Button
            disabled={message === undefined || markdown.length === 0}
            onClick={() => onCopyMarkdown(markdown)}
            size="sm"
            variant="subtle"
          >
            <Copy size={13} />
            Copy Markdown
          </Button>
        </div>
      </div>
      <div className="clio-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-7 py-6">
        {message === undefined ? (
          <div className="rounded-lg border border-border bg-surface px-4 py-3 text-[13px] text-muted-foreground">
            This assistant message is no longer available.
          </div>
        ) : (
          <article className="mx-auto max-w-[720px]">
            <MarkdownRenderer
              markdown={message.content}
              onSourceActivate={onSourceActivate}
              sources={sources}
              variant="preview"
            />
          </article>
        )}
      </div>
    </div>
  );
}

const homeToolboxSkills = [
  toolboxSkills.find((skill) => skill.id === "rewrite"),
  toolboxSkills.find((skill) => skill.id === "extract"),
  toolboxSkills.find((skill) => skill.id === "search"),
  toolboxSkills.find((skill) => skill.id === "image-gen"),
  toolboxSkills.find((skill) => skill.id === "translate"),
  toolboxSkills.find((skill) => skill.id === "summarize"),
  toolboxSkills.find((skill) => skill.id === "find-related"),
].filter((skill): skill is ToolboxSkill => skill !== undefined);

const toolboxDisplayLabels: Record<ToolboxSkill["id"], string> = {
  translate: "Translate",
  search: "Search",
  summarize: "Summarize",
  extract: "Extract",
  rewrite: "Rewrite",
  "find-related": "Related",
  "image-gen": "Image Gen",
};

function ToolboxGrid({ onActivate }: { onActivate: (skill: ToolboxSkill) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {homeToolboxSkills.map((skill) => (
        <button
          className="group flex min-h-[88px] min-w-0 flex-col items-center justify-center gap-2 rounded-lg border border-border bg-surface p-3 text-center outline-none transition-colors hover:border-border-strong hover:bg-surface-subtle focus-visible:ring-2 focus-visible:ring-primary"
          key={skill.id}
          onClick={() => onActivate(skill)}
          type="button"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground transition-colors group-hover:text-foreground">
            {toolboxIcon(skill.icon)}
          </span>
          <span className="block w-full whitespace-nowrap text-[12px] font-semibold leading-5 text-foreground">
            {toolboxDisplayLabels[skill.id]}
          </span>
        </button>
      ))}
    </div>
  );
}

const workflowDefinitions: Array<{
  title: string;
  subtitle: string;
  skillId: ToolboxSkill["id"];
  icon: React.ReactNode;
}> = [
  {
    title: "Web search",
    subtitle: "Search the web and organize traceable results",
    skillId: "search",
    icon: <Search size={17} />,
  },
  {
    title: "PPT outline",
    subtitle: "Turn an idea into a presentation structure",
    skillId: "rewrite",
    icon: <FileText size={17} />,
  },
  {
    title: "Extract key points",
    subtitle: "Pull structured points from a page or selection",
    skillId: "extract",
    icon: <Bot size={17} />,
  },
];

function SmartWorkflowList({ onActivate }: { onActivate: (skill: ToolboxSkill) => void }) {
  return (
    <section className="flex shrink-0 flex-col gap-2">
      <SectionLabel>Suggested workflows</SectionLabel>
      <div className="flex flex-col gap-2">
        {workflowDefinitions.map((item) => {
          const skill = toolboxSkills.find((candidate) => candidate.id === item.skillId);
          return (
            <button
              className="group flex min-h-[58px] w-full items-center gap-3 rounded-lg border border-border bg-surface p-3 text-left outline-none transition-colors hover:border-border-strong hover:bg-surface-subtle focus-visible:ring-2 focus-visible:ring-primary"
              disabled={skill === undefined}
              key={item.title}
              onClick={() => {
                if (skill !== undefined) onActivate(skill);
              }}
              type="button"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground transition-colors group-hover:text-foreground">
                {item.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold leading-5 text-foreground">
                  {item.title}
                </span>
                <span className="mt-0.5 block truncate text-[11.5px] leading-4 text-muted-foreground">
                  {item.subtitle}
                </span>
              </span>
              <span className="inline-flex min-h-8 shrink-0 items-center justify-center rounded-md bg-muted px-3 text-[12px] font-medium leading-4 text-foreground-soft transition-colors group-hover:bg-surface-hover group-hover:text-foreground">
                Start
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function toolboxIcon(icon: ToolboxSkillIcon) {
  switch (icon) {
    case "message-square":
      return <MessageSquare size={17} />;
    case "search":
      return <Search size={17} />;
    case "file-text":
      return <FileText size={17} />;
    case "book-open":
      return <BookOpen size={17} />;
    case "sparkles":
      return <Sparkles size={17} />;
    case "image":
      return <ImageIcon size={17} />;
    default:
      return null;
  }
}

function DialogueMessage({
  activePageContext,
  message,
  onOpenMarkdownPreview,
  onReplySuggestion,
  onSourceActivate,
  onRetry,
  onStop,
}: {
  activePageContext: RailState["activePageContext"];
  message: RailDialogueMessage;
  onOpenMarkdownPreview: (messageId: string) => void;
  onReplySuggestion: (suggestion: ReplyActionSuggestion) => void;
  onSourceActivate: (source: MarkdownSource) => void;
  onRetry: (messageId: string) => void;
  onStop: (messageId: string) => void;
}) {
  if (message.role === "evidence") {
    return (
      <div
        className="mr-auto max-w-[92%] rounded-md bg-muted px-2.5 py-1.5 text-[11px] leading-4 text-muted-foreground"
        data-clio-dialogue-role={message.role}
        data-clio-dialogue-status={message.status}
      >
        {message.content}
      </div>
    );
  }
  const isUser = message.role === "user";
  if (isUser && message.skillRequest !== undefined) {
    return <SkillRequestMessage message={message} />;
  }
  if (!isUser) {
    const sources = buildMarkdownSources(message, activePageContext);
    return (
      <div
        className="flex w-full items-start gap-3"
        data-clio-dialogue-role={message.role}
        data-clio-dialogue-status={message.status}
      >
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-primary">
          <Sparkles size={14} />
        </span>
        <div className="min-w-0 flex-1 pr-1 pt-0.5 text-[13.5px] leading-6 text-foreground">
          <AssistantActivity message={message} />
          {message.content.length > 0 ? (
            <MarkdownRenderer
              markdown={message.content}
              onSourceActivate={onSourceActivate}
              sources={sources}
              variant="chat"
            />
          ) : (
            <div className="whitespace-pre-wrap break-words">
              {renderAssistantPlaceholder(message)}
            </div>
          )}
          {message.worldKnowledge.length > 0 ? (
            <div className="mt-2.5 flex flex-col gap-1">
              {message.worldKnowledge.map((note) => (
                <div
                  className="rounded-md bg-muted px-2 py-1 text-[11px] leading-4 text-muted-foreground"
                  key={note}
                >
                  World knowledge: {note}
                </div>
              ))}
            </div>
          ) : null}
          {message.error !== undefined && message.status !== "cancelled" ? (
            <div className="mt-2.5 rounded-md border border-warning-border bg-warning-background px-2.5 py-1.5 text-[11px] leading-4 text-warning-foreground">
              {message.error.message}
            </div>
          ) : null}
          <ReplyActionChips
            onActivate={onReplySuggestion}
            suggestions={message.replySuggestions ?? []}
          />
          {isRetryableMessage(message) ? (
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <button
                className="inline-flex h-7 items-center gap-1.5 rounded-md bg-muted px-2.5 text-[11px] text-foreground outline-none transition-colors hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-primary"
                onClick={() => onRetry(message.id)}
                type="button"
              >
                <RefreshCw size={12} />
                Retry
              </button>
              <button
                className="inline-flex h-7 items-center gap-1.5 rounded-md bg-muted px-2.5 text-[11px] text-foreground outline-none transition-colors hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-primary"
                onClick={() => onStop(message.id)}
                type="button"
              >
                <Square size={12} />
                Stop
              </button>
            </div>
          ) : null}
          {message.content.trim().length > 0 ? (
            <div className="mt-2 flex justify-start">
              <button
                className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary"
                onClick={() => onOpenMarkdownPreview(message.id)}
                type="button"
              >
                <Eye size={12} />
                Preview
              </button>
            </div>
          ) : null}
        </div>
      </div>
    );
  }
  return (
    <div
      className="flex w-full justify-end"
      data-clio-dialogue-role={message.role}
      data-clio-dialogue-status={message.status}
    >
      <div className="max-w-[84%] rounded-lg bg-muted px-3.5 py-2.5 text-[13px] leading-5 text-foreground">
        <div className="whitespace-pre-wrap">{message.content}</div>
        {isUser && message.status === "queued" ? (
          <div className="mt-1 text-[11px] font-medium text-muted-foreground">Queued</div>
        ) : null}
      </div>
    </div>
  );
}

function AssistantActivity({ message }: { message: RailDialogueMessage }) {
  const snapshot = buildAgentActivitySnapshot(message);
  const [expanded, setExpanded] = React.useState(false);
  if (snapshot === undefined) return null;

  const latestTrace = snapshot.traces.at(-1);
  const latestExplicitTrace = snapshot.explicitToolTraces.at(-1);
  const running =
    latestExplicitTrace?.status === "running" ||
    latestTrace?.status === "running" ||
    (message.status === "streaming" && snapshot.thinking !== undefined);
  const status = latestTrace?.status ?? latestExplicitTrace?.status;

  return (
    <div
      className="mb-2 rounded-lg border border-border bg-surface-subtle px-2.5 py-2 text-[11.5px] leading-4 text-muted-foreground"
      data-clio-agent-activity="true"
    >
      <button
        aria-expanded={expanded}
        className="flex min-h-5 w-full min-w-0 items-center gap-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-primary"
        onClick={() => setExpanded((value) => !value)}
        title={snapshot.summary}
        type="button"
      >
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-surface text-primary">
          <ActivityStatusIcon running={running} status={status} />
        </span>
        <span className="min-w-0 flex-1 truncate">{snapshot.summary}</span>
        {running ? <MiniThinkingDots /> : null}
        <ChevronDown
          className={`shrink-0 text-muted-foreground transition-transform ${
            expanded ? "" : "-rotate-90"
          }`}
          size={13}
        />
      </button>
      {expanded ? (
        <div className="mt-2 flex flex-col gap-2 border-t border-border pt-2">
          {snapshot.thinking !== undefined ? (
            <div className="min-w-0">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-normal text-foreground-soft">
                Thinking
              </div>
              <p className="line-clamp-3 whitespace-pre-wrap break-words text-[11.5px] leading-5">
                {snapshot.thinking}
              </p>
            </div>
          ) : null}
          {snapshot.traces.length > 0 ? (
            <ol className="flex flex-col gap-1.5">
              {snapshot.traces.map((trace, index) => (
                <ActivityToolTraceRow index={index + 1} key={trace.toolCallId} trace={trace} />
              ))}
            </ol>
          ) : null}
          {snapshot.explicitToolTraces.length > 0 ? (
            <ol className="flex flex-col gap-1.5">
              {snapshot.explicitToolTraces.map((trace, index) => (
                <ExplicitToolTraceRow index={index + 1} key={trace.id} trace={trace} />
              ))}
            </ol>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ActivityStatusIcon({
  running,
  status,
}: {
  running: boolean;
  status?: AgentToolTrace["status"] | ExplicitToolTrace["status"];
}) {
  if (running) return <Loader2 className="animate-spin" size={12} />;
  if (status === "failed") return <ShieldAlert size={12} />;
  if (status === "completed") return <CheckCircle2 size={12} />;
  return <Sparkles size={12} />;
}

function MiniThinkingDots() {
  return (
    <span aria-hidden="true" className="clio-thinking-dots scale-[0.68]">
      {assistantThinkingDotIds.map((id) => (
        <span className="clio-thinking-dot" key={`activity-${id}`} />
      ))}
    </span>
  );
}

function ReplyActionChips({
  suggestions,
  onActivate,
}: {
  suggestions: ReplyActionSuggestion[];
  onActivate: (suggestion: ReplyActionSuggestion) => void;
}) {
  if (suggestions.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5" data-clio-reply-suggestions="true">
      {suggestions.map((suggestion) => (
        <button
          className="inline-flex h-7 min-w-0 items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-[11px] font-medium leading-4 text-foreground-soft outline-none transition-colors hover:border-border-strong hover:bg-surface-subtle hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary"
          key={suggestion.id}
          onClick={() => onActivate(suggestion)}
          title={suggestion.reason}
          type="button"
        >
          {replySuggestionIcon(suggestion.kind)}
          <span className="truncate">{suggestion.label}</span>
        </button>
      ))}
    </div>
  );
}

function replySuggestionIcon(kind: ReplyActionSuggestion["kind"]) {
  switch (kind) {
    case "web_search":
      return <Search size={12} />;
    case "search_knowledge":
    case "find_related":
      return <BookOpen size={12} />;
    case "summarize_current_page":
    case "ask_current_page":
      return <FileText size={12} />;
    case "translate_selection":
      return <MessageSquare size={12} />;
    case "save_to_memory":
      return <BookmarkPlus size={12} />;
    default:
      return null;
  }
}

function ActivityToolTraceRow({ trace, index }: { trace: AgentToolTrace; index: number }) {
  const summary = normalizeActivityText(trace.summary);
  return (
    <li
      className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1"
      data-clio-agent-tool-trace={trace.status}
    >
      <span className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-md bg-surface text-primary">
        <ActivityStatusIcon running={trace.status === "running"} status={trace.status} />
      </span>
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="shrink-0 text-[10.5px] text-muted-foreground">{index}.</span>
          <span className="min-w-0 truncate font-mono text-[11px] text-foreground-soft">
            {trace.toolName}
          </span>
          <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {formatToolTraceStatus(trace.status)}
          </span>
        </div>
        {summary === undefined ? null : (
          <div className="mt-1 line-clamp-2 break-words text-[11px] leading-4">{summary}</div>
        )}
      </div>
    </li>
  );
}

function ExplicitToolTraceRow({ trace, index }: { trace: ExplicitToolTrace; index: number }) {
  const summary = normalizeActivityText(trace.sourceSummary ?? trace.inputSummary);
  return (
    <li
      className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1"
      data-clio-explicit-tool-trace={trace.status}
    >
      <span className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-md bg-surface text-primary">
        <ActivityStatusIcon running={false} status={trace.status} />
      </span>
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="shrink-0 text-[10.5px] text-muted-foreground">{index}.</span>
          <span className="min-w-0 truncate font-mono text-[11px] text-foreground-soft">
            {explicitToolRouteLabel(trace.route)}
          </span>
          <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {formatExplicitToolTraceMeta(trace)}
          </span>
        </div>
        {summary === undefined ? null : (
          <div className="mt-1 line-clamp-2 break-words text-[11px] leading-4">{summary}</div>
        )}
      </div>
    </li>
  );
}

function SkillRequestMessage({ message }: { message: RailDialogueMessage }) {
  const request = message.skillRequest;
  if (request === undefined) return null;
  return (
    <div
      className="ml-auto max-w-[84%] rounded-lg bg-muted px-3.5 py-3 text-[13px] leading-5 text-foreground"
      data-clio-dialogue-role={message.role}
      data-clio-dialogue-status={message.status}
      data-clio-skill-request={request.skillId}
    >
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-surface text-primary">
          <Sparkles size={14} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold">{request.skillLabel}</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="rounded-md bg-surface px-2 py-0.5">{request.source}</span>
            {message.status === "queued" ? <span>Queued</span> : null}
          </div>
        </div>
      </div>
      {request.instruction === undefined ? null : (
        <p className="mt-2 line-clamp-3 text-[12px] leading-5 text-foreground-soft">
          {request.instruction}
        </p>
      )}
    </div>
  );
}

function renderAssistantPlaceholder(message: RailDialogueMessage) {
  if (message.role !== "assistant") return null;
  if (message.status === "streaming") return <AssistantThinkingIndicator />;
  if (message.status === "cancelled")
    return <span className="text-muted-foreground">Stopped.</span>;
  return null;
}

function AssistantThinkingIndicator() {
  return (
    <output
      aria-label="Thinking"
      className={assistantThinkingIndicatorClassName}
      data-clio-thinking-indicator="true"
    >
      <span aria-hidden="true" className="clio-thinking-dots">
        {assistantThinkingDotIds.map((id) => (
          <span className="clio-thinking-dot" key={id} />
        ))}
      </span>
    </output>
  );
}

function isRetryableMessage(message: RailDialogueMessage) {
  return isUnresolvedInterruptedAssistantMessage(message);
}

function RelatedMemoryCards({
  items,
  onOpenMemory,
}: {
  items: SearchMemoryItem[];
  onOpenMemory: (id: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div
      className="rounded-lg border border-border bg-surface px-3 py-2.5"
      data-clio-related-cards="true"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border bg-surface-subtle text-primary">
            <Sparkles size={14} />
          </span>
          <div className="min-w-0 text-[11px] font-medium text-muted-foreground">Related</div>
        </div>
        <span className="shrink-0 text-[11px] text-muted-foreground">{items.length} local</span>
      </div>
      <ul className="flex flex-col gap-1.5">
        {items.map((item) => (
          <li key={item.id}>
            <button
              className="group flex w-full min-w-0 flex-col gap-1.5 rounded-md border border-border bg-surface-subtle px-2.5 py-2 text-left outline-none transition-colors hover:border-border-strong hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary"
              onClick={() => onOpenMemory(item.id)}
              type="button"
            >
              <div className="flex min-w-0 items-start gap-2">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border bg-surface text-primary">
                  <FileText size={13} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-semibold leading-5 text-foreground">
                    {item.sourceTitle}
                  </span>
                  <span className="mt-0.5 flex min-w-0 flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className="max-w-[150px] truncate">{sourceHost(item.sourceUrl)}</span>
                    <span>{formatDate(item.capturedAt)}</span>
                  </span>
                </span>
                <Badge className="shrink-0 border-border bg-surface text-[10px] text-muted-foreground">
                  {item.sourceKind}
                </Badge>
              </div>
              <p className="line-clamp-2 pl-8 text-[12px] leading-5 text-muted-foreground">
                {item.snippet || item.excerpt}
              </p>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function WebSearchPanel(props: RailShellProps) {
  const [query, setQuery] = React.useState("");
  const [confirmClear, setConfirmClear] = React.useState(false);
  const result = props.webSearchState;
  const hasResult = result.running || result.answer.trim().length > 0 || result.error !== undefined;
  const canSubmit = query.trim().length > 0 && !result.running;

  React.useEffect(() => {
    if (!confirmClear) return;
    const timer = window.setTimeout(() => setConfirmClear(false), 4000);
    return () => window.clearTimeout(timer);
  }, [confirmClear]);

  const submitSearch = () => {
    if (!canSubmit) return;
    setConfirmClear(false);
    props.onSubmitWebSearch(query);
  };

  return (
    <div className="relative z-10 flex min-h-0 flex-1 flex-col" data-clio-panel="web-search">
      <div className="flex h-[62px] shrink-0 items-center gap-3 border-b border-border px-5">
        <IconButton label="Back to Agent Home" onClick={props.onBackToHome}>
          <ArrowLeft size={17} />
        </IconButton>
        <div className="min-w-0 leading-tight">
          <h3 className="truncate text-[20px] font-semibold leading-7">Search</h3>
          <p className="truncate text-[11px] text-muted-foreground">
            Standalone sourced web search
          </p>
        </div>
      </div>
      <div className="clio-scroll flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overflow-x-hidden px-6 py-4">
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            submitSearch();
          }}
        >
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-primary"
              size={15}
            />
            <Input
              aria-label="Search the web"
              className="h-11 rounded-lg border-border bg-surface-subtle pl-9 text-foreground placeholder:text-muted-foreground/70 focus-visible:ring-primary"
              disabled={result.running}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search the web"
              value={query}
            />
          </div>
          <Button
            className="h-11 shrink-0 bg-primary px-4 text-primary-foreground hover:bg-primary-hover"
            disabled={!canSubmit}
            type="submit"
          >
            {result.running ? <Loader2 className="animate-spin" size={15} /> : <Search size={15} />}
            Search
          </Button>
        </form>

        {hasResult ? (
          <WebSearchResultView
            onOpenSettings={props.onOpenSettings}
            onOpenSource={props.onOpenWebSearchSource}
            state={result}
          />
        ) : null}

        <section className="flex min-h-0 flex-col gap-2">
          <div className="flex items-center justify-between gap-2 px-1">
            <h4 className="text-[12px] font-medium text-muted-foreground">Recent searches</h4>
            {props.webSearchHistory.length === 0 ? null : (
              <Button
                className="h-7 border border-border bg-surface px-2 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => {
                  if (!confirmClear) {
                    setConfirmClear(true);
                    return;
                  }
                  setConfirmClear(false);
                  props.onClearWebSearchHistory();
                }}
                size="sm"
                type="button"
                variant="ghost"
              >
                <Trash2 size={12} />
                {confirmClear ? "Confirm clear" : "Clear"}
              </Button>
            )}
          </div>
          {props.webSearchHistory.length === 0 ? (
            <div className="rounded-lg border border-border bg-surface px-4 py-8 text-center">
              <span className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-md border border-border bg-surface-subtle text-primary">
                <Search size={20} />
              </span>
              <h3 className="text-sm font-semibold">No search history yet</h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Completed searches will appear here.
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {props.webSearchHistory.map((record) => (
                <WebSearchHistoryRow
                  key={record.id}
                  onDelete={props.onDeleteWebSearchHistory}
                  onOpen={props.onOpenWebSearchHistory}
                  record={record}
                />
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function ImageGenPanel(props: RailShellProps) {
  const [mode, setMode] = React.useState<ClioImageGenerationMode>("generate");
  const [prompt, setPrompt] = React.useState("");
  const [referenceInput, setReferenceInput] = React.useState<ClioImageInput | undefined>();
  const [referencePreview, setReferencePreview] = React.useState<string | undefined>();
  const [referenceText, setReferenceText] = React.useState("");
  const [localMessage, setLocalMessage] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const state = props.imageGenerationState;
  const effectiveModel =
    props.imageGenerationSettings?.model?.trim() || defaultImageGenerationModel;
  const effectiveSize = props.imageGenerationSettings?.size ?? defaultImageGenerationSize;
  const canGenerate =
    !state.running &&
    prompt.trim().length > 0 &&
    (mode === "generate" || referenceInput !== undefined);

  React.useEffect(() => {
    if (props.state.imagePromptPrefill === undefined) return;
    setPrompt(props.state.imagePromptPrefill.content);
    props.onImagePromptPrefillConsumed();
  }, [props.state.imagePromptPrefill, props.onImagePromptPrefillConsumed]);

  const setReference = (input: ClioImageInput, preview?: string) => {
    setReferenceInput(input);
    setReferencePreview(preview ?? input.value);
    setMode("edit");
    setLocalMessage(null);
  };

  const submit = () => {
    if (!canGenerate) {
      setLocalMessage(
        mode === "edit" && referenceInput === undefined
          ? "Add a reference image first."
          : "Enter an image prompt first.",
      );
      return;
    }
    setLocalMessage(null);
    props.onSubmitImageGeneration({
      mode,
      prompt: prompt.trim(),
      ...(mode === "edit" && referenceInput !== undefined ? { input: referenceInput } : {}),
    });
  };

  const addTextReference = () => {
    const parsed = imageInputFromText(referenceText);
    if (parsed === undefined) {
      setLocalMessage("Use an image URL, data URL, or base64 image. Local file paths do not work.");
      return;
    }
    setReference(
      parsed,
      parsed.kind === "url" || parsed.kind === "data_url" ? parsed.value : undefined,
    );
    setReferenceText("");
  };

  const handleFiles = (files: FileList | File[]) => {
    const file = Array.from(files).find((item) => item.type.startsWith("image/"));
    if (file === undefined) {
      setLocalMessage("Choose an image file.");
      return;
    }
    void fileToImageInput(file)
      .then((input) => setReference(input, input.value))
      .catch(() => setLocalMessage("Could not read that image file."));
  };

  const useResultAsReference = (result: ClioImageGenerationResult) => {
    setReference(
      {
        kind: "data_url",
        value: result.output.dataUrl,
        mimeType: result.output.mimeType,
        name: "generated.png",
      },
      result.output.dataUrl,
    );
  };

  return (
    <div
      className="relative z-10 flex min-h-0 flex-1 flex-col"
      data-clio-panel="image-gen"
      onDrop={(event) => {
        event.preventDefault();
        if (event.dataTransfer.files.length > 0) {
          handleFiles(event.dataTransfer.files);
          return;
        }
        const text = event.dataTransfer.getData("text/plain");
        if (text.trim().length > 0) {
          const parsed = imageInputFromText(text);
          if (parsed !== undefined) setReference(parsed, parsed.value);
        }
      }}
      onDragOver={(event) => event.preventDefault()}
      onPaste={(event) => {
        const file = Array.from(event.clipboardData.files).find((item) =>
          item.type.startsWith("image/"),
        );
        if (file !== undefined) {
          handleFiles([file]);
          return;
        }
        const text = event.clipboardData.getData("text/plain");
        if (text.trim().length === 0) return;
        const parsed = imageInputFromText(text);
        if (parsed !== undefined) {
          setReference(parsed, parsed.kind === "base64" ? undefined : parsed.value);
        }
      }}
    >
      <div className="flex h-[62px] shrink-0 items-center justify-between gap-3 border-b border-border px-5">
        <div className="flex min-w-0 items-center gap-3">
          <IconButton label="Back to Agent Home" onClick={props.onBackToHome}>
            <ArrowLeft size={17} />
          </IconButton>
          <div className="min-w-0 leading-tight">
            <h3 className="truncate text-[20px] font-semibold leading-7">Image Gen</h3>
            <p className="truncate text-[11px] text-muted-foreground">
              Text-to-image and image editing
            </p>
          </div>
        </div>
        <IconButton label="Image Gen settings" onClick={props.onOpenSettings}>
          <Settings size={16} />
        </IconButton>
      </div>

      <div className="clio-scroll flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overflow-x-hidden px-6 py-4">
        <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-1">
          <button
            className={`h-9 rounded-md text-[12px] font-medium transition-colors ${
              mode === "generate"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
            disabled={state.running}
            onClick={() => setMode("generate")}
            type="button"
          >
            Text to image
          </button>
          <button
            className={`h-9 rounded-md text-[12px] font-medium transition-colors ${
              mode === "edit"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
            disabled={state.running}
            onClick={() => setMode("edit")}
            type="button"
          >
            Image to image
          </button>
        </div>

        <section className="rounded-xl border border-border bg-surface p-4">
          <label className="text-[12px] font-medium text-foreground" htmlFor="clio-image-prompt">
            Prompt
          </label>
          <textarea
            className="mt-2 min-h-[118px] w-full resize-none rounded-lg border border-border bg-background px-3 py-2.5 text-[13px] leading-5 text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
            disabled={state.running}
            id="clio-image-prompt"
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Describe the image you want"
            value={prompt}
          />
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <Badge className="border-border bg-muted text-foreground-soft">{effectiveModel}</Badge>
            <Badge className="border-border bg-muted text-foreground-soft">{effectiveSize}</Badge>
            <span>Base URL and key can inherit the main model settings.</span>
          </div>
        </section>

        {mode === "edit" ? (
          <section className="rounded-xl border border-border bg-surface p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h4 className="text-sm font-semibold">Reference image</h4>
                <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                  Upload, drag, paste, or add an image URL.
                </p>
              </div>
              {referenceInput === undefined ? null : (
                <Button
                  className="h-8 border border-border bg-surface px-2 text-[11px]"
                  disabled={state.running}
                  onClick={() => {
                    setReferenceInput(undefined);
                    setReferencePreview(undefined);
                  }}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  <X size={12} />
                  Clear
                </Button>
              )}
            </div>
            <div className="flex min-h-[142px] flex-col items-center justify-center rounded-lg border border-dashed border-border bg-background px-4 py-5 text-center">
              {referencePreview === undefined ? (
                <>
                  <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-md bg-muted text-primary">
                    <Upload size={18} />
                  </span>
                  <p className="text-sm font-medium">Drop or paste an image here</p>
                  <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                    Local path strings like C:\image.png cannot be read by the browser.
                  </p>
                </>
              ) : (
                <img
                  alt="Reference preview"
                  className="max-h-[220px] max-w-full rounded-lg border border-border object-contain"
                  src={referencePreview}
                />
              )}
            </div>
            <div className="mt-3 flex gap-2">
              <input
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                  if (event.target.files !== null) handleFiles(event.target.files);
                  event.target.value = "";
                }}
                ref={fileInputRef}
                type="file"
              />
              <Button
                className="h-9 border border-border bg-surface text-foreground hover:bg-muted"
                disabled={state.running}
                onClick={() => fileInputRef.current?.click()}
                size="sm"
                type="button"
                variant="ghost"
              >
                <Upload size={14} />
                Upload
              </Button>
              <div className="flex min-w-0 flex-1 gap-2">
                <Input
                  className="h-9 min-w-0 rounded-lg border-border bg-background text-foreground placeholder:text-muted-foreground/70 focus-visible:ring-primary"
                  disabled={state.running}
                  onChange={(event) => setReferenceText(event.target.value)}
                  placeholder="Image URL or data URL"
                  value={referenceText}
                />
                <Button
                  className="h-9 shrink-0 border border-border bg-surface px-3 text-foreground hover:bg-muted"
                  disabled={state.running || referenceText.trim().length === 0}
                  onClick={addTextReference}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  <Plus size={14} />
                  Add
                </Button>
              </div>
            </div>
          </section>
        ) : null}

        {localMessage === null ? null : (
          <div className="rounded-lg border border-warning-border bg-warning-background px-3 py-2 text-xs leading-5 text-warning-foreground">
            {localMessage}
          </div>
        )}

        <div className="flex gap-2">
          <Button
            className="h-11 flex-1 bg-primary text-primary-foreground hover:bg-primary-hover"
            disabled={!canGenerate}
            onClick={submit}
            type="button"
          >
            {state.running ? (
              <Loader2 className="animate-spin" size={15} />
            ) : (
              <Sparkles size={15} />
            )}
            Generate
          </Button>
          {state.running ? (
            <Button
              className="h-11 border border-border bg-surface px-4 text-foreground hover:bg-muted"
              onClick={props.onCancelImageGeneration}
              type="button"
              variant="ghost"
            >
              <Square size={14} />
              Cancel
            </Button>
          ) : null}
        </div>

        <ImageGenerationResultView
          onOpenSettings={props.onOpenSettings}
          onUseAsReference={useResultAsReference}
          state={state}
        />

        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between px-1">
            <h4 className="text-[12px] font-medium text-muted-foreground">Recent images</h4>
            <span className="text-[11px] text-muted-foreground">
              {props.imageGenerationHistory.length}/20
            </span>
          </div>
          {props.imageGenerationHistory.length === 0 ? (
            <div className="rounded-lg border border-border bg-surface px-4 py-8 text-center">
              <span className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-md border border-border bg-surface-subtle text-primary">
                <ImageIcon size={20} />
              </span>
              <h3 className="text-sm font-semibold">No generated images yet</h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Successful generations will appear here.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {props.imageGenerationHistory.map((record) => (
                <ImageGenerationHistoryCard
                  key={record.id}
                  onDelete={props.onDeleteImageGenerationHistory}
                  onUseAsReference={(item) =>
                    useResultAsReference({
                      ...item,
                      runId: item.id,
                      completedAt: item.createdAt,
                    })
                  }
                  record={record}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function ImageGenerationResultView({
  onOpenSettings,
  onUseAsReference,
  state,
}: {
  onOpenSettings: () => void;
  onUseAsReference: (result: ClioImageGenerationResult) => void;
  state: ImageGenerationDisplayState;
}) {
  const [message, setMessage] = React.useState<string | null>(null);
  const showSettingsAction =
    state.error !== undefined && isImageGenerationConfigurationError(state.error.code);
  const result = state.result;

  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h4 className="truncate text-sm font-semibold">
            {state.prompt.trim().length > 0 ? state.prompt : "Current image"}
          </h4>
          <p className="mt-1 truncate text-[11px] text-muted-foreground">
            {state.provider ?? "Image Gen"}
            {state.model === undefined ? "" : ` - ${state.model}`}
            {state.size === undefined ? "" : ` - ${state.size}`}
          </p>
        </div>
        {state.running ? (
          <span className="inline-flex h-7 items-center gap-1.5 rounded-md bg-muted px-2.5 text-[11px] text-primary">
            <Loader2 className="animate-spin" size={13} />
            Generating
            <span className="inline-flex w-5 justify-start">
              <span className="animate-pulse">...</span>
            </span>
          </span>
        ) : null}
      </div>

      {state.running ? (
        <div className="flex min-h-[220px] flex-col items-center justify-center overflow-hidden rounded-lg border border-border bg-background">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-primary">
            <Sparkles className="animate-pulse" size={24} />
          </div>
          <p className="mt-3 text-sm font-medium">Generating image</p>
          <p className="mt-1 text-[11px] text-muted-foreground">Waiting for the Image2 response.</p>
        </div>
      ) : state.error !== undefined ? (
        <div className="rounded-lg border border-warning-border bg-warning-background px-3 py-2 text-xs leading-5 text-warning-foreground">
          <div className="flex items-start gap-2">
            <ShieldAlert className="mt-0.5 shrink-0" size={15} />
            <div className="min-w-0 flex-1">
              <p className="font-medium">{state.error.message}</p>
              {state.error.detail === undefined ? null : (
                <p className="mt-1 line-clamp-2 text-warning-foreground/80">{state.error.detail}</p>
              )}
            </div>
            {showSettingsAction ? (
              <Button
                className="h-8 shrink-0 border border-warning-border bg-surface px-2 text-[11px]"
                onClick={onOpenSettings}
                size="sm"
                type="button"
                variant="subtle"
              >
                Settings
              </Button>
            ) : null}
          </div>
        </div>
      ) : result === undefined ? (
        <div className="flex min-h-[180px] flex-col items-center justify-center rounded-lg border border-border bg-background px-4 text-center">
          <ImageIcon className="mb-3 text-muted-foreground" size={24} />
          <h3 className="text-sm font-semibold">No current image</h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Enter a prompt and generate an image.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="overflow-hidden rounded-lg border border-border bg-background">
            <img
              alt={result.prompt}
              className="max-h-[420px] w-full object-contain"
              src={result.output.dataUrl}
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Button
              className="border border-border bg-surface text-foreground hover:bg-muted"
              onClick={() => {
                void copyImageToClipboard(result.output.dataUrl)
                  .then(() => setMessage("Image copied."))
                  .catch(() => setMessage("Copy is unavailable in this page context."));
              }}
              size="sm"
              type="button"
              variant="subtle"
            >
              <Copy size={14} />
              Copy
            </Button>
            <Button
              className="border border-border bg-surface text-foreground hover:bg-muted"
              onClick={() => downloadImageDataUrl(result.output.dataUrl, result.prompt)}
              size="sm"
              type="button"
              variant="subtle"
            >
              <Download size={14} />
              Download
            </Button>
            <Button
              className="border border-border bg-surface text-foreground hover:bg-muted"
              onClick={() => onUseAsReference(result)}
              size="sm"
              type="button"
              variant="subtle"
            >
              <ImageIcon size={14} />
              Use
            </Button>
          </div>
          {message === null ? null : (
            <p className="text-[11px] leading-4 text-muted-foreground">{message}</p>
          )}
        </div>
      )}
    </section>
  );
}

function ImageGenerationHistoryCard({
  onDelete,
  onUseAsReference,
  record,
}: {
  onDelete: (id: string) => void;
  onUseAsReference: (record: ImageGenerationHistoryRecord) => void;
  record: ImageGenerationHistoryRecord;
}) {
  return (
    <article className="group overflow-hidden rounded-lg border border-border bg-surface transition-colors hover:border-border-strong">
      <button
        className="block w-full bg-background outline-none focus-visible:ring-2 focus-visible:ring-primary"
        onClick={() => onUseAsReference(record)}
        title="Use as reference"
        type="button"
      >
        <img
          alt={record.prompt}
          className="aspect-square w-full object-cover"
          src={record.output.dataUrl}
        />
      </button>
      <div className="p-2.5">
        <p className="line-clamp-2 min-h-8 text-[12px] font-medium leading-4 text-foreground">
          {record.prompt}
        </p>
        <p className="mt-1 truncate text-[10.5px] text-muted-foreground">
          {formatDate(record.createdAt)} - {record.size}
        </p>
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          <button
            aria-label="Copy generated image"
            className="flex h-7 items-center justify-center rounded-md border border-border bg-background text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary"
            onClick={() => void copyImageToClipboard(record.output.dataUrl).catch(() => undefined)}
            type="button"
          >
            <Copy size={12} />
          </button>
          <button
            aria-label="Download generated image"
            className="flex h-7 items-center justify-center rounded-md border border-border bg-background text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary"
            onClick={() => downloadImageDataUrl(record.output.dataUrl, record.prompt)}
            type="button"
          >
            <Download size={12} />
          </button>
          <button
            aria-label="Delete generated image"
            className="flex h-7 items-center justify-center rounded-md border border-border bg-background text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary"
            onClick={() => onDelete(record.id)}
            type="button"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
    </article>
  );
}

function imageInputFromText(text: string): ClioImageInput | undefined {
  const value = text.trim();
  if (value.length === 0 || looksLikeLocalPath(value)) return undefined;
  const dataUrlMatch = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([a-zA-Z0-9+/=\s]+)$/s.exec(value);
  if (dataUrlMatch !== null) {
    const mimeType = dataUrlMatch[1] ?? "image/png";
    return {
      kind: "data_url",
      value,
      mimeType,
      name: imageNameFromMime(mimeType),
    };
  }
  if (isHttpImageUrl(value)) {
    return { kind: "url", value };
  }
  if (looksLikeBase64Image(value)) {
    return {
      kind: "base64",
      value: value.replace(/\s+/g, ""),
      mimeType: detectMimeFromBase64(value),
      name: imageNameFromMime(detectMimeFromBase64(value) ?? "image/png"),
    };
  }
  return undefined;
}

function fileToImageInput(file: File): Promise<ClioImageInput> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Image file did not produce a data URL."));
        return;
      }
      resolve({
        kind: "data_url",
        value: reader.result,
        mimeType: file.type || "image/png",
        name: file.name,
      });
    });
    reader.addEventListener("error", () => reject(reader.error ?? new Error("File read failed.")));
    reader.readAsDataURL(file);
  });
}

async function copyImageToClipboard(dataUrl: string) {
  const clipboardItem = globalThis.ClipboardItem;
  if (clipboardItem === undefined || navigator.clipboard?.write === undefined) {
    throw new Error("Clipboard image writing is unavailable.");
  }
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  await navigator.clipboard.write([new clipboardItem({ [blob.type || "image/png"]: blob })]);
}

function downloadImageDataUrl(dataUrl: string, prompt: string) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = `${slugForFilename(prompt) || "clio-image"}.png`;
  document.body.append(link);
  link.click();
  link.remove();
}

function looksLikeLocalPath(value: string) {
  return /^[a-zA-Z]:[\\/]/.test(value) || value.startsWith("\\\\") || value.startsWith("file:");
}

function isHttpImageUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function looksLikeBase64Image(value: string) {
  const cleaned = value.replace(/\s+/g, "");
  return cleaned.length > 64 && /^[a-zA-Z0-9+/]+={0,2}$/.test(cleaned);
}

function detectMimeFromBase64(value: string) {
  const cleaned = value.replace(/\s+/g, "");
  if (cleaned.startsWith("iVBORw0KGgo")) return "image/png";
  if (cleaned.startsWith("/9j/")) return "image/jpeg";
  if (cleaned.startsWith("UklGR")) return "image/webp";
  if (cleaned.startsWith("R0lGOD")) return "image/gif";
  return undefined;
}

function imageNameFromMime(mimeType: string) {
  const extension = mimeType.includes("jpeg")
    ? "jpg"
    : mimeType.includes("webp")
      ? "webp"
      : mimeType.includes("gif")
        ? "gif"
        : "png";
  return `image.${extension}`;
}

function slugForFilename(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function isImageGenerationConfigurationError(code: string) {
  return (
    code === "IMAGE_PROVIDER_CONFIG_REQUIRED" ||
    code === "PROVIDER_PERMISSION_REQUIRED" ||
    code === "PROVIDER_AUTH_ERROR"
  );
}

function WebSearchResultView({
  onOpenSettings,
  onOpenSource,
  state,
}: {
  onOpenSettings: () => void;
  onOpenSource: (url: string) => void;
  state: WebSearchDisplayState;
}) {
  const showSettingsAction =
    state.error !== undefined && isSearchConfigurationError(state.error.code);
  return (
    <section
      className="rounded-xl border border-border bg-surface p-4"
      data-clio-web-search-result="true"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h4 className="truncate text-sm font-semibold">
            {state.query.length > 0 ? state.query : "Search result"}
          </h4>
          <p className="mt-1 truncate text-[11px] text-muted-foreground">
            {state.provider ?? "Search"}{" "}
            {state.createdAt === undefined ? "" : `- ${formatDate(state.createdAt)}`}
          </p>
        </div>
        {state.running ? (
          <span className="inline-flex h-7 items-center gap-1.5 rounded-md bg-muted px-2.5 text-[11px] text-primary">
            <Loader2 className="animate-spin" size={13} />
            Searching
            <span className="inline-flex w-5 justify-start">
              <span className="animate-pulse">...</span>
            </span>
          </span>
        ) : null}
      </div>

      {state.error === undefined ? (
        <>
          <div className="whitespace-pre-wrap text-[13px] leading-6 text-foreground">
            {state.answer.trim().length > 0
              ? state.answer
              : state.running
                ? "Searching..."
                : "No answer returned."}
          </div>
          {state.running ? (
            <p className="mt-3 text-[11px] text-muted-foreground">Finding sources...</p>
          ) : (
            <WebSearchSources sources={state.sources} onOpenSource={onOpenSource} />
          )}
        </>
      ) : (
        <div className="rounded-lg border border-warning-border bg-warning-background px-3 py-2 text-xs leading-5 text-warning-foreground">
          <div className="flex items-start gap-2">
            <ShieldAlert className="mt-0.5 shrink-0" size={15} />
            <div className="min-w-0 flex-1">
              <p className="font-medium">{state.error.message}</p>
              {state.error.detail === undefined ? null : (
                <p className="mt-1 line-clamp-2 text-warning-foreground/80">{state.error.detail}</p>
              )}
            </div>
            {showSettingsAction ? (
              <Button
                className="h-8 shrink-0 border border-warning-border bg-surface px-2 text-[11px]"
                onClick={onOpenSettings}
                size="sm"
                type="button"
                variant="subtle"
              >
                Settings
              </Button>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}

function WebSearchSources({
  onOpenSource,
  sources,
}: {
  onOpenSource: (url: string) => void;
  sources: ClioWebSearchResult["sources"];
}) {
  if (sources.length === 0) {
    return <p className="mt-3 text-[11px] text-muted-foreground">No sources returned.</p>;
  }
  return (
    <div className="mt-4">
      <h5 className="mb-2 text-[12px] font-medium text-muted-foreground">Sources</h5>
      <ul className="flex flex-col gap-2">
        {sources.map((source, index) => (
          <li key={`${source.id}:${source.url}`}>
            <button
              className="flex w-full min-w-0 items-start gap-2 rounded-lg border border-border bg-background px-3 py-2 text-left outline-none transition-colors hover:border-border-strong hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary"
              onClick={() => onOpenSource(source.url)}
              type="button"
            >
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-[11px] font-semibold text-primary">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate text-[12.5px] font-semibold text-foreground">
                    {source.title}
                  </span>
                  <ExternalLink className="shrink-0 text-muted-foreground" size={12} />
                </span>
                <span className="mt-0.5 block truncate text-[11px] text-primary">
                  {source.domain || sourceHost(source.url)}
                </span>
                {source.snippet.length === 0 ? null : (
                  <span className="mt-1 line-clamp-2 text-[12px] leading-5 text-muted-foreground">
                    {source.snippet}
                  </span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function WebSearchHistoryRow({
  onDelete,
  onOpen,
  record,
}: {
  onDelete: (id: string) => void;
  onOpen: (record: WebSearchHistoryRecord) => void;
  record: WebSearchHistoryRecord;
}) {
  return (
    <li>
      <div className="group flex w-full min-w-0 items-center gap-1.5 rounded-lg border border-border bg-surface p-1.5 transition-colors hover:border-border-strong hover:bg-muted">
        <button
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-primary"
          onClick={() => onOpen(record)}
          type="button"
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-primary">
            <Search size={14} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12.5px] font-semibold text-foreground">
              {record.query}
            </span>
            <span className="mt-0.5 flex min-w-0 flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
              <span>{formatDate(record.createdAt)}</span>
              <span>{record.sources.length} sources</span>
              <span>{record.provider}</span>
            </span>
          </span>
        </button>
        <button
          aria-label="Delete search history entry"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-70 outline-none transition-colors hover:bg-surface-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary group-hover:opacity-100"
          onClick={() => onDelete(record.id)}
          type="button"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </li>
  );
}

function isSearchConfigurationError(code: string) {
  return (
    code === "SEARCH_PROVIDER_CONFIG_REQUIRED" ||
    code === "PROVIDER_PERMISSION_REQUIRED" ||
    code === "PROVIDER_AUTH_ERROR"
  );
}

function SettingsPanel(props: RailShellProps) {
  const [geminiApiKey, setGeminiApiKey] = React.useState("");
  const [geminiModel, setGeminiModel] = React.useState(defaultGeminiModel);
  const [openAIApiKey, setOpenAIApiKey] = React.useState("");
  const [openAIModel, setOpenAIModel] = React.useState(defaultOpenAIModel);
  const [openAIBaseUrl, setOpenAIBaseUrl] = React.useState(defaultOpenAIBaseUrl);
  const [openAICompatibleApiKey, setOpenAICompatibleApiKey] = React.useState("");
  const [openAICompatibleModel, setOpenAICompatibleModel] = React.useState(
    defaultOpenAICompatibleModel,
  );
  const [openAICompatibleBaseUrl, setOpenAICompatibleBaseUrl] = React.useState(
    defaultOpenAICompatibleBaseUrl,
  );
  const [openAICompatibleProviderName, setOpenAICompatibleProviderName] = React.useState(
    defaultOpenAICompatibleProviderName,
  );
  const [searchProvider, setSearchProvider] = React.useState<SearchProviderId>("auto");
  const [searchOpenAIApiKey, setSearchOpenAIApiKey] = React.useState("");
  const [searchOpenAIModel, setSearchOpenAIModel] = React.useState("");
  const [searchOpenAIBaseUrl, setSearchOpenAIBaseUrl] = React.useState("");
  const [searchOpenAICompatibleApiKey, setSearchOpenAICompatibleApiKey] = React.useState("");
  const [searchOpenAICompatibleModel, setSearchOpenAICompatibleModel] = React.useState("");
  const [searchOpenAICompatibleBaseUrl, setSearchOpenAICompatibleBaseUrl] = React.useState("");
  const [imageGenerationApiKey, setImageGenerationApiKey] = React.useState("");
  const [imageGenerationModel, setImageGenerationModel] = React.useState("");
  const [imageGenerationBaseUrl, setImageGenerationBaseUrl] = React.useState("");
  const [imageGenerationSize, setImageGenerationSize] = React.useState<
    ImageGenerationSettings["size"]
  >(defaultImageGenerationSize);

  React.useEffect(() => {
    if (props.providerSettings === null) return;
    setGeminiApiKey(props.providerSettings.gemini.apiKey ?? "");
    setGeminiModel(props.providerSettings.gemini.model);
    setOpenAIApiKey(props.providerSettings.openai.apiKey ?? "");
    setOpenAIModel(props.providerSettings.openai.model);
    setOpenAIBaseUrl(props.providerSettings.openai.baseUrl);
    setOpenAICompatibleApiKey(props.providerSettings.openaiCompatible.apiKey ?? "");
    setOpenAICompatibleModel(props.providerSettings.openaiCompatible.model);
    setOpenAICompatibleBaseUrl(props.providerSettings.openaiCompatible.baseUrl);
    setOpenAICompatibleProviderName(props.providerSettings.openaiCompatible.providerName);
  }, [props.providerSettings]);

  React.useEffect(() => {
    if (props.searchProviderSettings === null) return;
    setSearchProvider(props.searchProviderSettings.provider);
    setSearchOpenAIApiKey(props.searchProviderSettings.openai.apiKey ?? "");
    setSearchOpenAIModel(props.searchProviderSettings.openai.model ?? "");
    setSearchOpenAIBaseUrl(props.searchProviderSettings.openai.baseUrl ?? "");
    setSearchOpenAICompatibleApiKey(props.searchProviderSettings.openaiCompatible.apiKey ?? "");
    setSearchOpenAICompatibleModel(props.searchProviderSettings.openaiCompatible.model ?? "");
    setSearchOpenAICompatibleBaseUrl(props.searchProviderSettings.openaiCompatible.baseUrl ?? "");
  }, [props.searchProviderSettings]);

  React.useEffect(() => {
    if (props.imageGenerationSettings === null) return;
    setImageGenerationApiKey(props.imageGenerationSettings.apiKey ?? "");
    setImageGenerationModel(props.imageGenerationSettings.model ?? "");
    setImageGenerationBaseUrl(props.imageGenerationSettings.baseUrl ?? "");
    setImageGenerationSize(props.imageGenerationSettings.size);
  }, [props.imageGenerationSettings]);

  const activeProvider = props.providerSettings?.activeProvider ?? defaultActiveProvider;
  const providerSelectDisabled = props.providerLoading || props.providerSettings === null;

  return (
    <div className="relative z-10 flex min-h-0 flex-1 flex-col" data-clio-panel="settings">
      <div className="flex h-[62px] shrink-0 items-center justify-between gap-3 border-b border-border bg-background px-5">
        <div className="flex min-w-0 items-center gap-3">
          <IconButton label="Back to Agent Home" onClick={props.onBackToHome}>
            <ArrowLeft size={17} />
          </IconButton>
          <div className="min-w-0 leading-tight">
            <h3 className="truncate text-[20px] font-semibold leading-7">Settings</h3>
            <p className="truncate text-[11px] text-muted-foreground">
              Model and system preferences
            </p>
          </div>
        </div>
        <IconButton label="Refresh providers" onClick={() => void props.onRefreshProvider()}>
          <RefreshCw className={props.providerLoading ? "animate-spin" : ""} size={16} />
        </IconButton>
      </div>
      <div className="clio-scroll flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overflow-x-hidden px-6 py-4">
        <SettingsSectionMenu />

        <AppearanceSettingsCard theme={props.railTheme} onThemeChange={props.onThemeChange} />

        <ImageGenerationSettingsCard
          apiKey={imageGenerationApiKey}
          baseUrl={imageGenerationBaseUrl}
          loading={props.providerLoading}
          model={imageGenerationModel}
          onApiKeyChange={setImageGenerationApiKey}
          onBaseUrlChange={setImageGenerationBaseUrl}
          onModelChange={setImageGenerationModel}
          onSave={() =>
            props.onSaveImageGenerationSettings({
              apiKey: imageGenerationApiKey,
              model: imageGenerationModel,
              baseUrl: imageGenerationBaseUrl,
              size: imageGenerationSize,
            })
          }
          onSizeChange={setImageGenerationSize}
          settings={props.imageGenerationSettings}
          size={imageGenerationSize}
        />

        <SearchProviderSettingsCard
          apiKey={searchOpenAIApiKey}
          baseUrl={searchOpenAIBaseUrl}
          compatibleApiKey={searchOpenAICompatibleApiKey}
          compatibleBaseUrl={searchOpenAICompatibleBaseUrl}
          compatibleModel={searchOpenAICompatibleModel}
          loading={props.providerLoading}
          model={searchOpenAIModel}
          onApiKeyChange={setSearchOpenAIApiKey}
          onBaseUrlChange={setSearchOpenAIBaseUrl}
          onCompatibleApiKeyChange={setSearchOpenAICompatibleApiKey}
          onCompatibleBaseUrlChange={setSearchOpenAICompatibleBaseUrl}
          onCompatibleModelChange={setSearchOpenAICompatibleModel}
          onModelChange={setSearchOpenAIModel}
          onProviderChange={setSearchProvider}
          onSave={() =>
            props.onSaveSearchProvider({
              provider: searchProvider,
              openai: {
                apiKey: searchOpenAIApiKey,
                model: searchOpenAIModel,
                baseUrl: searchOpenAIBaseUrl,
              },
              openaiCompatible: {
                apiKey: searchOpenAICompatibleApiKey,
                model: searchOpenAICompatibleModel,
                baseUrl: searchOpenAICompatibleBaseUrl,
              },
            })
          }
          provider={searchProvider}
          settings={props.searchProviderSettings}
        />

        <section
          className="rounded-xl border border-border bg-surface p-4"
          data-clio-settings-section="model"
        >
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-2.5">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-primary">
                <KeyRound size={16} />
              </span>
              <div className="min-w-0 leading-tight">
                <h4 className="truncate text-sm font-semibold">Large model</h4>
                <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                  {props.providerSettings === null
                    ? "Checking provider setup"
                    : `${providerLabel(activeProvider)} is used for chat generation`}
                </p>
              </div>
            </div>
            <Badge className="shrink-0 border-border bg-muted text-foreground-soft">
              {props.providerSettings === null ? "checking" : providerLabel(activeProvider)}
            </Badge>
          </div>

          <div className="mb-4 grid gap-1.5 text-[12px]">
            <label className="font-medium text-foreground" htmlFor="clio-rail-active-provider">
              Provider
            </label>
            <select
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-45"
              data-clio-provider-select="true"
              disabled={providerSelectDisabled}
              id="clio-rail-active-provider"
              onChange={(event) => void props.onSelectProvider(event.target.value as ProviderId)}
              value={activeProvider}
            >
              <option value="gemini">Gemini</option>
              <option value="openai">OpenAI</option>
              <option value="openai-compatible">OpenAI Compatible</option>
            </select>
          </div>

          {activeProvider === "openai" ? (
            <ProviderSettingsCard
              apiKey={openAIApiKey}
              baseUrl={openAIBaseUrl}
              defaultBaseUrl={defaultOpenAIBaseUrl}
              defaultModel={defaultOpenAIModel}
              label="OpenAI"
              loading={props.providerLoading}
              model={openAIModel}
              onApiKeyChange={setOpenAIApiKey}
              onBaseUrlChange={setOpenAIBaseUrl}
              onModelChange={setOpenAIModel}
              onSave={() =>
                props.onSaveOpenAIProvider({
                  apiKey: openAIApiKey,
                  model: openAIModel,
                  baseUrl: openAIBaseUrl,
                })
              }
              onTest={() =>
                props.onTestOpenAIProvider({
                  apiKey: openAIApiKey,
                  model: openAIModel,
                  baseUrl: openAIBaseUrl,
                })
              }
              provider="openai"
              settings={props.providerSettings?.openai}
            />
          ) : activeProvider === "openai-compatible" ? (
            <ProviderSettingsCard
              apiKey={openAICompatibleApiKey}
              baseUrl={openAICompatibleBaseUrl}
              defaultBaseUrl={defaultOpenAICompatibleBaseUrl}
              defaultModel={defaultOpenAICompatibleModel}
              label="OpenAI Compatible"
              loading={props.providerLoading}
              model={openAICompatibleModel}
              onApiKeyChange={setOpenAICompatibleApiKey}
              onBaseUrlChange={setOpenAICompatibleBaseUrl}
              onModelChange={setOpenAICompatibleModel}
              onProviderNameChange={setOpenAICompatibleProviderName}
              onSave={() =>
                props.onSaveOpenAICompatibleProvider({
                  apiKey: openAICompatibleApiKey,
                  model: openAICompatibleModel,
                  baseUrl: openAICompatibleBaseUrl,
                  providerName: openAICompatibleProviderName,
                })
              }
              onTest={() =>
                props.onTestOpenAICompatibleProvider({
                  apiKey: openAICompatibleApiKey,
                  model: openAICompatibleModel,
                  baseUrl: openAICompatibleBaseUrl,
                  providerName: openAICompatibleProviderName,
                })
              }
              provider="openai-compatible"
              providerName={openAICompatibleProviderName}
              settings={props.providerSettings?.openaiCompatible}
            />
          ) : (
            <ProviderSettingsCard
              apiKey={geminiApiKey}
              defaultModel={defaultGeminiModel}
              label="Gemini"
              loading={props.providerLoading}
              model={geminiModel}
              onApiKeyChange={setGeminiApiKey}
              onModelChange={setGeminiModel}
              onSave={() =>
                props.onSaveGeminiProvider({ apiKey: geminiApiKey, model: geminiModel })
              }
              onTest={() =>
                props.onTestGeminiProvider({ apiKey: geminiApiKey, model: geminiModel })
              }
              provider="gemini"
              settings={props.providerSettings?.gemini}
            />
          )}
        </section>

        {props.providerMessage === null ? null : (
          <div
            aria-live="polite"
            className="rounded-lg border border-border bg-surface px-3 py-2 text-xs leading-5 text-muted-foreground"
            data-clio-provider-message="true"
          >
            {props.providerMessage}
          </div>
        )}
      </div>
    </div>
  );
}

function SettingsSectionMenu() {
  return (
    <nav aria-label="Settings sections" className="grid gap-2">
      <button
        aria-current="page"
        aria-label="Appearance settings"
        className="flex min-h-12 w-full items-center gap-3 rounded-lg bg-surface-hover px-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary"
        type="button"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface text-primary">
          <Sun size={16} />
        </span>
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-sm font-semibold text-foreground">Appearance</span>
          <span className="block truncate text-[11px] text-muted-foreground">
            Light and dark tones
          </span>
        </span>
      </button>
      <button
        aria-label="Search provider settings"
        className="flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-left outline-none transition-colors hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-primary"
        type="button"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface text-primary">
          <Search size={16} />
        </span>
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-sm font-semibold text-foreground">Search</span>
          <span className="block truncate text-[11px] text-muted-foreground">
            AI search provider
          </span>
        </span>
      </button>
      <button
        aria-label="Image generation settings"
        className="flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-left outline-none transition-colors hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-primary"
        type="button"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface text-primary">
          <ImageIcon size={16} />
        </span>
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-sm font-semibold text-foreground">Image Gen</span>
          <span className="block truncate text-[11px] text-muted-foreground">
            Image2-compatible model
          </span>
        </span>
      </button>
      <button
        aria-label="Model settings"
        className="flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-left outline-none transition-colors hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-primary"
        type="button"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface text-primary">
          <Bot size={16} />
        </span>
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-sm font-semibold text-foreground">Model</span>
          <span className="block truncate text-[11px] text-muted-foreground">Provider and API</span>
        </span>
      </button>
    </nav>
  );
}

interface ImageGenerationSettingsCardProps {
  settings: ImageGenerationSettings | null;
  apiKey: string;
  model: string;
  baseUrl: string;
  size: ImageGenerationSettings["size"];
  loading: boolean;
  onApiKeyChange: (value: string) => void;
  onModelChange: (value: string) => void;
  onBaseUrlChange: (value: string) => void;
  onSizeChange: (value: ImageGenerationSettings["size"]) => void;
  onSave: () => Promise<boolean>;
}

function ImageGenerationSettingsCard(props: ImageGenerationSettingsCardProps) {
  const [apiKeyMasked, setApiKeyMasked] = React.useState(false);
  const disabled = props.loading || props.settings === null;
  const apiKeyToggleLabel = apiKeyMasked ? "Show Image Gen API key" : "Mask Image Gen API key";

  return (
    <section
      className="rounded-xl border border-border bg-surface p-4"
      data-clio-settings-section="image-generation"
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-primary">
            <ImageIcon size={16} />
          </span>
          <div className="min-w-0 leading-tight">
            <h4 className="truncate text-sm font-semibold">Image Gen</h4>
            <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
              Image2-compatible generation and edits.
            </p>
          </div>
        </div>
        <Badge className="shrink-0 border-border bg-muted text-foreground-soft">
          {props.settings === null ? "checking" : props.size}
        </Badge>
      </div>

      <div className="grid gap-3">
        <div className="grid gap-1.5 text-[12px]">
          <label className="font-medium text-foreground" htmlFor="clio-rail-image-gen-key">
            API Key
          </label>
          <div className="flex gap-2">
            <Input
              autoComplete="off"
              className="h-10 min-w-0 rounded-lg border-border bg-background text-foreground placeholder:text-muted-foreground/70 focus-visible:ring-primary"
              disabled={disabled}
              id="clio-rail-image-gen-key"
              onChange={(event) => props.onApiKeyChange(event.target.value)}
              placeholder="Use main OpenAI-compatible key"
              type={apiKeyMasked ? "password" : "text"}
              value={props.apiKey}
            />
            <Button
              aria-label={apiKeyToggleLabel}
              className="h-10 w-10 shrink-0 border border-border bg-surface px-0 text-muted-foreground hover:bg-muted hover:text-foreground"
              disabled={disabled}
              onClick={() => setApiKeyMasked((value) => !value)}
              size="icon"
              title={apiKeyToggleLabel}
              type="button"
              variant="subtle"
            >
              {apiKeyMasked ? <Eye size={15} /> : <EyeOff size={15} />}
            </Button>
          </div>
        </div>
        <label className="grid gap-1.5 text-[12px]" htmlFor="clio-rail-image-gen-base-url">
          <span className="font-medium text-foreground">Base URL</span>
          <Input
            className="h-10 rounded-lg border-border bg-background text-foreground placeholder:text-muted-foreground/70 focus-visible:ring-primary"
            disabled={disabled}
            id="clio-rail-image-gen-base-url"
            onChange={(event) => props.onBaseUrlChange(event.target.value)}
            placeholder="Use main OpenAI-compatible Base URL"
            value={props.baseUrl}
          />
        </label>
        <label className="grid gap-1.5 text-[12px]" htmlFor="clio-rail-image-gen-model">
          <span className="font-medium text-foreground">Model</span>
          <Input
            className="h-10 rounded-lg border-border bg-background text-foreground placeholder:text-muted-foreground/70 focus-visible:ring-primary"
            disabled={disabled}
            id="clio-rail-image-gen-model"
            onChange={(event) => props.onModelChange(event.target.value)}
            placeholder={defaultImageGenerationModel}
            value={props.model}
          />
        </label>
        <label className="grid gap-1.5 text-[12px]" htmlFor="clio-rail-image-gen-size">
          <span className="font-medium text-foreground">Size</span>
          <select
            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-45"
            disabled={disabled}
            id="clio-rail-image-gen-size"
            onChange={(event) =>
              props.onSizeChange(event.target.value as ImageGenerationSettings["size"])
            }
            value={props.size}
          >
            {imageGenerationSizes.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="mt-3 text-[11px] leading-4 text-muted-foreground">
        Blank Base URL and API Key inherit the active OpenAI or OpenAI Compatible model settings.
        Blank model uses {defaultImageGenerationModel}.
      </p>

      <div className="mt-3">
        <Button
          className="w-full border border-border bg-surface text-foreground hover:bg-muted"
          disabled={disabled}
          onClick={() => void props.onSave()}
          variant="subtle"
        >
          <ShieldCheck size={15} />
          Save Image Gen
        </Button>
      </div>
    </section>
  );
}

interface SearchProviderSettingsCardProps {
  provider: SearchProviderId;
  settings: SearchProviderSettings | null;
  apiKey: string;
  model: string;
  baseUrl: string;
  compatibleApiKey: string;
  compatibleModel: string;
  compatibleBaseUrl: string;
  loading: boolean;
  onProviderChange: (provider: SearchProviderId) => void;
  onApiKeyChange: (value: string) => void;
  onModelChange: (value: string) => void;
  onBaseUrlChange: (value: string) => void;
  onCompatibleApiKeyChange: (value: string) => void;
  onCompatibleModelChange: (value: string) => void;
  onCompatibleBaseUrlChange: (value: string) => void;
  onSave: () => Promise<boolean>;
}

function SearchProviderSettingsCard(props: SearchProviderSettingsCardProps) {
  const [apiKeyMasked, setApiKeyMasked] = React.useState(false);
  const disabled = props.loading || props.settings === null;
  const showingCompatible = props.provider === "openai-compatible";
  const apiKeyToggleLabel = apiKeyMasked
    ? `Show ${showingCompatible ? "OpenAI Compatible" : "OpenAI"} Search API key`
    : `Mask ${showingCompatible ? "OpenAI Compatible" : "OpenAI"} Search API key`;
  const fieldIds = showingCompatible
    ? {
        key: "clio-rail-search-openai-compatible-key",
        model: "clio-rail-search-openai-compatible-model",
        baseUrl: "clio-rail-search-openai-compatible-base-url",
      }
    : {
        key: "clio-rail-search-openai-key",
        model: "clio-rail-search-openai-model",
        baseUrl: "clio-rail-search-openai-base-url",
      };
  const apiKey = showingCompatible ? props.compatibleApiKey : props.apiKey;
  const model = showingCompatible ? props.compatibleModel : props.model;
  const baseUrl = showingCompatible ? props.compatibleBaseUrl : props.baseUrl;
  const onApiKeyChange = showingCompatible ? props.onCompatibleApiKeyChange : props.onApiKeyChange;
  const onModelChange = showingCompatible ? props.onCompatibleModelChange : props.onModelChange;
  const onBaseUrlChange = showingCompatible
    ? props.onCompatibleBaseUrlChange
    : props.onBaseUrlChange;

  return (
    <section
      className="rounded-xl border border-border bg-surface p-4"
      data-clio-settings-section="search"
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-primary">
            <Search size={16} />
          </span>
          <div className="min-w-0 leading-tight">
            <h4 className="truncate text-sm font-semibold">Search</h4>
            <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
              Standalone AI search provider.
            </p>
          </div>
        </div>
        <Badge className="shrink-0 border-border bg-muted text-foreground-soft">
          {props.settings === null ? "checking" : searchProviderLabel(props.provider)}
        </Badge>
      </div>

      <div className="mb-4 grid gap-1.5 text-[12px]">
        <label className="font-medium text-foreground" htmlFor="clio-rail-search-provider">
          Provider
        </label>
        <select
          className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-45"
          disabled={disabled}
          id="clio-rail-search-provider"
          onChange={(event) => props.onProviderChange(event.target.value as SearchProviderId)}
          value={props.provider}
        >
          <option value="auto">Auto</option>
          <option value="openai">OpenAI</option>
          <option value="openai-compatible">OpenAI Compatible</option>
        </select>
      </div>

      <section className="rounded-lg border border-border bg-background p-3.5">
        <div className="mb-3 flex min-w-0 items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-primary">
            <Bot size={15} />
          </span>
          <div className="min-w-0 leading-tight">
            <h5 className="truncate text-sm font-semibold">
              {showingCompatible ? "OpenAI Compatible Search" : "OpenAI Search override"}
            </h5>
            <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
              {showingCompatible
                ? "Custom model names are allowed; unsupported endpoints fail when Search runs."
                : "Empty fields use the main OpenAI model search config when supported."}
            </p>
          </div>
        </div>

        <div className="grid gap-3">
          <div className="grid gap-1.5 text-[12px]">
            <label className="font-medium text-foreground" htmlFor={fieldIds.key}>
              API Key
            </label>
            <div className="flex gap-2">
              <Input
                autoComplete="off"
                className="h-10 min-w-0 rounded-lg border-border bg-surface text-foreground placeholder:text-muted-foreground/70 focus-visible:ring-primary"
                disabled={disabled}
                id={fieldIds.key}
                onChange={(event) => onApiKeyChange(event.target.value)}
                placeholder={
                  showingCompatible ? "Use main OpenAI Compatible key" : "Use main OpenAI key"
                }
                type={apiKeyMasked ? "password" : "text"}
                value={apiKey}
              />
              <Button
                aria-label={apiKeyToggleLabel}
                className="h-10 w-10 shrink-0 border border-border bg-surface px-0 text-muted-foreground hover:bg-muted hover:text-foreground"
                disabled={disabled}
                onClick={() => setApiKeyMasked((value) => !value)}
                size="icon"
                title={apiKeyToggleLabel}
                type="button"
                variant="subtle"
              >
                {apiKeyMasked ? <Eye size={15} /> : <EyeOff size={15} />}
              </Button>
            </div>
          </div>
          <label className="grid gap-1.5 text-[12px]" htmlFor={fieldIds.model}>
            <span className="font-medium text-foreground">Model</span>
            <Input
              className="h-10 rounded-lg border-border bg-surface text-foreground placeholder:text-muted-foreground/70 focus-visible:ring-primary"
              disabled={disabled}
              id={fieldIds.model}
              onChange={(event) => onModelChange(event.target.value)}
              placeholder={
                showingCompatible ? "Use main OpenAI Compatible model" : "Use main OpenAI model"
              }
              value={model}
            />
          </label>
          <label className="grid gap-1.5 text-[12px]" htmlFor={fieldIds.baseUrl}>
            <span className="font-medium text-foreground">Base URL</span>
            <Input
              className="h-10 rounded-lg border-border bg-surface text-foreground placeholder:text-muted-foreground/70 focus-visible:ring-primary"
              disabled={disabled}
              id={fieldIds.baseUrl}
              onChange={(event) => onBaseUrlChange(event.target.value)}
              placeholder={
                showingCompatible
                  ? "Use main OpenAI Compatible Base URL"
                  : "Use main OpenAI Base URL"
              }
              value={baseUrl}
            />
          </label>
        </div>

        <p className="mt-3 text-[11px] leading-4 text-muted-foreground">
          {showingCompatible
            ? "OpenAI Compatible Search attempts the Responses web_search protocol and does not fall back to ordinary chat completion."
            : "Auto uses filled OpenAI Search fields first. Blank fields are resolved only when a search runs."}
        </p>

        <div className="mt-3">
          <Button
            className="w-full border border-border bg-surface text-foreground hover:bg-muted"
            disabled={disabled}
            onClick={() => void props.onSave()}
            variant="subtle"
          >
            <ShieldCheck size={15} />
            Save Search
          </Button>
        </div>
      </section>
    </section>
  );
}

function AppearanceSettingsCard({
  onThemeChange,
  theme,
}: {
  onThemeChange: (theme: RailTheme) => void;
  theme: RailTheme;
}) {
  const options: Array<{ value: RailTheme; label: string; icon: React.ReactNode }> = [
    { value: "light", label: "Light", icon: <Sun size={15} /> },
    { value: "dark", label: "Dark", icon: <Moon size={15} /> },
  ];

  return (
    <section
      className="rounded-xl border border-border bg-surface p-4"
      data-clio-settings-section="appearance"
    >
      <div className="mb-4 flex min-w-0 items-start gap-2.5">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-primary">
          {theme === "dark" ? <Moon size={16} /> : <Sun size={16} />}
        </span>
        <div className="min-w-0 leading-tight">
          <h4 className="truncate text-sm font-semibold">Appearance</h4>
          <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
            Choose the tone Clio uses on every page.
          </p>
        </div>
      </div>

      <fieldset
        className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-background p-1"
        data-clio-theme-toggle="true"
      >
        <legend className="sr-only">Theme</legend>
        {options.map((option) => {
          const active = option.value === theme;
          return (
            <button
              aria-pressed={active}
              className={[
                "flex h-9 items-center justify-center gap-1.5 rounded-md text-[12px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary",
                active
                  ? "bg-surface text-foreground shadow-[0_1px_2px_rgba(15,15,15,0.08)]"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              ].join(" ")}
              data-clio-theme-option={option.value}
              key={option.value}
              onClick={() => onThemeChange(option.value)}
              type="button"
            >
              {option.icon}
              {option.label}
            </button>
          );
        })}
      </fieldset>
    </section>
  );
}

interface ProviderSettingsCardProps {
  provider: ProviderId;
  label: string;
  settings?: GeminiProviderSettings | OpenAIProviderSettings | OpenAICompatibleProviderSettings;
  apiKey: string;
  model: string;
  baseUrl?: string;
  providerName?: string;
  defaultModel: string;
  defaultBaseUrl?: string;
  loading: boolean;
  onApiKeyChange: (value: string) => void;
  onModelChange: (value: string) => void;
  onBaseUrlChange?: (value: string) => void;
  onProviderNameChange?: (value: string) => void;
  onSave: () => Promise<boolean>;
  onTest: () => Promise<boolean>;
}

function ProviderSettingsCard(props: ProviderSettingsCardProps) {
  const hasBaseUrl = props.baseUrl !== undefined && props.onBaseUrlChange !== undefined;
  const configured = props.settings?.apiKeyConfigured === true;
  const hostReady = props.settings?.hostPermissionGranted === true;
  const [apiKeyMasked, setApiKeyMasked] = React.useState(false);
  const apiKeyToggleLabel = apiKeyMasked
    ? `Show ${props.label} API key`
    : `Mask ${props.label} API key`;

  return (
    <section
      className="rounded-lg border border-border bg-background p-3.5"
      data-clio-provider-form={props.provider}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-primary">
            <Bot size={15} />
          </span>
          <h4 className="truncate text-sm font-semibold">{props.label} configuration</h4>
          <ProviderPill>{configured ? "configured" : "not set"}</ProviderPill>
        </div>
        <span className="shrink-0 text-[11px] text-muted-foreground">
          Host {hostReady ? "ready" : "not ready"}
        </span>
      </div>
      <div className="grid gap-3">
        <div className="grid gap-1.5 text-[12px]">
          <label
            className="font-medium text-foreground"
            htmlFor={`clio-rail-${props.provider}-key`}
          >
            API Key
          </label>
          <div className="flex gap-2">
            <Input
              autoComplete="off"
              className="h-10 min-w-0 rounded-lg border-border bg-surface text-foreground placeholder:text-muted-foreground/70 focus-visible:ring-primary"
              id={`clio-rail-${props.provider}-key`}
              onChange={(event) => props.onApiKeyChange(event.target.value)}
              placeholder={`Paste ${props.label} API key`}
              type={apiKeyMasked ? "password" : "text"}
              value={props.apiKey}
            />
            <Button
              aria-label={apiKeyToggleLabel}
              className="h-10 w-10 shrink-0 border border-border bg-surface px-0 text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={() => setApiKeyMasked((value) => !value)}
              size="icon"
              title={apiKeyToggleLabel}
              type="button"
              variant="subtle"
            >
              {apiKeyMasked ? <Eye size={15} /> : <EyeOff size={15} />}
            </Button>
          </div>
        </div>
        <label className="grid gap-1.5 text-[12px]" htmlFor={`clio-rail-${props.provider}-model`}>
          <span className="font-medium text-foreground">Model</span>
          <Input
            className="h-10 rounded-lg border-border bg-surface text-foreground placeholder:text-muted-foreground/70 focus-visible:ring-primary"
            id={`clio-rail-${props.provider}-model`}
            onChange={(event) => props.onModelChange(event.target.value)}
            placeholder={props.defaultModel}
            value={props.model}
          />
        </label>
        {hasBaseUrl ? (
          <label
            className="grid gap-1.5 text-[12px]"
            htmlFor={`clio-rail-${props.provider}-base-url`}
          >
            <span className="font-medium text-foreground">Base URL</span>
            <Input
              className="h-10 rounded-lg border-border bg-surface text-foreground placeholder:text-muted-foreground/70 focus-visible:ring-primary"
              id={`clio-rail-${props.provider}-base-url`}
              onChange={(event) => props.onBaseUrlChange?.(event.target.value)}
              placeholder={props.defaultBaseUrl}
              value={props.baseUrl}
            />
          </label>
        ) : null}
        {props.providerName !== undefined && props.onProviderNameChange !== undefined ? (
          <label
            className="grid gap-1.5 text-[12px]"
            htmlFor={`clio-rail-${props.provider}-provider-name`}
          >
            <span className="font-medium text-foreground">Provider Name</span>
            <Input
              className="h-10 rounded-lg border-border bg-surface text-foreground placeholder:text-muted-foreground/70 focus-visible:ring-primary"
              id={`clio-rail-${props.provider}-provider-name`}
              onChange={(event) => props.onProviderNameChange?.(event.target.value)}
              placeholder={defaultOpenAICompatibleProviderName}
              value={props.providerName}
            />
          </label>
        ) : null}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button
          className="border border-border bg-surface text-foreground hover:bg-muted"
          disabled={props.loading}
          onClick={() => void props.onSave()}
          variant="subtle"
        >
          <ShieldCheck size={15} />
          Save
        </Button>
        <Button
          className="border border-border bg-surface text-foreground hover:bg-muted"
          disabled={props.loading}
          onClick={() => void props.onTest()}
          variant="subtle"
        >
          <Wifi size={15} />
          Test connection
        </Button>
      </div>
    </section>
  );
}

function ProviderPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md bg-muted px-2 py-0.5 text-[10.5px] text-muted-foreground">
      {children}
    </span>
  );
}

function providerLabel(provider: ProviderId) {
  if (provider === "openai") return "OpenAI";
  if (provider === "openai-compatible") return "OpenAI Compatible";
  return "Gemini";
}

function searchProviderLabel(provider: SearchProviderId) {
  if (provider === "openai") return "OpenAI";
  if (provider === "openai-compatible") return "OpenAI Compatible";
  return "Auto";
}

function KnowledgeBasePanel(props: RailShellProps) {
  const [section, setSection] = React.useState<"memories" | "topics">("memories");
  const topicCountLabel =
    props.topicPages.length === 0 ? "No topic pages" : `${props.topicPages.length} topic pages`;
  const memoryCountLabel =
    props.items.length === 0 ? "Local memory" : `${props.items.length} local items`;
  return (
    <div className="relative z-10 flex min-h-0 flex-1 flex-col" data-clio-panel="knowledge-base">
      <div className="flex h-[62px] shrink-0 items-center justify-between border-b border-border px-5">
        <div className="flex min-w-0 items-center gap-3">
          <IconButton label="Back to Agent Home" onClick={props.onBackToHome}>
            <ArrowLeft size={17} />
          </IconButton>
          <div className="min-w-0 leading-tight">
            <h3 className="truncate text-[20px] font-semibold leading-7">Knowledge Base</h3>
            <p className="truncate text-[11px] text-muted-foreground">
              {section === "topics" ? topicCountLabel : memoryCountLabel}
            </p>
          </div>
        </div>
        <Button
          className="border border-border bg-surface text-muted-foreground hover:bg-muted hover:text-foreground"
          disabled={props.state.loading}
          onClick={props.onRefresh}
          size="icon"
          variant="ghost"
        >
          {props.state.loading ? (
            <Loader2 className="animate-spin" size={15} />
          ) : (
            <RefreshCw size={15} />
          )}
        </Button>
      </div>
      <div className="clio-scroll flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overflow-x-hidden px-6 py-4">
        {renderRoutePrompt(props)}
        <InlineHealthBanner health={props.health} onOpenSettings={props.onOpenSettings} />
        <div className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-surface p-1">
          <button
            aria-pressed={section === "memories"}
            className={[
              "flex h-9 items-center justify-center gap-1.5 rounded-md text-[12px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary",
              section === "memories"
                ? "bg-background text-foreground shadow-[0_1px_2px_rgba(15,15,15,0.08)]"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            ].join(" ")}
            onClick={() => setSection("memories")}
            type="button"
          >
            <FileText size={14} />
            Memories
          </button>
          <button
            aria-pressed={section === "topics"}
            className={[
              "flex h-9 items-center justify-center gap-1.5 rounded-md text-[12px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary",
              section === "topics"
                ? "bg-background text-foreground shadow-[0_1px_2px_rgba(15,15,15,0.08)]"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            ].join(" ")}
            onClick={() => setSection("topics")}
            type="button"
          >
            <BookOpen size={14} />
            Topics
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button
            className="border border-border bg-surface text-foreground hover:bg-muted"
            disabled={props.state.loading}
            onClick={props.onSavePage}
            variant="subtle"
          >
            <BookOpen size={15} />
            Save page
          </Button>
          <Button
            className="border border-border bg-surface text-foreground hover:bg-muted"
            disabled={props.state.loading}
            onClick={props.onSaveSelection}
            variant="subtle"
          >
            <BookmarkPlus size={15} />
            Save selection
          </Button>
        </div>
        {section === "topics" ? (
          <Button
            className="border border-border bg-surface text-foreground hover:bg-muted"
            disabled={props.state.loading}
            onClick={props.onCreateTopicPage}
            variant="subtle"
          >
            <Plus size={15} />
            New topic
          </Button>
        ) : null}
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            size={15}
          />
          <Input
            aria-label="Search Clio memories"
            className="h-11 rounded-lg border-border bg-background pl-9 text-foreground placeholder:text-muted-foreground/70 focus-visible:ring-primary"
            onChange={(event) => props.onQueryChange(event.target.value)}
            placeholder="Search memories"
            value={props.state.query}
          />
        </div>
        {section === "topics" ? (
          <TopicKnowledgePanel
            detail={props.topicDetail}
            form={props.topicForm}
            formOpen={props.topicFormOpen}
            graphEdges={props.topicGraphEdges}
            items={props.topicPages}
            loading={props.state.loading}
            wikiCompileForm={props.wikiCompileForm}
            wikiCompileJobEvents={props.wikiCompileJobEvents}
            wikiCompileJobs={props.wikiCompileJobs}
            wikiCompileRunning={props.wikiCompileRunning}
            onCancelForm={props.onCancelTopicForm}
            onChangeForm={props.onTopicFormChange}
            onChangeWikiCompileForm={props.onWikiCompileFormChange}
            onCompileWithAI={props.onCompileTopicWithAI}
            onCreate={props.onCreateTopicPage}
            onDelete={props.onDeleteTopicPage}
            onEdit={props.onEditTopicPage}
            onOpen={props.onOpenTopicPage}
            onOpenSource={props.onOpenTopicSource}
            onSave={props.onSaveTopicPage}
          />
        ) : (
          <MemoryList
            highlightedId={props.state.highlightedMemoryId}
            items={props.items}
            loading={props.state.loading}
            onOpenDetail={props.onOpenDetail}
          />
        )}
      </div>
    </div>
  );
}

function TopicKnowledgePanel({
  detail,
  form,
  formOpen,
  graphEdges,
  items,
  loading,
  wikiCompileForm,
  wikiCompileJobEvents,
  wikiCompileJobs,
  wikiCompileRunning,
  onCancelForm,
  onChangeForm,
  onChangeWikiCompileForm,
  onCompileWithAI,
  onCreate,
  onDelete,
  onEdit,
  onOpen,
  onOpenSource,
  onSave,
}: {
  detail: TopicPageDetail | null;
  form: TopicPageFormState;
  formOpen: boolean;
  graphEdges: TopicGraphEdge[];
  items: TopicPageSummary[];
  loading: boolean;
  wikiCompileForm: WikiCompileFormState;
  wikiCompileJobEvents: WikiCompileJobEvent[];
  wikiCompileJobs: WikiCompileJobSummary[];
  wikiCompileRunning: boolean;
  onCancelForm: () => void;
  onChangeForm: (form: TopicPageFormState) => void;
  onChangeWikiCompileForm: (form: WikiCompileFormState) => void;
  onCompileWithAI: (form: WikiCompileFormState, topicId?: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onEdit: (page: TopicPageDetail) => void;
  onOpen: (id: string) => void;
  onOpenSource: (memoryId: string) => void;
  onSave: (form: TopicPageFormState, id?: string) => void;
}) {
  if (formOpen) {
    return (
      <TopicPageForm
        form={form}
        loading={loading}
        mode={detail === null ? "create" : "edit"}
        onCancel={onCancelForm}
        onChange={onChangeForm}
        onSave={() => onSave(form, detail?.id)}
      />
    );
  }

  return (
    <div className="grid gap-3">
      {detail === null ? null : (
        <TopicPageDetailCard
          detail={detail}
          graphEdges={graphEdges}
          loading={loading}
          onDelete={onDelete}
          onEdit={onEdit}
          onOpenSource={onOpenSource}
        />
      )}
      <WikiCompileCard
        detail={detail}
        form={wikiCompileForm}
        events={wikiCompileJobEvents}
        jobs={wikiCompileJobs}
        loading={loading || wikiCompileRunning}
        onChange={onChangeWikiCompileForm}
        onCompile={onCompileWithAI}
      />
      <TopicPageList
        activeId={detail?.id}
        items={items}
        loading={loading}
        onCreate={onCreate}
        onOpen={onOpen}
      />
    </div>
  );
}

function TopicPageList({
  activeId,
  items,
  loading,
  onCreate,
  onOpen,
}: {
  activeId?: string;
  items: TopicPageSummary[];
  loading: boolean;
  onCreate: () => void;
  onOpen: (id: string) => void;
}) {
  if (loading) {
    return (
      <div className="flex h-28 items-center justify-center rounded-lg border border-border bg-surface text-sm text-muted-foreground">
        <Loader2 className="mr-2 animate-spin" size={16} />
        Loading topics
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface px-4 py-8 text-center">
        <p className="text-sm text-muted-foreground">No topic pages yet.</p>
        <Button className="mt-3" onClick={onCreate} size="sm" variant="subtle">
          <Plus size={14} />
          New topic
        </Button>
      </div>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <li key={item.id}>
          <button
            className={[
              "relative flex w-full flex-col gap-2 rounded-lg border bg-surface p-3.5 text-left outline-none transition-colors hover:border-border-strong hover:bg-surface-subtle focus-visible:ring-2 focus-visible:ring-primary",
              activeId === item.id ? "border-primary/70" : "border-border",
            ].join(" ")}
            onClick={() => onOpen(item.id)}
            type="button"
          >
            {activeId === item.id ? (
              <span className="absolute bottom-3 left-0 top-3 w-[2px] rounded-r bg-primary" />
            ) : null}
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-surface-subtle text-primary">
                <BookOpen size={15} />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="line-clamp-2 text-sm font-semibold leading-5">{item.title}</h3>
                <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span>{topicSummaryLabel(item)}</span>
                  <span>{formatDate(item.updatedAt)}</span>
                </p>
              </div>
              <Badge className="border-border bg-surface-subtle text-muted-foreground">topic</Badge>
            </div>
            <p className="line-clamp-3 pl-9 text-[12.5px] leading-5 text-muted-foreground">
              {item.summary || "Derived page over local memories."}
            </p>
          </button>
        </li>
      ))}
    </ul>
  );
}

function WikiCompileCard({
  detail,
  events,
  form,
  jobs,
  loading,
  onChange,
  onCompile,
}: {
  detail: TopicPageDetail | null;
  events: WikiCompileJobEvent[];
  form: WikiCompileFormState;
  jobs: WikiCompileJobSummary[];
  loading: boolean;
  onChange: (form: WikiCompileFormState) => void;
  onCompile: (form: WikiCompileFormState, topicId?: string) => void;
}) {
  const query = form.query.trim();
  const recentEvents = events.slice(-5).reverse();
  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">AI compile</h3>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Compile a derived topic from saved memories.
          </p>
        </div>
        <Button
          disabled={loading || query.length === 0}
          onClick={() => onCompile(form, detail?.id)}
          size="sm"
          variant="subtle"
        >
          {loading ? <Loader2 className="animate-spin" size={14} /> : <Sparkles size={14} />}
          Compile
        </Button>
      </div>
      <div className="grid gap-2.5">
        <label className="grid gap-1.5 text-[12px]" htmlFor="clio-wiki-compile-query">
          <span className="font-medium text-foreground">Topic query</span>
          <Input
            className="h-10 rounded-lg border-border bg-background text-foreground placeholder:text-muted-foreground/70 focus-visible:ring-primary"
            id="clio-wiki-compile-query"
            onChange={(event) => onChange({ ...form, query: event.target.value })}
            placeholder="Customer onboarding"
            value={form.query}
          />
        </label>
        <label className="grid gap-1.5 text-[12px]" htmlFor="clio-wiki-compile-instructions">
          <span className="font-medium text-foreground">Instructions</span>
          <textarea
            className="min-h-[68px] resize-y rounded-lg border border-border bg-background px-3 py-2.5 text-[12px] leading-5 text-foreground outline-none placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-primary"
            id="clio-wiki-compile-instructions"
            onChange={(event) => onChange({ ...form, instructions: event.target.value })}
            placeholder="Optional focus, scope, or tone"
            value={form.instructions}
          />
        </label>
      </div>
      {jobs.length === 0 ? null : (
        <div className="mt-3 grid gap-1.5">
          {jobs.slice(0, 3).map((job) => (
            <div
              className="flex items-center justify-between gap-2 rounded-md border border-border bg-background px-2.5 py-2 text-[11px]"
              key={job.id}
            >
              <span className="min-w-0 truncate text-muted-foreground">{job.query}</span>
              <Badge className="shrink-0 border-border bg-surface-subtle text-muted-foreground">
                {wikiJobStatusLabel(job)}
              </Badge>
            </div>
          ))}
        </div>
      )}
      {recentEvents.length === 0 ? null : (
        <div className="mt-3 grid gap-1.5 border-t border-border pt-3">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-[12px] font-semibold text-foreground">Compile log</h4>
            <Badge className="border-border bg-surface-subtle text-muted-foreground">
              {recentEvents.length}
            </Badge>
          </div>
          <div className="grid gap-1.5">
            {recentEvents.map((event) => {
              const detailText = wikiCompileEventDetail(event);
              return (
                <div
                  className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-md border border-border bg-background px-2.5 py-2 text-[11px]"
                  key={event.id}
                >
                  <span
                    className={[
                      "h-2 w-2 rounded-full",
                      event.level === "error"
                        ? "bg-destructive"
                        : event.level === "warning"
                          ? "bg-amber-500"
                          : "bg-primary",
                    ].join(" ")}
                  />
                  <span className="min-w-0 truncate text-foreground">
                    {event.message || wikiCompileEventLabel(event)}
                  </span>
                  <span className="shrink-0 text-muted-foreground">
                    {detailText || wikiCompileEventLabel(event)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

function TopicPageDetailCard({
  detail,
  graphEdges,
  loading,
  onDelete,
  onEdit,
  onOpenSource,
}: {
  detail: TopicPageDetail;
  graphEdges: TopicGraphEdge[];
  loading: boolean;
  onDelete: (id: string) => void;
  onEdit: (page: TopicPageDetail) => void;
  onOpenSource: (memoryId: string) => void;
}) {
  return (
    <article className="rounded-lg border border-border bg-surface p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            <Badge className="border-border bg-surface-subtle text-muted-foreground">topic</Badge>
            <span className="text-[11px] text-muted-foreground">
              {formatDate(detail.updatedAt)}
            </span>
          </div>
          <h3 className="line-clamp-2 text-base font-semibold leading-6">{detail.title}</h3>
        </div>
        <div className="flex shrink-0 gap-1.5">
          <Button disabled={loading} onClick={() => onEdit(detail)} size="sm" variant="ghost">
            <Pencil size={14} />
            Edit
          </Button>
          <Button disabled={loading} onClick={() => onDelete(detail.id)} size="sm" variant="ghost">
            <Trash2 size={14} />
            Delete
          </Button>
        </div>
      </div>
      {detail.summary.length > 0 ? (
        <p className="mb-3 text-[12.5px] leading-5 text-muted-foreground">{detail.summary}</p>
      ) : null}
      {detail.content.length > 0 ? (
        <div className="mb-4 whitespace-pre-wrap rounded-lg border border-border bg-background p-3 text-sm leading-6 text-foreground">
          {detail.content}
        </div>
      ) : (
        <div className="mb-4 rounded-lg border border-dashed border-border bg-background px-3 py-6 text-center text-sm text-muted-foreground">
          Empty topic page.
        </div>
      )}
      <div className="grid gap-2">
        <h4 className="text-[12px] font-semibold text-foreground">Sources</h4>
        {detail.sourceRefs.length === 0 ? (
          <p className="rounded-lg border border-border bg-background px-3 py-3 text-[12px] text-muted-foreground">
            No source memories linked.
          </p>
        ) : (
          detail.sourceRefs.map((ref) => (
            <button
              className="flex w-full flex-col gap-1 rounded-lg border border-border bg-background px-3 py-2.5 text-left text-[12px] outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary"
              key={`${ref.memoryId}:${ref.chunkId ?? ""}`}
              onClick={() => onOpenSource(ref.memoryId)}
              type="button"
            >
              <span className="flex items-center gap-1.5 font-medium text-foreground">
                <ExternalLink size={13} />
                {ref.memoryId}
              </span>
              {ref.quote === undefined ? null : (
                <span className="line-clamp-2 text-muted-foreground">{ref.quote}</span>
              )}
            </button>
          ))
        )}
      </div>
      <TopicGraphMap detail={detail} edges={graphEdges} onOpenSource={onOpenSource} />
      <TopicGraphEdgesList edges={graphEdges} onOpenSource={onOpenSource} />
    </article>
  );
}

function TopicGraphMap({
  detail,
  edges,
  onOpenSource,
}: {
  detail: TopicPageDetail;
  edges: TopicGraphEdge[];
  onOpenSource: (memoryId: string) => void;
}) {
  if (edges.length === 0) return null;
  const sourceEdges = edges.filter((edge) => edge.memoryId !== undefined).slice(0, 4);
  const topicEdges = edges.filter((edge) => edge.toTopicId !== undefined).slice(0, 4);
  const sourceNodes = sourceEdges.map((edge, index) => ({
    edge,
    x: 18,
    y: graphNodeY(index, sourceEdges.length),
    label: edge.label || edge.memoryId || "Source",
  }));
  const topicNodes = topicEdges.map((edge, index) => ({
    edge,
    x: 82,
    y: graphNodeY(index, topicEdges.length),
    label: edge.label || edge.toTopicId || "Topic",
  }));
  const center = { x: 50, y: 50 };
  return (
    <div className="mt-4 grid gap-2 border-t border-border pt-3">
      <h4 className="text-[12px] font-semibold text-foreground">Graph</h4>
      <div className="relative h-56 overflow-hidden rounded-lg border border-border bg-background">
        <svg
          aria-hidden="true"
          className="absolute inset-0 h-full w-full"
          preserveAspectRatio="none"
          viewBox="0 0 100 100"
        >
          <title>Topic graph</title>
          {sourceNodes.map((node) => (
            <line
              className="stroke-primary/45"
              key={`source-line-${node.edge.id}`}
              strokeWidth="0.55"
              x1={node.x + 8}
              x2={center.x - 8}
              y1={node.y}
              y2={center.y}
            />
          ))}
          {topicNodes.map((node) => (
            <line
              className="stroke-muted-foreground/40"
              key={`topic-line-${node.edge.id}`}
              strokeDasharray={node.edge.kind === "mentions" ? "2 2" : undefined}
              strokeWidth="0.55"
              x1={center.x + 8}
              x2={node.x - 8}
              y1={center.y}
              y2={node.y}
            />
          ))}
        </svg>
        <div
          className="absolute left-1/2 top-1/2 flex h-14 w-28 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-lg border border-primary/50 bg-surface px-2 text-center text-[11px] font-semibold leading-4 text-foreground shadow-sm"
          title={detail.title}
        >
          <span className="line-clamp-2">{detail.title}</span>
        </div>
        {sourceNodes.map((node) => (
          <button
            className="absolute flex h-10 w-24 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-md border border-border bg-surface-subtle px-2 text-center text-[10px] leading-3 text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary"
            key={`source-node-${node.edge.id}`}
            onClick={() => {
              if (node.edge.memoryId !== undefined) onOpenSource(node.edge.memoryId);
            }}
            style={{ left: `${node.x}%`, top: `${node.y}%` }}
            title={node.label}
            type="button"
          >
            <span className="line-clamp-2">{node.label}</span>
          </button>
        ))}
        {topicNodes.map((node) => (
          <div
            className="absolute flex h-10 w-24 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-md border border-border bg-surface-subtle px-2 text-center text-[10px] leading-3 text-muted-foreground"
            key={`topic-node-${node.edge.id}`}
            style={{ left: `${node.x}%`, top: `${node.y}%` }}
            title={node.label}
          >
            <span className="line-clamp-2">{node.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TopicGraphEdgesList({
  edges,
  onOpenSource,
}: {
  edges: TopicGraphEdge[];
  onOpenSource: (memoryId: string) => void;
}) {
  if (edges.length === 0) return null;
  return (
    <div className="mt-4 grid gap-2 border-t border-border pt-3">
      <h4 className="text-[12px] font-semibold text-foreground">Graph links</h4>
      <div className="grid gap-1.5">
        {edges.slice(0, 8).map((edge) => {
          const canOpenSource = edge.memoryId !== undefined;
          return (
            <button
              className="flex w-full items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-2 text-left text-[12px] outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-default disabled:hover:bg-background"
              disabled={!canOpenSource}
              key={edge.id}
              onClick={() => {
                if (edge.memoryId !== undefined) onOpenSource(edge.memoryId);
              }}
              type="button"
            >
              <span className="min-w-0 truncate text-foreground">{topicGraphEdgeLabel(edge)}</span>
              <Badge className="shrink-0 border-border bg-surface-subtle text-muted-foreground">
                {edge.kind}
              </Badge>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function graphNodeY(index: number, count: number) {
  if (count <= 1) return 50;
  const step = 60 / Math.max(1, count - 1);
  return 20 + index * step;
}

function TopicPageForm({
  form,
  loading,
  mode,
  onCancel,
  onChange,
  onSave,
}: {
  form: TopicPageFormState;
  loading: boolean;
  mode: TopicFormMode;
  onCancel: () => void;
  onChange: (form: TopicPageFormState) => void;
  onSave: () => void;
}) {
  const title = form.title.trim();
  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold">
            {mode === "create" ? "New topic page" : "Edit topic page"}
          </h3>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Derived notes stay linked to source memories.
          </p>
        </div>
        <Button
          disabled={loading || title.length === 0}
          onClick={onSave}
          size="sm"
          variant="subtle"
        >
          {loading ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
          Save
        </Button>
      </div>
      <div className="grid gap-3">
        <label className="grid gap-1.5 text-[12px]" htmlFor="clio-topic-title">
          <span className="font-medium text-foreground">Title</span>
          <Input
            className="h-10 rounded-lg border-border bg-background text-foreground placeholder:text-muted-foreground/70 focus-visible:ring-primary"
            id="clio-topic-title"
            onChange={(event) => onChange({ ...form, title: event.target.value })}
            placeholder="Customer onboarding"
            value={form.title}
          />
        </label>
        <label className="grid gap-1.5 text-[12px]" htmlFor="clio-topic-summary">
          <span className="font-medium text-foreground">Summary</span>
          <Input
            className="h-10 rounded-lg border-border bg-background text-foreground placeholder:text-muted-foreground/70 focus-visible:ring-primary"
            id="clio-topic-summary"
            onChange={(event) => onChange({ ...form, summary: event.target.value })}
            placeholder="Short user-facing summary"
            value={form.summary}
          />
        </label>
        <label className="grid gap-1.5 text-[12px]" htmlFor="clio-topic-content">
          <span className="font-medium text-foreground">Content</span>
          <textarea
            className="min-h-[180px] resize-y rounded-lg border border-border bg-background px-3 py-2.5 text-sm leading-5 text-foreground outline-none placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-primary"
            id="clio-topic-content"
            onChange={(event) => onChange({ ...form, content: event.target.value })}
            placeholder="Compile what matters from local memories."
            value={form.content}
          />
        </label>
        <label className="grid gap-1.5 text-[12px]" htmlFor="clio-topic-sources">
          <span className="font-medium text-foreground">Source refs</span>
          <textarea
            className="min-h-[84px] resize-y rounded-lg border border-border bg-background px-3 py-2.5 font-mono text-[11.5px] leading-5 text-foreground outline-none placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-primary"
            id="clio-topic-sources"
            onChange={(event) => onChange({ ...form, sourceRefsText: event.target.value })}
            placeholder="mem_abc|chunk_xyz|optional quote"
            value={form.sourceRefsText}
          />
        </label>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <Button
          disabled={loading}
          onClick={() => {
            onChange(emptyTopicPageForm);
            onCancel();
          }}
          size="sm"
          variant="ghost"
        >
          Cancel
        </Button>
      </div>
    </section>
  );
}

function MemoryList({
  highlightedId,
  items,
  loading,
  onOpenDetail,
}: {
  highlightedId?: string;
  items: SearchMemoryItem[];
  loading: boolean;
  onOpenDetail: (id: string) => void;
}) {
  if (loading) {
    return (
      <div className="flex h-32 items-center justify-center rounded-lg border border-border bg-surface text-sm text-muted-foreground">
        <Loader2 className="mr-2 animate-spin" size={16} />
        Loading
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface px-4 py-10 text-center text-sm text-muted-foreground">
        No saved memories yet.
      </div>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <li key={item.id}>
          <button
            className={[
              "relative flex w-full flex-col gap-2 overflow-hidden rounded-lg border bg-surface p-3.5 text-left outline-none transition-colors hover:border-border-strong hover:bg-surface-subtle focus-visible:ring-2 focus-visible:ring-primary",
              highlightedId === item.id ? "border-primary/70" : "border-border",
            ].join(" ")}
            onClick={() => onOpenDetail(item.id)}
            type="button"
          >
            {highlightedId === item.id ? (
              <span className="absolute bottom-3 left-0 top-3 w-[2px] rounded-r bg-primary" />
            ) : null}
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-surface-subtle text-primary">
                <FileText size={15} />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="line-clamp-2 text-sm font-semibold leading-5">{item.sourceTitle}</h3>
                <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span className="truncate">{item.sourceUrl}</span>
                  <span>{formatDate(item.capturedAt)}</span>
                </p>
              </div>
              <Badge className="border-border bg-surface-subtle text-muted-foreground">
                {item.sourceKind}
              </Badge>
            </div>
            <p className="line-clamp-3 pl-9 text-[12.5px] leading-5 text-muted-foreground">
              {item.snippet || item.excerpt}
            </p>
          </button>
        </li>
      ))}
    </ul>
  );
}

function MemoryDetailPanel({
  detail,
  loading,
  onBack,
  onDelete,
  onOpenSource,
}: {
  detail: MemoryDetail | null;
  loading: boolean;
  onBack: () => void;
  onDelete: (id: string) => void;
  onOpenSource: (memory: MemoryDetail) => void;
}) {
  if (detail === null) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 animate-spin" size={16} />
        Loading
      </div>
    );
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-5">
        <Button onClick={onBack} size="sm" variant="ghost">
          <ArrowLeft size={15} />
          Back
        </Button>
        <Button disabled={loading} onClick={() => onDelete(detail.id)} size="sm" variant="ghost">
          <Trash2 size={15} />
          Delete
        </Button>
      </div>
      <article className="clio-scroll min-h-0 flex-1 overflow-y-auto px-6 py-4">
        <div className="mb-3 flex items-center gap-2">
          <Badge className="border-border bg-surface text-muted-foreground">
            {detail.sourceKind}
          </Badge>
          <span className="truncate text-xs text-muted-foreground">
            {formatDate(detail.capturedAt)}
          </span>
        </div>
        <h3 className="mb-2 text-base font-semibold leading-6">{detail.sourceTitle}</h3>
        <a
          className="mb-4 block truncate text-xs text-primary underline-offset-2 hover:underline"
          href={detail.sourceUrl}
          rel="noreferrer"
          target="_blank"
        >
          {detail.sourceUrl}
        </a>
        <div className="mb-4 flex items-center gap-2">
          <Button
            disabled={loading}
            onClick={() => onOpenSource(detail)}
            size="sm"
            variant="subtle"
          >
            <ExternalLink size={15} />
            Open Source
          </Button>
          {detail.version.versionNo > 1 ? <Badge>v{detail.version.versionNo}</Badge> : null}
          {!detail.version.isCurrent ? <Badge>superseded</Badge> : null}
        </div>
        <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">
          {detail.normalizedText}
        </p>
      </article>
    </div>
  );
}

function ChatHistoryPanel({
  items,
  onBack,
  onOpenSession,
  previousMarker,
  prompt,
}: {
  items: ChatSessionSummary[];
  onBack: () => void;
  onOpenSession: (sessionId: string) => void;
  previousMarker: React.ReactNode;
  prompt: React.ReactNode;
}) {
  return (
    <div className="relative z-10 flex min-h-0 flex-1 flex-col">
      <div className="flex h-[62px] shrink-0 items-center gap-3 border-b border-border px-5">
        <IconButton label="Back to Agent Home" onClick={onBack}>
          <ArrowLeft size={17} />
        </IconButton>
        <div className="min-w-0 leading-tight">
          <h3 className="truncate text-[20px] font-semibold leading-7">History</h3>
          <p className="truncate text-[11px] text-muted-foreground">Local conversations</p>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-3 px-6 py-4">
        {prompt}
        {previousMarker}
        {items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center rounded-lg border border-border bg-surface px-5 text-center">
            <Clock className="mb-3 text-muted-foreground" size={24} />
            <h3 className="text-sm font-semibold">No saved conversations</h3>
            <p className="mt-1 text-xs text-muted-foreground">Ask Clio to start a local history.</p>
          </div>
        ) : (
          <ul className="clio-scroll flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  className="flex w-full flex-col gap-2 rounded-lg border border-border bg-surface p-3.5 text-left outline-none transition-colors hover:border-border-strong hover:bg-surface-subtle focus-visible:ring-2 focus-visible:ring-primary"
                  onClick={() => onOpenSession(item.id)}
                  type="button"
                >
                  <span className="flex min-w-0 items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{item.title}</span>
                      <span className="mt-1 block truncate text-[11px] text-muted-foreground">
                        {formatDate(item.updatedAt)}
                      </span>
                    </span>
                    <ChevronRight className="mt-0.5 shrink-0 text-muted-foreground" size={16} />
                  </span>
                  <span className="line-clamp-2 text-[12px] leading-5 text-muted-foreground">
                    {item.lastMessageExcerpt || "Empty conversation"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Composer({
  active,
  blocked,
  onCancel,
  onClearComposerSkillMode,
  onComposerAttachmentRequestConsumed,
  onInputChange,
  onPrefillConsumed,
  onRuntimeStatus,
  onSubmit,
  providerSettings,
  slashCommands,
  slashContext,
  state,
}: {
  active: boolean;
  blocked: boolean;
  onCancel: () => void;
  onClearComposerSkillMode: () => void;
  onComposerAttachmentRequestConsumed: () => void;
  onInputChange: () => void;
  onPrefillConsumed: () => void;
  onRuntimeStatus: (message: string) => void;
  onSubmit: (content: string, attachment?: ComposerContextAttachmentKind) => void;
  providerSettings: ProviderSettings | null;
  slashCommands: SlashCommand[];
  slashContext: SlashCommandContext;
  state: RailState;
}) {
  const [content, setContent] = React.useState("");
  const [attachment, setAttachment] = React.useState<ComposerContextAttachmentKind | undefined>();
  const [slashListOpen, setSlashListOpen] = React.useState(false);
  const [selectedSlashIndex, setSelectedSlashIndex] = React.useState(0);
  const formRef = React.useRef<HTMLFormElement | null>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const visibleSlashCommands = React.useMemo(
    () => filterAvailableSlashCommands(slashCommands, slashContext, content),
    [content, slashCommands, slashContext],
  );
  const selectionPreview = normalizePreview(state.selectionSnapshot?.text ?? "");
  const hasSelection = selectionPreview.length > 0;
  const selectionCandidateLabel = formatSelectionContextLabel(selectionPreview, "candidate");
  const selectionChipLabel = formatSelectionContextLabel(selectionPreview, "attached");
  const skillMode = state.composerSkillMode;
  const hasInputObject = content.trim().length > 0 || attachment !== undefined;
  const skillNeedsInput = skillMode !== undefined && !hasInputObject;
  const ordinaryChatNeedsText = skillMode === undefined && content.trim().length === 0;
  const sendDisabled = blocked || skillNeedsInput || ordinaryChatNeedsText;
  const modelLabel = composerModelLabel(providerSettings);
  const showContextRow =
    skillMode !== undefined || attachment !== undefined || (hasSelection && !blocked);

  React.useEffect(() => {
    if (state.composerPrefill === undefined) return;
    setContent(state.composerPrefill.content);
    setSlashListOpen(isSlashCommandInput(state.composerPrefill.content));
    window.setTimeout(() => textareaRef.current?.focus(), 0);
    onPrefillConsumed();
  }, [onPrefillConsumed, state.composerPrefill]);

  React.useEffect(() => {
    if (state.composerAttachmentRequest === undefined) return;
    setAttachment(state.composerAttachmentRequest.kind);
    window.setTimeout(() => textareaRef.current?.focus(), 0);
    onComposerAttachmentRequestConsumed();
  }, [onComposerAttachmentRequestConsumed, state.composerAttachmentRequest]);

  React.useEffect(() => {
    if (skillMode === undefined) return;
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  }, [skillMode]);

  React.useEffect(() => {
    if (blocked) setAttachment(undefined);
  }, [blocked]);

  React.useEffect(() => {
    if (!slashListOpen) return;
    setSelectedSlashIndex(0);
  }, [slashListOpen]);

  React.useEffect(() => {
    if (!slashListOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const form = formRef.current;
      if (form !== null && event.composedPath().includes(form)) return;
      setSlashListOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [slashListOpen]);

  const runSlashCommand = (command: SlashCommand, argument?: string) => {
    if (!executeSlashCommand(command, slashContext, argument)) {
      onRuntimeStatus("Command unavailable");
      setSlashListOpen(false);
      return true;
    }
    setContent("");
    setAttachment(undefined);
    setSlashListOpen(false);
    return true;
  };

  const submitSlashInput = () => {
    const parsed = parseSlashCommandInput(content, slashCommands);
    if (parsed.kind === "chat") return false;
    if (parsed.kind === "exact") {
      return runSlashCommand(parsed.command, parsed.argument);
    }
    onRuntimeStatus("Unknown command");
    setSlashListOpen(false);
    return true;
  };

  const executeSelectedSlashCommand = () => {
    if (slashInputHasArguments(content)) return submitSlashInput();
    const command = visibleSlashCommands[selectedSlashIndex];
    if (command === undefined) return submitSlashInput();
    return runSlashCommand(command);
  };

  const submitComposer = () => {
    if (blocked) return;
    if (submitSlashInput()) return;
    const next = content.trim();
    if (skillMode !== undefined && next.length === 0 && attachment === undefined) {
      onRuntimeStatus("Add text or choose Page/Selection");
      return;
    }
    if (skillMode === undefined && next.length === 0) return;
    onSubmit(next, attachment);
    setContent("");
    setAttachment(undefined);
  };

  const statusMessage =
    state.runtimeStatus?.message ??
    (blocked
      ? "Retry, Stop, or Clear first."
      : skillNeedsInput
        ? "Add text or choose Page/Selection."
        : active
          ? agentRuntimeStatusMessage
          : "");
  const showStatus = statusMessage.length > 0;

  return (
    <form
      ref={formRef}
      className="relative z-20 shrink-0 border-t border-border bg-background px-6 pb-5 pt-4"
      data-clio-composer="true"
      onSubmit={(event) => {
        event.preventDefault();
        submitComposer();
      }}
    >
      {showContextRow ? (
        <div className="mb-3 flex min-h-8 flex-wrap items-center gap-2 px-1">
          {skillMode === undefined ? null : (
            <SkillModeChip label={skillMode.label} onRemove={onClearComposerSkillMode} />
          )}
          {blocked ? null : attachment === undefined ? (
            hasSelection ? (
              <ContextActionButton dataAttr="selection" onClick={() => setAttachment("selection")}>
                <MessageSquare size={13} />
                <span>{selectionCandidateLabel}</span>
              </ContextActionButton>
            ) : null
          ) : (
            <ContextChip
              kind={attachment}
              label={attachment === "selection" ? selectionChipLabel : "Page"}
              onRemove={() => setAttachment(undefined)}
            />
          )}
        </div>
      ) : null}
      {slashListOpen ? (
        <SlashCommandList
          commands={visibleSlashCommands}
          selectedIndex={slashInputHasArguments(content) ? -1 : selectedSlashIndex}
          onSelect={runSlashCommand}
        />
      ) : null}
      <div className="group relative min-h-[102px] overflow-hidden rounded-xl border border-border-strong bg-surface p-3.5 transition-colors focus-within:border-primary/60">
        <div className="relative z-10 flex items-start gap-2">
          <textarea
            className="min-h-[42px] flex-1 resize-none bg-transparent p-0 text-[14px] leading-5 text-foreground outline-none placeholder:text-muted-foreground"
            data-clio-composer-input="true"
            disabled={blocked}
            onChange={(event) => {
              const next = event.target.value;
              setContent(next);
              setSelectedSlashIndex(0);
              setSlashListOpen(isSlashCommandInput(next));
              onInputChange();
            }}
            onKeyDown={(event) => {
              if (isComposerSubmitKeyEvent(event)) {
                event.preventDefault();
                if (slashListOpen) {
                  executeSelectedSlashCommand();
                  return;
                }
                submitComposer();
                return;
              }
              if (!slashListOpen) return;
              if (event.key === "Escape") {
                event.preventDefault();
                setSlashListOpen(false);
                return;
              }
              if (event.key === "ArrowDown") {
                event.preventDefault();
                if (visibleSlashCommands.length === 0 || slashInputHasArguments(content)) return;
                setSelectedSlashIndex((index) =>
                  Math.min(index + 1, visibleSlashCommands.length - 1),
                );
                return;
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                if (visibleSlashCommands.length === 0 || slashInputHasArguments(content)) return;
                setSelectedSlashIndex((index) => Math.max(index - 1, 0));
                return;
              }
            }}
            placeholder={
              blocked
                ? "Resolve interrupted answer first."
                : skillMode !== undefined
                  ? skillMode.placeholder
                  : active
                    ? "Queue a follow-up..."
                    : "Ask Clio anything..."
            }
            ref={textareaRef}
            value={content}
          />
          <button
            aria-label="Voice input"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary"
            onClick={() => onRuntimeStatus("Voice input is not connected yet.")}
            type="button"
          >
            <Mic size={17} />
          </button>
        </div>
        {showStatus ? (
          <div className="relative z-10 mt-2 flex min-w-0 items-center gap-1.5 rounded-md bg-muted px-2.5 py-1 text-[11px] text-muted-foreground">
            <Sparkles className="shrink-0 text-primary" size={13} />
            <span className="truncate">{statusMessage}</span>
          </div>
        ) : null}
        <div className="relative z-10 mt-3 flex items-center justify-between border-t border-border pt-2.5">
          <span className="inline-flex min-w-0 max-w-[168px] items-center gap-1.5 rounded-md bg-muted px-2.5 py-1 text-[11px] font-medium text-foreground-soft">
            <Sparkles className="shrink-0 text-primary" size={13} />
            <span className="truncate">{modelLabel}</span>
          </span>
          <div className="ml-2 flex items-center gap-1.5">
            <button
              aria-label="Attach current page"
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-45"
              disabled={blocked}
              onClick={() => setAttachment("page")}
              title="Attach current page"
              type="button"
            >
              <Paperclip size={16} />
            </button>
            <button
              aria-label="Open slash commands"
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-45"
              disabled={blocked}
              onClick={() => {
                setContent("/");
                setSlashListOpen(true);
                setSelectedSlashIndex(0);
                window.setTimeout(() => textareaRef.current?.focus(), 0);
              }}
              title="Commands"
              type="button"
            >
              <Command size={16} />
            </button>
            {active ? (
              <button
                className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-foreground outline-none transition-colors hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-primary"
                onClick={onCancel}
                title="Stop"
                type="button"
              >
                <Square size={13} />
              </button>
            ) : null}
            <button
              className="ml-1 flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground outline-none transition-colors hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-45"
              data-clio-composer-send="true"
              disabled={sendDisabled}
              title={active ? "Queue follow-up" : "Send"}
              type="submit"
            >
              <ArrowUp size={17} strokeWidth={2.4} />
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}

function composerModelLabel(settings: ProviderSettings | null) {
  if (settings === null) return "Clio Agent";
  const provider = settings.activeProvider;
  const model =
    provider === "openai"
      ? settings.openai.model
      : provider === "openai-compatible"
        ? settings.openaiCompatible.model
        : settings.gemini.model;
  const compactModel = model.length <= 12 ? ` - ${model}` : "";
  return `${providerLabel(provider)}${compactModel}`;
}

function formatSelectionContextLabel(selectionPreview: string, mode: "attached" | "candidate") {
  const base = mode === "candidate" ? "Use selection" : "Selection";
  if (selectionPreview.length === 0) return base;
  return `${base} - ${Math.min(selectionPreview.length, 999)} chars`;
}

function SlashCommandList({
  commands,
  onSelect,
  selectedIndex,
}: {
  commands: SlashCommand[];
  onSelect: (command: SlashCommand) => void;
  selectedIndex: number;
}) {
  return (
    <div
      className="mb-2 overflow-hidden rounded-xl border border-border bg-surface shadow-[0_10px_28px_rgba(15,15,15,0.10)]"
      data-clio-slash-command-list="true"
    >
      {commands.length === 0 ? (
        <div className="px-3 py-3 text-[12px] text-muted-foreground">No commands</div>
      ) : (
        <ul className="max-h-[180px] overflow-y-auto overflow-x-hidden p-1.5">
          {commands.map((command, index) => (
            <li key={command.id}>
              <button
                className={[
                  "flex w-full items-center justify-between gap-3 rounded-md border px-2.5 py-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary",
                  index === selectedIndex
                    ? "border-transparent bg-surface-hover"
                    : "border-transparent bg-transparent hover:bg-muted",
                ].join(" ")}
                onClick={() => onSelect(command)}
                type="button"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium text-foreground">
                    {command.trigger}
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {command.description}
                  </span>
                </span>
                <span className="shrink-0 text-[11px] text-primary">{command.title}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ContextActionButton({
  children,
  dataAttr,
  onClick,
}: {
  children: React.ReactNode;
  dataAttr?: ComposerContextAttachmentKind;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={dataAttr === "selection" ? "Use selected text" : undefined}
      className="inline-flex h-7 items-center gap-1.5 rounded-md bg-muted px-2.5 text-[11px] font-medium text-foreground outline-none transition-colors hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-primary"
      data-clio-composer-attachment={dataAttr}
      data-clio-selection-candidate={dataAttr === "selection" ? "true" : undefined}
      onClick={onClick}
      title={dataAttr === "selection" ? "Use selected text" : undefined}
      type="button"
    >
      {children}
    </button>
  );
}

function SkillModeChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-md bg-muted px-2.5 text-[11px] text-foreground">
      <Sparkles size={13} />
      <span className="truncate">{label}</span>
      <button
        aria-label="Clear skill mode"
        className="ml-0.5 rounded-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary"
        onClick={onRemove}
        type="button"
      >
        <X size={12} />
      </button>
    </span>
  );
}

function ContextChip({
  kind,
  label,
  onRemove,
}: {
  kind: ComposerContextAttachmentKind;
  label: string;
  onRemove: () => void;
}) {
  return (
    <span
      className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-md bg-muted px-2.5 text-[11px] text-foreground"
      data-clio-composer-attachment={kind}
      data-clio-selection-chip={kind === "selection" ? "true" : undefined}
    >
      {kind === "selection" ? <MessageSquare size={13} /> : <BookOpen size={13} />}
      <span className="truncate">{label}</span>
      <button
        aria-label="Remove attached context"
        className="ml-0.5 rounded-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary"
        onClick={onRemove}
        type="button"
      >
        <X size={12} />
      </button>
    </span>
  );
}

function normalizePreview(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function sourceHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function InlineHealthBanner({
  health,
  onOpenSettings,
}: {
  health: EngineHealth | null;
  onOpenSettings: () => void;
}) {
  if (health === null || health.status === "ready") return null;
  return (
    <div className="rounded-lg border border-warning-border bg-warning-background px-3 py-2 text-xs text-warning-foreground">
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <ShieldAlert className="shrink-0" size={15} />
          <span className="truncate">{health.message ?? "Storage health needs attention."}</span>
        </span>
        <Button onClick={onOpenSettings} size="sm" variant="ghost">
          Settings
        </Button>
      </div>
    </div>
  );
}

function renderRoutePrompt(props: RailShellProps) {
  const pending = props.state.pendingPageChange;
  if (pending === undefined) return null;
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs text-foreground">
      <div className="mb-2 font-medium">New page detected</div>
      <div className="mb-2 truncate text-muted-foreground">{pending.title}</div>
      <div className="flex gap-2">
        <Button onClick={props.onAcceptPageChange} size="sm" variant="subtle">
          Switch
        </Button>
        <Button onClick={props.onKeepPreviousPage} size="sm" variant="ghost">
          Keep previous
        </Button>
      </div>
    </div>
  );
}

function renderPreviousPageMarker(props: RailShellProps) {
  if (!props.state.preservingPreviousPageContext) return null;
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-xs text-muted-foreground">
      <span className="min-w-0 truncate">
        Using previous page: {props.state.activePageContext.title}
      </span>
      <button
        className="shrink-0 text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-primary"
        onClick={props.onSwitchToLatestPage}
        type="button"
      >
        Switch to latest
      </button>
    </div>
  );
}

function IconButton({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg outline-none transition-colors hover:bg-surface hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary"
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2 px-1 text-[12px] font-medium text-muted-foreground">{children}</h3>;
}
