import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/conversation";
import { Message, MessageContent } from "@/components/message";
import {
  PromptInput,
  PromptInputModelSelect,
  PromptInputModelSelectContent,
  PromptInputModelSelectItem,
  PromptInputModelSelectTrigger,
  PromptInputModelSelectValue,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputTools,
} from "@/components/prompt-input";
import { useEffect, useMemo, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { Response } from "@/components/response";
import { GlobeIcon, Send, SquareStop, StopCircle, X } from "lucide-react";
import {
  Source,
  Sources,
  SourcesContent,
  SourcesTrigger,
} from "@/components/sources";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/reasoning";
import { Loader } from "@/components/loader";
import { key } from "./ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import z from "zod";
import { useSelector } from "@xstate/store/react";
import { sidepanel } from "./state";
import {
  ChatRequestOptions,
  convertFileListToFileUIParts,
  convertToModelMessages,
  createUIMessageStream,
  InferUIMessageChunk,
  ModelMessage,
  readUIMessageStream,
  stepCountIs,
  streamText,
  tool,
  UIDataTypes,
  UIMessage,
  UITools,
} from "ai";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button, ProgressCircle, TextArea } from "@adobe/react-spectrum";
import Markdown from "react-markdown";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import getFetcher, { FrameFetcher } from "./frames";
import { useVideo } from "../lib/db";
import { listToReadableStream, wrapAsyncGenerator } from "../lib/stream";

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
Minimize verbosity. For generic questions give a brief overview (<100 words) and no more. For specific questions only answer with relevant information. Try to map things to the lowest common denominator -- if the intent is a summary, don't go through every point, instead focusing on the most salient topics.
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
`;

export const useLocalChat = () => {
  const vtt = useSelector(sidepanel, (s) => s.context.vtt);
  const video = useVideo();
  const [fetcher, setFetcher] = useState<FrameFetcher | null>(null);

  useEffect(() => {
    const loadFetcher = async () => {
      if (video?.status === "done") {
        const result = await getFetcher(video.obj).unwrapOr(null);
        setFetcher(result);
      } else {
        setFetcher(null);
      }
    };

    loadFetcher();
  }, [video]);

  // useEffect(() => {
  //   if (video?.status === "done") {
  //     void getFetcher(video.obj).map(fetcher => fetcher.fetch(0)).map(console.log);
  //   }
  // }, [video]);
  type AgentMsg = InferUIMessageChunk<UIMessage<unknown, UIDataTypes, UITools>>;
  async function* run(
    options: {
      trigger: "submit-message" | "regenerate-message";
      chatId: string;
      messageId: string | undefined;
      messages: UIMessage<unknown, UIDataTypes, UITools>[];
      abortSignal: AbortSignal | undefined;
    } & ChatRequestOptions,
  ): AsyncGenerator<AgentMsg> {
    const google = createGoogleGenerativeAI({
      apiKey: key.get(),
    });
    // agentic loop
    let messages: ModelMessage[] = convertToModelMessages(options.messages);
    while (true) {
      let calls: {
        timestamp: number;
        show: boolean;
      }[] = [];
      const stream = streamText({
        model: google("gemini-2.5-flash-lite"),
        system: `<transcript>${JSON.stringify(vtt)}</transcript>\n ${system}`,
        messages,
        tools: {
          getFrame: tool({
            description:
              "Get the frame of the lecture at a specific timestamp. Can be called multiple times.",
            inputSchema: z.object({
              timestamp: z.number().describe("timestamp in seconds"),
              show: z
                .boolean()
                .describe("whether to show the result to the user"),
            }),
            execute: async (call) => {
              calls.push(call);
              return "Tool has been called; if you'd like to see output, end the turn.";
            },
          }),
        },
        abortSignal: options.abortSignal,
        stopWhen: stepCountIs(5),
      });
      let _parts: AgentMsg[] = [];

      for await (const part of stream.toUIMessageStream()) {
        _parts.push(part);
        yield part;
        console.log(part);
      }
      let uiParts: UIMessage[] = [];
      for await (const part of readUIMessageStream({
        stream: listToReadableStream(_parts),
      })) {
        uiParts.push(part);
      }
      messages = messages.concat(convertToModelMessages(uiParts));
      if (calls.length === 0) {
        break;
      }
      for (const call of calls) {
        if (fetcher) {
          const url = await fetcher.fetch(call.timestamp);
          if (url.isOk()) {
            messages.push({
              role: "user",
              content: [
                {
                  type: "image",
                  image: url.value,
                },
              ],
            });
          }
          const stream = createUIMessageStream({
            async execute({ writer }) {
              writer.merge(listToReadableStream([{
                role: "user",
                content: [
                  {
                    type: "image",
                    image: url.value,
                  },
                ],
              }]));
            },
          });
        }
      }
    }
  }
  return useChat({
    transport: {
      async sendMessages(options) {
        return wrapAsyncGenerator(run)(options);
      },
      // obviously not needed
      async reconnectToStream(_) {
        return null;
      },
    },
  });
};

const Chat = ({
  messages,
  sendMessage,
  status,
  setMessages,
}: ReturnType<typeof useLocalChat>) => {
  const [input, setInput] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      sendMessage({ text: input });
      setInput("");
    }
  };
  return (
    <div className="max-w-4xl mx-auto relative h-full flex flex-col min-h-0">
      <Conversation className="flex-1 overflow-y-auto min-h-0">
        <ConversationContent>
          {messages.map((message) => (
            <Message from={message.role} key={message.id}>
              <MessageContent className="backdrop-brightness-125 p-4 rounded-xl">
                {message.parts.map((part, i) => {
                  switch (part.type) {
                    case "text":
                      return (
                        <Markdown key={`${message.id}-${i}`}>
                          {part.text}
                        </Markdown>
                      );
                    default:
                      return JSON.stringify(part);
                  }
                })}
              </MessageContent>
            </Message>
          ))}
        </ConversationContent>
      </Conversation>
      <PromptInput
        onSubmit={handleSubmit}
        className="mt-4 flex flex-col z-10 gap-2"
      >
        <div className="flex flex-row border-0 gap-2">
          <input
            onChange={(e) => setInput(e.target.value)}
            className="border-2 size-full px-2 border-blue-500 rounded-2xl transition-all duration-300"
            value={input}
          />
          <PromptInputToolbar className="gap-2">
            <Button
              type="submit"
              variant="primary"
              UNSAFE_style={{ minHeight: "100%", borderWidth: 2 }}
              isDisabled={!input}
            >
              {status === "submitted" ? (
                <ProgressCircle size="S" isIndeterminate />
              ) : status === "streaming" ? (
                <StopCircle className="size-6" />
              ) : status === "error" ? (
                <X className="size-6" />
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
        <div>
          <p>
            <b>Disclaimer:</b> AC AI can make mistakes. Do not trust it for
            information. The developer does not hold responsibility for any
            damages caused by the AI's responses.
          </p>
          <p>Closing the sidepanel will permanently clear chat history.</p>
        </div>
      </PromptInput>
    </div>
  );
};

export default Chat;
