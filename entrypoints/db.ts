import { ResultAsync } from "neverthrow";
import { useState, useRef, useEffect } from "react";
import { VIDEO_PORT } from "./background";

const DB_NAME = "ohs-ac-utils-db";
const DB_VERSION = 1;
const STORE_NAME = "videos";

function openDB(): ResultAsync<IDBDatabase, string> {
  return ResultAsync.fromPromise(new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { reject(req.error) };
  }), e => String(e));
}

export function getVideoFromDB(url: string): ResultAsync<ArrayBuffer, string> {
  return openDB().map(async db => {
    const promise = ResultAsync.fromPromise(new Promise<ArrayBuffer>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const r = store.get(url);
      r.onsuccess = () => {
        const val = r.result;
        if (!val || !val.data) {
          reject("no data");
          return;
        }
        resolve(val.data);
      };
      r.onerror = () => reject(r.error);
    }), e => e as string);
    return await promise;
  }).andThen(e => e);
}

export function setVideoInDB(url: string, data: ArrayBuffer): ResultAsync<void, string> {
  return openDB().map(db => new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const r = store.put({ url, data });
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
  }));
}


export type VideoStatus =
  | {
      status: "working";
      progress: number;
    }
  | {
      status: "done";
      obj: string;
    }
  | {
      status: "error";
      error: string;
    }
  | null;

export const loadVideo = async (url: string, set: (v: VideoStatus) => void, get: () => VideoStatus) => {
  const progress = (number: number) => {
    set({
      status: "working",
      progress: number,
    })
  };
  progress(0);
  if ((await getVideoFromDB(url)).isOk()) {
    return url;
  }
  await ResultAsync.fromPromise(
    fetch(url, {
      headers: {
        accept: "*/*",
        "cache-control": "no-cache",
        pragma: "no-cache",
      },
      method: "GET",
      referrerPolicy: "same-origin",
    }),
    (error) =>
      error instanceof Error
        ? error.message
        : "Unknown error while fetching video blob",
  ).map(async (res) => {
    console.log("start")
    const contentLength = res.headers.get("Content-Length");
    const totalSize = contentLength ? parseInt(contentLength, 10) : -1;
    if (!res.body) {
      console.log("[data.ts] fallback");
      return res.blob();
    }
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let receivedLength = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      chunks.push(value);
      // console.log(receivedLength);
      receivedLength += value.length;

      if (totalSize > 0) {
        const newProg = Math.round((receivedLength / totalSize) * 100);
        const video = get();
        if (video?.status !== "working" || newProg !== video.progress) {
          progress(newProg);
        }
      }
    }

    const allChunks = new Uint8Array(receivedLength);
    let position = 0;
    for (const chunk of chunks) {
      allChunks.set(chunk, position);
      position += chunk.length;
    }

    return new Blob([allChunks], { type: "video/mp4" });
  }).map(async (blob) => {
    progress(100);
    const arrayBuffer = await blob.arrayBuffer();
    setVideoInDB(url, arrayBuffer);
    set({
      status: "done",
      obj: url,
    });
  }).mapErr((error) => {
    set({
      status: "error",
      error
    })
  });
};

// one of the two React APIs we expose
// just returns a VideoStatus encapsulating a
// object URL
export function useVideo(): VideoStatus {
  const [status, setStatus] = useState<VideoStatus>(null);
  // Keep the current created object URL so we can revoke it on update/unmount
  const url = useRef<string | null>(null);

  useEffect(() => {
    const port = browser.runtime.connect({ name: VIDEO_PORT });

    const cleanupObjectUrl = () => {
      if (url.current) {
        URL.revokeObjectURL(url.current);
        url.current = null;
      }
    };

    const listener = async (msg: VideoStatus) => {
      if (!msg || msg.status !== "done") {
        setStatus(msg);
      } else {
        const sourceUrl = msg.obj as string | null;
        if (!sourceUrl || typeof sourceUrl !== "string") {
          setStatus({ status: "error", error: "Background returned invalid video URL" });
          return;
        }
        try {
          getVideoFromDB(sourceUrl).map(buffer => {
            cleanupObjectUrl();
            const blob = new Blob([buffer], { type: "video/mp4" });
            const newUrl = URL.createObjectURL(blob);
            url.current = newUrl;
            setStatus({ status: "done", obj: newUrl });
          }).mapErr(e => {
            setStatus({ status: "error", error: `Error: ${e}` });
          })
        } catch (e) {
          const msgStr = e instanceof Error ? e.message : String(e);
          setStatus({ status: "error", error: `Failed to load video bytes: ${msgStr}` });
        }
      }
    };

    port.onMessage.addListener(listener);

    return () => {
      port.onMessage.removeListener(listener);
      port.disconnect();
      cleanupObjectUrl();
    };
  }, []);

  return status;
}
