import type { SelectionState } from "@/src/rail/page/selection";
import { Bookmark, PanelRightOpen, Paperclip, Search } from "lucide-react";
// biome-ignore lint/style/useImportType: WXT production JSX output needs React at runtime in content scripts.
import * as React from "react";

export function SelectionMiniUi({
  loading,
  onAdd,
  onOpenRail,
  onSave,
  onSearch,
  selection,
}: {
  loading: boolean;
  onAdd: () => void;
  onOpenRail: () => void;
  onSave: () => void;
  onSearch: () => void;
  selection: SelectionState | null;
}) {
  if (selection === null) return null;
  return (
    <div
      className="fixed z-[2147483646] flex h-9 items-center gap-0.5 rounded-full border border-border bg-surface px-1 shadow-[0_8px_20px_rgba(15,15,15,0.10)]"
      data-clio-selection-mini-ui="true"
      style={{
        left: `${selection.x}px`,
        top: `${selection.y}px`,
        transform: "translate(-50%, -100%)",
      }}
    >
      <MiniButton disabled={loading} label="Save selection" onClick={onSave}>
        <Bookmark size={14} />
      </MiniButton>
      <MiniButton disabled={loading} label="Search memory" onClick={onSearch}>
        <Search size={14} />
      </MiniButton>
      <MiniButton disabled={loading} label="Add selection" onClick={onAdd} primary>
        <Paperclip size={14} />
      </MiniButton>
      <div className="mx-0.5 h-4 w-px bg-border" />
      <MiniButton disabled={loading} label="Open Clio" onClick={onOpenRail}>
        <PanelRightOpen size={14} />
      </MiniButton>
    </div>
  );
}

function MiniButton({
  children,
  disabled,
  label,
  onClick,
  primary = false,
}: {
  children: React.ReactNode;
  disabled: boolean;
  label: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      aria-label={label}
      className={[
        "inline-flex h-8 w-8 items-center justify-center rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50",
        primary
          ? "bg-primary text-primary-foreground hover:bg-primary-hover"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      ].join(" ")}
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}
