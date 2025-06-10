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
Summarize this video briefly.

Do not acknowledge the user or this prompt. Respond ONLY with the summary, and no prefix such as "Here is a summary:".

The transcript is also provided, in VTT format. You can use this to aid you in finding timestamps. Keep in mind that the transcript is not the source of truth, as it is not multilingual or perfectly accurate.

Be brief, concise, and straightforward. Target one paragraph for each important aspect. Do not aim to discuss all points, but instead focus on a broad overview.

Use HTML instead of Markdown for formatting when formatting is needed. You can create custom styles with CSS, although that is not recommended for most use cases.

Indent your paragraphs, keeping HTML whitespace rules in mind.

This is a lecture recording from a class at Stanford Online High School.


After your summary, respond with a timeline.

Link to time stamps of each slide displayed. For time stamps, always respond with an accurate MM:SS timestamp.

If slides are not displayed or a separate event occurs, that may also be a valid time stamp + label.

Target 5-15 points per video. Here is an end-to-end example (with made-up labels and timestamps):

===========
<h2>Summary</h2>

...

<br><h2>Timeline</h2>

<ul>
  <li><a href="0:00">Introduction</a></li>
  <li><a href="0:17">Overview of the course</a></li>
  <li><a href="22:00">Course objectives</a></li>
  <li><a href="34:00">Course structure</a></li>
  <li><a href="45:59">Course materials</a></li>
  <li><a href="67:02">Course evaluation</a></li>
</ul>
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
      if (!context.video?.videoUrl) return context;
      if (!context.ai) return context;

      // Check if we have a cached summary for this video URL
      const cachedSummary = getCachedSummary(context.video.videoUrl);
      if (cachedSummary) {
        return {
          ...context,
          summary: cachedSummary,
          progressStatus: null,
        };
      }

      enqueue.effect(async () => {
        async function waitForFileActive(
          ai: GoogleGenAI,
          fileName: string,
          timeoutMs = 2 * 60 * 1000,
          pollInterval = 1500,
        ) {
          const deadline = Date.now() + timeoutMs;

          while (Date.now() < deadline) {
            // fetch the metadata
            const meta = await ai.files.get({ name: fileName });
            if (meta.state === "ACTIVE") {
              return meta;
            }
            await new Promise((r) => setTimeout(r, pollInterval));
          }
          throw new Error(`File ${fileName} never became ACTIVE`);
        }

        const url = context.video!.videoUrl;

        // Get the original video URL to fetch the blob from cache
        const videoUrlResult = await new Promise<string>((resolve, reject) => {
          const extApi = (window as any).browser?.runtime?.sendMessage
            ? (window as any).browser
            : (window as any).chrome;

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
        });

        // Use cached blob from fetchVideoBlob
        const blobResult = await fetchVideoBlob(videoUrlResult);
        if (blobResult.isErr()) {
          throw new Error(`Failed to get video blob: ${blobResult.error}`);
        }
        const blob = blobResult.value;

        // Downscale video to 1fps
        store.trigger.update_progress({ status: "Downscaling video" });
        const downscaledBlob = await downscaleVideoTo1fps(blob, (percent) => {
          store.trigger.update_progress_with_percent({
            status: "Downscaling video",
            percent,
          });
        });

        // step 1: upload
        store.trigger.update_progress({ status: "Uploading video" });
        const uploadResult = await context.ai!.files.upload({
          file: downscaledBlob,
          config: { mimeType: downscaledBlob.type },
        });

        // step 2: wait until that upload is fully processed by Google
        // (uploadResult.name is "files/…" or just the ID)
        store.trigger.update_progress({
          status: "Waiting for video to become active",
        });
        await waitForFileActive(context.ai!, uploadResult.name!);

        // step 3: now you can safely call generateContent
        store.trigger.update_progress({ status: "Running AI" });
        const input = {
          model: "gemini-2.0-flash",
          contents: createUserContent([
            `Transcript follows.\n\n======\n\n${await fetchVttText(await getVttUrl().unwrapOr("")).unwrapOr("Transcript not found")}`,
            createPartFromUri(uploadResult.uri!, uploadResult.mimeType!),
            SUMMARIZE_PROMPT,
          ]),
        };
        const stream = await context.ai!.models.generateContentStream(input);

        for await (const chunk of stream) {
          console.log(chunk.text);
          store.trigger.update_summary({ chunk: chunk.text! });
        }
        const tokens = (await context.ai!.models.countTokens(input))
          .totalTokens!;
        const tokenInfo = `<br /> <br /> Used ${tokens} tokens.`;
        store.trigger.update_summary({ chunk: tokenInfo });

        // Save the complete summary to cache
        const finalSummary = (context.summary || "") + tokenInfo;
        saveSummaryToCache(context.video!.videoUrl!, finalSummary);

        // Update cache in store context
        store.trigger.update_cache({
          videoUrl: context.video!.videoUrl!,
          summary: finalSummary,
        });
      });

      // Reset summary before starting
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
  if (!video?.videoUrl) return <div>No video detected</div>;
  if (!ai) return <div>No API key set</div>;

  const cachedSummary = video?.videoUrl ? summaryCache[video.videoUrl] : null;
  const [generated, setGenerated] = useState(!!cachedSummary);

  const handleSummaryClick = useCallback((event: React.MouseEvent) => {
    const target = event.target as HTMLElement;
    if (
      target.tagName === "A" &&
      target.getAttribute("href")?.match(/^\d+:\d+$/)
    ) {
      event.preventDefault();
      const timeStr = target.getAttribute("href")!;
      const [minutes, seconds] = timeStr.split(":").map(Number);
      const timestamp = minutes * 60 + seconds;
      setVideoTimestamp(timestamp);
    }
  }, []);

  return (
    <>
      {!generated ? (
        <>
          <Button
            variant="primary"
            onPress={() => {
              setGenerated(true);
              store.trigger.summarize();
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
          {progressStatus && <span>{progressStatus}</span>}
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
  const video = useSelector(store, (state) => state.context.video);
  const videoProgress = useSelector(
    store,
    (state) => state.context.videoProgress,
  );
  const isVideoLoading = useSelector(
    store,
    (state) => state.context.isVideoLoading,
  );
  const ai = useSelector(store, (state) => state.context.ai);

  // Initialize video loading
  React.useEffect(() => {
    let mounted = true;

    loadVideoWithProgress((progress) => {
      if (mounted) {
        store.trigger.update_video_progress({ progress });
      }
    }).then((result) => {
      if (mounted) {
        store.trigger.set_video_result({
          videoUrl: result.videoUrl,
          error: result.error,
        });
      }
    });

    return () => {
      mounted = false;
    };
  }, []);

  if (isVideoLoading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "1rem",
          padding: "1rem",
        }}
      >
        <ProgressCircle isIndeterminate />
        <span>Loading video... {videoProgress}%</span>
      </div>
    );
  }

  if (video?.error) {
    return (
      <InlineAlert variant="negative">
        <Heading>No video detected</Heading>
        <Content>
          Please load a video. Make sure you are on the page of an Adobe Connect
          recording for Stanford Online High School.
          <br />
          Error: {video.error}
        </Content>
      </InlineAlert>
    );
  }

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
