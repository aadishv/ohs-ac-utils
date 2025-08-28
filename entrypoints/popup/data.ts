import { useEffect, useState } from "react";
import { browser } from "wxt/browser";
import { VIDEO_PORT, VideoStatus, VideoStatusInternal } from "../background";

export function useVideo(): VideoStatus {
  const [status, setStatus] = useState<VideoStatus>(null);
  useEffect(() => {
    const port = browser.runtime.connect({ name: VIDEO_PORT });

    const listener = (msg: VideoStatusInternal) => {
      if (msg.status === "done") {

      }
      setStatus(msg);
    };

    port.onMessage.addListener(listener);

    return () => {
        port.onMessage.removeListener(listener);
        port.disconnect();
    };
  }, []);
  return status;
}
