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
import { Suspense } from "react";
import { createRoot } from "react-dom/client";
import "../tailwind.css";
import { convertSecondsToHms, useTranscript } from "./transcript";
import { Entry } from "./transcript";
import { AIRuntime, useAIRuntime } from "./ai";

function Transcript({ vtt }: { vtt: Entry[] | null }) {
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

function AIPanel({ ai }: { ai: AIRuntime }) {
  return ai.running === "unavailable" ? (
    <ProgressBar isIndeterminate />
  ) : ai.running === "ready" ? (
    <Button variant="primary" onPress={ai.run}>
      Run AI analysis
    </Button>
  ) : (
    <div className="flex flex-col gap-3">
      {ai.running === "working" && (ai.progress === null ? (
        <div className="flex">
          <ProgressCircle size="S" UNSAFE_className="my-auto" isIndeterminate />
          <span className="mx-1 my-auto">Let the AI cook...</span>
        </div>
      ) : (
        <div className="flex flex-col">
          <span>{ai.progress.action}</span>
          <ProgressBar value={ai.progress.prog * 100} />
        </div>
      ))}
      {
        ai.status.isErr() && <InlineAlert variant="negative">
          <Heading>An error occured during analysis</Heading>
          <Content>
            {ai.status.error}
          </Content>
        </InlineAlert>
      }
    </div>
  );
}

function App() {
  const vtt = useTranscript();
  const ai = useAIRuntime(vtt);
  return (
    <div className="p-4 h-full">
      <Tabs aria-label="Choose which mode to use the AI side panel in">
        <TabList UNSAFE_className="mb-4">
          <Item key="ai">AI</Item>
          <Item key="tc">Transcript</Item>
        </TabList>
        <TabPanels>
          <Item key="tc">
            <Transcript vtt={vtt} />
          </Item>
          <Item key="ai">
            <AIPanel ai={ai} />
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
      </Suspense>
    </Provider>,
  );
}
