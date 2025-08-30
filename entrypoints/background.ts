import { defineBackground } from "#imports";
import { browser } from "wxt/browser";
import { loadVideo, loadCaptions } from "./lib/db";

export const VIDEO_URL_KEY = "current_video_url";
export const VTT_URL_KEY = "current_vtt_url";

export default defineBackground(() => {
  console.log("Background script initialized.");

  browser.webRequest.onSendHeaders.addListener(
    (details) => {
      if (details.url.includes(".vtt")) {
        browser.storage.local.set({ [VTT_URL_KEY]: details.url });
        void loadCaptions(details.url);
      }
      if (details.url.includes("video.mp4")) {
        const url = details.url.split("?")[0];
        browser.storage.local.set({ [VIDEO_URL_KEY]: url });
        void loadVideo(
          url,
          details.url
        );
      }
    },
    { urls: ["<all_urls>"] },
    ["requestHeaders"],
  );
});
