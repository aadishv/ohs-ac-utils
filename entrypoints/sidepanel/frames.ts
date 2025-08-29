import { okAsync, ResultAsync } from "neverthrow";

// hand-rewritten from gpt-5 mini boilerplate
// https://github.com/copilot/share/40370196-0864-84b4-b102-d64a80770817
type FrameFetcher = {
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
            console.log("promise init");
            const controller = new AbortController();
            const onLoaded = () => {
              controller.abort();
              console.log("YOOO");
              resolve(video);
            };
            const onError = (e: any) => {
              console.log(e);
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
              console.log(video);
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
