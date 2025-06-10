import React, { Suspense, useCallback, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Button,
  Content,
  defaultTheme,
  Form,
  Heading,
  InlineAlert,
  Item,
  ProgressCircle,
  Provider,
  TabList,
  TabPanels,
  Tabs,
  TextField,
  ToastContainer,
  ToastQueue,
} from "@adobe/react-spectrum";
import {
  createPartFromUri,
  createUserContent,
  GoogleGenAI,
} from "@google/genai";
import { createStore } from "@xstate/store";
import { useSelector } from "@xstate/store/react";
import {
  useVideo,
  fetchVideoBlob,
  loadVideoWithProgress,
  getVttUrl,
  fetchVttText,
} from "../popup/data";
import {
  injectVideoControl,
  setVideoTime as setVideoTimeInject,
} from "../lib/video-control";

// Be brief, concise, and straightforward.
const SUMMARIZE_PROMPT = `
Summarize this video briefly. A transcript is provided to aid you.

Do not acknowledge the user or this prompt. Respond ONLY with the summary, and no prefix such as "Here is a summary:".

Be brief, concise, and straightforward. Target one paragraph for each important aspect. Do not aim to discuss all points, but instead focus on a broad overview.

Use HTML instead of Markdown for formatting when formatting is needed. NEVER use Markdown. Make sure to use <br /> for newlines.

Indent your paragraphs, keeping HTML whitespace rules in mind.

This is a lecture recording from a class at Stanford Online High School.

Example format:
===========

<h2>Summary</h2>

...
`;
async function setVideoTimestamp(timestamp: number) {
  try {
    const [tab] = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tab?.id) {
      // First inject the video control script
      await injectVideoControl(tab.id);
      // Then set the video time
      const response = await setVideoTimeInject(tab.id, timestamp);
      return response?.success;
    }
  } catch (error) {
    console.error("Failed to control video:", error);
  }
  return false;
}

async function validateApiKey(apiKey: string): Promise<boolean> {
  try {
    const ai = new GoogleGenAI({ apiKey });
    await ai.models.generateContent({
      model: "models/gemma-3n-e4b-it",
      contents: 'Return with the shortest possible response: ".".',
    });
    return true;
  } catch {
    return false;
  }
}

async function getStoredApiKey(): Promise<string | null> {
  const stored = localStorage.getItem("gemini_api_key");
  if (stored && (await validateApiKey(stored))) {
    return stored;
  }
  if (stored) {
    localStorage.removeItem("gemini_api_key");
  }
  return null;
}

function getSummaryCache(): Record<string, string> {
  const stored = localStorage.getItem("video_summary_cache");
  return stored ? JSON.parse(stored) : {};
}

function saveSummaryToCache(videoUrl: string, summary: string): void {
  const cache = getSummaryCache();
  cache[videoUrl] = summary;
  localStorage.setItem("video_summary_cache", JSON.stringify(cache));
}

function getCachedSummary(videoUrl: string): string | null {
  const cache = getSummaryCache();
  return cache[videoUrl] || null;
}

// Persistent cache for uploaded video URIs, keyed by first 3 transcript lines
function getUploadCache(): Record<string, { uri: string; mimeType: string }> {
  const stored = localStorage.getItem("video_upload_cache");
  return stored ? JSON.parse(stored) : {};
}
function saveUploadToCache(key: string, uri: string, mimeType: string): void {
  const cache = getUploadCache();
  cache[key] = { uri, mimeType };
  localStorage.setItem("video_upload_cache", JSON.stringify(cache));
}
function getCachedUpload(key: string): { uri: string; mimeType: string } | null {
  const cache = getUploadCache();
  return cache[key] || null;
}

