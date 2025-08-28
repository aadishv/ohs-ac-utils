import { defineBackground } from "#imports";
import { Err, Ok, Result, ResultAsync } from "neverthrow";
import { useState } from "react";
import { browser } from "wxt/browser";
import { getVideoFromDB, loadVideo, VideoStatus } from "./db";

export const VIDEO_PORT = "ohs-ac-utils-video";

export default defineBackground(() => {
  console.log("Background script initialized.");
  let video: VideoStatus = null;
  let lastVttRequest: string | null = null;
  // MARK: - port setup
  const ports = new Set<Browser.runtime.Port>();
  browser.runtime.onConnect.addListener((p) => {
    if (p.name !== VIDEO_PORT) return;
    ports.add(p);
    if (video !== null) {
      p.postMessage(video);
    }
    p.onDisconnect.addListener(() => {
      ports.delete(p);
    });
  });
  // TODO: revamp
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "getVttRequest") {
      if (
        lastVttRequest
      ) {
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
  // MARK: - request listeners
  browser.webRequest.onSendHeaders.addListener(
    (details) => {
      if (details.url.includes(".vtt")) {
        lastVttRequest = details.url;
      }
      if (details.url.includes("video.mp4") && (video === null || video?.status === "error")) {
        console.log("test");
        void loadVideo(details.url, (v: VideoStatus) => {
          video = v;
          for (const p of ports) {
             p.postMessage(video);
          }
        }, () => {
          return video;
        })
      }
    },
    { urls: ["<all_urls>"] },
    ["requestHeaders"],
  );
});
