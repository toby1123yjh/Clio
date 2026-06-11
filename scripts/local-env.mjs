import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export function loadClioLocalEnv(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const override = options.override === true;
  const files = [path.resolve(cwd, ".env.local"), path.resolve(cwd, "apps/extension/.env.local")];

  for (const file of files) {
    if (!existsSync(file)) continue;
    for (const [key, value] of Object.entries(parseLocalEnv(readFileSync(file, "utf8")))) {
      if (!override && process.env[key] !== undefined && process.env[key] !== "") continue;
      process.env[key] = value;
    }
  }

  copyEnvAlias("VITE_CLIO_OPENAI_API_KEY", "CLIO_OPENAI_API_KEY", override);
  copyEnvAlias("VITE_CLIO_OPENAI_BASE_URL", "CLIO_OPENAI_BASE_URL", override);
  copyEnvAlias("VITE_CLIO_OPENAI_MODEL", "CLIO_OPENAI_MODEL", override);
}

function parseLocalEnv(contents) {
  const values = {};
  for (const line of contents.split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (match === null) continue;
    const [, key, value] = match;
    if (key === undefined || value === undefined) continue;
    values[key] = unquoteLocalEnvValue(value);
  }
  return values;
}

function copyEnvAlias(from, to, override) {
  const value = process.env[from]?.trim();
  if (value === undefined || value === "") return;
  if (!override && process.env[to] !== undefined && process.env[to] !== "") return;
  process.env[to] = value;
}

function unquoteLocalEnvValue(value) {
  const trimmed = value.trim();
  if (trimmed.length >= 2) {
    const quote = trimmed[0];
    if ((quote === '"' || quote === "'") && trimmed.endsWith(quote)) {
      return trimmed.slice(1, -1);
    }
  }
  return trimmed;
}