async function downscaleVideoTo1fps(
  videoBlob: Blob,
  onProgress?: (percent: number) => void,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;

    video.src = URL.createObjectURL(videoBlob);
    video.muted = true;

    video.onloadedmetadata = () => {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const stream = canvas.captureStream(1); // Higher capture rate for smoother recording

      // Create audio context to preserve original audio
      const audioContext = new AudioContext();
      const audioSource = audioContext.createMediaElementSource(video);
      const audioDestination = audioContext.createMediaStreamDestination();
      audioSource.connect(audioDestination);

      // Combine video stream with full-quality audio
      const combinedStream = new MediaStream([
        ...stream.getVideoTracks(),
        ...audioDestination.stream.getAudioTracks(),
      ]);

      const mediaRecorder = new MediaRecorder(combinedStream, {
        mimeType: "video/webm; codecs=vp8",
        videoBitsPerSecond: 1000000, // Increased bitrate to 1 Mbps
        audioBitsPerSecond: 128000, // Full quality audio
      });

      const chunks: Blob[] = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const processedBlob = new Blob(chunks, { type: "video/webm" });
        URL.revokeObjectURL(video.src);
        resolve(processedBlob);
      };

      mediaRecorder.onerror = (event) => {
        URL.revokeObjectURL(video.src);
        throw new Error("MediaRecorder error");
      };

      let frameCount = 0;
      const duration = video.duration;
      const totalFrames = Math.floor(duration / 5); // 1 frame every 5 seconds
      const PROGRESS_UPDATE_INTERVAL = 10; // Update progress every 10 frames

      const drawFrame = () => {
        if (frameCount >= totalFrames) {
          // Ensure 100% progress is reported if any frames were processed.
          if (totalFrames > 0) {
            onProgress?.(100);
          }
          mediaRecorder.stop();
          return;
        }

        // Update progress on the first frame, and then at specified intervals.
        if (
          frameCount === 0 ||
          (frameCount > 0 && frameCount % PROGRESS_UPDATE_INTERVAL === 0)
        ) {
          const percent =
            totalFrames > 0 ? Math.round((frameCount / totalFrames) * 100) : 0;
          onProgress?.(percent);
        }

        video.currentTime = frameCount * 5; // Jump by 5 seconds
        frameCount++;
      };

      video.onseeked = () => {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        drawFrame(); // Remove delay for faster processing
      };

      mediaRecorder.start();
      drawFrame();
    };

    video.onerror = () => {
      URL.revokeObjectURL(video.src);
      reject(new Error("Video loading error"));
    };
  });
}

const initialApiKey = await getStoredApiKey();

