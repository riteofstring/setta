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
        clientX: round(event.clientX),
        clientY: round(event.clientY),
        hitTargets: summarizeHitTargets(event.clientX, event.clientY),
        target: summarizeTarget(event.target),
        type: "click",
        url: window.location.href,
      });
      layoutRecorder.schedule("click");
    },
    true,
  );

  window.addEventListener(
    "pointerdown",
    (event) => {
      record(ipcRenderer, {
        at: timestamp(),
        button: event.button,
        clientX: round(event.clientX),
        clientY: round(event.clientY),
        hitTargets: summarizeHitTargets(event.clientX, event.clientY),
        pointerId: event.pointerId,
        pointerType: truncate(event.pointerType),
        target: summarizeTarget(event.target),
        type: "pointerdown",
        url: window.location.href,
      });
    },
    true,
  );

  window.addEventListener(
    "pointerup",
    (event) => {
      record(ipcRenderer, {
        at: timestamp(),
        button: event.button,
        clientX: round(event.clientX),
        clientY: round(event.clientY),
        hitTargets: summarizeHitTargets(event.clientX, event.clientY),
        pointerId: event.pointerId,
        pointerType: truncate(event.pointerType),
        target: summarizeTarget(event.target),
        type: "pointerup",
        url: window.location.href,
      });
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
  observeInteractionLatency(ipcRenderer);
  observeLongTasks(ipcRenderer);
}

/*
 * Below this an interaction is indistinguishable from an immediate one at any
 * refresh rate, so recording it would bury the slow ones it exists to find.
 */
const slowInteractionMs = 24;
const longTaskMs = 50;

/**
 * The browser's own account of how long an interaction took to reach a paint.
 *
 * `durationThreshold` is what keeps this cheap: the observer is not told about
 * fast interactions at all, so ordinary typing costs nothing and only the
 * keystrokes that actually lagged reach the recording.
 */
function observeInteractionLatency(ipcRenderer: Pick<IpcRenderer, "send">): void {
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      const timing = entry as PerformanceEventTiming;
      record(ipcRenderer, {
        at: timestamp(),
        delayMs: round(timing.processingStart - timing.startTime),
        durationMs: round(timing.duration),
        interactionId: timing.interactionId ?? 0,
        name: timing.name,
        processingMs: round(timing.processingEnd - timing.processingStart),
        target: summarizeTarget(timing.target ?? null),
        type: "interaction_latency",
        url: window.location.href,
      });
    }
  });
  // `durationThreshold` is not in every lib.dom; the option is what makes this
  // affordable, so it is passed explicitly rather than dropped for the typing.
  observer.observe({
    durationThreshold: slowInteractionMs,
    type: "event",
  } as PerformanceObserverInit);
}

/** The slice of `PerformanceLongTaskTiming` used here; it is not in lib.dom. */
interface LongTaskAttribution {
  containerType: string;
  name: string;
}

/** What the main thread was doing instead of responding. */
function observeLongTasks(ipcRenderer: Pick<IpcRenderer, "send">): void {
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.duration < longTaskMs) {
        continue;
      }
      const attribution: LongTaskAttribution[] =
        (entry as unknown as { attribution?: LongTaskAttribution[] }).attribution ?? [];
      record(ipcRenderer, {
        at: timestamp(),
        attribution: attribution
          .map((item) => `${item.name}:${item.containerType}`)
          .join(",")
          .slice(0, maxTextLength),
        durationMs: round(entry.duration),
        startedAtMs: round(entry.startTime),
        type: "long_task",
        url: window.location.href,
      });
    }
  });
  observer.observe({ entryTypes: ["longtask"] });
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
  return {
    at: timestamp(),
    trigger,
    type: "layout_snapshot",
    url: window.location.href,
    viewport: {
      height: window.innerHeight,
      width: window.innerWidth,
    },
  };
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

function summarizeHitTargets(clientX: number, clientY: number) {
  return document
    .elementsFromPoint(clientX, clientY)
    .slice(0, 6)
    .map((element) => summarizeTarget(element))
    .filter((summary) => summary !== undefined);
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
