import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./manifest.config";

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  build: {
    rollupOptions: {
      // crxjs auto-detects HTML entries referenced by manifest fields it parses
      // (action.default_popup, etc). src/health/index.html is only referenced via
      // web_accessible_resources, which makes crxjs copy the raw file but skips the
      // usual Vite HTML transform (script tag -> built asset). Declaring it here
      // explicitly gets it processed the same way the popup is.
      input: {
        health: "src/health/index.html",
      },
    },
  },
  server: {
    // Puerto fijo para que el HMR de crxjs funcione de forma predecible
    port: 5173,
    strictPort: true,
  },
});
