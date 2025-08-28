import { defineBackground } from "#imports";
import { Err, Ok, Result, ResultAsync } from "neverthrow";
import { useState } from "react";
import { browser } from "wxt/browser";
import { getVideoFromDB, loadVideo, FetchStatus, loadCaptions } from "./lib/db";

export const VIDEO_PORT = "ohs-ac-utils-video";
export const VTT_PORT = "ohs-ac-utils-captions";

export default defineBackground(() => {
  console.log("Background script initialized.");
  let video: FetchStatus = null;
  let vtt: FetchStatus = null;
  // most recently fetched URL from VTT. this is needed externally since
  // VTT URL isn't directly encapsulated in FetchStatus
  let url: string | null = null;
  // MARK: - port setup
  const videoPorts = new Set<Browser.runtime.Port>();
  browser.runtime.onConnect.addListener((p) => {
    if (p.name !== VIDEO_PORT) return;
    videoPorts.add(p);
    if (video !== null) {
      p.postMessage(video);
    }
    p.onDisconnect.addListener(() => {
      videoPorts.delete(p);
    });
  });
  const vttPorts = new Set<Browser.runtime.Port>();
  browser.runtime.onConnect.addListener((p) => {
    if (p.name !== VTT_PORT) return;
    vttPorts.add(p);
    if (vtt !== null) {
      p.postMessage(vtt);
    }
    p.onDisconnect.addListener(() => {
      vttPorts.delete(p);
    });
  });
  // MARK: - request listeners
  browser.webRequest.onSendHeaders.addListener(
    (details) => {
      if (
        details.url.includes(".vtt") &&
        (vtt === null || vtt?.status === "error" || vtt?.status === "done") &&
        true
      ) {
        url = details.url;
        void loadCaptions(details.url, (v) => {
          console.log(v);
          vtt = v;
          for (const p of vttPorts) {
            p.postMessage(vtt);
          }
        });
      }
      if (
        details.url.includes("video.mp4") &&
        (video === null ||
          video?.status === "error" ||
          (video?.status === "done" && video.obj !== details.url))
      ) {
        const url = details.url.split("?")[0];

        void loadVideo(
          url,
          details.url,
          (v: FetchStatus) => {
            video = v;
            for (const p of videoPorts) {
              p.postMessage(video);
            }
          },
          () => {
            return video;
          },
        );
      }
    },
    { urls: ["<all_urls>"] },
    ["requestHeaders"],
  );
});
