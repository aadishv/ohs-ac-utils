import { useState, useEffect } from "react";
import "./App.css";

// Helper to get video.mp4 URLs from the background script
async function getVideoMp4Links(tabId: number): Promise<string[] | undefined> {
  try {
    // Send a message to the background script to get the URLs
    const response = await browser.runtime.sendMessage({
      type: "GET_VIDEO_MP4_LINKS",
      tabId,
    });
    return response?.urls ?? undefined;
  } catch (error) {
    console.error("Failed to get video.mp4 links:", error);
    return undefined;
  }
}

function App() {
  const [loading, setLoading] = useState(false);
  const [output, setOutput] = useState<string[] | undefined | null>(null);

  useEffect(() => {
    setLoading(true);
    (async () => {
      let id = 0;
      await new Promise<void>((resolve) => {
        browser.tabs.query(
          { active: true, url: "https://pcadobeconnect.stanford.edu/*" },
          (tabs) => {
            id = tabs[0]?.id || 0;
            resolve();
          },
        );
      });
      const result = await getVideoMp4Links(id);
      setOutput(result);
      setLoading(false);
    })();
  }, []);

  return (
    <>
      <div className="card">
        {loading && <span>Loading...</span>}
        {!loading && (
          <pre style={{ textAlign: "left", whiteSpace: "pre-wrap" }}>
            {output === undefined
              ? "No output or failed to fetch."
              : JSON.stringify(output, null, 2)}
          </pre>
        )}
      </div>
    </>
  );
}

export default App;
