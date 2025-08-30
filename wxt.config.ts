import { defineConfig } from "wxt";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
  manifest: {
    name: "OHS AC Utilities",
    version: "0.1.0",
    description:
      "Offers useful download utilities for Stanford Online High School students accessing Adobe Connect recordings.",
    permissions: [
      "webRequest", // To inspect network requests
      "sidePanel",
      "activeTab", // To communicate with content scripts
    ],
    host_permissions: [
      "https://*/*", // To intercept requests on any page. Be as specific as possible if you can.
    ],
    // WXT automatically detects entrypoints, but you can be explicit if needed.
    // Action (popup) is usually defined by having a popup/index.html entrypoint.
  },
  modules: ["@wxt-dev/auto-icons"],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
