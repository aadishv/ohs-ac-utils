import { useSelector } from "@xstate/store/react";
import { createStore } from "@xstate/store";
import { z } from "zod";
import { cache, runAI } from "./ai";

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
  icon: z.union([
    z.literal("question"),
    z.literal("x"),
    z.literal("task"),
    z.literal("checkmark"),
    z.literal("bookmark"),
  ]),
  content: z.string(),
});
export type Topic = z.infer<typeof topic_validator>;

export const sidepanel = createStore({
  context: {
    vtt: null as Entry[] | null,
    topics: [] as Topic[],
    // ready | progress 0-100 | error message
    state: null as null | number | string,
  },
  on: {
    _updateTopics: (context, { topics }: { topics: Topic[] }) => {
      return { ...context, topics };
    },
    _addTopics: (context, { topic }: { topic: Topic }) => {
      return { ...context, topics: [...context.topics, topic] };
    },
    _updateState: (context, { state }: { state: null | number | string }) => {
      return { ...context, state };
    },
    run: (context, { videoUrl, vtt }: { videoUrl: string, vtt: Entry[] | null }) => {
      let topics = context.topics;
      void runAI(
        (state: number | null | string) =>
          sidepanel.trigger._updateState({ state }),
        {
          add(topic: Topic) {
            topics.push(topic);
            sidepanel.trigger._addTopics({ topic });
          },
          clear() {
            topics = [];
            sidepanel.trigger._updateTopics({ topics });
          },
          get() {
            return topics;
          },
        },
        vtt,
        videoUrl,
      );
    },
  },
});

export const useSidepanelState = () => {
  const state = useSelector(sidepanel, (s) => s.context);
  return state;
};
