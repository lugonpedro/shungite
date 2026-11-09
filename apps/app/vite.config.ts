import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig, type Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const TARGETS = ["tauri", "web"] as const;
type Target = (typeof TARGETS)[number];

/** Dark app background; also the PWA splash/theme color (see src/styles.css). */
const THEME_COLOR = "#18181b";

function resolveTarget(value: string | undefined): Target {
  const target = value ?? "tauri";
  if (TARGETS.includes(target as Target)) return target as Target;
  throw new Error(
    `VITE_TARGET inválido: "${target}". Use "tauri" ou "web".`,
  );
}

const target = resolveTarget(process.env.VITE_TARGET);

/**
 * iOS only reads a subset of the web app manifest: the home-screen icon and
 * full-screen mode come from these tags. They are injected on the web build
 * only, so the Tauri build keeps its output byte-for-byte unchanged.
 */
function webAppHeadTags(): Plugin {
  return {
    name: "shungite-web-app-head-tags",
    transformIndexHtml() {
      return [
        {
          tag: "link",
          attrs: {
            rel: "apple-touch-icon",
            sizes: "180x180",
            href: "/pwa/apple-touch-icon-180x180.png",
          },
          injectTo: "head",
        },
        {
          tag: "link",
          attrs: {
            rel: "icon",
            type: "image/png",
            sizes: "192x192",
            href: "/pwa/pwa-192x192.png",
          },
          injectTo: "head",
        },
        {
          tag: "meta",
          attrs: { name: "theme-color", content: THEME_COLOR },
          injectTo: "head",
        },
        {
          tag: "meta",
          attrs: { name: "mobile-web-app-capable", content: "yes" },
          injectTo: "head",
        },
        {
          tag: "meta",
          attrs: { name: "apple-mobile-web-app-capable", content: "yes" },
          injectTo: "head",
        },
        {
          tag: "meta",
          attrs: {
            name: "apple-mobile-web-app-status-bar-style",
            content: "black-translucent",
          },
          injectTo: "head",
        },
        {
          tag: "meta",
          attrs: { name: "apple-mobile-web-app-title", content: "Shungite" },
          injectTo: "head",
        },
      ];
    },
  };
}

const plugins: Plugin[] = [react()];

if (target === "web") {
  plugins.push(
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      // Manifest icons are precached automatically; the Apple touch icon is
      // not part of the manifest, so list it explicitly.
      includeAssets: ["pwa/apple-touch-icon-180x180.png"],
      manifest: {
        id: "/",
        name: "Shungite",
        short_name: "Shungite",
        description:
          "Todo list local-first: Tasks em Markdown com Sync opcional.",
        lang: "pt-BR",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        theme_color: THEME_COLOR,
        background_color: THEME_COLOR,
        icons: [
          {
            src: "/pwa/pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/pwa/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/pwa/maskable-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // Precache the app shell so the app opens offline. Data lives in
        // IndexedDB (see ADR 0002); no push and no background sync.
        // png icons come from the manifest and includeAssets below.
        globPatterns: ["**/*.{js,css,html,svg,ico,woff,woff2}"],
        navigateFallback: "/index.html",
        cleanupOutdatedCaches: true,
      },
    }),
    webAppHeadTags(),
  );
}

export default defineConfig({
  plugins,
  // `public/` only holds PWA assets, which belong to the web target. Keeping it
  // out of the Tauri build leaves that build's output unchanged.
  publicDir: target === "web" ? "public" : false,
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
