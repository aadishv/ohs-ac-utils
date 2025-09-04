import { defineBackground } from "#imports";
import { browser } from "wxt/browser";
import { loadCaptions } from "./lib/caption";
import { loadVideo } from "./lib/video";

export default defineBackground(() => {
  console.log("Initializing background script...")
  // db.videos.clear();
  // db.tabToVid.clear();
  // MARK: - request listeners
  browser.webRequest.onSendHeaders.addListener(
    (details) => {
      if (details.tabId < 0) return;
      if (
        details.url.includes(".vtt")
      ) {
        void loadCaptions(details);
      }
      if (
        details.url.includes("video.mp4")
      ) {
        void loadVideo(details);
      }
    },
    { urls: ["<all_urls>"] },
    ["requestHeaders"],
  );
});
