import { useQuery } from "@tanstack/react-query";
import { getVideoFromDB, getVttFromDB } from "../lib/db";
import { VTT_URL_KEY, VIDEO_URL_KEY } from "../background";
import { useState, useEffect } from "react";
import { browser } from "wxt/browser";
import { Result } from "neverthrow";
import { parse } from "@plussub/srt-vtt-parser";
import { Entry } from "./state";
import { v7 } from "uuid";

export function useCurrentUrls() {
  const [urls, setUrls] = useState<{ videoUrl: string | null; vttUrl: string | null }>({
    videoUrl: null,
    vttUrl: null,
  });

  useEffect(() => {
    const getInitialUrls = async () => {
      const initial = await browser.storage.local.get([VIDEO_URL_KEY, VTT_URL_KEY]);
      setUrls({
        videoUrl: initial[VIDEO_URL_KEY] || null,
        vttUrl: initial[VTT_URL_KEY] || null,
      });
    };
    getInitialUrls();

    const listener = (changes: Record<string, Browser.storage.StorageChange>, areaName: string) => {
      if (areaName === 'local') {
        if (changes[VIDEO_URL_KEY]) {
          setUrls(prev => ({ ...prev, videoUrl: changes[VIDEO_URL_KEY].newValue || null }));
        }
        if (changes[VTT_URL_KEY]) {
          setUrls(prev => ({ ...prev, vttUrl: changes[VTT_URL_KEY].newValue || null }));
        }
      }
    };

    browser.storage.onChanged.addListener(listener);

    return () => {
      browser.storage.onChanged.removeListener(listener);
    };
  }, []);

  return urls;
}

export function useVideoQuery(url: string | null) {
    return useQuery({
        queryKey: ['video', url],
        queryFn: async () => {
            if (!url) return null;
            const result = await getVideoFromDB(url);
            if (result.isErr()) {
                throw new Error(result.error);
            }
            const blob = new Blob([result.value], { type: "video/mp4" });
            return URL.createObjectURL(blob);
        },
        enabled: !!url,
    });
}

const parseSpeakerText = (
    input: string,
  ): { speaker: string; text: string }[] => {
    const regex = /@:@\s*([^@]+?)\s*@:@\s*([^@]+?)(?=(?:\s*@:@|$))/g;
    const results: { speaker: string; text: string }[] = [];
    let match: RegExpExecArray | null;
    while ((match = regex.exec(input)) !== null) {
      results.push({
        speaker: match[1].trim(),
        text: match[2].trim(),
      });
    }
    if (results.length === 0) {
      return [{ speaker: "", text: input.trim() }];
    }
    return results;
  };

export function useVttQuery(url: string | null) {
    return useQuery({
        queryKey: ['vtt', url],
        queryFn: async () => {
            if (!url) return null;
            const result = await getVttFromDB(url);
            if (result.isErr()) {
                throw new Error(result.error);
            }

            const parsedResult = Result.fromThrowable(parse)(result.value).map((parsed) => parsed.entries);
            if(parsedResult.isErr()) {
                throw new Error("Failed to parse VTT");
            }

            const entries = parsedResult.value.flatMap((e) => {
                const { text, ...rest } = e;
                const parsed = parseSpeakerText(text);
                return parsed.map(({ speaker, text }) => ({
                  ...rest,
                  speaker,
                  text,
                }));
              });

            let newEntries: Entry[] = [];
            if(entries.length > 0) {
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
                newEntries.push(currentEntry);
            }
            return newEntries;
        },
        enabled: !!url,
    });
}
