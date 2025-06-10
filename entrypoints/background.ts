import { defineBackground } from "#imports";
import { browser } from "wxt/browser";

let lastVideoRequest: string | null = null;
let lastVttRequest: string | null = null;
let lastVideoRequestTimestamp: number | null = null;


export default defineBackground(() => {
  console.log("Background script initialized.");
  console.log('9')
  console.log('16');
  browser.webRequest.onSendHeaders.addListener(
    (details) => {
      if (details.url.includes(".vtt")) {
        lastVttRequest = details.url;
        lastVideoRequestTimestamp = Date.now();
      }
      if (details.url.includes("video.mp4")) {
        lastVideoRequest = details.url;
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
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "getVttRequest") {
      const FIVE_MINUTES = 5 * 60 * 1000;
      const now = Date.now();
      if (
        lastVttRequest &&
        lastVideoRequestTimestamp &&
        now - lastVideoRequestTimestamp < FIVE_MINUTES
      ) {
        console.log(lastVttRequest, "background");
        sendResponse({ success: true, data: lastVttRequest });
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
