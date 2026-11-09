import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

// Component tests need a DOM (jsdom); the IndexedDB adapter tests load
// `fake-indexeddb/auto` themselves and run fine in the same environment.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Tests that need the real platform module can use the Tauri variant;
      // login tests mock `../platform` to exercise the web build.
      "@platform-impl": fileURLToPath(
        new URL("./src/platform/tauri.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
