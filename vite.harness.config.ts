import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Dev-harness server ONLY — deliberately separate from `vite.config.ts` so the real
 * extension build is untouched by it (no crxjs plugin, no manifest, different root).
 * See `dev-harness/main.ts` for what the harness is and why it exists.
 */
export default defineConfig({
  root: "dev-harness",
  plugins: [react()],
  server: {
    port: 5199,
    strictPort: true,
    fs: { allow: [".."] },
  },
});
