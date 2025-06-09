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
import { useVideo } from "../popup/data";
import { injectVideoControl, setVideoTime as setVideoTimeInject } from "../lib/video-control";

// Be brief, concise, and straightforward.
const SUMMARIZE_PROMPT = `
Summarize this video briefly.

Do not acknowledge the user or this prompt. Respond ONLY with the summary, and no prefix such as "Here is a summary:".

Be brief, concise, and straightforward. Target one paragraph for each important aspect. Do not aim to discuss all points, but instead focus on a broad overview.

Use HTML instead of Markdown for formatting when formatting is needed. You can create custom styles with CSS, although that is not recommended for most use cases.

Indent your paragraphs, keeping HTML whitespace rules in mind.

This is a lecture recording from a class at Stanford Online High School.

After your summary, respond with a timeline. Link to time stamps. Target 5-15 points per video. Here is an end-to-end example:
===========
<h2>Summary</h2>

...

<br><h2>Timeline</h2>

<ul>
  <li><a href="0:00"> Introduction</li>
  <li><a href="00:10">Overview of the course</a></li>
  <li><a href="00:20">Course objectives</a></li>
  <li><a href="00:30">Course structure</a></li>
  <li><a href="00:40">Course materials</a></li>
  <li><a href="00:50">Course evaluation</a></li>
</ul>
`

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

const initialApiKey = await getStoredApiKey();

const store = createStore({
  context: {
    ai: initialApiKey ? new GoogleGenAI({ apiKey: initialApiKey }) : null,
    video: await useVideo(),
    summary: null as string | null,
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
    summarize: (context, event, enqueue) => {
      if (context.video.isErr()) return context;
      if (!context.ai) return context;

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

        const url = context.video._unsafeUnwrap();

        // re-fetch into a Blob
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`Fetch failed: ${resp.status}`);
        const blob = await resp.blob();

        // step 1: upload
        const uploadResult = await context.ai!.files.upload({
          file: blob,
          config: { mimeType: blob.type },
        });

        // step 2: wait until that upload is fully processed by Google
        // (uploadResult.name is "files/…" or just the ID)
        await waitForFileActive(context.ai!, uploadResult.name!);

        // step 3: now you can safely call generateContent
        const input = {
          model: "gemini-2.0-flash",
          contents: createUserContent([
            createPartFromUri(uploadResult.uri!, uploadResult.mimeType!),
            SUMMARIZE_PROMPT,
          ]),
        }
        const stream = await context.ai!.models.generateContentStream(input);

        for await (const chunk of stream) {
          console.log(chunk.text);
          store.trigger.update_summary({ chunk: chunk.text! });
        }
        const tokens = (await context.ai!.models.countTokens(input)).totalTokens!;
        store.trigger.update_summary({ chunk: `<br /> <br /> Used ${tokens} tokens.` });
      });

      // Reset summary before starting
      return {
        ...context,
        summary: "",
      };
    }
  },
});
async function setVideoTimestamp(timestamp: number) {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      // First inject the video control script
      await injectVideoControl(tab.id);
      // Then set the video time
      const response = await setVideoTimeInject(tab.id, timestamp);
      return response?.success;
    }
  } catch (error) {
    console.error('Failed to control video:', error);
  }
  return false;
}


function SummarizeView() {
  let ai = useSelector(store, (state) => state.context.ai);
  const output = useSelector(store, (state) => state.context.summary);
  const videoUrl = useSelector(store, (state) => state.context.video);
  if (videoUrl.isErr()) return <div>No video detected</div>;
  if (!ai) return <div>No API key set</div>;
  const [generated, setGenerated] = useState(false);


  const handleSummaryClick = useCallback((event: React.MouseEvent) => {
     const target = event.target as HTMLElement;
     if (target.tagName === 'A' && target.getAttribute('href')?.match(/^\d+:\d+$/)) {
       event.preventDefault();
       const timeStr = target.getAttribute('href')!;
       const [minutes, seconds] = timeStr.split(':').map(Number);
       const timestamp = minutes * 60 + seconds;

       setVideoTimestamp(timestamp);
     }
   }, []);



   return (
     <>
       {!generated ? (
         <>
           <Button variant="primary" onPress={() => {
             setGenerated(true);
             store.trigger.summarize();
           }}>
             Generate AI Summary
           </Button>
         </>
       ) : (
         output ? (

           <>
             <div
               dangerouslySetInnerHTML={{ __html: output! }}
               onClick={handleSummaryClick}
             />
           </>
         ) : <ProgressCircle isIndeterminate />
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
  const videoUrl = useSelector(store, (state) => state.context.video);
  if (videoUrl.isErr()) {
    return (
      <InlineAlert variant="negative">
        <Heading>No video detected</Heading>
        <Content>
          Please load a video. Make sure you are on the page of an Adobe Connect
          recording for Stanford Online High School.
          <br />
          Error: {videoUrl.error}
        </Content>
      </InlineAlert>
    );
  }
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
