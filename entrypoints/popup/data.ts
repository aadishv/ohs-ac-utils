import { errAsync, ResultAsync } from 'neverthrow'
/**
 * Helper to trim any leading/trailing "%22" (encoded `"` quotes) from the URL.
 */
function trimEncodedQuotes(url: string): string {
  let s = url
  while (s.startsWith('%22')) {
    s = s.slice(3)
  }
  while (s.endsWith('%22')) {
    s = s.slice(0, -3)
  }
  return s
}

/**
 * Step 1: ask the extension for the video URL.
 * Returns ResultAsync< videoUrl, errorMessage >
 */
function getVideoUrl(): ResultAsync<string, string> {
  return ResultAsync.fromPromise(
    (async () => {
      // support both Firefox and Chrome extensions
      const extApi = (window as any).browser?.runtime?.sendMessage
        ? (window as any).browser
        : (window as any).chrome

      if (!extApi?.runtime?.sendMessage) {
        throw new Error('Extension API not available')
      }

      const response = await extApi.runtime.sendMessage({ action: 'getVideoRequest' })
      if (!response?.success || typeof response.data !== 'string') {
        throw new Error('Failed to get video URL from extension')
      }

      return response.data
    })(),
    (error) =>
      error instanceof Error
        ? error.message
        : 'Unknown error while fetching video URL'
  )
}

// Cache for storing blobs keyed by video URL
const blobCache = new Map<string, Blob>()

/**
 * Step 2: download the video as a blob.
 * Returns ResultAsync< Blob, errorMessage >
 */
export function fetchVideoBlob(videoUrl: string): ResultAsync<Blob, string> {
  return ResultAsync.fromPromise(
    (async () => {
      const cleanUrl = trimEncodedQuotes(videoUrl)

      // Check cache first
      if (blobCache.has(cleanUrl)) {
        return blobCache.get(cleanUrl)!
      }

      const res = await fetch(cleanUrl, {
        headers: {
          accept: '*/*',
          'cache-control': 'no-cache',
          pragma: 'no-cache',
          // ...any other headers you really need...
        },
        method: 'GET',
        referrerPolicy: 'same-origin',
      })
      if (!res.ok) {
        throw new Error(`HTTP error: ${res.status}`)
      }
      const blob = await res.blob()
      if (blob.type !== 'video/mp4') {
        console.warn(`Expected video/mp4 but got ${blob.type}`)
      }

      // Cache the blob
      blobCache.set(cleanUrl, blob)

      return blob
    })(),
    (error) =>
      error instanceof Error
        ? error.message
        : 'Unknown error while fetching video blob'
  )
}

// Cache for storing object URLs keyed by video URL
const urlCache = new Map<string, string>()

/**
 * The combined hook/function:
 * 1) getVideoUrl
 * 2) fetchVideoBlob
 * 3) createObjectURL
 *
 * Returns ResultAsync< objectUrl, errorMessage >
 */
export function useVideo(): ResultAsync<string, string> {
  return getVideoUrl()
    .andThen((videoUrl) => {
      const cleanUrl = trimEncodedQuotes(videoUrl)
      
      // Check if we already have an object URL for this video
      if (urlCache.has(cleanUrl)) {
        return ResultAsync.fromSafePromise(Promise.resolve(urlCache.get(cleanUrl)!))
      }
      
      return fetchVideoBlob(videoUrl)
        .map((blob) => {
          const objectUrl = URL.createObjectURL(blob)
          urlCache.set(cleanUrl, objectUrl)
          return objectUrl
        })
    })
}

// MARK: - downloading utilities

export async function downloadBlobFromUrl(blobUrl: string): Promise<void> {
  try {
    // Get the active tab's title for the filename
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const title = tabs[0]?.title?.trim() || "video";
    const filename = `${title}.mp4`;

    // Fetch the blob
    const response = await fetch(blobUrl);
    if (!response.ok) throw new Error(`Network response was not ok: ${response.statusText}`);
    const blob = await response.blob();

    // Create a download link and trigger it
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error("Failed to download blob:", error);
    // Optionally, display an error message to the user here
  }
}
