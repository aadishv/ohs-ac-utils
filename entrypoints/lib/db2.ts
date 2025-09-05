import { UIMessage } from "ai";
import Dexie, { type EntityTable } from "dexie";

export type FetchStatus<T> =
  | {
      status: "working";
      progress: number;
    }
  | {
      status: "done";
      obj: T;
    }
  | {
      status: "error";
      error: string;
    }
  | null;
export type Entry = {
  speaker: string;
  text: string;
  id: string;
  from: number;
  to: number;
};
const db = new Dexie("ohs_ac_utils") as Dexie & {
  videos: EntityTable<{
    url: string;
    data: ArrayBuffer;
  }, "url">;
  captions: EntityTable<{
    id: number;
    contents: FetchStatus<Entry[]>;
  }, "id">;
  tabToVid: EntityTable<
    {
      id: number;
      // progress | url for lookup | error
      value: FetchStatus<string>;
    },
    "id"
  >;
};

// Schema declaration:
db.version(1).stores({
  videos: "url",
  tabToVid: "id",
  captions: "id",
});

type Request = globalThis.Browser.webRequest.OnSendHeadersDetails;
export { db, type Request };
