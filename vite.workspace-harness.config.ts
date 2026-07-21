import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Workspace-page preview harness ONLY (gate G-PO) — deliberately separate from
 * `vite.config.ts` so the real extension build is untouched by it. Serves
 * `workspace-harness/`, which stubs `chrome.storage` with representative captured
 * edits and mounts the REAL `<Workspace/>` component so the page can be rendered and
 * observed without a live org. Same pattern as the interaction dev harness
 * (`vite.harness.config.ts`), different surface.
 */
export default defineConfig({
  root: "workspace-harness",
  plugins: [react()],
  server: {
    port: 5200,
    strictPort: true,
    fs: { allow: [".."] },
  },
});
