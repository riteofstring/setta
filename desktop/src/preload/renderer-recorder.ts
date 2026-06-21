import type { IpcRenderer } from "electron";

import {
  recordingCartographerAuditSnapshotEventName,
  recordingRendererEventChannel,
  recordingWorkflowGraphEventName,
  type RendererGraphRecordedEvent,
  type RendererRecordedEvent,
} from "@shared/recording";

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
  markRendererRecordingEnabled();
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
  window.addEventListener(recordingCartographerAuditSnapshotEventName, (event) => {
    const detail = cartographerAuditSnapshotDetail(event);
    record(ipcRenderer, {
      at: timestamp(),
      snapshot: detail.snapshot,
      trigger: detail.trigger,
      type: "cartographer_audit_snapshot",
      url: window.location.href,
      workspaceId: detail.workspaceId,
    });
  });
  window.addEventListener(recordingWorkflowGraphEventName, (event) => {
    record(ipcRenderer, graphRecordingEvent(event));
  });
  window.addEventListener("setta:record-layout-snapshot", (event) => {
    layoutRecorder.capture(layoutSnapshotTrigger(event));
  });
  window.addEventListener("beforeunload", () => layoutRecorder.capture("before_unload"));
  layoutRecorder.observe();
}

function isRecordingEnabled(): boolean {
  const env = typeof process === "undefined" ? undefined : process.env;
  return env?.SETTA_RECORDING === "1" || env?.SETTA_RECORDING_DIR !== undefined;
}

function markRendererRecordingEnabled() {
  const mark = () => {
    document.documentElement.setAttribute("data-setta-recording", "true");
  };
  if (document.documentElement) {
    mark();
    return;
  }
  window.addEventListener("DOMContentLoaded", mark, { once: true });
}

function shouldRecordKeydown(event: KeyboardEvent): boolean {
  return interestingKeys.has(event.key) || event.metaKey || event.ctrlKey;
}

function record(ipcRenderer: Pick<IpcRenderer, "send">, event: RendererRecordedEvent) {
  ipcRenderer.send(recordingRendererEventChannel, event);
}

function graphRecordingEvent(event: Event): RendererGraphRecordedEvent {
  const detail = graphRecordingEventDetail(event);
  assertGraphRecordedEventType(detail.type);
  assertGraphRecordingSurface(detail);
  assertGraphRecordingPayload(detail);
  return {
    ...detail,
    at: nonEmptyStringOr(detail.at, timestamp()),
    url: typeof detail.url === "string" ? detail.url : window.location.href,
  } as RendererGraphRecordedEvent;
}

function graphRecordingEventDetail(event: Event): Partial<RendererGraphRecordedEvent> {
  if (event instanceof CustomEvent && event.detail && typeof event.detail === "object") {
    return event.detail as Partial<RendererGraphRecordedEvent>;
  }
  throw new Error("Workflow graph recording event detail is missing");
}

function assertGraphRecordedEventType(
  value: unknown,
): asserts value is RendererGraphRecordedEvent["type"] {
  if (isGraphRecordedEventType(value)) {
    return;
  }
  throw new Error(`Workflow graph recording event type is unsupported: ${String(value)}`);
}

function assertGraphRecordingSurface(detail: Partial<RendererGraphRecordedEvent>) {
  if (typeof detail.surfaceId === "string" && detail.surfaceId !== "") {
    return;
  }
  throw new Error("Workflow graph recording event surfaceId is missing");
}

function assertGraphRecordingPayload(detail: Partial<RendererGraphRecordedEvent>) {
  if (detail.graph && typeof detail.graph === "object") {
    return;
  }
  throw new Error("Workflow graph recording event graph payload is missing");
}

function isGraphRecordedEventType(value: unknown): value is RendererGraphRecordedEvent["type"] {
  return graphRecordedEventTypes.has(value as RendererGraphRecordedEvent["type"]);
}

function nonEmptyStringOr(value: unknown, fallback: string): string {
  return typeof value === "string" && value !== "" ? value : fallback;
}

const graphRecordedEventTypes = new Set<RendererGraphRecordedEvent["type"]>([
  "graph_interaction",
  "graph_layout_save",
  "graph_replacement",
  "graph_snapshot",
]);

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
  const composer = document.querySelector('[data-testid="chat-composer"]');
  return {
    activeRunStatus: pane?.getAttribute("data-run-status") ?? "",
    at: timestamp(),
    chatDetailPane: elementRect(pane),
    composer: elementRect(composer),
    queueSize: document.querySelectorAll('[data-testid="chat-queued-turn-row"]').length,
    selectedConversationId: pane?.getAttribute("data-conversation-id") ?? "",
    transcript: scrollRect(transcript, scroller),
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
  return {
    ...rect,
    clientHeight: scroller?.clientHeight ?? region.clientHeight,
    scrollHeight: scroller?.scrollHeight ?? region.scrollHeight,
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

function cartographerAuditSnapshotDetail(event: Event): {
  snapshot: unknown;
  trigger: string;
  workspaceId: string;
} {
  if (!(event instanceof CustomEvent) || !isRecord(event.detail)) {
    return { snapshot: null, trigger: "manual", workspaceId: "" };
  }
  const detail = event.detail;
  return {
    snapshot: "snapshot" in detail ? detail.snapshot : null,
    trigger:
      typeof detail.trigger === "string" && detail.trigger !== "" ? detail.trigger : "manual",
    workspaceId: typeof detail.workspaceId === "string" ? detail.workspaceId : "",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
