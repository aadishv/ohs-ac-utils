import { defineBackground } from "#imports";
import { ResultAsync } from "neverthrow";
import { useState } from "react";
import { browser } from "wxt/browser";

export type VideoStatusGeneric<T> = {
  status: "working";
  progress: number;
}
  | {
    status: "done";
    obj: T;
  }
  | {
    status: "error";
    error: string;
  } | null;
export type VideoStatus = VideoStatusGeneric<string>;
export type VideoStatusInternal = VideoStatusGeneric<ArrayBuffer>;
export const VIDEO_PORT = "ohs-ac-utils-video";

let lastVttRequest: string | null = null;

const loadVideo = async (url: string, set: (v: VideoStatusInternal) => void, get: () => VideoStatusInternal) => {
  const progress = (number: number) => {
    set({
      status: "working",
      progress: number,
    })
  };
  progress(0);
  await ResultAsync.fromPromise(
    fetch(url, {
      headers: {
        accept: "*/*",
        "cache-control": "no-cache",
        pragma: "no-cache",
      },
      method: "GET",
      referrerPolicy: "same-origin",
    }),
    (error) =>
      error instanceof Error
        ? error.message
        : "Unknown error while fetching video blob",
  ).map(async (res) => {
    console.log("start")
    const contentLength = res.headers.get("Content-Length");
    const totalSize = contentLength ? parseInt(contentLength, 10) : -1;
    if (!res.body) {
      console.log("[data.ts] fallback");
      return res.blob();
    }
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let receivedLength = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      chunks.push(value);
      // console.log(receivedLength);
      receivedLength += value.length;

      if (totalSize > 0) {
        const newProg = Math.round((receivedLength / totalSize) * 100);
        const video = get();
        if (video?.status !== "working" || newProg !== video.progress) {
          progress(newProg);
        }
      }
    }

    const allChunks = new Uint8Array(receivedLength);
    let position = 0;
    for (const chunk of chunks) {
      allChunks.set(chunk, position);
      position += chunk.length;
    }

    return new Blob([allChunks], { type: "video/mp4" });
  }).map(async (blob) => {
    progress(100);
    const arrayBuffer = await blob.arrayBuffer();
    set({
      status: "done",
      obj: arrayBuffer,
    });
  }).mapErr((error) => {
    set({
      status: "error",
      error
    })
  });
};

export default defineBackground(() => {
  console.log("Background script initialized.");
  let video: VideoStatusInternal = null;
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
  browser.webRequest.onSendHeaders.addListener(
    (details) => {
      if (details.url.includes(".vtt")) {
        lastVttRequest = details.url;
      }
      if (details.url.includes("video.mp4") && (video === null || video?.status === "error")) {
        console.log("test");
        void loadVideo(details.url, (v: VideoStatusInternal) => {
          video = v;
          for (const p of ports) {
            if (video?.status === "done") {
              const obj = video.obj.slice();
              p.postMessage({
                status: "done",
                obj,
              });
            } else {
             p.postMessage(video);
            }
          }
        }, () => {
          return video;
        })
      }
    },
    { urls: ["<all_urls>"] },
    ["requestHeaders"],
  );
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
});
