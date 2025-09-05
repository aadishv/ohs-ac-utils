import { Conversation, ConversationContent } from "@/components/conversation";
import { Message, MessageContent } from "@/components/message";
import { PromptInput, PromptInputToolbar } from "@/components/prompt-input";
import { useEffect, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { Image, Send } from "lucide-react";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import z from "zod";
import { convertToModelMessages, FileUIPart, streamText, tool } from "ai";
import {
  Button,
  Content,
  Heading,
  InlineAlert,
  ProgressCircle,
} from "@adobe/react-spectrum";
import Markdown from "react-markdown";
import { Skeleton } from "@/components/ui/skeleton";
import { useVideo } from "../lib/video";
import getFetcher, { FrameFetcher, parseTimeToSeconds } from "./frames";
import { convertSecondsToHms, getCaptions, useCaptions } from "../lib/caption";
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';


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
</verbosity>
<errors>
This transcript contains multiple errors, which you need to account for.
<examples>
The transcript may say: "Pocks are known as man's best friend," where the first word was likely meant to be "dogs". If you believe there is an error in the slightest, fix it for all responses. **NEVER mention the wrong spelling and ALWAYS use the fixed version.**
</examples>
</errors>
<important>
**Be as concise as possible.**
</important>
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
                    "err on the side of caution; if you aren't confident in the contents of a frame, don't show it. you can re-call the tool to show them once you're more confident. if the user specifically requests to view the frame, set this to true.",
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

const Chat = ({
  messages,
  sendMessage,
  status,
  setMessages,
  vttAvailable,
  frameFetcherAvailable,
  cache,
  error,
}: ReturnType<typeof useLocalChat>) => {
  const [input, setInput] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      void sendMessage({ text: input });
      setInput("");
    }
  };
  return (
    <div className="h-full flex flex-col">
      {!vttAvailable ? (
        <>
          <ProgressCircle isIndeterminate />
          <p>
            Waiting for transcript to load. If it's been a while, try reloading
            the page. Make sure you're on the page of the lecture recording.
          </p>
        </>
      ) : (
        <>
          <Conversation className="overflow-y-auto flex-1 min-h-0">
            {error && (
              <InlineAlert variant="negative" UNSAFE_className="w-full">
                <Heading>Error occured during generation</Heading>
                <Content>{error.message}</Content>
              </InlineAlert>
            )}
            <ConversationContent>
              {messages.map((message) => (
                <Message from={message.role} key={message.id}>
                  <MessageContent className="backdrop-brightness-125 p-4 rounded-xl">
                    {message.parts.map((part, i) => {
                      switch (part.type) {
                        case "text":
                          return (
                            <Markdown key={`${message.id}-${i}`} remarkPlugins={[remarkMath]}
                                  rehypePlugins={[rehypeKatex]}>
                              {part.text}
                            </Markdown>
                          );
                        case "tool-getFrame":
                          if (part.state !== "output-available") {
                            return <Skeleton className="size-full" />;
                          }
                          const input = part.input as {
                            timestamp: string;
                            show: boolean;
                          };
                          return (
                            <>
                              <span className="flex gap-2">
                                <Image className="h-4 w-4 my-auto" />
                                Get lecture frame at {input.timestamp}
                              </span>
                              {input.show && (
                                <img src={cache[input.timestamp] ?? ""} />
                              )}
                            </>
                          );
                      }
                    })}
                  </MessageContent>
                </Message>
              ))}
            </ConversationContent>
          </Conversation>
          <PromptInput
            onSubmit={handleSubmit}
            className="pt-4 flex flex-col z-10 h-40 gap-2"
          >
            <hr />
            <div className="flex flex-row border-0 gap-2">
              <input
                onChange={(e) => setInput(e.target.value)}
                className="border-2 size-full px-2 border-blue-500 rounded-2xl transition-all duration-300"
                value={input}
                placeholder="try mentioning a timestamp!"
              />
              <PromptInputToolbar className="gap-2">
                <Button
                  type="submit"
                  variant="primary"
                  UNSAFE_style={{ minHeight: "100%", borderWidth: 2 }}
                  isDisabled={!input}
                >
                  {status === "submitted" || status === "streaming" ? (
                    <ProgressCircle size="S" isIndeterminate />
                  ) : (
                    <Send />
                  )}
                </Button>
                <Button
                  variant="negative"
                  onPress={() => {
                    setMessages([]);
                  }}
                  UNSAFE_style={{ minHeight: "100%", borderWidth: 2 }}
                >
                  Clear chat
                </Button>
              </PromptInputToolbar>
            </div>
            <div className="text-xs">
              <p>AC AI can make mistakes. Closing the sidepanel will permanently clear chat history.</p>
              <b>Context status:</b>
              <div className="flex gap-2">
                <p className="flex gap-2">
                  <span
                    className={`w-5 h-5 rounded-full ${vttAvailable ? "bg-green-500" : "bg-red-500"}`}
                  />
                  <span className="my-auto">
                    Transcript {vttAvailable ? "available" : "not available"}
                  </span>
                </p>
                <p className="flex gap-2">
                  <span
                    className={`w-5 h-5 rounded-full ${frameFetcherAvailable ? "bg-green-500" : "bg-red-500"}`}
                  />
                  <span className="my-auto">
                    Frame Fetcher{" "}
                    {frameFetcherAvailable ? "available" : "not available"}
                  </span>
                </p>
              </div>
            </div>
          </PromptInput>
        </>
      )}
    </div>
  );
};

export default Chat;
