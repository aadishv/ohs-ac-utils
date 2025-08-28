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
import { useVideo } from "../db";
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
  if (state === null) {
    return (
      <div className="flex flex-col gap-4">
        <span className="opacity-70">waiting for video to get detected... if it's been a while, try refreshing.</span>
        <Button variant="secondary" onPress={openSidePanel}>
        Open AI Panel
      </Button>
      </div>
    );
  }

  if (state.status === "working") return <div className="h-full">
    Downloading video...
    <ProgressBar value={state.progress} />
  </div>;
  if (state.status === "error") return <div className="h-full py-auto">
    <InlineAlert variant="negative">
      <Heading>Error occured during data fetching</Heading>
      <Content>
        {state.error}
      </Content>
    </InlineAlert>
  </div>;
  if (state.status === "done")
    return (
      // TODO: reimplement
      // see https://stackoverflow.com/questions/72474057/how-to-use-url-createobjecturl-inside-a-manifest-v3-extension-serviceworker
      <div>
        <video controls src={state.obj} className="w-full rounded-lg" />
        <Button
          variant="primary"
          // onPress={() => downloadBlobFromUrl(state.url)}
          UNSAFE_style={{
            marginTop: "1rem"
          }}
        >
          Download Video
        </Button>
      </div>
    );

  return null;
}

// Mount directly if #root exists (for direct import from index.html)
const rootElement = document.getElementById("root");
if (rootElement) {
  createRoot(rootElement).render(
    <Provider theme={defaultTheme}>
      <div className="p-4">
        <VideoPlayer />
      </div>
    </Provider>
  );
}
