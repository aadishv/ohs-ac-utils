import { useEffect, useState } from "react";
import { convertSecondsToHms, getCaptions, useCaptions } from "../lib/caption";
import { useVideo } from "../lib/video";
import getFetcher, { FrameFetcher, parseTimeToSeconds } from "./frames";
import { useChat } from "@ai-sdk/react";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { convertToModelMessages, FileUIPart, streamText, tool } from "ai";
import z from "zod";

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

const system = `
<role>
You are a teaching assistant for a course taken at Stanford Online High School. Your role is to discuss questions with students given the transcript (given in a <transcript></transcript> tag) to aid students in studying.
Answer questions about the recorded class discussion given the transcript.
</role>
<formatting>
Always use headings level 1 and 2, never levels 3-6.
Avoid Markdown block quotes or syntax unique to Github-flavored Markdown.
LaTeX is available.
</formatting>
<verbosity>
Minimize verbosity. For generic questions give a brief overview and no more. For specific questions only answer with relevant information. Try to map things to the lowest common denominator -- if the intent is a summary, don't go through every point, instead focusing on the most salient topics.
**Be as concise as possible. The user is not looking for paragraphs/essays -- they want concise and to-the-point answers to their questions.**
</verbosity>
<errors>
This transcript contains multiple errors, which you need to account for.
<examples>
The transcript may say: "Pocks are known as man's best friend," where the first word was likely meant to be "dogs". If you believe there is an error in the slightest, fix it for all responses. **NEVER mention the wrong spelling and ALWAYS use the fixed version.**
</examples>
</errors>
<tools>
You have the \`getFrame\` tool available. This tool allows you to view the lecture video at a specific timestamp. It can be called multiple times.
<uses>
* If the user specifically asks to view a frame, or asks for you to check it.
* If you need more context about a specific caption to answer the user's question.
</uses>
<input>
timestamp: timestamp in MM:SS or HH:MM:SS. If you're searching for the frame when specific thing from the transcript was said, estimate when it was said based on the beginning of the speaker's turn and the location of that thing within the greater turn.
show: whether to display the result to the user. This should ALMOST ALWAYS be set to false in the vast majority of cases; **it should ONLY be set to true when the user explicitly requests to view the frame.**
</input>
<output>
You can view the output after ending your turn. Then, the user will provide the image to you in a <system> message.
</output>
</tools>
<abilities>
Avoid saying you cannot do something. Think hard and find a way to do it using your given environment.
</abilities>
`;

type CallStatus = {
  calls: { timestamp: string; show: boolean }[];
  done: boolean;
};

export const useLocalChat = () => {
  const vtt = useCaptions();
  const video = useVideo();
  const [fetcher, setFetcher] = useState<FrameFetcher | null>(null);
  const [calls, setCalls] = useState<CallStatus>({ calls: [], done: false });
  const [cache, setCache] = useState<Record<string, string | null>>({});
  const chat = useChat({
    transport: {
      async sendMessages(options) {
        if (!key.get()) {
          throw new Error(
            'No API key. Go to the "API Key" tab to view instructions on how to add a valid API key.',
          );
        }
        const google = createGoogleGenerativeAI({
          apiKey: key.get(),
        });
        const normVtt = (await getCaptions())?.map((v) => ({
          ...v,
          from: convertSecondsToHms(v.from / 1000),
          to: convertSecondsToHms(v.to / 1000),
        }));
        setCalls({ calls: [], done: false });
        console.log(normVtt, vtt);
        const stream = streamText({
          model: google("gemini-2.5-flash-lite"),
          system: `<transcript>${JSON.stringify(normVtt)}</transcript>\n ${system}`,
          messages: convertToModelMessages(options.messages),
          abortSignal: options.abortSignal,
          tools: {
            getFrame: tool({
              description:
                "Get the frame of the lecture at a specific timestamp. Can be called multiple times to fetch multiple frames. You can wait for 3 results to come back, then call 3 more, etc. You can view the resulting image after you end your turn.",
              inputSchema: z.object({
                timestamp: z
                  .string()
                  .describe("timestamp in MM:SS or HH:MM:SS"),
                show: z
                  .boolean()
                  .describe("whether to display the result to the user. ")
                  .describe(
                    "this should ALMOST ALWAYS be false. if the user specifically requests to view the frame, set this to true.",
                  ),
              }),
              execute: async (call) => {
                setCalls((c) => ({ done: false, calls: [...c.calls, call] }));
                return "Tool has been called; if you'd like to see output, end the turn.";
              },
            }),
          },
          onFinish: () => {
            setCalls((c) => ({ ...c, done: true }));
          },
        });
        return stream.toUIMessageStream();
      },
      // obviously not needed
      async reconnectToStream(_) {
        return null;
      },
    },
  });
  useEffect(() => {
    if (video?.status === "done") {
      void (async () => {
        const newFetcher = (await getFetcher(video.obj)).unwrapOr(null);
        setFetcher((f) => {
          if (f !== null) return f;
          else {
            return newFetcher;
          }
        });
      })();
    }
  }, [video]);
  useEffect(() => {
    if (!calls.done) return;
    const get = async (time: string) => {
      const lookup = cache[time];
      if (lookup) {
        return lookup;
      }
      if (!fetcher) {
        return null;
      } else {
        const result = (await fetcher.fetch(parseTimeToSeconds(time))).unwrapOr(
          null,
        );
        setCache((c) => ({ ...c, [time]: result }));
        return result;
      }
    };
    void (async () => {
      const inputs = calls.calls;
      if (inputs.length > 0) {
        const files: FileUIPart[] = [];
        for (const input of inputs) {
          const url = await get(input.timestamp);
          if (url !== null) {
            files.push({
              type: "file",
              mediaType: "image/png",
              filename: `frame-${input.timestamp}.png`,
              url: url,
            });
          }
        }
        if (files.length === 0) {
          await chat.sendMessage({
            text: `<system>Frame fetching is temporarily unavailable.</system>`,
          });
        } else {
          await chat.sendMessage({
            files,
            text: `<system>Fetched frames attached.</system>`,
          });
        }
      }
    })();
  }, [calls]);
  console.log(vtt);
  return {
    ...chat,
    vttAvailable: vtt !== null,
    frameFetcherAvailable: fetcher !== null,
    cache,
    messages: chat.messages.filter(
      (message) =>
        !message.parts
          .map(
            (p) =>
              p.type === "text" &&
              p.text.includes("<system>") &&
              p.text.includes("</system>"),
          )
          .includes(true),
    ),
  };
};
