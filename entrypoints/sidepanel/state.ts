import { useEffect, useState } from "react";
import { Err, Ok, Result, ResultAsync } from "neverthrow";
import { createStore } from "@xstate/store";
import { parse } from "@plussub/srt-vtt-parser";
import { v7 } from "uuid";
import { useSelector } from "@xstate/store/react";
import { FetchStatus } from "../lib/db";
import { VTT_PORT } from "../background";

export function convertSecondsToHms(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (num: number): string => num.toFixed().padStart(2, "0");

  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}
export type Entry = {
  speaker: string;
  text: string;
  id: string;
  from: number;
  to: number;
};

export const sidepanel = createStore({
  context: {
    vtt: null as Entry[] | null,
  },
  on: {
    updateVtt: (context, { vtt }: { vtt: Entry[] }, enqueue) => {
      return { ...context, vtt };
    },
  },
});
export const useSidepanelState = () => {
  const state = useSelector(sidepanel, (s) => s.context);
  return state;
};
// type Status = {
//   topics: ({
//     question: string,
//     answer: string,
//   } | {
//     misconception: string,
//   } | {
//     term: string,
//     definition: string,
//   } | {
//     task: string,
//   })[];
// }
// export type AIRuntime = {
//   running: "unavailable";
// } | {
//   running: "ready";
//   run: () => void;
// } | {
//   running: "working";
//   status: Result<Status, string>;
//   progress: {
//     action: string;
//     prog: number; // 0-1
//   } | null;
// } | {
//   running: "done";
//   status: Result<Status, string>;
// }
// export const useAIRuntime = (vtt: Entry[] | null): AIRuntime => {
//   const [running, setRunning] = useState("ready" as "ready" | "working" | "done");
//   if (vtt == null) {
//     return {
//       running: "unavailable",
//     }
//   }

//   if (running !== "ready") {
//     return {
//       running,
//       status: new Err("Invalid API key"),
//       progress: {
//         action: "Doing something...",
//         prog: 0.5,
//       },
//     }
//   } else {
//     return {
//       running,
//       run() {
//         setRunning("working");
//         setTimeout(() => {
//           setRunning("done");
//         }, 4000);
//       }
//     }
//   }
// }
const setupSubscriber = () => {
  const port = browser.runtime.connect({ name: VTT_PORT });

  port.onMessage.addListener(async (msg: FetchStatus) => {
    const parseSpeakerText = (
      input: string,
    ): { speaker: string; text: string }[] => {
      const regex = /@:@\s*([^@]+?)\s*@:@\s*([^@]+?)(?=(?:\s*@:@|$))/g;
      const results: { speaker: string; text: string }[] = [];
      let match: RegExpExecArray | null;
      while ((match = regex.exec(input)) !== null) {
        results.push({
          speaker: match[1].trim(),
          text: match[2].trim(),
        });
      }
      if (results.length === 0) {
        return [{ speaker: "", text: input.trim() }];
      }
      return results;
    };
    if (msg?.status === "done") {
      const vtt = (new Ok(msg.obj) as Result<string, string>)
        .map((vtt) =>
          Result.fromThrowable(parse)(vtt).map((parsed) => parsed.entries),
        ).andThen(v => v)
        .map((entries) => {
          return entries.flatMap((e) => {
            const { text, ...rest } = e;
            const parsed = parseSpeakerText(text);
            return parsed.map(({ speaker, text }) => ({
              ...rest,
              speaker,
              text,
            }));
          });
        }).map((entries) => {
          let newEntries: Entry[] = [];
          let currentEntry = entries[0];
          entries = entries.slice(1)
          for (const entry of entries) {
            if (entry.speaker !== currentEntry.speaker) {
              currentEntry.id = v7();
              newEntries.push(currentEntry);
              currentEntry = entry;
            } else {
              currentEntry.text += ` ${entry.text}`;
              currentEntry.to = entry.to;
            }
          }
          newEntries.push(currentEntry);
          return newEntries;
        });
      if (vtt.isOk()) {
        sidepanel.trigger.updateVtt({ vtt: vtt.value });
      }
    }
  });
}
setupSubscriber();
