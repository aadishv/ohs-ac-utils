import { okAsync, ResultAsync } from "neverthrow";

// hand-rewritten from gpt-5 mini boilerplate
// https://github.com/copilot/share/40370196-0864-84b4-b102-d64a80770817
export type FrameFetcher = {
  fetch: (timestamp: number) => ResultAsync<string, string>;
};
export default function getFetcher(
  url: string,
): ResultAsync<FrameFetcher, string> {
  return (
    okAsync<HTMLVideoElement, string>(document.createElement("video"))
      .map((video) => {
        video.muted = true;
        video.playsInline = true;
        video.crossOrigin = "anonymous";
        video.src = url;
        return video;
      })
      // wait for metadata to load
      .map(async (video) =>
        ResultAsync.fromPromise(
          new Promise<HTMLVideoElement>((resolve, reject) => {
            const controller = new AbortController();
            const onLoaded = () => {
              controller.abort();
              resolve(video);
            };
            const onError = (e: any) => {
              controller.abort();
              reject(new Error("Could not load video"));
            };
            video.addEventListener("loadedmetadata", onLoaded, {
              signal: controller.signal,
            });
            video.addEventListener("error", onError, {
              signal: controller.signal,
            });
          }),
          (e) => e as string,
        ),
      )
      // collapse Result
      .andThen((v) => v)
      // create FrameFetcher
      .map((video) => ({
        fetch: (timestamp: number) =>
          okAsync(video)
            // seek
            .map(async (video) => {
              const time =
                isFinite(video.duration) && !isNaN(video.duration)
                  ? Math.max(0, Math.min(timestamp, video.duration))
                  : Math.max(0, timestamp);
              video.currentTime = time;
              await ResultAsync.fromPromise(
                new Promise<void>((resolve, reject) => {
                  const controller = new AbortController();
                  const onSeeked = () => {
                    controller.abort();
                    resolve();
                  };
                  const onError = (e: any) => {
                    controller.abort();
                    reject(new Error("Seek failed"));
                  };
                  video.addEventListener("seeked", onSeeked, {
                    signal: controller.signal,
                  });
                  video.addEventListener("error", onError, {
                    signal: controller.signal,
                  });
                }),
                (e) => e as string,
              );
              return video;
            })
            // => bitmap => base64
            .map((video) => createImageBitmap(video))
            .map((bitmap) => {
              const c = document.createElement("canvas");
              c.width = bitmap.width;
              c.height = bitmap.height;
              const ctx = c.getContext("2d")!;
              ctx.drawImage(bitmap, 0, 0);
              return c.toDataURL("image/png"); // "data:image/png;base64,..."
            }),
      }))
  );
  // seek
}


export const parseTimeToSeconds = (timeString: string): number => {
  const parts = timeString.split(':').map(Number);

  if (parts.some(isNaN)) {
    throw new Error(`Invalid time string format: "${timeString}". Contains non-numeric parts.`);
  }

  let hours = 0;
  let minutes = 0;
  let seconds = 0;

  if (parts.length === 3) {
    [hours, minutes, seconds] = parts;
  } else if (parts.length === 2) {
    [minutes, seconds] = parts;
  } else {
    throw new Error(`Invalid time string format: "${timeString}". Expected HH:MM:SS or MM:SS.`);
  }

  return (hours * 3600) + (minutes * 60) + seconds;
};
