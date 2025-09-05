import {
  Badge,
  Button, defaultTheme, Item,
  Link, ProgressCircle,
  Provider,
  TabList,
  TabPanels,
  Tabs,
  ToastContainer, Well
} from "@adobe/react-spectrum";
import { Suspense, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "../tailwind.css";
import { convertSecondsToHms, useCaptions } from "../lib/caption";
import * as Icons from "lucide-react";
import { Toaster, toast } from "sonner";
import Chat, { useLocalChat, key } from "./ai2";
function Transcript() {
  const vtt = useCaptions();
  return vtt === null ? (
    <ProgressCircle isIndeterminate />
  ) : (
    <div className="overflow-y-scroll">
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
      <div className="mb-4">
        <Well>
        <p className="mb-2">
          To use the AI features, you need to provide a Gemini API key from
          Google AI Studio. Follow these steps:
        </p>
        <ol className="list-decimal list-inside mb-2">
          <li>
            Go to{" "}
            <Link
              href="https://ai.studio/"
              target="_blank"
            >
              https://ai.studio/
            </Link>
          </li>
          <li>Open the sidebar, click on Dashboard &gt; API keys</li>
          <li>
            Click "Create API key" and paste the result into the field below
          </li>
        </ol>
        <p className="text-sm">
          I never view your API key, and all requests are directly forwarded to
          Google servers.
        </p>
        <p className="text-sm">
          <Link
            href="https://ai.google.dev/gemini-api/terms"
            target="_blank"
          >
            Gemini API Additional Terms of Service
          </Link>
          {" | "}
          <Link
            href="https://aadishv.github.io/ohs-ac-privacy/"
            target="_blank"
          >
            OHS AC Utils Privacy Policy
          </Link>
        </p>
        </Well>
      <div className="flex items-center gap-2 mt-4">
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
    </div>
  );
}

function App() {
  const chat = useLocalChat();
  return (
    <div className="h-full ">
      <Tabs
        aria-label="Choose which mode to use the AI side panel in"
        UNSAFE_className="overflow-y-scroll"
      >
        <TabList
          UNSAFE_className="z-[50] w-[96vw]"
          UNSAFE_style={{
            backgroundColor: "var(--spectrum-alias-background-color-default)",
          }}
        >
          <Item key="ai">AI</Item>
          <Item key="tc">Transcript</Item>
          <Item key="ak">API key</Item>
        </TabList>
        <TabPanels UNSAFE_className="w-[96%] h-[96%] pt-14 fixed overflow-y-scroll">
          <Item key="tc">
            <Transcript />
          </Item>
          <Item key="ai">
            <Chat {...chat} />
          </Item>
          <Item key="ak">
            <KeySelect />
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
      UNSAFE_className="w-screen h-screen fixed overflow-y-scroll"
      theme={defaultTheme}
    >
      <ToastContainer />
      <Suspense>
        <div className="w-[96vw] h-[96vh] mx-[2vw] my-[2vh]">
          <App />
        </div>
        <Toaster />
      </Suspense>
    </Provider>,
  );
}
