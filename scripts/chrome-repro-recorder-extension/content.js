const PAGE_RUNTIME_SOURCE = "setta.chrome-repro-recorder/page-runtime";
const APP_STATE_SOURCE = "setta.chrome-repro-recorder/app-state";
const SCROLL_EVENT_THROTTLE_MS = 50;
const FRAME_GAP_THRESHOLD_MS = 34;
const FRAME_GAP_INTERACTION_WINDOW_MS = 1500;
const FRAME_GAP_EVENT_THROTTLE_MS = 100;
const EVENT_TIMING_DURATION_THRESHOLD_MS = 16;
const PERFORMANCE_ATTRIBUTION_LIMIT = 5;
const GPU_FLOW_BROWSER_VISUAL_EVIDENCE_KIND =
  "gpu-flow-browser-visual-evidence";
const GPU_FLOW_RETAINED_DOM_CONTROLS_KIND = "gpu-flow-retained-dom-controls";
const GPU_FLOW_BROWSER_VISUAL_SCREENSHOT_SOURCE =
  "setta.chrome-repro-recorder/browser-visual-screenshot";
const GPU_FLOW_VISUAL_EVIDENCE_CLIP_LIMIT = 16;
const lastScrollEventByTarget = new WeakMap();
let frameGapMonitorStarted = false;
let gpuFlowBrowserVisualEvidenceAutoStarted = false;
let gpuFlowBrowserVisualEvidenceAutoSent = false;
let gpuFlowBrowserVisualEvidenceAutoPending = false;
let gpuFlowBrowserVisualEvidenceScreenshot = null;
let frameGapInteractionUntilMs = 0;
let lastAnimationFrameTimestampMs = null;
let lastFrameGapSentAtMs = 0;
let lastInteractionSummary = null;

function nowTimestampMs() {
  return Date.now();
}

function nowPerformanceMs() {
  if (typeof performance === "undefined") {
    return Date.now();
  }
  if (typeof performance.now !== "function") {
    return Date.now();
  }
  return performance.now();
}

function roundMs(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return Math.round(value * 10) / 10;
}

function normalizeText(value) {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, 200) : null;
}

function cssEscape(value) {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return value.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

function buildCssPath(element) {
  const parts = [];
  let current = element;

  while (current instanceof Element && parts.length < 8) {
    if (current.id) {
      parts.unshift(`#${cssEscape(current.id)}`);
      break;
    }

    const tagName = current.tagName.toLowerCase();
    const testId = current.getAttribute("data-testid");
    if (testId) {
      parts.unshift(`${tagName}[data-testid="${testId.replace(/"/g, '\\"')}"]`);
      break;
    }

    let selector = tagName;
    const parent = current.parentElement;
    if (parent) {
      const sameTagSiblings = Array.from(parent.children).filter(
        (child) => child.tagName === current.tagName,
      );
      if (sameTagSiblings.length > 1) {
        selector += `:nth-of-type(${sameTagSiblings.indexOf(current) + 1})`;
      }
    }
    parts.unshift(selector);
    current = parent;
  }

  return parts.join(" > ");
}

function getElementTarget(rawTarget) {
  if (rawTarget instanceof Element) {
    return rawTarget;
  }
  if (rawTarget instanceof Node) {
    return rawTarget.parentElement;
  }
  return null;
}

function getLabeledByText(element) {
  const labelledBy = element.getAttribute("aria-labelledby");
  if (!labelledBy) {
    return null;
  }
  const ids = labelledBy
    .split(/\s+/)
    .map((value) => value.trim())
    .filter(Boolean);
  const chunks = ids
    .map((id) => normalizeText(document.getElementById(id)?.textContent ?? ""))
    .filter(Boolean);
  if (chunks.length === 0) {
    return null;
  }
  return chunks.join(" ");
}

function getTargetDescriptor(element) {
  const textContent =
    normalizeText(element.innerText) ?? normalizeText(element.textContent);
  const labels =
    "labels" in element && element.labels
      ? Array.from(element.labels)
          .map((label) => normalizeText(label.textContent))
          .filter(Boolean)
      : [];

  return {
    tagName: element.tagName.toLowerCase(),
    id: element.id || null,
    testId: element.getAttribute("data-testid"),
    role: element.getAttribute("role"),
    ariaLabel: element.getAttribute("aria-label"),
    labelledByText: getLabeledByText(element),
    placeholder: element.getAttribute("placeholder"),
    name: element.getAttribute("name"),
    labels,
    text: textContent,
    cssPath: buildCssPath(element),
  };
}

function getElementValue(element) {
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  ) {
    return element.value;
  }
  if (element instanceof HTMLElement && element.isContentEditable) {
    return normalizeText(element.innerText);
  }
  return null;
}

