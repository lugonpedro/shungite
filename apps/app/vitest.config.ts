import { defineConfig } from "vitest/config";

// The IndexedDB adapters run in Node with `fake-indexeddb`; no DOM needed.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
