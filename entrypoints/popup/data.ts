import { ResultAsync } from 'neverthrow'
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

/**
 * Step 2: download the video as a blob.
 * Returns ResultAsync< Blob, errorMessage >
 */
function fetchVideoBlob(videoUrl: string): ResultAsync<Blob, string> {
  return ResultAsync.fromPromise(
    (async () => {
      const cleanUrl = trimEncodedQuotes(videoUrl)
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
      return blob
    })(),
    (error) =>
      error instanceof Error
        ? error.message
        : 'Unknown error while fetching video blob'
  )
}

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
    .andThen(fetchVideoBlob)
    .map((blob) => URL.createObjectURL(blob))
}
