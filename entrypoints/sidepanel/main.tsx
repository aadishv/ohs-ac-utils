import {
  Badge,
  Button,
  Content,
  defaultTheme,
  Heading,
  InlineAlert,
  Item,
  ProgressBar,
  ProgressCircle,
  Provider,
  TabList,
  TabPanels,
  Tabs,
  ToastContainer,
} from "@adobe/react-spectrum";
import { Suspense, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "../tailwind.css";
import {
  convertSecondsToHms,
  Entry,
  sidepanel,
  useSidepanelState,
} from "./state";
import { key } from "./ai";
import * as Icons from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Toaster, toast } from "sonner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useCurrentUrls, useVideoQuery, useVttQuery } from "./hooks";

const queryClient = new QueryClient();

function Transcript() {
  const { vttUrl } = useCurrentUrls();
  const { data: vtt, isLoading, isError, error } = useVttQuery(vttUrl);

  if (isLoading) {
    return <ProgressCircle isIndeterminate />;
  }

  if (isError) {
    return <InlineAlert variant="negative"><Heading>Error loading transcript</Heading><Content>{error.message}</Content></InlineAlert>
  }

  return vtt === null || vtt === undefined ? (
    <p>No transcript found.</p>
  ) : (
    <div>
      {vtt.map((entry) => (
        <div key={entry.id} className="flex flex-col">
          <div className="flex">
            <Badge variant="neutral">{entry.speaker}</Badge>{" "}
            <span className="opacity-80 my-auto mx-3">{`${convertSecondsToHms(entry.from / 1000)}`}</span>
          </div>
          {entry.text}
        </div>
      ))}
    </div>
  );
}

function KeySelect() {
  const [showing, setShow] = useState(false);
  const [keyString, setKeyStr] = useState(key.get());
  useEffect(() => {
    setKeyStr(key.get());
  }, []);
  const set = () => {
    key.set(keyString);
    toast("Saved API key!");
  };
  return (
    <div className="flex items-center gap-2">
      <Icons.Key className="w-5 h-5 text-gray-500" />
      <div className="relative flex-1 flex items-center">
        <input
          type={showing ? "text" : "password"}
          placeholder="enter API key"
          onSubmit={set}
          value={keyString}
          onChange={(e) => setKeyStr(e.target.value)}
          className="rounded-full px-2 py-1 mr-1 w-full focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <button
          type="button"
          className=""
          onClick={() => setShow((s) => !s)}
          tabIndex={-1}
          aria-label={showing ? "Hide API key" : "Show API key"}
        >
          {showing ? (
            <Icons.EyeOff className="w-4 h-4" />
          ) : (
            <Icons.Eye className="w-4 h-4" />
          )}
        </button>
      </div>
      <Button variant="primary" onPress={set}>
        save API key
      </Button>
    </div>
  );
}

function AIPanel() {
  const state = useSidepanelState();
  const { videoUrl, vttUrl } = useCurrentUrls();
  const { data: video, isLoading: isVideoLoading } = useVideoQuery(videoUrl);
  const { data: vtt, isLoading: isVttLoading } = useVttQuery(vttUrl);

  useEffect(() => {
    if (video) {
      const videoElement = document.createElement('video');
      videoElement.src = video;
      videoElement.controls = true;
      videoElement.className = "w-full rounded-lg mb-4";
      const container = document.getElementById("main-video");
      if(container) {
        container.innerHTML = '';
        container.appendChild(videoElement);
      }
    }
  }, [video]);

  return (
    <div className="flex flex-col gap-3">
      <div id="main-video">
        {isVideoLoading && <ProgressCircle isIndeterminate />}
      </div>
      <KeySelect />
      {typeof state.state === "number" ? (
        <ProgressBar
          value={state.state >= 0 ? state.state : undefined}
          isIndeterminate={state.state < 0}
        />
      ) : (
        <Button
          variant="primary"
          onPress={() => {
            if (videoUrl && vtt) {
              sidepanel.trigger.run({ videoUrl, vtt });
            }
          }}
          isDisabled={isVttLoading || isVideoLoading || !videoUrl || !vtt}
        >
          Run AI analysis
        </Button>
      )}
      <div className="flex flex-col gap-3">
        {typeof state.state === "string" && (
          <InlineAlert variant="negative">
            <Heading>An error occured during analysis</Heading>
            <Content>{state.state}</Content>
          </InlineAlert>
        )}
      </div>
      <div className="flex flex-col gap-3">
        {state.topics.map((topic) => (
          <div className="backdrop-brightness-150 p-4 rounded-lg flex flex-col gap-4">
            <div className="flex italic gap-1">
              {topic.icon === "question" ? (
                <Icons.CircleQuestionMark />
              ) : topic.icon === "checkmark" ? (
                <Icons.Check />
              ) : topic.icon === "task" ? (
                <Icons.ListChecks />
              ) : topic.icon === "x" ? (
                <Icons.X />
              ) : topic.icon === "bookmark" ? (
                <Icons.Bookmark />
              ) : (
                <></>
              )}
            </div>
            <hr />
            <ReactMarkdown>{topic.content}</ReactMarkdown>
          </div>
        ))}
      </div>
    </div>
  );
}

function App() {
  return (
    <div className="h-full">
      <Tabs
        aria-label="Choose which mode to use the AI side panel in"
        UNSAFE_style={{ height: "100vh", padding: "1rem" }}
      >
        <TabList UNSAFE_className="mb-4">
          <Item key="ai">AI</Item>
          <Item key="tc">Transcript</Item>
        </TabList>
        <TabPanels UNSAFE_style={{ height: "100%" }}>
          <Item key="tc">
            <Transcript />
          </Item>
          <Item key="ai">
            <AIPanel />
          </Item>
        </TabPanels>
      </Tabs>
    </div>
  );
}

const rootElement = document.getElementById("root");
if (rootElement) {
  createRoot(rootElement).render(
    <Provider
      UNSAFE_className="w-[100vw] h-[100vh] fixed overflow-y-scroll"
      theme={defaultTheme}
    >
      <QueryClientProvider client={queryClient}>
        <ToastContainer />
        <Suspense>
          <App />
          <Toaster />
        </Suspense>
      </QueryClientProvider>
    </Provider>,
  );
}
