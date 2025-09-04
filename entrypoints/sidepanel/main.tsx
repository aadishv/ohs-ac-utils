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
  useCaptions,
} from "../lib/caption";
import { useSelector } from "@xstate/store/react";
import * as Icons from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Toaster, toast } from "sonner";
import { useVideo } from "../lib/video";
import Chat, { useLocalChat, key } from "./ai2";
function Transcript() {
  const vtt = useCaptions();
  return vtt === null ? (
    <ProgressCircle isIndeterminate />
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

function App() {
  const chat = useLocalChat();
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
            <Chat {...chat} />
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
      <ToastContainer />
      <Suspense>
        <App />
        <Toaster />
      </Suspense>
    </Provider>,
  );
}