function getScrollMetrics(element) {
  const style =
    element instanceof HTMLElement ? window.getComputedStyle(element) : null;
  return {
    scrollTop: "scrollTop" in element ? element.scrollTop : null,
    scrollLeft: "scrollLeft" in element ? element.scrollLeft : null,
    scrollHeight: "scrollHeight" in element ? element.scrollHeight : null,
    scrollWidth: "scrollWidth" in element ? element.scrollWidth : null,
    clientHeight: "clientHeight" in element ? element.clientHeight : null,
    clientWidth: "clientWidth" in element ? element.clientWidth : null,
    overflowX: style?.overflowX ?? null,
    overflowY: style?.overflowY ?? null,
  };
}

function isScrollableMetrics(metrics) {
  return (
    ((metrics.overflowY === "auto" || metrics.overflowY === "scroll") &&
      metrics.scrollHeight > metrics.clientHeight) ||
    ((metrics.overflowX === "auto" || metrics.overflowX === "scroll") &&
      metrics.scrollWidth > metrics.clientWidth)
  );
}

function getScrollableAncestors(element) {
  const ancestors = [];
  let current =
    element instanceof HTMLElement ? element : element.parentElement;
  while (current instanceof HTMLElement && ancestors.length < 8) {
    const scrollMetrics = getScrollMetrics(current);
    if (isScrollableMetrics(scrollMetrics)) {
      ancestors.push({
        target: getTargetDescriptor(current),
        scrollMetrics,
      });
    }
    current = current.parentElement;
  }
  return ancestors;
}

function getWheelPoint(event) {
  return {
    clientX: event.clientX,
    clientY: event.clientY,
    pageX: event.pageX,
    pageY: event.pageY,
    screenX: event.screenX,
    screenY: event.screenY,
  };
}

function getPointerPoint(event) {
  return {
    clientX: event.clientX,
    clientY: event.clientY,
    pageX: event.pageX,
    pageY: event.pageY,
    screenX: event.screenX,
    screenY: event.screenY,
    movementX: event.movementX,
    movementY: event.movementY,
  };
}

function sendEvent(payload) {
  try {
    chrome.runtime.sendMessage({ type: "record-event", event: payload }, () => {
      void chrome.runtime.lastError;
    });
  } catch {
    // Ignore recorder transport failures in the page context.
  }
}

function sendAppState(kind, payload) {
  sendEvent({
    type: "app-state",
    timestampMs: nowTimestampMs(),
    kind,
    payload,
    url: window.location.href,
    title: document.title,
  });
}

function sendEventAfterCurrentEvent(getPayload) {
  const schedule =
    typeof queueMicrotask === "function"
      ? queueMicrotask
      : (callback) => Promise.resolve().then(callback);
  schedule(() => {
    sendEvent(getPayload());
  });
}

function markPerformanceInteraction(kind, target) {
  const now = nowPerformanceMs();
  frameGapInteractionUntilMs = Math.max(
    frameGapInteractionUntilMs,
    now + FRAME_GAP_INTERACTION_WINDOW_MS,
  );
  lastInteractionSummary = {
    kind,
    timestampMs: nowTimestampMs(),
    target,
  };
}

