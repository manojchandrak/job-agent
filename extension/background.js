// Relays requests from content scripts/popup to the local job-agent server
// (http://127.0.0.1:8765, started with `npm run serve`). Routing through the
// background service worker — which has host_permissions for that origin —
// avoids the cross-origin restrictions a content script's own fetch would hit
// on linkedin.com/indeed.com pages.

const BASE_URL = "http://127.0.0.1:8765";

async function callServer(path, options) {
  try {
    const res = await fetch(`${BASE_URL}${path}`, options);
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true, data: await res.json() };
  } catch {
    return { ok: false, error: "Cannot reach local server. Run `npm run serve` in job-agent." };
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    switch (message?.type) {
      case "health":
        sendResponse(await callServer("/api/health"));
        break;
      case "personal":
        sendResponse(await callServer("/api/personal"));
        break;
      case "sponsorCheck":
        sendResponse(await callServer(`/api/sponsor-check?company=${encodeURIComponent(message.company)}`));
        break;
      case "saveJob":
        sendResponse(
          await callServer("/api/jobs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(message.job),
          }),
        );
        break;
      default:
        sendResponse({ ok: false, error: "Unknown message type" });
    }
  })();
  return true; // keep the message channel open for the async response
});
