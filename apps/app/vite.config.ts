import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

const target = process.env.VITE_TARGET ?? "tauri";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  resolve: {
    alias: {
      "@platform-impl": fileURLToPath(
        new URL(`./src/platform/${target}.ts`, import.meta.url),
      ),
    },
  },
});
