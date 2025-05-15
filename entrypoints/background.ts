import { defineBackground } from "#imports";
import { browser } from "wxt/browser";

interface VideoRequestDetails {
  url: string;
  method: string;
  headers: Browser.webRequest.HttpHeader[];
  // Add other fields if "Copy as Fetch" typically includes them and they are available
  // e.g., referrer, body (though for video.mp4, body is unlikely for GET)
}

let lastVideoRequest: VideoRequestDetails | null = null;

export default defineBackground(() => {
  console.log('Background script loaded.');

  // Listener for network requests to capture headers
  browser.webRequest.onSendHeaders.addListener(
    (details) => {
      // console.lxog("Listener triggers", details)
      if (details.url.includes('video.mp4')) { // Or a more robust check if needed
        console.log('Found video.mp4 request:', details);
        lastVideoRequest = {
          url: details.url,
          method: details.method,
          headers: details.requestHeaders || [],
        };
        // To see what "Copy as fetch" includes, you might want to inspect `details` further.
        // For example, to get the referrer, it might be `details.initiator` or `details.originUrl`
        // depending on the context and what Chrome's "Copy as fetch" actually uses.
        // The `referrer` header is usually part of `details.requestHeaders` if sent.
      }
    },
    { urls: ['<all_urls>'] }, // Filter for all URLs, then check the path in the callback
    ['requestHeaders']
  );

  // Listener for messages from the popup
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'getVideoRequest') {
      if (lastVideoRequest) {
        sendResponse({ success: true, data: lastVideoRequest });
      } else {
        sendResponse({ success: false, message: 'No video.mp4 request captured yet.' });
      }
      return true; // Indicates you wish to send a response asynchronously
    }
  });

  console.log("Listeners registed");
});
