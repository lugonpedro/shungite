import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

const TARGETS = ["tauri", "web"] as const;
type Target = (typeof TARGETS)[number];

function resolveTarget(value: string | undefined): Target {
  const target = value ?? "tauri";
  if (TARGETS.includes(target as Target)) return target as Target;
  throw new Error(
    `VITE_TARGET inválido: "${target}". Use "tauri" ou "web".`,
  );
}

const target = resolveTarget(process.env.VITE_TARGET);

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