function serializePerformanceAttribution(attribution) {
  if (!attribution || typeof attribution[Symbol.iterator] !== "function") {
    return [];
  }
  return Array.from(attribution)
    .slice(0, PERFORMANCE_ATTRIBUTION_LIMIT)
    .map((item) => ({
      name: typeof item.name === "string" ? item.name : null,
      entryType: typeof item.entryType === "string" ? item.entryType : null,
      startTimeMs: roundMs(item.startTime),
      durationMs: roundMs(item.duration),
      containerType:
        typeof item.containerType === "string" ? item.containerType : null,
      containerName:
        typeof item.containerName === "string" ? item.containerName : null,
      containerId:
        typeof item.containerId === "string" ? item.containerId : null,
      containerSrc:
        typeof item.containerSrc === "string" ? item.containerSrc : null,
    }));
}

function recordPerformanceLongTask(entry) {
  sendEvent({
    type: "performance-longtask",
    timestampMs: nowTimestampMs(),
    name: typeof entry.name === "string" ? entry.name : null,
    entryType: entry.entryType,
    startTimeMs: roundMs(entry.startTime),
    durationMs: roundMs(entry.duration),
    attribution: serializePerformanceAttribution(entry.attribution),
    url: window.location.href,
    title: document.title,
  });
}

function serializePerformanceDetail(detail) {
  if (!detail || typeof detail !== "object") {
    return null;
  }
  const result = {};
  for (const [key, value] of Object.entries(detail).slice(0, 24)) {
    if (
      value === null ||
      typeof value === "boolean" ||
      typeof value === "number" ||
      typeof value === "string"
    ) {
      result[key] = value;
    }
  }
  return result;
}

function recordPerformanceMeasure(entry) {
  sendEvent({
    type: "performance-measure",
    timestampMs: nowTimestampMs(),
    name: typeof entry.name === "string" ? entry.name : null,
    entryType: entry.entryType,
    startTimeMs: roundMs(entry.startTime),
    durationMs: roundMs(entry.duration),
    detail: serializePerformanceDetail(entry.detail),
    url: window.location.href,
    title: document.title,
  });
}

function recordPerformanceEvent(entry) {
  const target =
    entry.target instanceof Element ? getTargetDescriptor(entry.target) : null;
  sendEvent({
    type: "performance-event",
    timestampMs: nowTimestampMs(),
    name: typeof entry.name === "string" ? entry.name : null,
    entryType: entry.entryType,
    startTimeMs: roundMs(entry.startTime),
    durationMs: roundMs(entry.duration),
    processingStartMs: roundMs(entry.processingStart),
    processingEndMs: roundMs(entry.processingEnd),
    interactionId:
      typeof entry.interactionId === "number" ? entry.interactionId : null,
    cancelable: typeof entry.cancelable === "boolean" ? entry.cancelable : null,
    target,
    activeInteraction: lastInteractionSummary,
    url: window.location.href,
    title: document.title,
  });
}

function observePerformanceEntries(type, callback, options = {}) {
  if (typeof PerformanceObserver !== "function") {
    return;
  }
  const supported = PerformanceObserver.supportedEntryTypes;
  if (Array.isArray(supported) && !supported.includes(type)) {
    return;
  }
  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        callback(entry);
      }
    });
    observer.observe({ type, buffered: true, ...options });
  } catch {
    // Older Chrome builds may expose PerformanceObserver without this entry type.
  }
}

function installPerformanceObservers() {
  observePerformanceEntries("longtask", recordPerformanceLongTask);
  observePerformanceEntries("measure", recordPerformanceMeasure);
  observePerformanceEntries("event", recordPerformanceEvent, {
    durationThreshold: EVENT_TIMING_DURATION_THRESHOLD_MS,
  });
}

