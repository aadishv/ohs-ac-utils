interface VideoRequestDetails {
  url: string;
  method: string;
  headers: Browser.webRequest.HttpHeader[];
}

function formatAsFetch(details: VideoRequestDetails): string {
  const headersObject: Record<string, string> = {};
  details.headers.forEach(header => {
    if (header.name.toLowerCase() !== 'cookie') { // Often cookies are handled by credentials='include'
      headersObject[header.name] = header.value || '';
    }
  });

  // "Copy as fetch" in Chrome often includes these defaults or derived values.
  // You might need to inspect a few "Copy as fetch" outputs to match it closely.
  const fetchOptions: any = {
    headers: headersObject,
    method: details.method,
    // mode: 'cors', // Common default
    // credentials: 'omit', // or 'include', or 'same-origin' - this depends on cookies etc.
                           // 'Copy as fetch' usually sets this correctly based on the request.
    // referrer: details.referrer, // You'd need to capture and pass this from the background
    // referrerPolicy: 'strict-origin-when-cross-origin', // Common default
    // body: null, // For GET requests. For POST/PUT, this would be the body.
  };

  // Clean up undefined/null options before stringifying
  for (const key in fetchOptions) {
    if (fetchOptions[key] === undefined || fetchOptions[key] === null) {
      delete fetchOptions[key];
    }
  }

  // For headers, if it's an empty object, sometimes "Copy as fetch" omits the "headers" key entirely.
  if (Object.keys(fetchOptions.headers).length === 0) {
    delete fetchOptions.headers;
  }

  const optionsString = JSON.stringify(fetchOptions, null, 2)
    // Remove quotes from keys in the options object for a cleaner look,
    // similar to how "Copy as fetch" sometimes formats it.
    // This is stylistic and not strictly necessary for functionality.
    .replace(/"([^"]+)":/g, '$1:');


  return `Workspace("${details.url}", ${optionsString});`;
}

document.addEventListener('DOMContentLoaded', () => {
  const copyButton = document.getElementById('copyButton') as HTMLButtonElement;
  const statusMessage = document.getElementById('statusMessage') as HTMLParagraphElement;

  copyButton.addEventListener('click', async () => {
    statusMessage.textContent = 'Processing...';
    try {
      const response = await browser.runtime.sendMessage({ action: 'getVideoRequest' });

      if (response && response.success) {
        const fetchCommand = formatAsFetch(response.data as VideoRequestDetails);
        await navigator.clipboard.writeText(fetchCommand);
        statusMessage.textContent = 'Fetch command copied to clipboard!';
        console.log('Copied:', fetchCommand);
      } else {
        statusMessage.textContent = response.message || 'Failed to get request details.';
      }
    } catch (error) {
      console.error('Error getting video request or copying:', error);
      statusMessage.textContent = `Error: ${error instanceof Error ? error.message : String(error)}`;
    }
  });
});
