
import { useState } from "react";
import { Entry } from "./transcript";
import { Err, Ok, Result } from "neverthrow";
type Status = {
  topics: ({
    question: string,
    answer: string,
  } | {
    misconception: string,
  } | {
    term: string,
    definition: string,
  } | {
    task: string,
  })[];
}
export type AIRuntime = {
  running: "unavailable";
} | {
  running: "ready";
  run: () => void;
} | {
  running: "working";
  status: Result<Status, string>;
  progress: {
    action: string;
    prog: number; // 0-1
  } | null;
} | {
  running: "done";
  status: Result<Status, string>;
}
export const useAIRuntime = (vtt: Entry[] | null): AIRuntime => {
  const [running, setRunning] = useState("ready" as "ready" | "working" | "done");
  if (vtt == null) {
    return {
      running: "unavailable",
    }
  }

  if (running !== "ready") {
    return {
      running,
      status: new Err("Invalid API key"),
      progress: {
        action: "Doing something...",
        prog: 0.5,
      },
    }
  } else {
    return {
      running,
      run() {
        setRunning("working");
        setTimeout(() => {
          setRunning("done");
        }, 4000);
      }
    }
  }
}
console.log();
