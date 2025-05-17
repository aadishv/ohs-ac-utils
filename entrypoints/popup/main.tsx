import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Button,
  ButtonGroup,
  defaultTheme,
  ProgressCircle,
  Provider,
} from "@adobe/react-spectrum";
import { getBlobUrl } from "./data";
interface VideoPlayerProps {
  videoUrl: string; // The URL to fetch the MP4 data from
}

async function downloadBlobFromUrl(
  blobUrl: string,
): Promise<void> {
  let name = "video.mp4";
  browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
    if (tabs.length > 0) {
      name = `${tabs[0].title}.mp4`;
    }
  });

  try {
    const response = await fetch(blobUrl);

    if (!response.ok) {
      throw new Error(`Network response was not ok: ${response.statusText}`);
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.style.display = "none";
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  } catch (error) {
    console.error("Failed to download blob:", error);
    // You could display an error message to the user here
  }
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({ videoUrl }) => {
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    let objectUrl: string | null = null;

    const fetchVideo = async () => {
      setIsLoading(true);
      setError(null);
      setVideoSrc(null); // Reset previous video src

      try {
        objectUrl = await getBlobUrl(videoUrl);
        setVideoSrc(objectUrl);
      } catch (e) {
        if (e instanceof Error) {
          setError(e.message);
        } else {
          setError("An unknown error occurred");
        }
        console.error("Failed to fetch video:", e);
      } finally {
        setIsLoading(false);
      }
    };

    if (videoUrl) {
      console.log("here");
      fetchVideo();
    } else {
      setVideoSrc(null); // Clear video if no URL is provided
    }

    // Cleanup function
    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        console.log("Revoked object URL:", objectUrl);
      }
      // Also, if you are directly setting srcObject, ensure it's cleaned up.
      // if (videoRef.current && videoRef.current.srcObject) {
      //   const stream = videoRef.current.srcObject as MediaStream;
      //   stream.getTracks().forEach(track => track.stop());
      //   videoRef.current.srcObject = null;
      // }
    };
  }, [videoUrl]); // Re-run effect if videoUrl changes

  if (isLoading) {
    return <p>Loading video...</p>;
  }

  if (error) {
    return <p>Error loading video: {error}</p>;
  }

  if (!videoSrc) {
    return <p>No video to display.</p>;
  }

  return (
    <div>
      <video ref={videoRef} src={videoSrc} controls width="600">
        Your browser does not support the video tag.
      </video>
    </div>
  );
};

export default VideoPlayer;

function VideoEmulator(props: { children?: React.ReactNode }) {
  return (
    <div
      style={{
        marginLeft: "50%",
        marginRight: "50%",
        marginTop: "3.5rem",
        marginBottom: "3.5rem",
        justifySelf: "center",
      }}
    >
      <div
        style={{
          // border: "red 1px solid",
          width: "2rem",
          height: "2rem",
        }}
      >
        {props.children}
      </div>
    </div>
  );
}

const MainApp: React.FC = () => {
  const [status, setStatus] = useState<string>("");
  const [url, setUrl] = useState("");
  const [done, setDone] = useState(true);
  const runFetch = async () => {
    // MARK: - Get video URL
    setDone(false);
    let fileUrl = "";
    try {
      // Support both Firefox (browser) and Chrome (chrome) extension APIs
      const extensionApi = (window as any).browser?.runtime?.sendMessage
        ? (window as any).browser
        : (window as any).chrome;
      if (!extensionApi?.runtime?.sendMessage) {
        setStatus("Extension API not available. Please contact Aadish");
        return;
      }
      const response = await extensionApi.runtime.sendMessage({
        action: "getVideoRequest",
      });

      if (response && response.success) {
        fileUrl = response.data;
      } else {
        setStatus("Failed to get request details. Please contact Aadish");
      }
    } catch (error: any) {
      setStatus(`An unknown error occurred. Please contact Aadish`);
    }
    // MARK: - Get blob set up
    if (!fileUrl) return;
    let blobUrl = "";
    try {
      blobUrl = await getBlobUrl(fileUrl);
      setUrl(blobUrl);
    } catch (e) {
      setStatus("An unknown error occurred. Please contact Aadish");
    } finally {
      setDone(true);
    }

    // Cleanup function
    return () => {
      if (url) {
        URL.revokeObjectURL(url);
        console.log("Revoked object URL:", url);
      }
    };
  };
  return (
    <>
      <Provider theme={defaultTheme}>
        <div style={{ padding: "1rem", width: "100vw" }}>
          <Button variant="accent" onPress={runFetch}>
            Load video
          </Button>
          <div style={{ marginTop: "1rem" }}>
            {!done && (
              <VideoEmulator>
                <ProgressCircle aria-label="Loading…" isIndeterminate />
              </VideoEmulator>
            )}
            {done && status}
            {url != "" && <video src={url} controls></video>}
            {url != "" && (
              <ButtonGroup UNSAFE_style={{marginTop: "1rem"}}>
                <Button
                  variant="primary"
                  onPress={async () =>
                    await downloadBlobFromUrl(url)
                  }
                >
                  Download
                </Button>
                {/* <Button variant="secondary" onPress={ () => alert("AC AI is not yet available. Contact Aadish for details!") }>Open in AC AI</Button> */}
              </ButtonGroup>
            )}
          </div>

        </div>
      </Provider>
    </>
  );
};

// Mount directly if #root exists (for direct import from index.html)
const rootElement = document.getElementById("root");
if (rootElement) {
  createRoot(rootElement).render(<MainApp />);
}
