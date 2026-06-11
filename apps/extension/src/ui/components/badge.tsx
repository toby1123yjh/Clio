import { cn } from "@/src/ui/lib/cn";
// biome-ignore lint/style/useImportType: WXT production JSX output needs React at runtime in content scripts.
import * as React from "react";

export function Badge({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-md border border-border bg-muted px-2 text-xs font-medium text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}
