import { Result, ResultAsync } from "neverthrow";
import { db, Request } from "./db2";
import { parse } from "@plussub/srt-vtt-parser";
import type { Entry, FetchStatus } from "./db2";
import { v7 } from "uuid";
import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
export function convertSecondsToHms(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (num: number): string => num.toFixed().padStart(2, "0");

  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

export async function loadCaptions(
  req: Request
) {
  if (await db.captions.get(req.tabId)) return;
  const id = req.tabId;
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

  await db.captions.add({
    id,
    contents: { status: "working", progress: 10 },
  });
  await ResultAsync.fromPromise(
    (async () => {
      const res = await fetch(req.url, {
        headers: {
          accept: "*/*",
          "cache-control": "no-cache",
          pragma: "no-cache",
        },
        method: "GET",
        referrerPolicy: "same-origin",
      });
      if (!res.ok) {
        throw new Error(`HTTP error: ${res.status}`);
      }

      const text = await res.text();
      return text;
    })(),
    (error) =>
      error instanceof Error
        ? error.message
        : "Unknown error while fetching captions text",
  )
    .map((vtt) =>
        Result.fromThrowable(parse)(vtt).map((parsed) => parsed.entries),
      )
      .andThen((v) => v)
      .map((entries) => {
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
      .map((entries) => {
        let newEntries: Entry[] = [];
        let currentEntry = entries[0];
        entries = entries.slice(1);
        for (const entry of entries) {
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
        return newEntries;
      })
    .map(async (v) =>
      await db.captions.update(id, {
        id,
        contents: {
          status: "done",
          obj: v,
        },
      })
    )
    .mapErr(async (e) =>
      await db.captions.update(id, {
        id,
        contents: {
          status: "error",
          error: e as string,
        },
      })
    );
}

export function useCaptions(): Entry[] | null {
    const [id, setId] = useState<number | null>(null);
    useEffect(() => {
      void (async () => {
        const tabs = await browser.tabs.query({
          active: true,
          currentWindow: true,
        });
        setId(tabs[0].id ?? null);
      })();
    }, []);
    const result = useLiveQuery(
      async () => {
        if (!id) { return null;  }
        const caps = await db.captions.where("id").equals(id).first() ?? null;
        if (caps?.contents?.status !== "done") return null;
        return caps.contents.obj;
      },
      [id],
    );
    return result ?? null;
}
export async function getCaptions(): Promise<Entry[] | null> {
  const tabs = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });
  const id = tabs[0].id ?? null;
  if (!id) { return null;  }
  const caps = await db.captions.where("id").equals(id).first() ?? null;
  if (caps?.contents?.status !== "done") return null;
  return caps.contents.obj;
}
