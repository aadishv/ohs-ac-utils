import { parse } from "@plussub/srt-vtt-parser";
import { useState, useEffect } from "react";
import { v7 } from "uuid";
import { getVttUrl, fetchVttText } from "../popup/data";
import { Result } from "neverthrow";

function useAsyncValue<T>(value: () => Promise<T>): T | null {
  const [state, setState] = useState<T | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const v = await value();
      if (!cancelled) setState(v);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

export const useTranscript = () => useAsyncValue(async () => {});
