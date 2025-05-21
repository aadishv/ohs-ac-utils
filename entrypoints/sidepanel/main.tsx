import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Button,
  ButtonGroup,
  defaultTheme,
  ProgressCircle,
  Provider,
} from "@adobe/react-spectrum";
import { useVideo, downloadBlobFromUrl } from "../popup/data";

type VideoState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; url: string }
  | { status: "error"; error: string };

export function VideoPlayer() {
  const [state, setState] = useState<VideoState>({ status: "idle" });
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
    };
  }, []);

  const handleLoadVideo = () => {
    setState({ status: "loading" });
    useVideo().match(
      (url) => {
        objectUrlRef.current = url;
        setState({ status: "success", url });
      },
      (errMsg) => {
        setState({ status: "error", error: errMsg });
      },
    );
  };
  if (state.status === "idle") {
    return (
      <div style={{display: "flex", flexDirection: "column", gap: "1rem"}}>
      <Button variant="accent" onPress={handleLoadVideo}>
        Load Video
      </Button>
      </div>
    );
  }

  if (state.status === "loading") return <div>Loading…</div>;
  if (state.status === "error") return <div>Error: {state.error}</div>;
  if (state.status === "success")
    return (
      <div>
        <video controls src={state.url} style={{ width: "100%" }} />
        <Button
          variant="primary"
          onPress={() => downloadBlobFromUrl(state.url)}
          UNSAFE_style={{marginTop: "1rem"}}
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
      <div style={{padding: "1rem", height: "100vh"}}>
        <VideoPlayer />
      </div>
    </Provider>,
  );
}