const store = createStore({
  context: {
    ai: initialApiKey ? new GoogleGenAI({ apiKey: initialApiKey }) : null,
    video: null as { videoUrl: string | null; error: string | null } | null,
    videoProgress: 0,
    isVideoLoading: true,
    summary: null as string | null,
    progressStatus: null as string | null,
    summaryCache: getSummaryCache(),
  },
  on: {
    set_api_key: (context, event: { key: string }) => {
      // if (!import.meta.env.DEV) {
      localStorage.setItem("gemini_api_key", event.key);
      // }
      context.ai = new GoogleGenAI({ apiKey: event.key });
    },
    update_summary: (context, event: { chunk: string }) => ({
      ...context,
      summary: (context.summary || "") + event.chunk,
    }),
    update_progress: (context, event: { status: string }) => ({
      ...context,
      progressStatus: event.status,
    }),
    update_progress_with_percent: (
      context,
      event: { status: string; percent: number },
    ) => ({
      ...context,
      progressStatus: `${event.status} (${event.percent}%)`,
    }),
    update_video_progress: (context, event: { progress: number }) => ({
      ...context,
      videoProgress: event.progress,
    }),
    set_video_result: (
      context,
      event: { videoUrl: string | null; error: string | null },
    ) => ({
      ...context,
      video: { videoUrl: event.videoUrl, error: event.error },
      isVideoLoading: false,
    }),
    clear_cache: (context) => {
      localStorage.removeItem("video_summary_cache");
      return {
        ...context,
        summaryCache: {},
      };
    },
    force_regenerate: (context) => {
      if (context.video?.videoUrl) {
        const cache = getSummaryCache();
        delete cache[context.video.videoUrl];
        localStorage.setItem("video_summary_cache", JSON.stringify(cache));
      }
      return {
        ...context,
        summary: null,
        summaryCache: getSummaryCache(),
      };
    },
    update_cache: (context, event: { videoUrl: string; summary: string }) => ({
      ...context,
      summaryCache: {
        ...context.summaryCache,
        [event.videoUrl]: event.summary,
      },
    }),
    summarize: (context, event, enqueue) => {
      if (!context.ai) return context;

      // Reset summary before starting
      enqueue.effect(async () => {
        // Step 1: Load video (get URL)
        let lastLoadPercent = 0;
        store.trigger.update_progress_with_percent({
          status: "Loading video",
          percent: 0,
        });
        const videoUrl: string = await new Promise((resolve, reject) => {
          const extApi = (window as any).browser?.runtime?.sendMessage
            ? (window as any).browser
            : (window as any).chrome;
          // Try to use loadVideoWithProgress if available for percent
          if (typeof loadVideoWithProgress === "function") {
            loadVideoWithProgress((percent: number) => {
              if (percent !== lastLoadPercent) {
                lastLoadPercent = percent;
                store.trigger.update_progress_with_percent({
                  status: "Loading video",
                  percent,
                });
              }
            }).then((result: any) => {
              if (result?.videoUrl) {
                resolve(result.videoUrl);
              } else {
                reject(new Error("Failed to get video URL"));
              }
            }).catch(reject);
          } else {
            extApi.runtime
              .sendMessage({ action: "getVideoRequest" })
              .then((response: any) => {
                if (response?.success && typeof response.data === "string") {
                  resolve(response.data);
                } else {
                  reject(new Error("Failed to get video URL"));
                }
              })
              .catch(reject);
          }
        });

        // Step 2: Fetch transcript and get first 3 lines as key
        store.trigger.update_progress({ status: "Loading transcript" });
        const vttText = await fetchVttText(await getVttUrl().unwrapOr("")).unwrapOr("Transcript not found");
        const transcriptLines = vttText.split("\n").filter(Boolean).slice(0, 3).join("\n");
        const transcriptKey = transcriptLines || videoUrl; // fallback to URL if transcript missing

        // Step 3: Check for cached summary by videoUrl
        const cachedSummary = getCachedSummary(videoUrl);
        if (cachedSummary) {
          store.trigger.update_summary({ chunk: cachedSummary });
          return;
        }

        // Step 4: Check for cached upload by transcript key
        let uploadInfo = getCachedUpload(transcriptKey);

        let uploadUri: string | undefined;
        let uploadMime: string | undefined;

        if (uploadInfo) {
          uploadUri = uploadInfo.uri;
          uploadMime = uploadInfo.mimeType;
        } else {
          // Step 5: Download and downscale video
          let lastPercent = 0;
          store.trigger.update_progress_with_percent({
            status: "Downloading video",
            percent: 0,
          });
          const blobResult = await fetchVideoBlob(videoUrl, (percent: number) => {
            if (percent !== lastPercent) {
              lastPercent = percent;
              store.trigger.update_progress_with_percent({
                status: "Downloading video",
                percent,
              });
            }
          });
          if (blobResult.isErr()) {
            throw new Error(`Failed to get video blob: ${blobResult.error}`);
          }
          const blob = blobResult.value;

          store.trigger.update_progress({ status: "Downscaling video" });
          const downscaledBlob = await downscaleVideoTo1fps(blob, (percent) => {
            store.trigger.update_progress_with_percent({
              status: "Downscaling video",
              percent,
            });
          });

          // Step 6: Upload video
          store.trigger.update_progress({ status: "Uploading video" });
          const uploadResult = await context.ai!.files.upload({
            file: downscaledBlob,
            config: { mimeType: downscaledBlob.type },
          });

          // Step 7: Wait for upload to become active
          store.trigger.update_progress({
            status: "Waiting for video to become active",
          });
          async function waitForFileActive(
            ai: GoogleGenAI,
            fileName: string,
            timeoutMs = 2 * 60 * 1000,
            pollInterval = 1500,
          ) {
            const deadline = Date.now() + timeoutMs;
            while (Date.now() < deadline) {
              const meta = await ai.files.get({ name: fileName });
              if (meta.state === "ACTIVE") return meta;
              await new Promise((r) => setTimeout(r, pollInterval));
            }
            throw new Error(`File ${fileName} never became ACTIVE`);
          }
          await waitForFileActive(context.ai!, uploadResult.name!);

          uploadUri = uploadResult.uri!;
          uploadMime = uploadResult.mimeType!;
          saveUploadToCache(transcriptKey, uploadUri, uploadMime);
        }

        // Step 8: Run AI
        store.trigger.update_progress({ status: "Running AI" });
        const input = {
          model: "gemini-2.0-flash",
          contents: createUserContent([
            `Transcript follows.\n\n======\n\n${vttText}`,
            createPartFromUri(uploadUri!, uploadMime!),
            SUMMARIZE_PROMPT,
          ]),
        };
        const stream = await context.ai!.models.generateContentStream(input);

        for await (const chunk of stream) {
          store.trigger.update_summary({ chunk: chunk.text! });
        }
        const tokens = (await context.ai!.models.countTokens(input)).totalTokens!;
        const tokenInfo = `<br /> <br /> Used ${tokens} tokens.`;
        store.trigger.update_summary({ chunk: tokenInfo });

        // Save the complete summary to cache, but only if non-empty
        const finalSummary = (context.summary || "") + tokenInfo;
        if (finalSummary.trim() && finalSummary.trim() !== tokenInfo.trim()) {
          saveSummaryToCache(videoUrl, finalSummary);

          // Update cache in store context
          store.trigger.update_cache({
            videoUrl,
            summary: finalSummary,
          });
        }
      });

      return {
        ...context,
        summary: "",
        progressStatus: null,
      };
    },
  },
});

