import { requestEngine, sendCurrentTabCommand } from "@/src/shared/chrome-client";
import type { EngineHealth } from "@/src/shared/rpc";
import { Button } from "@/src/ui/components/button";
import { Library, RefreshCw, Settings } from "lucide-react";
import * as React from "react";
import { createRoot } from "react-dom/client";
import "@/src/ui/tailwind.css";
import "./style.css";

function PopupApp() {
  const [health, setHealth] = React.useState<EngineHealth | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      setHealth(await requestEngine({ kind: "health" }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to read storage health.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <main className="w-[320px] bg-background p-3 text-foreground">
      <header className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h1 className="text-base font-semibold">Clio</h1>
          <p className="text-xs text-muted-foreground">{healthLabel(health)}</p>
        </div>
        <Button disabled={loading} onClick={refresh} size="icon" variant="ghost">
          <RefreshCw className={loading ? "animate-spin" : ""} size={16} />
        </Button>
      </header>
      {message !== null ? (
        <p className="mb-3 rounded-md border border-border bg-muted p-2 text-xs text-muted-foreground">
          {message}
        </p>
      ) : null}
      <div className="flex flex-col gap-2">
        <Button
          onClick={() => {
            void sendCurrentTabCommand({ action: "openRail" }).catch(() =>
              setMessage("Open Clio on a normal http or https page."),
            );
          }}
        >
          <Library size={16} />
          Open Toolbox
        </Button>
        <Button
          onClick={() => {
            void sendCurrentTabCommand({ action: "openSettings" }).catch(() =>
              setMessage("Open Clio settings on a normal http or https page."),
            );
          }}
          variant="subtle"
        >
          <Settings size={16} />
          Settings & AI Providers
        </Button>
      </div>
    </main>
  );
}

function healthLabel(health: EngineHealth | null) {
  if (health === null) return "Checking storage";
  if (health.status === "ready") return "Storage ready";
  if (health.status === "starting") return "Storage starting";
  if (health.status === "degraded") return "Storage degraded";
  return "Storage error";
}

createRoot(document.getElementById("app") ?? document.body).render(<PopupApp />);
