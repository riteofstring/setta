import { SETTA_CHROME_REPRO_CONFIG } from "./config.js";

let activeTabId = null;
let sequenceNumber = 0;

const actionBadgeConfig = {
  color: "#b91c1c",
  text: "REC"
};

void chrome.action.setBadgeBackgroundColor({
  color: actionBadgeConfig.color
});
void chrome.action.setBadgeText({
  text: actionBadgeConfig.text
});

function isHttpUrl(value) {
  return typeof value === "string" && /^https?:/i.test(value);
}

async function postEvent(payload) {
  const response = await fetch(
    `${SETTA_CHROME_REPRO_CONFIG.collectorBaseUrl}/event`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    }
  );
  if (!response.ok) {
    throw new Error(`Collector rejected event with status ${response.status}`);
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "record-event") {
    return undefined;
  }

  const tabId = sender.tab?.id;
  const tabUrl = sender.tab?.url ?? sender.url ?? null;
  if (typeof tabId !== "number" || !isHttpUrl(tabUrl)) {
    sendResponse({ ok: false, ignored: true, reason: "non-http-tab" });
    return undefined;
  }

  if (activeTabId === null) {
    activeTabId = tabId;
  }
  if (activeTabId !== tabId) {
    sendResponse({ ok: false, ignored: true, reason: "inactive-tab" });
    return undefined;
  }

  sequenceNumber += 1;
  const payload = {
    sequenceNumber,
    receivedAt: new Date().toISOString(),
    tabId,
    tabUrl,
    frameId: sender.frameId ?? null,
    event: message.event ?? null
  };

  void postEvent(payload)
    .then(() => {
      sendResponse({ ok: true });
    })
    .catch((error) => {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    });
  return true;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === activeTabId) {
    activeTabId = null;
  }
});
