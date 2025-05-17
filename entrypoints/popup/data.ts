function trimTrailingEncodedQuotes(str: string): string {
  while (str.endsWith("%22")) {
    str = str.slice(0, -3);
  }
  while (str.startsWith("%22")) {
    str = str.slice(3, 0);
  }
  return str;
}
async function fetch_data(url: string) {
  let cleanUrl = trimTrailingEncodedQuotes(url);
  // console.log("1=>=>=>=>=>=>=>=>=>=>=>=>=>=>=>=>=>=>=>=>=>=>=>=>=>=>=>=>=>=>=>=>=>=>")
  // console.log(cleanUrl)
  // console.log(oUrl);
  // console.log(cleanUrl == oUrl)
  const res = await fetch(cleanUrl, {
    headers: {
      accept: "*/*",
      "accept-language": "en-US,en;q=0.9",
      "cache-control": "no-cache",
      pragma: "no-cache",
      priority: "i",
      range: "bytes=0-",
      "sec-ch-ua":
        '"Chromium";v="136", "Google Chrome";v="136", "Not.A/Brand";v="99"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"macOS"',
      "sec-fetch-dest": "video",
      "sec-fetch-mode": "no-cors",
      "sec-fetch-site": "cross-site",
      cookie:
        "_gcl_au=1.1.1922721946.1747179786; _ga_93RG4K7176=GS2.1.s1747179785$o1$g0$t1747179785$j0$l0$h0; _ga=GA1.2.1278091680.1747179786; s_cc=true; s_sq=%5B%5BB%5D%5D; BREEZESESSION=breezbreezz3ubyfkmwtwbgit5; RECSESSION=b56c98e1963b757aa20456b113a6c5a9c203f1a4fd6a9c50a9f3687d8894a733",
    },
    referrerPolicy: "same-origin",
    body: null,
    method: "GET",
  });
  return res;
}
export async function getBlobUrl(videoUrl: string) {
  try {
    const response = await fetch_data(videoUrl);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const videoBlob = await response.blob();
    console.log(videoBlob.text(), "text");
    // Ensure the blob type is correct (optional, but good practice)
    if (videoBlob.type !== "video/mp4") {
      console.warn(
        `Workspaceed data type is ${videoBlob.type}, expected video/mp4. Playback might not work as expected.`,
      );
    }

    const objectUrl = URL.createObjectURL(videoBlob);
    return objectUrl;
  } catch (e) {
    if (e instanceof Error) {
      console.error(e.message);
      throw e;
    } else {
      console.error("An unknown error occurred");
      throw new Error("An unknown error occurred");
    }
  }
}
