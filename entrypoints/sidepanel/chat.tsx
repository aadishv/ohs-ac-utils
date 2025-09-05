import { Conversation, ConversationContent } from "@/components/conversation";
import { Message, MessageContent } from "@/components/message";
import { PromptInput, PromptInputToolbar } from "@/components/prompt-input";
import { useEffect, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { ArrowDown, ArrowUp, Image, Send } from "lucide-react";
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
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { useLocalChat } from "./ai2";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button as ShadcnButton } from "@/components/ui/button";
function ToolCall({
  cache,
  input,
}: {
  cache: Record<string, string | null>;
  input: {
    timestamp: string;
    show: boolean;
  };
}) {
  const [isOpen, setIsOpen] = useState(input.show);
  return (
    <>
      <Collapsible
        open={isOpen}
        onOpenChange={setIsOpen}
        className="flex flex-col gap-2"
      >
        <div className="flex gap-1">
          <h4 className="text-sm font-semibold flex gap-2">
            <Image className="h-4 w-4 my-auto" />
            Get lecture frame at {input.timestamp}
          </h4>
          <CollapsibleTrigger asChild>
            <ShadcnButton variant="ghost" size="icon" className="size-8">
              {isOpen ? <ArrowUp /> : <ArrowDown />}
            </ShadcnButton>
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent>
          <img src={cache[input.timestamp] ?? ""} />
        </CollapsibleContent>
      </Collapsible>
    </>
  );
}

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
                            <Markdown
                              key={`${message.id}-${i}`}
                              remarkPlugins={[remarkMath]}
                              rehypePlugins={[rehypeKatex]}
                            >
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
                          return <ToolCall cache={cache} input={input} />;
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
              <p>
                AC AI can make mistakes. Closing the sidepanel will permanently
                clear chat history.
              </p>
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
