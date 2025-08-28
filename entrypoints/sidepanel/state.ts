import { useEffect, useState } from "react";
import { Err, Ok, Result } from "neverthrow";
import { createStore } from "@xstate/store";
import { fetchVttText, getVttUrl } from "../popup/data";
import { parse } from "@plussub/srt-vtt-parser";
import { v7 } from "uuid";
import { useSelector } from "@xstate/store/react";

export function convertSecondsToHms(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  // Use the String.prototype.padStart() method to ensure leading zeros
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
    refreshVtt: (ctx, _, enqueue) => {
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
        // Fallback: if nothing matched, treat the whole input as text with no speaker
        if (results.length === 0) {
          return [{ speaker: "", text: input.trim() }];
        }
        return results;
      };
      const promise = getVttUrl()
        .unwrapOr("")
        .then((url) => fetchVttText(url))
        .then((captions) =>
          captions
            .map((vtt) =>
              Result.fromThrowable(parse)(vtt).map((parsed) => parsed.entries),
            )
            .andThen((p) => p),
        )
        .then((result) => result.unwrapOr([]))
        .then((entries) => {
          // Flatten entries if a single text contains multiple speakers
          return entries.flatMap((e) => {
            const { text, ...rest } = e;
            const parsed = parseSpeakerText(text);
            return parsed.map(({ speaker, text }) => ({
              ...rest,
              speaker,
              text,
            }));
          });
        })
        .then((entries) => {
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
        })
      enqueue.effect(async () => {
        const entries = await promise;
        sidepanel.trigger.updateVtt({ vtt: entries });
      });
    },
  },
});
export const useSidepanelState = (main: boolean = false) => {
  const state = useSelector(sidepanel, (s) => s.context);
  useEffect(() => {
    if (main) {
      sidepanel.trigger.refreshVtt();
    }
  }, [main]);
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
// console.log();
