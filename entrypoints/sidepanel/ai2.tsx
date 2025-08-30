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
import { useState } from "react";
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
import { convertToModelMessages, streamText } from "ai";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button, ProgressCircle, TextArea } from "@adobe/react-spectrum";
import Markdown from "react-markdown";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

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

const ChatBotDemo = () => {
  const vtt = useSelector(sidepanel, (s) => s.context.vtt);
  const [input, setInput] = useState("");
  const [webSearch, setWebSearch] = useState(false);
  const { messages, sendMessage, status } = useChat({
    transport: {
      async sendMessages(options) {
        const google = createGoogleGenerativeAI({
          apiKey: key.get(),
        });
        const stream = streamText({
          model: google("gemini-2.5-flash-lite"),
          system: `<transcript>${JSON.stringify(vtt)}</transcript>\n ${system}`,
          messages: convertToModelMessages(options.messages),
          abortSignal: options.abortSignal,
        });
        return stream.toUIMessageStream();
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
                      return null;
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
