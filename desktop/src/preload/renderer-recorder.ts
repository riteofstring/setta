import type { IpcRenderer } from "electron";

import { recordingRendererEventChannel, type RendererRecordedEvent } from "@shared/recording";

const maxTextLength = 160;
const interestingKeys = new Set([
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "Backspace",
  "Enter",
  "Escape",
  "Tab",
]);

interface TranscriptScrollDebugApi {
  getSnapshot: () => TranscriptScrollDebugSnapshot;
}

interface TranscriptScrollDebugSnapshot {
  atBottom: boolean;
  clientHeight: number;
  distanceFromBottom: number;
  lastVisibleIndex: number;
  mode: string;
  pendingScrollCount: number;
  rowCount: number;
  scrollHeight: number;
  scrollTop: number;
  tailRevision: string;
  trace: TranscriptScrollDebugTraceEntry[];
}

interface TranscriptScrollDebugTraceEntry {
  [key: string]: boolean | number | string | null;
}

export function installRendererRecorder(ipcRenderer: Pick<IpcRenderer, "send">) {
  if (!isRecordingEnabled()) {
    return;
  }
  markDocumentRecordingEnabled();
  const layoutRecorder = createLayoutRecorder(ipcRenderer);

  window.addEventListener(
    "click",
    (event) => {
      record(ipcRenderer, {
        at: timestamp(),
        button: event.button,
        target: summarizeTarget(event.target),
        type: "click",
        url: window.location.href,
      });
      layoutRecorder.schedule("click");
    },
    true,
  );

  window.addEventListener(
    "keydown",
    (event) => {
      if (!shouldRecordKeydown(event)) {
        return;
      }
      record(ipcRenderer, {
        altKey: event.altKey,
        at: timestamp(),
        ctrlKey: event.ctrlKey,
        key: event.key,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
        target: summarizeTarget(event.target),
        type: "keydown",
        url: window.location.href,
      });
      layoutRecorder.schedule("keydown");
    },
    true,
  );

  window.addEventListener(
    "submit",
    (event) => {
      record(ipcRenderer, {
        at: timestamp(),
        target: summarizeTarget(event.target),
        type: "submit",
        url: window.location.href,
      });
      layoutRecorder.schedule("submit");
    },
    true,
  );

  window.addEventListener("error", (event) => {
    record(ipcRenderer, {
      at: timestamp(),
      message: truncate(event.message),
      source: truncate(event.filename),
      type: "error",
      url: window.location.href,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    record(ipcRenderer, {
      at: timestamp(),
      reason: truncate(String(event.reason)),
      type: "unhandledrejection",
      url: window.location.href,
    });
  });

  window.addEventListener("load", () => layoutRecorder.schedule("renderer_load"));
  window.addEventListener("setta:record-layout-snapshot", (event) => {
    layoutRecorder.capture(layoutSnapshotTrigger(event));
  });
  window.addEventListener("beforeunload", () => layoutRecorder.capture("before_unload"));
  layoutRecorder.observe();
}

function markDocumentRecordingEnabled() {
  if (document.documentElement) {
    document.documentElement.setAttribute("data-setta-recording", "true");
    return;
  }
  window.setTimeout(markDocumentRecordingEnabled, 0);
}

function isRecordingEnabled(): boolean {
  const env = typeof process === "undefined" ? undefined : process.env;
  return env?.SETTA_RECORDING === "1" || env?.SETTA_RECORDING_DIR !== undefined;
}

function shouldRecordKeydown(event: KeyboardEvent): boolean {
  return interestingKeys.has(event.key) || event.metaKey || event.ctrlKey;
}

function record(ipcRenderer: Pick<IpcRenderer, "send">, event: RendererRecordedEvent) {
  ipcRenderer.send(recordingRendererEventChannel, event);
}

function createLayoutRecorder(ipcRenderer: Pick<IpcRenderer, "send">) {
  let pending = 0;
  let lastCapturedAt = 0;

  return {
    capture(trigger: string) {
      lastCapturedAt = Date.now();
      record(ipcRenderer, layoutSnapshot(trigger));
    },
    observe() {
      const target = document.body ?? document.documentElement;
      if (!target) {
        window.addEventListener("DOMContentLoaded", () => this.observe(), { once: true });
        return;
      }
      const observer = new MutationObserver(() => {
        const now = Date.now();
        if (now - lastCapturedAt < 250) {
          return;
        }
        this.schedule("dom_mutation");
      });
      observer.observe(target, {
        attributes: true,
        childList: true,
        subtree: true,
      });
    },
    schedule(trigger: string) {
      if (pending !== 0) {
        return;
      }
      pending = window.setTimeout(() => {
        pending = 0;
        this.capture(trigger);
      }, 0);
    },
  };
}

function layoutSnapshot(trigger: string): RendererRecordedEvent {
  const pane = document.querySelector('[data-testid="chat-detail-pane"]');
  const transcript = document.querySelector('[data-testid="chat-transcript-region"]');
  const scroller = document.querySelector('[data-testid="chat-transcript-scroller"]');
  const scrollFollowDebug = document.querySelector('[data-testid="chat-transcript-scroll-follow"]');
  const composer = document.querySelector('[data-testid="chat-composer"]');
  const jumpToLatestButton = document.querySelector('[aria-label="Jump to latest"]');
  return {
    activeRunStatus: pane?.getAttribute("data-run-status") ?? "",
    at: timestamp(),
    chatDetailPane: elementRect(pane),
    composer: elementRect(composer),
    jumpToLatestButton: visibleElementRect(jumpToLatestButton),
    queueSize: document.querySelectorAll('[data-testid="chat-queued-turn-row"]').length,
    selectedConversationId: pane?.getAttribute("data-conversation-id") ?? "",
    transcript: scrollRect(transcript, scroller),
    transcriptScrollDebug: transcriptScrollDebugSnapshot(scrollFollowDebug),
    trigger,
    type: "layout_snapshot",
    url: window.location.href,
    viewport: {
      height: window.innerHeight,
      width: window.innerWidth,
    },
    visibleTurnIds: Array.from(document.querySelectorAll('[data-testid="chat-transcript-turn"]'))
      .map((turn) => turn.getAttribute("data-run-id") ?? "")
      .filter((id) => id !== ""),
  };
}

function elementRect(element: Element | null) {
  if (!element) {
    return null;
  }
  const rect = element.getBoundingClientRect();
  return {
    bottom: round(rect.bottom),
    height: round(rect.height),
    left: round(rect.left),
    right: round(rect.right),
    top: round(rect.top),
    width: round(rect.width),
  };
}

function scrollRect(region: Element | null, scroller: Element | null) {
  const rect = elementRect(region);
  if (!rect || !region) {
    return null;
  }
  const scrollElement = scroller ?? region;
  const clientHeight = scrollElement.clientHeight;
  const scrollHeight = scrollElement.scrollHeight;
  const scrollTop = scrollElement.scrollTop;
  const maxScrollTop = Math.max(0, scrollHeight - clientHeight);
  return {
    ...rect,
    clientHeight,
    distanceFromBottom: round(Math.max(0, maxScrollTop - scrollTop)),
    scrollHeight,
    scrollTop: round(scrollTop),
  };
}

function visibleElementRect(element: Element | null) {
  const rect = elementRect(element);
  if (!rect || !element) {
    return null;
  }
  const style = window.getComputedStyle(element);
  return {
    ...rect,
    visible:
      rect.height > 0 &&
      rect.width > 0 &&
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      style.opacity !== "0",
  };
}

function transcriptScrollDebugSnapshot(debugElement: Element | null) {
  const debug = (
    window as Window & {
      __settaChatTranscriptScrollDebug?: TranscriptScrollDebugApi;
    }
  ).__settaChatTranscriptScrollDebug;
  if (debug) {
    try {
      return recordedTranscriptScrollDebugSnapshot(debug.getSnapshot(), "window");
    } catch (error) {
      return {
        error: truncate(error instanceof Error ? error.message : String(error)),
        source: "window",
      };
    }
  }
  return transcriptScrollDebugSnapshotFromElement(debugElement);
}

function recordedTranscriptScrollDebugSnapshot(
  snapshot: TranscriptScrollDebugSnapshot,
  source: string,
) {
  return {
    ...snapshot,
    source,
    tailRevision: truncate(snapshot.tailRevision),
    trace: sanitizeScrollDebugTrace(snapshot.trace),
  };
}

function transcriptScrollDebugSnapshotFromElement(element: Element | null) {
  if (!element) {
    return null;
  }
  const mode = element.getAttribute("data-scroll-follow-mode");
  if (!mode) {
    return null;
  }
  return {
    atBottom: booleanAttribute(element, "data-scroll-follow-at-bottom"),
    clientHeight: numberAttribute(element, "data-scroll-follow-client-height"),
    distanceFromBottom: numberAttribute(element, "data-scroll-follow-distance-from-bottom"),
    lastVisibleIndex: numberAttribute(element, "data-scroll-follow-last-visible-index"),
    mode: truncate(mode),
    pendingScrollCount: numberAttribute(element, "data-scroll-follow-pending-scroll-count"),
    rowCount: numberAttribute(element, "data-scroll-follow-row-count"),
    scrollHeight: numberAttribute(element, "data-scroll-follow-scroll-height"),
    scrollTop: numberAttribute(element, "data-scroll-follow-scroll-top"),
    source: "dom",
    tailRevision: truncate(element.getAttribute("data-scroll-follow-tail-revision") ?? ""),
    trace: parseScrollDebugTrace(element.getAttribute("data-scroll-follow-trace")),
  };
}

function booleanAttribute(element: Element, name: string) {
  return element.getAttribute(name) === "true";
}

function numberAttribute(element: Element, name: string) {
  const value = Number(element.getAttribute(name) ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function parseScrollDebugTrace(value: string | null) {
  if (!value) {
    return [];
  }
  try {
    return sanitizeScrollDebugTrace(JSON.parse(value));
  } catch {
    return [{ error: "invalid_trace_json" }];
  }
}

function sanitizeScrollDebugTrace(value: unknown): TranscriptScrollDebugTraceEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.slice(-30).flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return [];
    }
    const sanitized: TranscriptScrollDebugTraceEntry = {};
    for (const [key, entryValue] of Object.entries(entry)) {
      if (
        typeof entryValue === "boolean" ||
        typeof entryValue === "number" ||
        entryValue === null
      ) {
        sanitized[key] = entryValue;
      } else if (typeof entryValue === "string") {
        sanitized[key] = truncate(entryValue);
      }
    }
    return [sanitized];
  });
}

function summarizeTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) {
    return undefined;
  }
  const element = closestUsefulElement(target);
  return {
    ariaLabel: truncate(element.getAttribute("aria-label") ?? ""),
    classes: truncate(className(element)),
    id: truncate(element.id),
    name: truncate(element.getAttribute("name") ?? ""),
    role: truncate(element.getAttribute("role") ?? ""),
    tag: element.tagName.toLowerCase(),
    text: truncate(textContent(element)),
    type: truncate(element.getAttribute("type") ?? ""),
  };
}

function closestUsefulElement(element: Element): Element {
  return (
    element.closest("button,a,input,textarea,select,[role],[data-testid],[aria-label]") ?? element
  );
}

function className(element: Element): string {
  if (typeof element.className === "string") {
    return element.className;
  }
  return "";
}

function textContent(element: Element): string {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    return "";
  }
  return element.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

function timestamp(): string {
  return new Date().toISOString();
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function truncate(value: string): string {
  const codePoints = Array.from(value);
  if (codePoints.length <= maxTextLength) {
    return value;
  }
  return (
    codePoints
      .slice(0, maxTextLength - 3)
      .join("")
      .trimEnd() + "..."
  );
}

function layoutSnapshotTrigger(event: Event): string {
  if (!(event instanceof CustomEvent)) {
    return "manual";
  }
  const detail = event.detail;
  if (typeof detail !== "object" || detail === null || !("trigger" in detail)) {
    return "manual";
  }
  return typeof detail.trigger === "string" && detail.trigger !== "" ? detail.trigger : "manual";
}
