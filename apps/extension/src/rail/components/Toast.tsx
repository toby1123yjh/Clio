import type { ToastState } from "@/src/rail/app/feedback";
import * as React from "react";

export function Toast({ toast }: { toast: ToastState }) {
  const toneClass =
    toast.tone === "success"
      ? "border-primary"
      : toast.tone === "warning"
        ? "border-warning-border"
        : "border-danger";
  return (
    <output
      aria-live="polite"
      className={`pointer-events-none fixed bottom-5 right-5 z-[2147483647] max-w-[320px] rounded-lg border bg-surface px-4 py-3 text-sm text-foreground shadow-[0_8px_22px_rgba(15,15,15,0.10)] ${toneClass}`}
      data-clio-toast={toast.tone}
    >
      {toast.message}
    </output>
  );
}
