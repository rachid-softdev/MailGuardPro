import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      reportsDirectory: "coverage",
    },
    env: {
      API_KEY_PEPPER: "test-pepper-00000000000000000000000000000000",
      TOKEN_ENCRYPTION_KEY: "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
