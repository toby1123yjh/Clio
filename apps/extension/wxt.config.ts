import { existsSync, readFileSync } from "node:fs";
import { defineConfig } from "wxt";

const sqliteOpfsProxyAsset = "assets/sqlite3-opfs-async-proxy.js";
const sqliteOpfsProxySource = fileUrlPath(
  new URL(
    "./node_modules/@sqlite.org/sqlite-wasm/dist/sqlite3-opfs-async-proxy.js",
    import.meta.url,
  ),
);
const localEnv = loadLocalEnvFiles([
  fileUrlPath(new URL("../../.env.local", import.meta.url)),
  fileUrlPath(new URL("./.env.local", import.meta.url)),
]);
const defaultOpenAIApiKey =
  process.env.VITE_CLIO_OPENAI_API_KEY ??
  localEnv.VITE_CLIO_OPENAI_API_KEY ??
  process.env.CLIO_OPENAI_API_KEY ??
  localEnv.CLIO_OPENAI_API_KEY ??
  "";
const defaultOpenAIBaseUrl =
  process.env.VITE_CLIO_OPENAI_BASE_URL ??
  localEnv.VITE_CLIO_OPENAI_BASE_URL ??
  process.env.CLIO_OPENAI_BASE_URL ??
  localEnv.CLIO_OPENAI_BASE_URL ??
  "";
const defaultOpenAIModel =
  process.env.VITE_CLIO_OPENAI_MODEL ??
  localEnv.VITE_CLIO_OPENAI_MODEL ??
  process.env.CLIO_OPENAI_MODEL ??
  localEnv.CLIO_OPENAI_MODEL ??
  "";

type OutputBundleItem =
  | {
      type: "chunk";
      fileName: string;
      code: string;
    }
  | {
      type: "asset";
      fileName: string;
      source: string | Uint8Array;
    };

// See https://wxt.dev/api/config.html
export default defineConfig({
  manifest: {
    name: "Clio",
    short_name: "Clio",
    description:
      "Evidence-first, browser-only knowledge companion. Capture, recall, and ground answers in your own reading.",
    version: "0.0.1",
    // Phase 1A: capture, local engine, Offscreen/Worker SQLite, and in-page Toolbox.
    permissions: [
      "storage",
      "tabs",
      "scripting",
      "activeTab",
      "offscreen",
      "alarms",
      "contextMenus",
      "unlimitedStorage",
    ],
    // Rail-side provider setup must work without Chrome runtime permission prompts.
    // OpenAI-compatible Base URLs can be arbitrary HTTPS origins, so grant host access upfront.
    host_permissions: ["<all_urls>"],
    // MV3 production CSP. Allows WASM ('wasm-unsafe-eval') and module workers.
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; worker-src 'self'",
    },
    // SQLite WASM OPFS requires cross-origin isolation so SharedArrayBuffer is available.
    cross_origin_opener_policy: {
      value: "same-origin",
    },
    cross_origin_embedder_policy: {
      value: "require-corp",
    },
    web_accessible_resources: [
      {
        resources: ["assets/*", "icon/*"],
        matches: ["<all_urls>"],
      },
    ],
    action: {
      default_title: "Open Clio Toolbox",
    },
    commands: {
      open_rail: {
        suggested_key: {
          default: "Alt+Shift+C",
        },
        description: "Open or focus the Clio Toolbox",
      },
      command_palette: {
        suggested_key: {
          default: "Ctrl+Shift+K",
          mac: "Command+Shift+K",
        },
        description: "Open the Clio Toolbox",
      },
      save_page: {
        suggested_key: {
          default: "Alt+Shift+S",
        },
        description: "Save the current page to Clio memory",
      },
    },
  },
  dev: {
    reloadCommand: false,
  },
  hooks: {
    "build:publicAssets": (_wxt, files) => {
      files.push({
        absoluteSrc: sqliteOpfsProxySource,
        relativeDest: sqliteOpfsProxyAsset,
      });
    },
  },
  vite: () => ({
    esbuild: {
      charset: "ascii",
    },
    define: {
      __CLIO_DEFAULT_OPENAI_API_KEY__: JSON.stringify(defaultOpenAIApiKey),
      __CLIO_DEFAULT_OPENAI_BASE_URL__: JSON.stringify(defaultOpenAIBaseUrl),
      __CLIO_DEFAULT_OPENAI_MODEL__: JSON.stringify(defaultOpenAIModel),
    },
    optimizeDeps: {
      exclude: ["@sqlite.org/sqlite-wasm"],
      esbuildOptions: {
        charset: "ascii",
      },
    },
    plugins: [asciiSafeJavaScriptOutputPlugin()],
    server: {
      headers: {
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Embedder-Policy": "require-corp",
      },
    },
  }),
});

function fileUrlPath(url: URL) {
  const pathname = decodeURIComponent(url.pathname);
  return pathname.replace(/^\/([A-Za-z]:\/)/, "$1");
}

function loadLocalEnvFiles(files: string[]) {
  const values: Record<string, string> = {};
  for (const file of files) {
    if (!existsSync(file)) continue;
    Object.assign(values, parseLocalEnv(readFileSync(file, "utf8")));
  }
  return values;
}

function parseLocalEnv(contents: string) {
  const values: Record<string, string> = {};
  for (const line of contents.split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (match === null || match[1] === undefined || match[2] === undefined) continue;
    values[match[1]] = unquoteLocalEnvValue(match[2]);
  }
  return values;
}

function unquoteLocalEnvValue(value: string) {
  const trimmed = value.trim();
  if (trimmed.length >= 2) {
    const quote = trimmed[0];
    if ((quote === '"' || quote === "'") && trimmed.endsWith(quote)) {
      return trimmed.slice(1, -1);
    }
  }
  return trimmed;
}

function asciiSafeJavaScriptOutputPlugin() {
  return {
    name: "clio-ascii-safe-javascript-output",
    generateBundle(_options: unknown, bundle: Record<string, OutputBundleItem>) {
      for (const item of Object.values(bundle)) {
        if (!item.fileName.endsWith(".js")) continue;
        if (item.type === "chunk") {
          item.code = escapeUnsafeJavaScriptSource(item.code);
        } else if (typeof item.source === "string") {
          item.source = escapeUnsafeJavaScriptSource(item.source);
        }
      }
    },
  };
}

function escapeUnsafeJavaScriptSource(source: string) {
  let escaped = "";
  for (let index = 0; index < source.length; index += 1) {
    const code = source.charCodeAt(index);
    if (isSafeJavaScriptSourceCodeUnit(code)) {
      escaped += source.charAt(index);
      continue;
    }
    escaped += code <= 0xff ? `\\x${hex(code, 2)}` : `\\u${hex(code, 4)}`;
  }
  return escaped;
}

function isSafeJavaScriptSourceCodeUnit(code: number) {
  return code === 9 || code === 10 || code === 13 || (code >= 32 && code <= 126);
}

function hex(code: number, width: number) {
  return code.toString(16).toUpperCase().padStart(width, "0");
}
