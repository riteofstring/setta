import { SETTA_CHROME_REPRO_CONFIG } from "./config.js";

let activeTabId = null;
let sequenceNumber = 0;
const GPU_FLOW_BROWSER_VISUAL_EVIDENCE_KIND =
  "gpu-flow-browser-visual-evidence";
const VISIBLE_TAB_CAPTURE_TIMEOUT_MS = 1500;

const actionBadgeConfig = {
  color: "#b91c1c",
  text: "REC",
};

void chrome.action.setBadgeBackgroundColor({
  color: actionBadgeConfig.color,
});
void chrome.action.setBadgeText({
  text: actionBadgeConfig.text,
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
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );
  if (!response.ok) {
    throw new Error(`Collector rejected event with status ${response.status}`);
  }
}

function isGpuFlowBrowserVisualEvidence(event) {
  return (
    event?.type === "app-state" &&
    event?.kind === GPU_FLOW_BROWSER_VISUAL_EVIDENCE_KIND &&
    event?.payload &&
    typeof event.payload === "object"
  );
}

function hasPngScreenshotDataUrl(value) {
  return (
    typeof value === "string" &&
    value.startsWith("data:image/png;base64,") &&
    value.length > "data:image/png;base64,".length
  );
}

function hasPayloadScreenshot(event) {
  const screenshot = event?.payload?.screenshot;
  return (
    screenshot &&
    typeof screenshot === "object" &&
    hasPngScreenshotDataUrl(screenshot.dataUrl)
  );
}

async function captureTabScreenshotWithDebugger(tabId) {
  if (typeof tabId !== "number") {
    throw new Error("missing tab id");
  }
  const target = { tabId };
  await chrome.debugger.attach(target, "1.3");
  try {
    const result = await chrome.debugger.sendCommand(
      target,
      "Page.captureScreenshot",
      {
        format: "png",
        fromSurface: true,
      },
    );
    if (!result || typeof result.data !== "string" || result.data === "") {
      throw new Error("debugger screenshot returned no data");
    }
    return `data:image/png;base64,${result.data}`;
  } finally {
    await chrome.debugger.detach(target).catch(() => undefined);
  }
}

function withTimeout(promise, timeoutMs, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(message)), timeoutMs);
    }),
  ]);
}

async function captureVisibleTabScreenshot(windowId, tabId) {
  if (typeof windowId !== "number") {
    throw new Error("missing tab window id");
  }
  try {
    await chrome.windows.update(windowId, { focused: true });
    await new Promise((resolve) => setTimeout(resolve, 120));
  } catch {
    // The capture call below provides the authoritative error if focusing fails.
  }
  try {
    return await withTimeout(
      chrome.tabs.captureVisibleTab(windowId, {
        format: "png",
      }),
      VISIBLE_TAB_CAPTURE_TIMEOUT_MS,
      "captureVisibleTab timed out",
    );
  } catch (error) {
    return await captureTabScreenshotWithDebugger(tabId).catch(
      (debuggerError) => {
        const primaryMessage =
          error instanceof Error ? error.message : String(error);
        const fallbackMessage =
          debuggerError instanceof Error
            ? debuggerError.message
            : String(debuggerError);
        throw new Error(
          `${primaryMessage}; debugger fallback failed: ${fallbackMessage}`,
        );
      },
    );
  }
}

async function enrichVisualEvidenceEvent(event, sender) {
  if (!isGpuFlowBrowserVisualEvidence(event)) {
    return event;
  }
  if (hasPayloadScreenshot(event)) {
    return event;
  }
  try {
    const screenshotDataUrl = await captureVisibleTabScreenshot(
      sender.tab?.windowId,
      sender.tab?.id,
    );
    return {
      ...event,
      payload: {
        ...event.payload,
        screenshot: {
          capturedAt: new Date().toISOString(),
          dataUrl: screenshotDataUrl,
          source: "chrome.tabs.captureVisibleTab",
        },
      },
    };
  } catch (error) {
    return {
      ...event,
      payload: {
        ...event.payload,
        screenshot: {
          error: error instanceof Error ? error.message : String(error),
          source: "chrome.tabs.captureVisibleTab",
        },
      },
    };
  }
}

async function buildRecordedEventPayload(message, sender, tabId, tabUrl) {
  const event = await enrichVisualEvidenceEvent(message.event ?? null, sender);
  sequenceNumber += 1;
  return {
    sequenceNumber,
    receivedAt: new Date().toISOString(),
    tabId,
    tabUrl,
    frameId: sender.frameId ?? null,
    event,
  };
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

  void buildRecordedEventPayload(message, sender, tabId, tabUrl)
    .then(postEvent)
    .then(() => {
      sendResponse({ ok: true });
    })
    .catch((error) => {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  return true;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === activeTabId) {
    activeTabId = null;
  }
});
