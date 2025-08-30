import React from "react";
import { createRoot } from "react-dom/client";
import {
  Button,
  Content,
  defaultTheme,
  Heading,
  InlineAlert,
  ProgressCircle,
  Provider,
} from "@adobe/react-spectrum";
import "../tailwind.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useCurrentUrls, useVideoQuery } from "../sidepanel/hooks";

const queryClient = new QueryClient();

export function VideoPlayer() {
  const { videoUrl } = useCurrentUrls();
  const { data: video, isLoading, isError, error } = useVideoQuery(videoUrl);

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
    <div className="flex flex-col gap-4 h-full">
      {isLoading && (
        <>
          Downloading video...
          <ProgressCircle isIndeterminate />
        </>
      )}
      {isError && (
        <InlineAlert variant="negative">
          <Heading>Error occured during data fetching</Heading>
          <Content>{error.message}</Content>
        </InlineAlert>
      )}
      {video && (
        <>
          <video controls src={video} className="w-full rounded-lg" />
          <Button
            variant="primary"
          >
            Download Video
          </Button>
        </>
      )}
      {!videoUrl && !isLoading && (
        <>
          <span className="opacity-70">
            waiting for video to get detected... if it's been a while, try
            refreshing.
          </span>
        </>
      )}
      <Button variant="secondary" onPress={openSidePanel}>
        Open AI Panel
      </Button>
    </div>
  );
}

const rootElement = document.getElementsByTagName("body")[0];
if (rootElement) {
  createRoot(rootElement).render(
    <Provider theme={defaultTheme}>
      <QueryClientProvider client={queryClient}>
        <div className="p-4">
          <VideoPlayer />
        </div>
      </QueryClientProvider>
    </Provider>,
  );
}
