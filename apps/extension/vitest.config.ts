import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
      "@shared": fileURLToPath(new URL("./src/shared", import.meta.url)),
    },
  },
  define: {
    __CLIO_DEFAULT_OPENAI_API_KEY__: JSON.stringify(""),
    __CLIO_DEFAULT_OPENAI_BASE_URL__: JSON.stringify(""),
    __CLIO_DEFAULT_OPENAI_MODEL__: JSON.stringify(""),
    __CLIO_TEST_WORKSPACE_CONFIG__: JSON.stringify(null),
  },
  test: {
    environment: "node",
  },
});
