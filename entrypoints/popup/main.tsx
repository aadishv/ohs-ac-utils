import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Button,
  ButtonGroup,
  defaultTheme,
  ProgressCircle,
  Provider,
} from "@adobe/react-spectrum";
import { useVideo } from "./data";

export function VideoPlayer() {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    // Call useVideo() ONCE on mount
    useVideo()
      .match(
        (url) => {
          if (!cancelled) {
            setVideoUrl(url);
            objectUrl = url;
          }
        },
        (errMsg) => {
          if (!cancelled) setError(errMsg);
        }
      );

    // Cleanup: revoke object URL when component unmounts
    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, []);

  if (error) return <div>Error: {error}</div>;
  if (!videoUrl) return <div>Loading…</div>;

  return (
    <video controls src={videoUrl} style={{ width: "100%" }} />
  );
}

// Mount directly if #root exists (for direct import from index.html)
const rootElement = document.getElementById("root");
if (rootElement) {
  createRoot(rootElement).render(<VideoPlayer />);
}
