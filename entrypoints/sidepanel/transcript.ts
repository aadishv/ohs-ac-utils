import { parse } from "@plussub/srt-vtt-parser";
import { useState, useEffect } from "react";
import { v7 } from "uuid";
import { getVttUrl, fetchVttText } from "../popup/data";
import { Result } from "neverthrow";
export type Entry = {
  speaker: string;
  text: string;
  id: string;
  from: number;
  to: number;
};
export function convertSecondsToHms(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  // Use the String.prototype.padStart() method to ensure leading zeros
  const pad = (num: number): string => num.toFixed().padStart(2, '0');

  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}
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

export const useTranscript = () => useAsyncValue(async () => {
  /**
   * Parses a string with multiple @:@Speaker@:@ Text segments into an array of {speaker, text}.
   * Handles cases where multiple speakers are present in a single string.
   */
  function parseSpeakerText(
    input: string,
  ): { speaker: string; text: string }[] {
    const regex = /@:@\s*([^@]+?)\s*@:@\s*([^@]+?)(?=(?:\s*@:@|$))/g;
    const results: { speaker: string; text: string }[] = [];
    let match: RegExpExecArray | null;
    while ((match = regex.exec(input)) !== null) {
      results.push({
        speaker: match[1].trim(),
        text: match[2].trim(),
      });
    }
    // Fallback: if nothing matched, treat the whole input as text with no speaker
    if (results.length === 0) {
      return [{ speaker: "", text: input.trim() }];
    }
    return results;
  }
  function log<T>(value: T): T {
    console.log(value);
    return value;
  }
  return getVttUrl()
    .unwrapOr("")
    .then((url) => fetchVttText(url))
    .then((c) => {
      return c;
    })
    .then((captions) =>
      captions.map(
        (vtt) => Result.fromThrowable(parse)(vtt).map(parsed => parsed.entries),
      ).andThen(p => p)
    )
    .then(log)
    .then((result) => result.unwrapOr([]))
    .then((entries) => {
      // Flatten entries if a single text contains multiple speakers
      return entries.flatMap((e) => {
        const { text, ...rest } = e;
        const parsed = parseSpeakerText(text);
        return parsed.map(({ speaker, text }) => ({
          ...rest,
          speaker,
          text,
        }));
      });
    })
    .then((entries) => {
      let newEntries: Entry[] = [];
      let currentEntry = entries[0];
      for (const entry of entries.slice(1)) {
        if (entry.speaker !== currentEntry.speaker) {
          currentEntry.id = v7();
          newEntries.push(currentEntry);
          currentEntry = entry;
        } else {
          currentEntry.text += ` ${entry.text}`;
          currentEntry.to = entry.to;
        }
      }
      return newEntries;
    });
});
