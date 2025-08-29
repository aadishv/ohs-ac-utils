import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { streamText, tool, stepCountIs } from "ai";
import z from "zod";
import { sidepanel, Topic, topic_validator, Entry } from "./state";
import fetchFrame from "./frames";
import { FetchStatus } from "../lib/db";
import getFetcher from "./frames";

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
export const cache = {
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
export const runAI = async (state: (v: number | string | null) => void, topics: {
  add: (t: Topic) => void;
  clear: () => void;
  get: () => Topic[];
}, vtt: Entry[] | null, video: FetchStatus) => {
  if (!vtt) {
    state("Transcript hasn't loaded yet. Try reloading?");
    return;
  }
  if (video?.status !== "done") {
    state("No video detected. Try reloading?");
    return;
  }
  state(-1);
  topics.clear();
  // try {
  //   const google = createGoogleGenerativeAI({
  //     apiKey: key.get(),
  //   });
  //   const stream = streamText({
  //     model: google('gemini-2.5-flash-lite'),
  //     tools: {
  //       add_topic: tool({
  //         description: 'add_topic: Add a topic to the summary.',
  //         inputSchema: z.object({ topic: topic_validator }),
  //         execute: async ({ topic }) => {
  //           console.log(topic);
  //           topics.add(topic);
  //           return "Successfully added topics";
  //         },
  //       }),
  //     },
  //     stopWhen: stepCountIs(20),
  //     prompt: `<transcript>${JSON.stringify(vtt)}</transcript>`,
  //     system: SYSTEM,
  //   });
  //   // block until response is over
  //   for await (const p of stream.toUIMessageStream()) {
  //     console.log(p);
  //     if (p.type === "tool-input-error") {
  //       console.log(p.errorText);
  //     }
  //     if (p.type === "error") {
  //       state(p.errorText)
  //       return
  //     }
  //   }
  // } catch {}
  const fetcher = await getFetcher(video.obj);
  const dataUrl = (await fetcher._unsafeUnwrap().fetch(600))._unsafeUnwrap();
const img = document.createElement("img");
  img.src = dataUrl;
  const mainVideoElem = document.getElementById("main-video");
  if (mainVideoElem) {
    mainVideoElem.appendChild(img);
  }
  cache.set(vtt, topics.get());
  state(null);
}
