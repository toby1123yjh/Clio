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
  defaultActiveProvider,
  defaultGeminiModel,
  defaultOpenAICompatibleModel,
  defaultOpenAICompatibleProviderName,
  defaultOpenAIModel,
} from "@/src/agent-runtime/provider-settings";
import { installPhase0PocHost } from "@/src/phase0/poc-host";
import { requestEngine, requestProvider } from "@/src/shared/chrome-client";
import type { EngineHealth, JobSummary, RepairAction } from "@/src/shared/rpc";
import { Badge } from "@/src/ui/components/badge";
import { Button } from "@/src/ui/components/button";
import { Input } from "@/src/ui/components/input";
import {
  Bot,
  Database,
  Eye,
  EyeOff,
  KeyRound,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Trash2,
  Wifi,
} from "lucide-react";
import * as React from "react";
import { createRoot } from "react-dom/client";
import "@/src/ui/tailwind.css";
import "./style.css";

installPhase0PocHost("extension-page");

function OptionsApp() {
  const [health, setHealth] = React.useState<EngineHealth | null>(null);
  const [jobs, setJobs] = React.useState<JobSummary[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [providerSettings, setProviderSettings] = React.useState<ProviderSettings | null>(null);
  const [providerLoading, setProviderLoading] = React.useState(false);
  const [providerMessage, setProviderMessage] = React.useState<string | null>(null);
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

  const refresh = React.useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      setHealth(await requestEngine({ kind: "health" }));
      setJobs((await requestEngine({ kind: "getJobStatus", limit: 6 })).jobs);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to read storage health.");
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshProvider = React.useCallback(async () => {
    setProviderLoading(true);
    setProviderMessage(null);
    try {
      const settings = await requestProvider({ kind: "getProviderSettings" });
      setProviderSettings(settings);
    } catch (error) {
      setProviderMessage(error instanceof Error ? error.message : "Unable to read provider setup.");
    } finally {
      setProviderLoading(false);
    }
  }, []);

  const saveGeminiProvider = React.useCallback(async () => {
    setProviderLoading(true);
    setProviderMessage(null);
    try {
      const settings = await requestProvider({
        kind: "saveGeminiProvider",
        apiKey: geminiApiKey,
        model: geminiModel,
      });
      setProviderSettings(settings);
      setProviderMessage("Gemini provider saved.");
    } catch (error) {
      setProviderMessage(error instanceof Error ? error.message : "Unable to save provider.");
    } finally {
      setProviderLoading(false);
    }
  }, [geminiApiKey, geminiModel]);

  const testGeminiProvider = React.useCallback(async () => {
    setProviderLoading(true);
    setProviderMessage(null);
    try {
      await requestProvider({
        kind: "testGeminiProvider",
        apiKey: geminiApiKey,
        model: geminiModel,
      });
      const settings = await requestProvider({ kind: "getProviderSettings" });
      setProviderSettings(settings);
      setProviderMessage("Gemini connection works.");
    } catch (error) {
      setProviderMessage(error instanceof Error ? error.message : "Gemini connection test failed.");
    } finally {
      setProviderLoading(false);
    }
  }, [geminiApiKey, geminiModel]);

  const saveOpenAIProvider = React.useCallback(async () => {
    setProviderLoading(true);
    setProviderMessage(null);
    try {
      const settings = await requestProvider({
        kind: "saveOpenAIProvider",
        apiKey: openAIApiKey,
        model: openAIModel,
        baseUrl: openAIBaseUrl,
      });
      setProviderSettings(settings);
      setProviderMessage("OpenAI provider saved.");
    } catch (error) {
      setProviderMessage(error instanceof Error ? error.message : "Unable to save provider.");
    } finally {
      setProviderLoading(false);
    }
  }, [openAIApiKey, openAIBaseUrl, openAIModel]);

  const testOpenAIProvider = React.useCallback(async () => {
    setProviderLoading(true);
    setProviderMessage(null);
    try {
      await requestProvider({
        kind: "testOpenAIProvider",
        apiKey: openAIApiKey,
        model: openAIModel,
        baseUrl: openAIBaseUrl,
      });
      const settings = await requestProvider({ kind: "getProviderSettings" });
      setProviderSettings(settings);
      setProviderMessage("OpenAI connection works.");
    } catch (error) {
      setProviderMessage(error instanceof Error ? error.message : "OpenAI connection test failed.");
    } finally {
      setProviderLoading(false);
    }
  }, [openAIApiKey, openAIBaseUrl, openAIModel]);

  const saveOpenAICompatibleProvider = React.useCallback(async () => {
    setProviderLoading(true);
    setProviderMessage(null);
    try {
      const settings = await requestProvider({
        kind: "saveOpenAICompatibleProvider",
        apiKey: openAICompatibleApiKey,
        model: openAICompatibleModel,
        baseUrl: openAICompatibleBaseUrl,
        providerName: openAICompatibleProviderName,
      });
      setProviderSettings(settings);
      setProviderMessage("OpenAI-compatible provider saved.");
    } catch (error) {
      setProviderMessage(error instanceof Error ? error.message : "Unable to save provider.");
    } finally {
      setProviderLoading(false);
    }
  }, [
    openAICompatibleApiKey,
    openAICompatibleBaseUrl,
    openAICompatibleModel,
    openAICompatibleProviderName,
  ]);

  const testOpenAICompatibleProvider = React.useCallback(async () => {
    setProviderLoading(true);
    setProviderMessage(null);
    try {
      await requestProvider({
        kind: "testOpenAICompatibleProvider",
        apiKey: openAICompatibleApiKey,
        model: openAICompatibleModel,
        baseUrl: openAICompatibleBaseUrl,
        providerName: openAICompatibleProviderName,
      });
      const settings = await requestProvider({ kind: "getProviderSettings" });
      setProviderSettings(settings);
      setProviderMessage("OpenAI-compatible connection works.");
    } catch (error) {
      setProviderMessage(
        error instanceof Error ? error.message : "OpenAI-compatible connection test failed.",
      );
    } finally {
      setProviderLoading(false);
    }
  }, [
    openAICompatibleApiKey,
    openAICompatibleBaseUrl,
    openAICompatibleModel,
    openAICompatibleProviderName,
  ]);

  const selectProvider = React.useCallback(async (provider: ProviderId) => {
    setProviderLoading(true);
    setProviderMessage(null);
    try {
      const settings = await requestProvider({ kind: "setActiveProvider", provider });
      setProviderSettings(settings);
      setProviderMessage(`${providerLabel(provider)} selected.`);
    } catch (error) {
      setProviderMessage(error instanceof Error ? error.message : "Unable to switch provider.");
    } finally {
      setProviderLoading(false);
    }
  }, []);

  const allowProviderHost = React.useCallback(
    async (provider: ProviderId) => {
      setProviderLoading(true);
      setProviderMessage(null);
      try {
        const settings = await requestProvider(
          provider === "openai"
            ? { kind: "ensureOpenAIHostPermission", baseUrl: openAIBaseUrl }
            : provider === "openai-compatible"
              ? {
                  kind: "ensureOpenAICompatibleHostPermission",
                  baseUrl: openAICompatibleBaseUrl,
                }
              : { kind: "ensureGeminiHostPermission" },
        );
        setProviderSettings(settings);
        setProviderMessage(`${providerLabel(provider)} host access is available.`);
      } catch (error) {
        setProviderMessage(error instanceof Error ? error.message : "Unable to check host access.");
      } finally {
        setProviderLoading(false);
      }
    },
    [openAIBaseUrl, openAICompatibleBaseUrl],
  );

  const repair = React.useCallback(async (action: RepairAction) => {
    if (
      action === "reset_library" &&
      !window.confirm("Reset Clio local library? This deletes all saved local memories.")
    ) {
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const result = await requestEngine({ kind: "repair", action });
      setHealth(result.health);
      setMessage(repairMessage(action));
      setJobs((await requestEngine({ kind: "getJobStatus", limit: 6 })).jobs);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Repair action failed.");
    } finally {
      setLoading(false);
    }
  }, []);

  const reindex = React.useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const result = await requestEngine({ kind: "reindex", scope: "fts" });
      setMessage(`Reindex job ${result.jobId} is ${result.status}.`);
      setJobs((await requestEngine({ kind: "getJobStatus", limit: 6 })).jobs);
      setHealth(await requestEngine({ kind: "health" }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Reindex failed.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
    void refreshProvider();
  }, [refresh, refreshProvider]);

  React.useEffect(() => {
    if (providerSettings === null) return;
    setGeminiApiKey(providerSettings.gemini.apiKey ?? "");
    setGeminiModel(providerSettings.gemini.model);
    setOpenAIApiKey(providerSettings.openai.apiKey ?? "");
    setOpenAIModel(providerSettings.openai.model);
    setOpenAIBaseUrl(providerSettings.openai.baseUrl);
    setOpenAICompatibleApiKey(providerSettings.openaiCompatible.apiKey ?? "");
    setOpenAICompatibleModel(providerSettings.openaiCompatible.model);
    setOpenAICompatibleBaseUrl(providerSettings.openaiCompatible.baseUrl);
    setOpenAICompatibleProviderName(providerSettings.openaiCompatible.providerName);
  }, [providerSettings]);

  return (
    <main className="mx-auto max-w-3xl bg-background px-6 py-6 text-foreground">
      <header className="mb-6">
        <div className="mb-2 flex items-center gap-2">
          <Database size={20} />
          <h1 className="text-xl font-semibold">Clio Options</h1>
        </div>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          Clio stores memories locally and keeps saved provider keys in this browser profile.
        </p>
      </header>
      <section className="mb-5 rounded-md border border-border p-4">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <KeyRound size={17} />
              <h2 className="text-base font-semibold">AI Providers</h2>
              <Badge>{providerSettings?.activeProvider ?? "checking"}</Badge>
            </div>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              API keys are saved in this browser profile. The in-page Clio Settings panel is the
              primary setup path.
            </p>
          </div>
          <Button disabled={providerLoading} onClick={refreshProvider} variant="subtle">
            <RefreshCw className={providerLoading ? "animate-spin" : ""} size={16} />
            Refresh
          </Button>
        </div>
        <div className="mb-4 grid gap-1.5 text-sm">
          <label className="font-medium" htmlFor="clio-active-provider">
            Active Provider
          </label>
          <select
            className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
            disabled={providerLoading || providerSettings === null}
            id="clio-active-provider"
            onChange={(event) => void selectProvider(event.target.value as ProviderId)}
            value={providerSettings?.activeProvider ?? defaultActiveProvider}
          >
            <option value="gemini">Gemini</option>
            <option value="openai">OpenAI</option>
            <option value="openai-compatible">OpenAI Compatible</option>
          </select>
        </div>
        <div className="grid gap-4">
          <ProviderPanel
            active={providerSettings?.activeProvider === "gemini"}
            apiKey={geminiApiKey}
            defaultModel={defaultGeminiModel}
            label="Gemini"
            loading={providerLoading}
            model={geminiModel}
            onAllow={() => void allowProviderHost("gemini")}
            onApiKeyChange={setGeminiApiKey}
            onModelChange={setGeminiModel}
            onSave={() => void saveGeminiProvider()}
            onTest={() => void testGeminiProvider()}
            provider="gemini"
            settings={providerSettings?.gemini}
          />
          <ProviderPanel
            active={providerSettings?.activeProvider === "openai"}
            apiKey={openAIApiKey}
            baseUrl={openAIBaseUrl}
            defaultBaseUrl={defaultOpenAIBaseUrl}
            defaultModel={defaultOpenAIModel}
            label="OpenAI"
            loading={providerLoading}
            model={openAIModel}
            onAllow={() => void allowProviderHost("openai")}
            onApiKeyChange={setOpenAIApiKey}
            onBaseUrlChange={setOpenAIBaseUrl}
            onModelChange={setOpenAIModel}
            onSave={() => void saveOpenAIProvider()}
            onTest={() => void testOpenAIProvider()}
            provider="openai"
            settings={providerSettings?.openai}
          />
          <ProviderPanel
            active={providerSettings?.activeProvider === "openai-compatible"}
            apiKey={openAICompatibleApiKey}
            baseUrl={openAICompatibleBaseUrl}
            defaultBaseUrl={defaultOpenAICompatibleBaseUrl}
            defaultModel={defaultOpenAICompatibleModel}
            label="OpenAI Compatible"
            loading={providerLoading}
            model={openAICompatibleModel}
            onAllow={() => void allowProviderHost("openai-compatible")}
            onApiKeyChange={setOpenAICompatibleApiKey}
            onBaseUrlChange={setOpenAICompatibleBaseUrl}
            onModelChange={setOpenAICompatibleModel}
            onProviderNameChange={setOpenAICompatibleProviderName}
            onSave={() => void saveOpenAICompatibleProvider()}
            onTest={() => void testOpenAICompatibleProvider()}
            provider="openai-compatible"
            providerName={openAICompatibleProviderName}
            settings={providerSettings?.openaiCompatible}
          />
        </div>
        {providerMessage !== null ? (
          <div className="mt-4 rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
            {providerMessage}
          </div>
        ) : null}
      </section>
      <section className="rounded-md border border-border p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <h2 className="text-base font-semibold">Engine Status</h2>
              <Badge>{health?.status ?? "checking"}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {health?.message ?? "Checking local memory engine."}
            </p>
            {health?.sqliteVersion !== undefined ? (
              <p className="mt-1 text-xs text-muted-foreground">SQLite {health.sqliteVersion}</p>
            ) : null}
          </div>
          <Button disabled={loading} onClick={refresh} variant="subtle">
            <RefreshCw className={loading ? "animate-spin" : ""} size={16} />
            Retry
          </Button>
        </div>
        {message !== null ? (
          <div className="mb-4 rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
            {message}
          </div>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-3">
          <Button disabled={loading} onClick={() => void repair("retry_init")} variant="subtle">
            <RefreshCw size={16} />
            Retry Init
          </Button>
          <Button disabled={loading} onClick={() => void reindex()} variant="subtle">
            <RotateCcw size={16} />
            Rebuild FTS
          </Button>
          <Button disabled={loading} onClick={() => void repair("reset_library")} variant="danger">
            <Trash2 size={16} />
            Reset Library
          </Button>
        </div>
        {jobs.length > 0 ? (
          <div className="mt-5 border-t border-border pt-4">
            <h3 className="mb-2 text-sm font-semibold">Recent Jobs</h3>
            <ul className="space-y-2">
              {jobs.map((job) => (
                <li
                  className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm"
                  key={job.id}
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{job.type}</p>
                    {job.lastError !== undefined ? (
                      <p className="truncate text-xs text-muted-foreground">{job.lastError}</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {job.attempts}/{job.maxAttempts}
                    </span>
                    <Badge>{job.status}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
    </main>
  );
}

interface ProviderPanelProps {
  provider: ProviderId;
  label: string;
  active: boolean;
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
  onSave: () => void;
  onTest: () => void;
  onAllow: () => void;
}

function ProviderPanel(props: ProviderPanelProps) {
  const hasBaseUrl = props.baseUrl !== undefined && props.onBaseUrlChange !== undefined;
  const [apiKeyMasked, setApiKeyMasked] = React.useState(false);
  const apiKeyToggleLabel = apiKeyMasked
    ? `Show ${props.label} API key`
    : `Mask ${props.label} API key`;

  return (
    <div className="rounded-md border border-border p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Bot size={16} />
          <h3 className="text-sm font-semibold">{props.label}</h3>
          {props.active ? <Badge>active</Badge> : null}
          <Badge>{props.settings?.apiKeyConfigured ? "configured" : "not set"}</Badge>
        </div>
        <span className="text-xs text-muted-foreground">
          Host: {props.settings?.hostPermissionGranted ? "allowed" : "not allowed"}
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
        <div className="grid gap-1.5 text-sm">
          <label className="font-medium" htmlFor={`clio-${props.provider}-api-key`}>
            API Key
          </label>
          <div className="flex gap-2">
            <Input
              autoComplete="off"
              className="min-w-0"
              id={`clio-${props.provider}-api-key`}
              onChange={(event) => props.onApiKeyChange(event.target.value)}
              placeholder={`Paste ${props.label} API key`}
              type={apiKeyMasked ? "password" : "text"}
              value={props.apiKey}
            />
            <Button
              aria-label={apiKeyToggleLabel}
              onClick={() => setApiKeyMasked((value) => !value)}
              size="icon"
              title={apiKeyToggleLabel}
              type="button"
              variant="subtle"
            >
              {apiKeyMasked ? <Eye size={16} /> : <EyeOff size={16} />}
            </Button>
          </div>
        </div>
        <label className="grid gap-1.5 text-sm" htmlFor={`clio-${props.provider}-model`}>
          <span className="font-medium">Model</span>
          <Input
            id={`clio-${props.provider}-model`}
            onChange={(event) => props.onModelChange(event.target.value)}
            placeholder={props.defaultModel}
            value={props.model}
          />
        </label>
        {hasBaseUrl ? (
          <label
            className="grid gap-1.5 text-sm sm:col-span-2"
            htmlFor={`clio-${props.provider}-base-url`}
          >
            <span className="font-medium">Base URL</span>
            <Input
              id={`clio-${props.provider}-base-url`}
              onChange={(event) => props.onBaseUrlChange?.(event.target.value)}
              placeholder={props.defaultBaseUrl}
              value={props.baseUrl}
            />
          </label>
        ) : null}
        {props.providerName !== undefined && props.onProviderNameChange !== undefined ? (
          <label
            className="grid gap-1.5 text-sm sm:col-span-2"
            htmlFor={`clio-${props.provider}-provider-name`}
          >
            <span className="font-medium">Provider Name</span>
            <Input
              id={`clio-${props.provider}-provider-name`}
              onChange={(event) => props.onProviderNameChange?.(event.target.value)}
              placeholder={defaultOpenAICompatibleProviderName}
              value={props.providerName}
            />
          </label>
        ) : null}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button disabled={props.loading} onClick={props.onSave} variant="subtle">
          <ShieldCheck size={16} />
          Save
        </Button>
        <Button disabled={props.loading} onClick={props.onTest} variant="subtle">
          <Wifi size={16} />
          Test Connection
        </Button>
        <Button
          disabled={props.loading || props.settings?.hostPermissionGranted === true}
          onClick={props.onAllow}
          variant="ghost"
        >
          <ShieldCheck size={16} />
          Check Host
        </Button>
      </div>
    </div>
  );
}

function providerLabel(provider: ProviderId) {
  if (provider === "openai") return "OpenAI";
  if (provider === "openai-compatible") return "OpenAI Compatible";
  return "Gemini";
}

function repairMessage(action: RepairAction) {
  if (action === "retry_init") return "Engine initialization retried.";
  if (action === "rebuild_fts") return "Search index rebuilt from local memories.";
  return "Local library reset.";
}

createRoot(document.getElementById("app") ?? document.body).render(<OptionsApp />);
