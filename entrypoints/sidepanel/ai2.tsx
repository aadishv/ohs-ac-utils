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
</formatting>
<verbosity>
Minimize verbosity. For generic questions give a brief overview (<100 words) and no more. For specific questions only answer with relevant information.
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
          system: `${system}\n <transcript>${JSON.stringify(vtt)}</transcript>`,
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      sendMessage({ text: input });
      setInput("");
    }
  };
  return (
    <div className="max-w-4xl mx-auto p-6 relative min-h-full border">
        <Conversation className="h-full">
          <ConversationContent>
            {messages.map((message) => (
              <div key={message.id}>
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
              </div>
            ))}
          </ConversationContent>
        </Conversation>
      <PromptInput onSubmit={handleSubmit} className="mt-4 flex flex-row">
        <input onChange={e => setInput(e.target.value)} className="border-2 w-full min-h-full my-2 px-2 border-blue-500 rounded-full" value={input} />
        <PromptInputToolbar className="">
          <Button type="submit" variant="primary" isDisabled={!input}>
            {status === 'submitted' ? (
              <ProgressCircle size="S" isIndeterminate />
            ) : status === 'streaming' ? (
              <StopCircle className="size-6" />
            ) : status === 'error' ? (
              <X className="size-6" />
            ) : <Send />}
          </Button>
        </PromptInputToolbar>
      </PromptInput>
    </div>
  );
};

export default ChatBotDemo;
