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
  const [loading, setLoading] = useState(false);
  const [started, setStarted] = useState(false);

  // Store objectUrl for cleanup
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    // Cleanup: revoke object URL when component unmounts
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
    };
  }, []);

  const handleLoadVideo = () => {
    setStarted(true);
    setLoading(true);
    setError(null);
    useVideo().match(
      (url) => {
        setVideoUrl(url);
        objectUrlRef.current = url;
        setLoading(false);
      },
      (errMsg) => {
        setError(errMsg);
        setLoading(false);
      },
    );
  };

  if (!started) {
    return (
      <Button variant="accent" onPress={handleLoadVideo}>
        Load Video
      </Button>
    );
  }

  if (loading) return <div>Loading…</div>;
  if (error) return <div>Error: {error}</div>;
  if (!videoUrl) return null;

  return <video controls src={videoUrl} style={{ width: "100%" }} />;
}

// Mount directly if #root exists (for direct import from index.html)
const rootElement = document.getElementById("root");
if (rootElement) {
  createRoot(rootElement).render(
    <Provider theme={defaultTheme}>
      <div style={{padding: "1rem", width: "100vw", height: "100%"}}>
      <VideoPlayer />
      </div>
    </Provider>,
  );
}
