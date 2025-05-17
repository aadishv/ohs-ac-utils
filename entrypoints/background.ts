import { defineBackground } from "#imports";
import { browser } from "wxt/browser";

let lastVideoRequest: string | null = null;
let lastVideoRequestTimestamp: number | null = null;

export default defineBackground(() => {
  console.log("Background script initialized.");

  browser.webRequest.onSendHeaders.addListener(
    (details) => {
      if (details.url.includes("video.mp4")) {
        lastVideoRequest = details.url;
        console.log(details.url);
        lastVideoRequestTimestamp = Date.now();
      }
    },
    { urls: ["<all_urls>"] },
    ["requestHeaders"],
  );

  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "getVideoRequest") {
      const FIVE_MINUTES = 5 * 60 * 1000;
      const now = Date.now();
      if (
        lastVideoRequest &&
        lastVideoRequestTimestamp &&
        now - lastVideoRequestTimestamp < FIVE_MINUTES
      ) {
        console.log(lastVideoRequest, "background");
        sendResponse({ success: true, data: lastVideoRequest });
      } else {
        sendResponse({
          success: false,
          message: "No recent video.mp4 request captured.",
        });
      }
      return true;
    }
  });

  console.log("WebRequest and Runtime listeners registered.");
});