function recordAnimationFrameGap(timestamp) {
  if (lastAnimationFrameTimestampMs !== null) {
    const gap = timestamp - lastAnimationFrameTimestampMs;
    const now = nowPerformanceMs();
    const activeInteraction = now <= frameGapInteractionUntilMs;
    if (
      document.visibilityState === "visible" &&
      activeInteraction &&
      gap >= FRAME_GAP_THRESHOLD_MS &&
      now - lastFrameGapSentAtMs >= FRAME_GAP_EVENT_THROTTLE_MS
    ) {
      lastFrameGapSentAtMs = now;
      sendEvent({
        type: "performance-frame-gap",
        timestampMs: nowTimestampMs(),
        frameTimestampMs: roundMs(timestamp),
        gapMs: roundMs(gap),
        thresholdMs: FRAME_GAP_THRESHOLD_MS,
        activeInteraction: lastInteractionSummary,
        visibilityState: document.visibilityState,
        url: window.location.href,
        title: document.title,
      });
    }
  }
  lastAnimationFrameTimestampMs = timestamp;
  window.requestAnimationFrame(recordAnimationFrameGap);
}

function startFrameGapMonitor() {
  if (
    frameGapMonitorStarted ||
    typeof window.requestAnimationFrame !== "function"
  ) {
    return;
  }
  frameGapMonitorStarted = true;
  window.requestAnimationFrame(recordAnimationFrameGap);
}

