import { type TestWorkspaceBuildConfig, isTestWorkspaceBuildConfig } from "./contracts";

declare const __CLIO_TEST_WORKSPACE_CONFIG__: unknown;

export const testWorkspaceBuildConfig = readTestWorkspaceBuildConfig();

export function readTestWorkspaceBuildConfig(
  value: unknown = typeof __CLIO_TEST_WORKSPACE_CONFIG__ === "undefined"
    ? null
    : __CLIO_TEST_WORKSPACE_CONFIG__,
): TestWorkspaceBuildConfig | null {
  if (value === null || value === undefined) return null;
  if (!isTestWorkspaceBuildConfig(value)) {
    throw new Error("Invalid build-time test workspace configuration.");
  }
  return value;
}
