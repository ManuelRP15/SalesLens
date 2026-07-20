import { defineManifest } from "@crxjs/vite-plugin";
import pkg from "./package.json";

export default defineManifest({
  manifest_version: 3,
  name: "Salesforce Translation Inspector",
  version: pkg.version,
  description:
    "Hover over any Salesforce text and instantly discover where it comes from and how it's translated.",
  permissions: ["storage", "activeTab", "cookies", "tabs"],
  host_permissions: [
    "https://*.lightning.force.com/*",
    "https://*.my.salesforce.com/*",
    "https://*.salesforce.com/*",
  ],
  background: {
    service_worker: "src/background/index.ts",
    type: "module",
  },
  content_scripts: [
    {
      matches: ["https://*.lightning.force.com/*"],
      js: ["src/content/index.tsx"],
      run_at: "document_idle",
    },
  ],
  action: {
    default_popup: "src/popup/index.html",
  },
  // Lets crxjs pick up this extra standalone page as a build entry, and lets the
  // popup open it via chrome.tabs.create(chrome.runtime.getURL(...)).
  web_accessible_resources: [
    {
      resources: ["src/health/index.html"],
      matches: ["https://*.lightning.force.com/*"],
    },
  ],
});
