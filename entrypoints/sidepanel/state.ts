import { useEffect, useState } from "react";
import { Err, Ok, Result, ResultAsync } from "neverthrow";
import { createStore } from "@xstate/store";
import { parse } from "@plussub/srt-vtt-parser";
import { v7 } from "uuid";
import { useSelector } from "@xstate/store/react";
import { FetchStatus } from "../lib/db";
import { VTT_PORT } from "../background";
import { json, z } from 'zod';
import { generateText, stepCountIs, streamText, tool } from 'ai';
import {createGoogleGenerativeAI} from '@ai-sdk/google';
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
export const topic_validator = z.object({
  icon: z.union([z.literal("question"), z.literal("x"), z.literal("task"), z.literal("checkmark"), z.literal("bookmark")]),
  content: z.string(),
});
export type Topic = z.infer<typeof topic_validator>;

export const key = {
  get: (): string => {
    if (!localStorage.getItem("apiKey")) {
      localStorage.setItem("apiKey", "");
      return "";
    }
    return localStorage.getItem("apiKey")!;
  },
  set: (value: string) => {
    localStorage.setItem("apiKey", value);
  },
};
function simpleHash(v: Entry[]) {
  // Build a stable projection of the transcript that excludes volatile fields (e.g., id)
  // and normalizes whitespace to avoid insignificant differences between parses.
  const stable = v.map(({ speaker, text, from, to }) => ({
    speaker: speaker.trim(),
    text: text.replace(/\s+/g, " ").trim(),
    from,
    to,
  }));

  let str = JSON.stringify(stable);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
  }
  // Convert to 32-bit unsigned integer and return as a base-36 string
  return (hash >>> 0).toString(36);
}
const cache = {
  get: (vtt: Entry[]): Topic[] => {
    return JSON.parse(localStorage.getItem(simpleHash(vtt)) || "[]") as Topic[];
  },
  set: (vtt: Entry[], topics: Topic[]) => {
    localStorage.setItem(simpleHash(vtt), JSON.stringify(topics));
  }
}
const SYSTEM = `
<role>
You are a teaching assistant for a course taken at Stanford Online High School. Your role is to compile a "Lecture Pack" of topics from the given lecture transcript (given in a <transcript></transcript> tag) to aid students in studying.
</role>
<guidelines>
<tools>
To add topics to the Lecture Pack, use the provided \`add_topic\` tool. This is the only way to communicate content to students.
<examples>
For a key term:
{
  "icon": "bookmark",
  "content": "**Biomes:**\n A general area defined by latitude, average temperature, and average precipitation."
}
etc. Adapt as needed.
</examples>
</tools>
<choice>
Topics must be important to the discussion and likely to show up on exams.
<examples>
Avoid making topics with anecdotes, specific mentions, or irrelevant details. The lecturer's pets should not be included; an example of how to use the Pythagorean theorem should not be included; the Pythagorean theorem itself *should* be included.

If the transcript discusses a specific example of the scientific method, add the method itself instead of examples.

If a math class solves a practice problem, add the theorems used instead of the problem.

Avoid generic titles such as "Key terms": "1. Biome = ... 2. Ecosystem = ...". Instead, use multiple topics such as "Biome": "...", "Ecosystem": "...".
</examples>
</choice>
<errors>
This transcript contains multiple errors, which you need to account for.
<examples>
The transcript may say: "Pocks are known as man's best friend," where the first word was likely meant to be "dogs". If you believe there is an error in the slightest, fix it for all topics. **NEVER mention the wrong spelling and ALWAYS use the fixed version.** Anything that is not a standard English word (and for which another English word makes more sense) should be immediately corrected.
</examples>
</errors>
<formatting>
Markdown and LaTeX are available in your environment.
</formatting>
<interaction>
**IMPORTANT:** to add topics, use the provided tool. Avoid returning any other text.
</interaction>
</guidelines>
`;

export const sidepanel = createStore({
  context: {
    vtt: null as Entry[] | null,
    topics: [] as Topic[],
    // ready | progress 0-100 | error message
    state: null as null | number | string,
  },
  on: {
    updateVtt: (context, { vtt }: { vtt: Entry[] }) => {
      return { ...context, vtt, topics: context.topics.length === 0 ? cache.get(vtt) : context.topics };
    },
    _updateTopics: (context, { topics }: { topics: Topic[] }, enqueue) => {
      return { ...context, topics };
    },
    _addTopics: (context, { topics }: { topics: Topic[] }, enqueue) => {
      return { ...context, topics: [...context.topics, ...topics] };
    },
    _updateState: (context, { state }: { state: null | number | string }) => {
      return { ...context, state };
    },
    run: (context, _, enqueue) => {
      enqueue.effect(async () => {
        const state = (state: number | null | string) => sidepanel.trigger._updateState({ state });
        if (!context.vtt) {
          state("Transcript hasn't loaded yet. Try reloading?");
          return;
        }
        const setTopics = (topics: Topic[]) => sidepanel.trigger._updateTopics({ topics });
        const addTopics = (topics: Topic[]) => sidepanel.trigger._addTopics({ topics });
        state(-1);
        setTopics([]);
        const topics: Topic[] = [];
        try {
          const google = createGoogleGenerativeAI({
            apiKey: key.get(),
          });
          const stream = streamText({
            model: google('gemini-2.5-flash-lite'),
            tools: {
              add_topic: tool({
                description: 'add_topic: Add a topic to the summary.',
                inputSchema: z.object({ topic: topic_validator }),
                execute: async ({ topic }) => {
                  console.log(topic);
                  topics.push(topic);
                  addTopics([topic]);
                  return "Successfully added topics";
                },
              }),
            },
            stopWhen: stepCountIs(20),
            prompt: JSON.stringify(context.vtt),
            system: SYSTEM,
          });
          // block until response is over
          for await (const p of stream.toUIMessageStream()) {
            console.log(p);
            if (p.type === "tool-input-error") {
              console.log(p.errorText);
            }
            if (p.type === "error") {
              state(p.errorText)
              return
            }
          }
        } catch {}
        cache.set(context.vtt, topics);
        state(null);
      });
      console.log("RUNNING HERE :DDDD");
    }
  },
});

export const useSidepanelState = () => {
  const state = useSelector(sidepanel, (s) => s.context);
  return state;
};
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
        )
        .andThen((v) => v)
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
        })
        .map((entries) => {
          let newEntries: Entry[] = [];
          let currentEntry = entries[0];
          entries = entries.slice(1);
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
};
setupSubscriber();
