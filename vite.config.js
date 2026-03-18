import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const host = process.env.TAURI_DEV_HOST;
const packageJson = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
const appVersion = packageJson.version;

// https://vitejs.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
        protocol: "ws",
        host,
        port: 1421,
      }
      : undefined,
    watch: {
      // 3. tell vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return;
          }

          if (id.includes("framer-motion")) {
            return "vendor-motion";
          }

          if (id.includes("country-flag-icons")) {
            return "vendor-flags";
          }

          if (id.includes("@tauri-apps")) {
            return "vendor-tauri";
          }

          if (
            id.includes("react-hot-toast") ||
            id.includes("@headlessui") ||
            id.includes("tailwind-merge")
          ) {
            return "vendor-ui";
          }

          return "vendor-core";
        },
      },
    },
  },
}));
