import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Button,
  ButtonGroup,
  Content,
  defaultTheme,
  Heading,
  InlineAlert,
  ProgressBar,
  ProgressCircle,
  Provider,
} from "@adobe/react-spectrum";
import { useVideo } from "../lib/video";
import "../tailwind.css";
import { toast, Toaster } from "sonner";

export function VideoPlayer() {
  const state = useVideo();

  const openSidePanel = () => {
    browser.windows.getCurrent().then((win) => {
      browser.sidePanel
        .open({
          windowId: win.id!,
        })
        .catch((err) => console.error(err));
    });
  };
  const download = async () => {
    if (state?.status !== "done") {
      toast.error("Video not yet loaded");
      return;
    }
    const tabs = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
    const title = tabs[0]?.title?.trim() || "video";
    const filename = `${title}.mp4`;

    const a = document.createElement("a");
    a.href = state.obj;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };
  return (
    <div className="flex flex-col gap-4 h-full w-full">
      {state === null && (
        <>
          <span className="opacity-70">
            Waiting for video to get detected. If it's been a while, try
            reloading the page. Make sure you're on the page of the lecture
            recording.
          </span>
        </>
      )}
      {state && state.status === "working" && (
        <>
          Downloading video...
          <ProgressBar
            value={state.progress}
            isIndeterminate={state.progress < 0}
          />
        </>
      )}
      {state && state.status === "error" && (
        <InlineAlert variant="negative">
          <Heading>Error occured during data fetching</Heading>
          <Content>{state.error}</Content>
        </InlineAlert>
      )}
      {state && state.status === "done" && (
        <>
          <video controls src={state.obj} className="w-full rounded-lg" />
          <Button variant="primary" onPress={() => void download()}>
            Download Video
          </Button>
        </>
      )}
      {state?.status !== "working" && (
        <Button variant="secondary" onPress={openSidePanel}>
          Open AI Panel
        </Button>
      )}
    </div>
  );
}

const rootElement = document.getElementById("root");
if (rootElement) {
  createRoot(rootElement).render(
    <Provider
      theme={defaultTheme}
      UNSAFE_style={{ width: "100%", height: "100%", minWidth: "320px" }}
    >
      <div className="p-4 size-full">
        <VideoPlayer />
        <Toaster />
      </div>
    </Provider>,
  );
}
