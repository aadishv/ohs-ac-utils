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
  return (
    <div className="flex flex-col gap-4 h-full w-full">
      {state === null && (
        <>
          <span className="opacity-70">
            waiting for video to get detected... if it's been a while, try
            refreshing.
          </span>
        </>
      )}
      {state && state.status === "working" && (
        <>
          Downloading video...
          <ProgressBar value={state.progress} isIndeterminate={state.progress < 0} />
        </>
      )}
      {state && state.status === "error" && (
        <InlineAlert variant="negative">
          <Heading>Error occured during data fetching</Heading>
          <Content>{state.error}</Content>
        </InlineAlert>
      )}
      {state && state.status === "done" && (
        // TODO: reimplement
        // see https://stackoverflow.com/questions/72474057/how-to-use-url-createobjecturl-inside-a-manifest-v3-extension-serviceworker
        <>
          <video controls src={state.obj} className="w-full rounded-lg" />
          <Button
            variant="primary"
            // onPress={() => downloadBlobFromUrl(state.url)}
          >
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
    <Provider theme={defaultTheme} UNSAFE_style={{width: "100%", height: "100%", minWidth: "320px"}}>
      <div className="p-4 size-full">
        <VideoPlayer />
      </div>
    </Provider>,
  );
}
