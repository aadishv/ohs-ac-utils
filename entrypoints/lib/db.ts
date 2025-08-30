import { ResultAsync } from "neverthrow";

const DB_NAME = "ohs-ac-utils-db";
const DB_VERSION = 2;
const VIDEO_STORE_NAME = "videos";
const VTT_STORE_NAME = "captions";

function openDB(): ResultAsync<IDBDatabase, string> {
  return ResultAsync.fromPromise(
    new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(VIDEO_STORE_NAME)) {
          db.createObjectStore(VIDEO_STORE_NAME, { keyPath: "url" });
        }
        if (!db.objectStoreNames.contains(VTT_STORE_NAME)) {
          db.createObjectStore(VTT_STORE_NAME, { keyPath: "url" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        reject(req.error);
      };
    }),
    (e) => String(e),
  );
}

export function getVideoFromDB(url: string): ResultAsync<ArrayBuffer, string> {
  return openDB()
    .map(async (db) => {
      const promise = ResultAsync.fromPromise(
        new Promise<ArrayBuffer>((resolve, reject) => {
          const tx = db.transaction(VIDEO_STORE_NAME, "readonly");
          const store = tx.objectStore(VIDEO_STORE_NAME);
          const r = store.get(url);
          r.onsuccess = () => {
            const val = r.result;

            if (!val || !val.data) {
              reject("no data");
              return;
            }
            resolve(val.data);
          };
          r.onerror = () => reject(r.error);
        }),
        (e) => e as string,
      );
      return await promise;
    })
    .andThen((e) => e);
}

export function setVideoInDB(
  url: string,
  data: ArrayBuffer,
): ResultAsync<void, string> {
  return openDB().map(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(VIDEO_STORE_NAME, "readwrite");
        const store = tx.objectStore(VIDEO_STORE_NAME);
        const r = store.put({ url, data });
        r.onsuccess = () => resolve();
        r.onerror = () => reject(r.error);
      }),
  );
}

export function getVttFromDB(url: string): ResultAsync<string, string> {
  return openDB()
    .map(async (db) => {
      const promise = ResultAsync.fromPromise(
        new Promise<string>((resolve, reject) => {
          const tx = db.transaction(VTT_STORE_NAME, "readonly");
          const store = tx.objectStore(VTT_STORE_NAME);
          const r = store.get(url);
          r.onsuccess = () => {
            const val = r.result;

            if (!val || !val.data) {
              reject("no data");
              return;
            }
            resolve(val.data);
          };
          r.onerror = () => reject(r.error);
        }),
        (e) => e as string,
      );
      return await promise;
    })
    .andThen((e) => e);
}

export function setVttInDB(
  url: string,
  data: string,
): ResultAsync<void, string> {
  return openDB().map(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(VTT_STORE_NAME, "readwrite");
        const store = tx.objectStore(VTT_STORE_NAME);
        const r = store.put({ url, data });
        r.onsuccess = () => resolve();
        r.onerror = () => reject(r.error);
      }),
  );
}

export const loadVideo = async (url: string, fetchUrl: string) => {
  try {
    const got = await getVideoFromDB(url);
    if (got.isOk()) {
      return;
    }

    const res = await fetch(fetchUrl, {
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

    const blob = await res.blob();
    const arrayBuffer = await blob.arrayBuffer();
    await setVideoInDB(url, arrayBuffer);
  } catch (error) {
    console.error("Failed to load video:", error);
  }
};

export const loadCaptions = async (url: string) => {
  try {
    const got = await getVttFromDB(url);
    if (got.isOk()) {
      return;
    }

    const res = await fetch(url, {
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
    await setVttInDB(url, text);
  } catch (error) {
    console.error("Failed to load captions:", error);
  }
};
