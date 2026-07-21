import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Standalone preview server for the Translation Health page (health-harness/), used to
// render + screenshot the real component with representative data — no crxjs, no real org.
// Separate from the extension build; `vite build` never sees it.
export default defineConfig({
  root: "health-harness",
  plugins: [react()],
  server: { port: 5178, strictPort: true },
});
