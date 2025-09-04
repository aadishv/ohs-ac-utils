import { ResultAsync } from "neverthrow";
import { db, FetchStatus } from "./db2";
import { type Request } from "./db2";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useRef, useState } from "react";
export async function loadVideo(req: Request) {
  if (await db.tabToVid.get(req.tabId)) return;
  const id = req.tabId;
  const cacheUrl = req.url.split("?")[0];
  if (await db.videos.get(cacheUrl)) {
    await db.tabToVid.add({
      id,
      value: { status: "done", obj: cacheUrl },
    });
    return;
  }
  let prog = 0;
  await db.tabToVid.delete(id);
  await db.tabToVid.add({ id, value: { status: "working", progress: 0 } });
  const progress = async (n: number) => {
    prog = n;
    await db.tabToVid.update(id, {
      id,
      value: { status: "working", progress: n },
    });
  };

  const got = await db.videos.get(cacheUrl);
  if (got) {
    await db.tabToVid.update(id, {
      id,
      value: { status: "done", obj: cacheUrl },
    });
    return;
  }
  await ResultAsync.fromPromise(
    fetch(req.url, {
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
  )
    .map(async (res) => {
      const contentLength = res.headers.get("Content-Length");
      const totalSize = contentLength ? parseInt(contentLength, 10) : -1;
      if (!res.body) {
        return res.blob();
      }
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let receivedLength = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        chunks.push(value);
        receivedLength += value.length;

        if (totalSize > 0) {
          const newProg = Math.round((receivedLength / totalSize) * 100);
          if (newProg > prog) {
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
    })
    .map(async (blob) => {
      progress(100);
      let arrayBuffer = await blob.arrayBuffer();
      await db.videos.add({ url: cacheUrl, data: arrayBuffer });
      await db.tabToVid.update(id, {
        id,
        value: { status: "done", obj: cacheUrl },
      });
    })
    .mapErr((error) => {
      db.tabToVid.update(id, {
        id,
        value: {
          status: "error",
          error,
        },
      });
    });
}

export function useVideo(): FetchStatus<string> {
  const url = useRef<string | null>(null);
  const [id, setId] = useState<number | null>(null);
  const cleanupObjectUrl = () => {
    if (url.current) {
      URL.revokeObjectURL(url.current);
      url.current = null;
    }
  };
  useEffect(() => {
    void (async () => {
      const tabs = await browser.tabs.query({
        active: true,
        currentWindow: true,
      });
      setId(tabs[0].id ?? null);
    })();
  }, []);
  const result = useLiveQuery(
    async () => {
      cleanupObjectUrl();
      if (!id) {
        return {
          status: "working" as const,
          progress: -1,
        };
      }
      const video = await db.tabToVid.where("id").equals(id).first() ?? null;
      if (video?.value?.status !== "done") return video?.value;
      const buffer = await db.videos.where("url").equals(video.value.obj).first();
      if (!buffer) return {
        status: "error" as const,
        error: "No video data found",
      };
      const blob = new Blob([buffer.data], { type: "video/mp4" });
      const newUrl = URL.createObjectURL(blob);
      url.current = newUrl;
      return { status: "done" as const, obj: newUrl };
    },
    [id],
  );
  return result ?? null;
};