function createVisualEvidenceId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `visual-evidence-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isPngDataUrl(value) {
  return (
    typeof value === "string" &&
    value.startsWith("data:image/png;base64,") &&
    value.length > "data:image/png;base64,".length
  );
}

function storeGpuFlowBrowserVisualEvidenceScreenshot(payload) {
  if (!payload || typeof payload !== "object") {
    return;
  }
  if (!isPngDataUrl(payload.dataUrl)) {
    return;
  }
  gpuFlowBrowserVisualEvidenceScreenshot = {
    capturedAt:
      typeof payload.capturedAt === "string"
        ? payload.capturedAt
        : new Date().toISOString(),
    dataUrl: payload.dataUrl,
    source: "cdp-page-message",
    url: window.location.href,
    viewportOriginDevicePx:
      payload.viewportOriginDevicePx &&
      typeof payload.viewportOriginDevicePx === "object"
        ? payload.viewportOriginDevicePx
        : undefined,
    viewportScale: payload.viewportScale,
  };
}

function resolveGpuFlowBrowserVisualEvidenceScreenshot() {
  if (
    !gpuFlowBrowserVisualEvidenceScreenshot ||
    gpuFlowBrowserVisualEvidenceScreenshot.url !== window.location.href
  ) {
    return undefined;
  }
  return {
    capturedAt: gpuFlowBrowserVisualEvidenceScreenshot.capturedAt,
    dataUrl: gpuFlowBrowserVisualEvidenceScreenshot.dataUrl,
    source: gpuFlowBrowserVisualEvidenceScreenshot.source,
    viewportOriginDevicePx:
      gpuFlowBrowserVisualEvidenceScreenshot.viewportOriginDevicePx,
    viewportScale: gpuFlowBrowserVisualEvidenceScreenshot.viewportScale,
  };
}

function intersectViewportRect(rect) {
  const x = Math.max(0, rect.left);
  const y = Math.max(0, rect.top);
  const right = Math.min(window.innerWidth, rect.right);
  const bottom = Math.min(window.innerHeight, rect.bottom);
  return {
    height: Math.max(0, bottom - y),
    width: Math.max(0, right - x),
    x,
    y,
  };
}

function readElementTextLength(element) {
  const values = [];
  for (const field of element.querySelectorAll("input, textarea, select")) {
    if (
      field instanceof HTMLInputElement ||
      field instanceof HTMLTextAreaElement ||
      field instanceof HTMLSelectElement
    ) {
      values.push(field.value);
    }
  }
  const text = values.join(" ") || element.textContent || "";
  return text.replace(/\s+/g, " ").trim().length;
}

const GPU_FLOW_VISUAL_RASTER_STYLE_PROPERTIES = [
  "align-items",
  "background",
  "background-color",
  "border",
  "border-radius",
  "box-sizing",
  "color",
  "display",
  "font",
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
  "height",
  "justify-content",
  "letter-spacing",
  "line-height",
  "margin",
  "overflow",
  "padding",
  "text-align",
  "text-overflow",
  "white-space",
  "width",
];

function copyRasterCloneStyle(source, target) {
  const computed = window.getComputedStyle(source);
  for (const property of GPU_FLOW_VISUAL_RASTER_STYLE_PROPERTIES) {
    target.style.setProperty(property, computed.getPropertyValue(property));
  }
  target.style.position = "static";
  target.style.transform = "none";
}

function cloneElementForRaster(source) {
  const clone = source.cloneNode(false);
  if (source instanceof Element && clone instanceof Element) {
    copyRasterCloneStyle(source, clone);
    if (source instanceof HTMLInputElement && clone instanceof HTMLInputElement) {
      clone.setAttribute("value", source.value);
    }
    if (
      source instanceof HTMLTextAreaElement &&
      clone instanceof HTMLTextAreaElement
    ) {
      clone.textContent = source.value;
    }
  }
  for (const child of source.childNodes) {
    clone.appendChild(
      child.nodeType === Node.ELEMENT_NODE
        ? cloneElementForRaster(child)
        : child.cloneNode(true),
    );
  }
  return clone;
}

function loadRasterImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const timeoutId = window.setTimeout(
      () => reject(new Error("clip raster image load timed out")),
      1000,
    );
    image.onload = () => {
      window.clearTimeout(timeoutId);
      resolve(image);
    };
    image.onerror = () => {
      window.clearTimeout(timeoutId);
      reject(new Error("clip raster image failed to load"));
    };
    image.src = dataUrl;
  });
}

async function rasterizeGpuFlowVisualEvidenceHost(host, clip) {
  const width = Math.max(1, Math.ceil(clip.width));
  const height = Math.max(1, Math.ceil(clip.height));
  const clone = cloneElementForRaster(host);
  if (clone instanceof Element) {
    clone.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
    clone.style.width = `${width}px`;
    clone.style.height = `${height}px`;
  }
  const html = new XMLSerializer().serializeToString(clone);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject width="100%" height="100%">${html}</foreignObject></svg>`;
  const image = await loadRasterImage(
    `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(width * window.devicePixelRatio));
  canvas.height = Math.max(1, Math.ceil(height * window.devicePixelRatio));
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("clip raster canvas context unavailable");
  }
  context.scale(window.devicePixelRatio, window.devicePixelRatio);
  context.drawImage(image, 0, 0);
  return {
    dataUrl: canvas.toDataURL("image/png"),
    height,
    source: "svg-foreign-object-clone",
    width,
  };
}

async function withGpuFlowVisualClipRaster(host, clipEntry) {
  if (clipEntry.expectedTextLength <= 0) {
    return clipEntry;
  }
  try {
    return {
      ...clipEntry,
      raster: await rasterizeGpuFlowVisualEvidenceHost(host, clipEntry.clip),
    };
  } catch (error) {
    return {
      ...clipEntry,
      raster: {
        error: error instanceof Error ? error.message : String(error),
        source: "svg-foreign-object-clone",
      },
    };
  }
}

async function collectGpuFlowBrowserVisualEvidence(triggerKind) {
  const hosts = Array.from(
    document.querySelectorAll('[data-gpu-flow-dom-control="true"]'),
  ).filter((element) => element instanceof HTMLElement);
  const clips = [];
  const clipHosts = [];
  let visibleHostCount = 0;
  let visibleNonemptyHostCount = 0;
  for (const host of hosts) {
    const rect = host.getBoundingClientRect();
    const clip = intersectViewportRect(rect);
    const visible = clip.width > 1 && clip.height > 1;
    if (!visible) {
      continue;
    }
    visibleHostCount += 1;
    const textLength = readElementTextLength(host);
    if (textLength > 0) {
      visibleNonemptyHostCount += 1;
    }
    if (clips.length >= GPU_FLOW_VISUAL_EVIDENCE_CLIP_LIMIT) {
      continue;
    }
    const clipEntry = {
      active: host.getAttribute("data-gpu-flow-dom-control-active") === "true",
      clip,
      coverageState:
        host.getAttribute("data-gpu-flow-dom-control-coverage-state") ?? null,
      expectedTextLength: textLength,
      rowId: host.getAttribute("data-gpu-flow-dom-control-row-id"),
      sourceId: host.getAttribute("data-gpu-flow-dom-control-id"),
      surfaceId: host.getAttribute("data-gpu-flow-dom-control-surface-id"),
    };
    clips.push(clipEntry);
    clipHosts.push(host);
  }
  if (hosts.length === 0 && triggerKind !== GPU_FLOW_RETAINED_DOM_CONTROLS_KIND) {
    return null;
  }
  const clipsWithRasters = await Promise.all(
    clips.map((clipEntry, index) =>
      withGpuFlowVisualClipRaster(clipHosts[index], clipEntry),
    ),
  );
  return {
    alternativePixelSource: "clip-raster",
    devicePixelRatio: window.devicePixelRatio,
    evidenceId: createVisualEvidenceId(),
    hostCount: hosts.length,
    screenshot: resolveGpuFlowBrowserVisualEvidenceScreenshot(),
    triggerKind,
    url: window.location.href,
    viewport: {
      height: window.innerHeight,
      width: window.innerWidth,
    },
    visibleHostCount,
    visibleNonemptyHostCount,
    clips: clipsWithRasters,
  };
}

async function maybeSendGpuFlowBrowserVisualEvidence(triggerKind) {
  const automaticTrigger = triggerKind === "auto-visible-dom-controls";
  if (
    automaticTrigger &&
    (gpuFlowBrowserVisualEvidenceAutoSent ||
      gpuFlowBrowserVisualEvidenceAutoPending)
  ) {
    return false;
  }
  if (automaticTrigger) {
    gpuFlowBrowserVisualEvidenceAutoPending = true;
  }
  try {
    const evidence = await collectGpuFlowBrowserVisualEvidence(triggerKind);
    if (!evidence || evidence.visibleNonemptyHostCount === 0) {
      return false;
    }
    if (automaticTrigger) {
      gpuFlowBrowserVisualEvidenceAutoSent = true;
    }
    sendAppState(GPU_FLOW_BROWSER_VISUAL_EVIDENCE_KIND, evidence);
    return true;
  } finally {
    if (automaticTrigger) {
      gpuFlowBrowserVisualEvidenceAutoPending = false;
    }
  }
}

function startGpuFlowBrowserVisualEvidenceAutoCapture() {
  if (gpuFlowBrowserVisualEvidenceAutoStarted) {
    return;
  }
  gpuFlowBrowserVisualEvidenceAutoStarted = true;
  let attempts = 0;
  const intervalId = window.setInterval(() => {
    attempts += 1;
    void maybeSendGpuFlowBrowserVisualEvidence(
      "auto-visible-dom-controls",
    ).then((sent) => {
      if (sent || attempts >= 45) {
        window.clearInterval(intervalId);
      }
    });
  }, 1000);
}

function injectPageRuntime() {
  const target = document.head || document.documentElement;
  if (
    !target ||
    target.querySelector('script[data-setta-chrome-repro-runtime="true"]')
  ) {
    return;
  }
  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("pageRuntime.js");
  script.async = false;
  script.dataset.settaChromeReproRuntime = "true";
  script.addEventListener("load", () => {
    script.remove();
  });
  script.addEventListener("error", () => {
    script.remove();
  });
  target.appendChild(script);
}

window.addEventListener(
  "message",
  (event) => {
    if (
      event.source !== window ||
      !event.data ||
      typeof event.data !== "object"
    ) {
      return;
    }

    if (event.data.source === PAGE_RUNTIME_SOURCE && event.data.event) {
      sendEvent(event.data.event);
      return;
    }

    if (event.data.source === GPU_FLOW_BROWSER_VISUAL_SCREENSHOT_SOURCE) {
      storeGpuFlowBrowserVisualEvidenceScreenshot(event.data.payload);
      return;
    }

    if (event.data.source === APP_STATE_SOURCE) {
      sendEvent({
        type: "app-state",
        timestampMs:
          typeof event.data.timestampMs === "number"
            ? event.data.timestampMs
            : nowTimestampMs(),
        kind: typeof event.data.kind === "string" ? event.data.kind : null,
        payload: event.data.payload ?? null,
        url: window.location.href,
        title: document.title,
      });
      if (event.data.kind === GPU_FLOW_RETAINED_DOM_CONTROLS_KIND) {
        void maybeSendGpuFlowBrowserVisualEvidence(event.data.kind);
      }
    }
  },
  true,
);

if (document.documentElement) {
  injectPageRuntime();
  startGpuFlowBrowserVisualEvidenceAutoCapture();
} else {
  document.addEventListener(
    "readystatechange",
    () => {
      if (document.documentElement) {
        injectPageRuntime();
        startGpuFlowBrowserVisualEvidenceAutoCapture();
      }
    },
    { once: true },
  );
}

function recordNavigation(kind) {
  sendEvent({
    type: "navigation",
    kind,
    url: window.location.href,
    title: document.title,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
    },
    timestampMs: nowTimestampMs(),
  });
}

function recordPointerLikeEvent(type, event) {
  if (!event.isTrusted) {
    return;
  }
  const element = getElementTarget(event.target);
  if (!element) {
    return;
  }
  const target = getTargetDescriptor(element);
  markPerformanceInteraction(type, target);
  sendEvent({
    type,
    timestampMs: nowTimestampMs(),
    button: "button" in event ? event.button : null,
    detail: "detail" in event ? event.detail : null,
    altKey: event.altKey,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    shiftKey: event.shiftKey,
    target,
  });
}

document.addEventListener(
  "click",
  (event) => {
    recordPointerLikeEvent("click", event);
  },
  true,
);

document.addEventListener(
  "dblclick",
  (event) => {
    recordPointerLikeEvent("dblclick", event);
  },
  true,
);

document.addEventListener(
  "pointermove",
  (event) => {
    if (!event.isTrusted || event.buttons === 0) {
      return;
    }
    const element = getElementTarget(event.target);
    if (!element) {
      return;
    }
    const target = getTargetDescriptor(element);
    markPerformanceInteraction("pointermove", target);
    const pointerPoint = getPointerPoint(event);
    const pointElement = document.elementFromPoint(
      event.clientX,
      event.clientY,
    );
    const pointTarget =
      pointElement instanceof Element
        ? getTargetDescriptor(pointElement)
        : null;
    sendEventAfterCurrentEvent(() => ({
      type: "pointermove",
      timestampMs: nowTimestampMs(),
      ...pointerPoint,
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      isPrimary: event.isPrimary,
      button: event.button,
      buttons: event.buttons,
      width: event.width,
      height: event.height,
      pressure: event.pressure,
      tangentialPressure: event.tangentialPressure,
      tiltX: event.tiltX,
      tiltY: event.tiltY,
      twist: event.twist,
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      shiftKey: event.shiftKey,
      defaultPrevented: event.defaultPrevented,
      target,
      pointTarget,
    }));
  },
  { capture: true, passive: true },
);

document.addEventListener(
  "wheel",
  (event) => {
    if (!event.isTrusted) {
      return;
    }
    const element = getElementTarget(event.target);
    if (!element) {
      return;
    }
    const target = getTargetDescriptor(element);
    markPerformanceInteraction("wheel", target);
    const wheelPoint = getWheelPoint(event);
    const pointElement = document.elementFromPoint(
      event.clientX,
      event.clientY,
    );
    const pointTarget =
      pointElement instanceof Element
        ? getTargetDescriptor(pointElement)
        : null;
    sendEventAfterCurrentEvent(() => ({
      type: "wheel",
      timestampMs: nowTimestampMs(),
      ...wheelPoint,
      deltaX: event.deltaX,
      deltaY: event.deltaY,
      deltaZ: event.deltaZ,
      deltaMode: event.deltaMode,
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      shiftKey: event.shiftKey,
      defaultPrevented: event.defaultPrevented,
      target,
      pointTarget,
      scrollMetrics: getScrollMetrics(element),
      scrollAncestors: getScrollableAncestors(element),
    }));
  },
  { capture: true, passive: true },
);

document.addEventListener(
  "scroll",
  (event) => {
    const element = getElementTarget(event.target);
    if (!element) {
      return;
    }
    const now = nowTimestampMs();
    const last = lastScrollEventByTarget.get(element) ?? 0;
    if (now - last < SCROLL_EVENT_THROTTLE_MS) {
      return;
    }
    lastScrollEventByTarget.set(element, now);
    sendEvent({
      type: "scroll",
      timestampMs: now,
      target: getTargetDescriptor(element),
      scrollMetrics: getScrollMetrics(element),
    });
  },
  { capture: true, passive: true },
);

document.addEventListener(
  "input",
  (event) => {
    if (!event.isTrusted) {
      return;
    }
    const element = getElementTarget(event.target);
    if (!element) {
      return;
    }
    const target = getTargetDescriptor(element);
    markPerformanceInteraction("input", target);
    sendEvent({
      type: "input",
      timestampMs: nowTimestampMs(),
      inputType: "inputType" in event ? event.inputType ?? null : null,
      value: getElementValue(element),
      target,
    });
  },
  true,
);

document.addEventListener(
  "change",
  (event) => {
    if (!event.isTrusted) {
      return;
    }
    const element = getElementTarget(event.target);
    if (!element) {
      return;
    }
    const target = getTargetDescriptor(element);
    markPerformanceInteraction("change", target);
    sendEvent({
      type: "change",
      timestampMs: nowTimestampMs(),
      value: getElementValue(element),
      target,
    });
  },
  true,
);

document.addEventListener(
  "keydown",
  (event) => {
    if (!event.isTrusted) {
      return;
    }
    const element = getElementTarget(event.target);
    const target = element ? getTargetDescriptor(element) : null;
    markPerformanceInteraction("keydown", target);
    sendEvent({
      type: "keydown",
      timestampMs: nowTimestampMs(),
      key: event.key,
      code: event.code,
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      shiftKey: event.shiftKey,
      target,
    });
  },
  true,
);

document.addEventListener(
  "submit",
  (event) => {
    if (!event.isTrusted) {
      return;
    }
    const element = getElementTarget(event.target);
    if (!element) {
      return;
    }
    const target = getTargetDescriptor(element);
    markPerformanceInteraction("submit", target);
    sendEvent({
      type: "submit",
      timestampMs: nowTimestampMs(),
      target,
    });
  },
  true,
);

startFrameGapMonitor();
installPerformanceObservers();

window.addEventListener("hashchange", () => {
  recordNavigation("hashchange");
});

window.addEventListener("popstate", () => {
  recordNavigation("popstate");
});

if (document.readyState === "complete") {
  recordNavigation("initial-complete");
} else {
  window.addEventListener(
    "load",
    () => {
      recordNavigation("load");
    },
    { once: true },
  );
}
