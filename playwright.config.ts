import { defineConfig } from "@playwright/test";

export default defineConfig({
  forbidOnly: true,
  fullyParallel: false,
  reporter: "line",
  testDir: "./tests/e2e",
  timeout: 0,
  use: {
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
    screenshot: "off",
    trace: "off",
    video: "off",
  },
  workers: 1,
});