function SummarizeView() {
  let ai = useSelector(store, (state) => state.context.ai);
  const output = useSelector(store, (state) => state.context.summary);
  const progressStatus = useSelector(
    store,
    (state) => state.context.progressStatus,
  );
  const video = useSelector(store, (state) => state.context.video);
  const summaryCache = useSelector(
    store,
    (state) => state.context.summaryCache,
  );
  const [generated, setGenerated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cachedSummary = video?.videoUrl ? summaryCache[video.videoUrl] : null;

  const handleSummaryClick = useCallback((event: React.MouseEvent) => {
    const target = event.target as HTMLElement;
    event.preventDefault();
    if (
      target.tagName === "A" &&
      target.getAttribute("href")?.match(/^\d+:\d+$/)
    ) {
      const timeStr = target.getAttribute("href")!;
      const [minutes, seconds] = timeStr.split(":").map(Number);
      const timestamp = minutes * 60 + seconds;
      setVideoTimestamp(timestamp);
    }
  }, []);

  if (!ai) return <div>No API key set</div>;

  return (
    <>
      {!generated ? (
        <>
          {error && (
            <InlineAlert variant="negative" marginBottom="size-200">
              <Content>{error}</Content>
            </InlineAlert>
          )}
          <Button
            variant="primary"
            onPress={async () => {
              if (!video?.videoUrl) {
                // Try to detect video
                try {
                  const videoUrl: string = await new Promise((resolve, reject) => {
                    const extApi = (window as any).browser?.runtime?.sendMessage
                      ? (window as any).browser
                      : (window as any).chrome;
                    extApi.runtime
                      .sendMessage({ action: "getVideoRequest" })
                      .then((response: any) => {
                        if (response?.success && typeof response.data === "string") {
                          resolve(response.data);
                        } else {
                          reject(new Error("No video detected on this page."));
                        }
                      })
                      .catch(reject);
                  });
                  store.trigger.set_video_result({ videoUrl, error: null });
                  setError(null);
                  setGenerated(true);
                  store.trigger.summarize();
                } catch (e: any) {
                  setError(e?.message || "No video detected on this page.");
                }
              } else {
                setError(null);
                setGenerated(true);
                store.trigger.summarize();
              }
            }}
          >
            Generate AI Summary
          </Button>
          {cachedSummary && (
            <Button
              variant="secondary"
              onPress={() => {
                setGenerated(true);
                // Load cached summary immediately
                store.trigger.update_summary({ chunk: cachedSummary });
              }}
              UNSAFE_style={{ marginLeft: "0.5rem" }}
            >
              Load Cached Summary
            </Button>
          )}
        </>
      ) : output ? (
        <>
          <div
            dangerouslySetInnerHTML={{ __html: output! }}
            onClick={handleSummaryClick}
          />
          <div style={{ marginTop: "1rem", display: "flex", gap: "0.5rem" }}>
            <Button
              variant="secondary"
              onPress={() => {
                store.trigger.force_regenerate();
                setGenerated(false);
              }}
            >
              Regenerate
            </Button>
            <Button
              variant="secondary"
              onPress={() => {
                store.trigger.clear_cache();
              }}
            >
              Clear All Cache
            </Button>
          </div>
        </>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <ProgressCircle isIndeterminate />
          {progressStatus && (
            <span>
              {progressStatus}
              {progressStatus.match(/Loading video \(\d+%\)/) ? "" : (
                progressStatus.includes("Loading video") &&
                typeof store.getSnapshot().context.videoProgress === "number"
                  ? ` (${store.getSnapshot().context.videoProgress}%)`
                  : ""
              )}
            </span>
          )}
        </div>
      )}
    </>
  );
}

function AIApp() {
  return (
    <Tabs aria-label="Adobe Connect AI Panel">
      <TabList>
        <Item key="sum">Summarize</Item>
        <Item key="chat">Chat with Video</Item>
      </TabList>
      <TabPanels UNSAFE_style={{ marginTop: "1rem" }}>
        <Item key="sum">
          <SummarizeView />
        </Item>
        <Item key="chat">Chat with Video</Item>
      </TabPanels>
    </Tabs>
  );
}

function KeyInputView() {
  const [errors, setErrors] = useState({});

  const onSubmit = useCallback(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const data = Object.fromEntries(new FormData(e.currentTarget));
    const apiKey = data.apiKey as string;

    const isValid = await validateApiKey(apiKey);

    if (isValid) {
      setErrors({});
      ToastQueue.positive("API key set!", { timeout: 5000 });
      store.trigger.set_api_key({ key: apiKey });
    } else {
      setErrors({
        apiKey: "Invalid API key. Please check your key and try again.",
      });
    }
  }, []);

  return (
    <InlineAlert variant="negative">
      <Heading>No API key provided</Heading>
      <Content>
        In order to use AI features, please provide a Gemini API key. You can go
        to <a href="https://aistudio.google.com">Google AI Studio</a> to create
        an API key.
        <Form
          validationBehavior="native"
          maxWidth="size-3000"
          onSubmit={onSubmit}
          validationErrors={errors}
        >
          <TextField label="API Key" name="apiKey" isRequired />
        </Form>
      </Content>
    </InlineAlert>
  );
}

function App() {
  const ai = useSelector(store, (state) => state.context.ai);
  return ai ? <AIApp /> : <KeyInputView />;
}

// Mount directly if #root exists (for direct import from index.html)
const rootElement = document.getElementById("root");
if (rootElement) {
  createRoot(rootElement).render(
    <Provider theme={defaultTheme}>
      <div style={{ padding: "1rem", height: "100vh" }}>
        <ToastContainer />
        <Suspense>
          <App />
        </Suspense>
      </div>
    </Provider>,
  );
}
