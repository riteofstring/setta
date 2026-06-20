import type { IpcRenderer } from "electron";

import {
  recordingCartographerAuditSnapshotEventName,
  recordingRendererEventChannel,
  recordingWorkspaceGraphPerformanceEventName,
  type RendererRecordedEvent,
} from "@shared/recording";

const maxTextLength = 160;
const maxLongTaskAttributionCount = 5;
const maxMutationAttributeNameCount = 12;
const maxMutationNodeCount = 8;
const maxMutationTargetCount = 8;
const rendererFrameGapThresholdMs = 50;
const rendererEventTimingThresholdMs = 16;
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
  window.addEventListener(recordingWorkspaceGraphPerformanceEventName, (event) => {
    const detail = workspaceGraphPerformanceDetail(event);
    record(ipcRenderer, {
      at: timestamp(),
      reason: detail.reason,
      sample: detail.sample,
      surfaceId: detail.surfaceId,
      type: "workspace_graph_performance",
      url: window.location.href,
    });
  });
  window.addEventListener("setta:record-layout-snapshot", (event) => {
    layoutRecorder.capture(layoutSnapshotTrigger(event));
  });
  window.addEventListener("beforeunload", () => layoutRecorder.capture("before_unload"));
  layoutRecorder.observe();
  installAnimationFrameGapRecorder(ipcRenderer);
  installEventTimingRecorder(ipcRenderer);
  installLongTaskRecorder(ipcRenderer);
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
  let pendingDetails: LayoutSnapshotDetails | null = null;
  let lastCapturedAt = 0;

  return {
    capture(trigger: string, details: LayoutSnapshotDetails | null = null) {
      lastCapturedAt = Date.now();
      record(ipcRenderer, layoutSnapshot(trigger, details));
      pendingDetails = null;
    },
    observe() {
      const target = document.body ?? document.documentElement;
      if (!target) {
        window.addEventListener("DOMContentLoaded", () => this.observe(), { once: true });
        return;
      }
      const observer = new MutationObserver((records) => {
        const now = Date.now();
        if (now - lastCapturedAt < 250) {
          return;
        }
        this.schedule("dom_mutation", {
          mutationSummary: summarizeMutations(records),
        });
      });
      observer.observe(target, {
        attributes: true,
        childList: true,
        subtree: true,
      });
    },
    schedule(trigger: string, details: LayoutSnapshotDetails | null = null) {
      pendingDetails = mergeLayoutSnapshotDetails(pendingDetails, details);
      if (pending !== 0) {
        return;
      }
      pending = window.setTimeout(() => {
        pending = 0;
        this.capture(trigger, pendingDetails);
      }, 0);
    },
  };
}

type LayoutSnapshotDetails = {
  mutationSummary?: MutationSummary;
};

type MutationSummary = {
  addedNodes: NonNullable<ReturnType<typeof summarizeTarget>>[];
  attributeCount: number;
  attributeNames: string[];
  characterDataCount: number;
  childListCount: number;
  recordCount: number;
  removedNodes: NonNullable<ReturnType<typeof summarizeTarget>>[];
  targetCount: number;
  targets: NonNullable<ReturnType<typeof summarizeTarget>>[];
};

function layoutSnapshot(
  trigger: string,
  details: LayoutSnapshotDetails | null = null,
): RendererRecordedEvent {
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
    ...(details?.mutationSummary ? { mutationSummary: details.mutationSummary } : {}),
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

function mergeLayoutSnapshotDetails(
  current: LayoutSnapshotDetails | null,
  next: LayoutSnapshotDetails | null,
): LayoutSnapshotDetails | null {
  if (!next) {
    return current;
  }
  if (!current) {
    return next;
  }
  if (!current.mutationSummary || !next.mutationSummary) {
    return {
      ...current,
      ...next,
    };
  }
  return {
    ...current,
    ...next,
    mutationSummary: mergeMutationSummaries(current.mutationSummary, next.mutationSummary),
  };
}

function summarizeMutations(records: MutationRecord[]): MutationSummary {
  let attributeCount = 0;
  let characterDataCount = 0;
  let childListCount = 0;
  const attributeNames = new Set<string>();
  const targets = new Map<string, NonNullable<ReturnType<typeof summarizeTarget>>>();
  const addedNodes = new Map<string, NonNullable<ReturnType<typeof summarizeTarget>>>();
  const removedNodes = new Map<string, NonNullable<ReturnType<typeof summarizeTarget>>>();

  for (const record of records) {
    if (record.type === "attributes") {
      attributeCount += 1;
      if (record.attributeName) {
        attributeNames.add(record.attributeName);
      }
    } else if (record.type === "characterData") {
      characterDataCount += 1;
    } else if (record.type === "childList") {
      childListCount += 1;
    }
    addTargetSummary(targets, record.target, maxMutationTargetCount);
    for (const node of record.addedNodes) {
      addTargetSummary(addedNodes, node, maxMutationNodeCount);
    }
    for (const node of record.removedNodes) {
      addTargetSummary(removedNodes, node, maxMutationNodeCount);
    }
  }

  return {
    addedNodes: [...addedNodes.values()],
    attributeCount,
    attributeNames: [...attributeNames].slice(0, maxMutationAttributeNameCount),
    characterDataCount,
    childListCount,
    recordCount: records.length,
    removedNodes: [...removedNodes.values()],
    targetCount: targets.size,
    targets: [...targets.values()],
  };
}

function mergeMutationSummaries(current: MutationSummary, next: MutationSummary): MutationSummary {
  return {
    addedNodes: uniqueTargets([...current.addedNodes, ...next.addedNodes], maxMutationNodeCount),
    attributeCount: current.attributeCount + next.attributeCount,
    attributeNames: [...new Set([...current.attributeNames, ...next.attributeNames])].slice(
      0,
      maxMutationAttributeNameCount,
    ),
    characterDataCount: current.characterDataCount + next.characterDataCount,
    childListCount: current.childListCount + next.childListCount,
    recordCount: current.recordCount + next.recordCount,
    removedNodes: uniqueTargets(
      [...current.removedNodes, ...next.removedNodes],
      maxMutationNodeCount,
    ),
    targetCount: current.targetCount + next.targetCount,
    targets: uniqueTargets([...current.targets, ...next.targets], maxMutationTargetCount),
  };
}

function addTargetSummary(
  targets: Map<string, NonNullable<ReturnType<typeof summarizeTarget>>>,
  target: EventTarget | null,
  limit: number,
) {
  if (targets.size >= limit) {
    return;
  }
  const summary = summarizeTarget(target);
  if (!summary) {
    return;
  }
  targets.set(targetSummaryKey(summary), summary);
}

function uniqueTargets(
  targets: NonNullable<ReturnType<typeof summarizeTarget>>[],
  limit: number,
): NonNullable<ReturnType<typeof summarizeTarget>>[] {
  const byKey = new Map<string, NonNullable<ReturnType<typeof summarizeTarget>>>();
  for (const target of targets) {
    if (byKey.size >= limit) {
      break;
    }
    byKey.set(targetSummaryKey(target), target);
  }
  return [...byKey.values()];
}

function targetSummaryKey(target: NonNullable<ReturnType<typeof summarizeTarget>>): string {
  return [
    target.tag,
    target.id,
    target.role,
    target.name,
    target.type,
    target.ariaLabel,
    target.classes,
    target.text,
  ].join("|");
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

function installLongTaskRecorder(ipcRenderer: Pick<IpcRenderer, "send">) {
  if (
    typeof PerformanceObserver !== "function" ||
    !PerformanceObserver.supportedEntryTypes.includes("longtask")
  ) {
    return;
  }
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      record(ipcRenderer, {
        at: timestamp(),
        attribution: summarizeLongTaskAttribution(entry),
        durationMs: round(entry.duration),
        entryType: entry.entryType,
        name: truncate(entry.name),
        startTimeMs: round(entry.startTime),
        type: "renderer_long_task",
        url: window.location.href,
      });
    }
  });
  observer.observe({ buffered: true, type: "longtask" });
}

function installEventTimingRecorder(ipcRenderer: Pick<IpcRenderer, "send">) {
  if (
    typeof PerformanceObserver !== "function" ||
    !PerformanceObserver.supportedEntryTypes.includes("event")
  ) {
    return;
  }
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      record(ipcRenderer, eventTimingEvent(entry));
    }
  });
  observer.observe({
    buffered: true,
    durationThreshold: rendererEventTimingThresholdMs,
    type: "event",
  } as PerformanceObserverInit);
}

function eventTimingEvent(entry: PerformanceEntry): RendererRecordedEvent {
  const timing = entry as PerformanceEntry & {
    cancelable?: boolean;
    interactionId?: number;
    processingEnd?: number;
    processingStart?: number;
    target?: EventTarget | null;
  };
  const processingStartMs = finiteNumberOrNull(timing.processingStart);
  const processingEndMs = finiteNumberOrNull(timing.processingEnd);
  const eventTarget = timing.target ? summarizeTarget(timing.target) : undefined;
  return {
    at: timestamp(),
    cancelable: Boolean(timing.cancelable),
    durationMs: round(entry.duration),
    entryType: entry.entryType,
    ...(eventTarget ? { eventTarget } : {}),
    inputDelayMs: processingStartMs === null ? null : round(processingStartMs - entry.startTime),
    interactionId: Number.isFinite(timing.interactionId) ? Number(timing.interactionId) : null,
    name: truncate(entry.name),
    processingDurationMs:
      processingStartMs === null || processingEndMs === null
        ? null
        : round(processingEndMs - processingStartMs),
    processingEndMs,
    processingStartMs,
    startTimeMs: round(entry.startTime),
    type: "renderer_event_timing",
    url: window.location.href,
  };
}

function installAnimationFrameGapRecorder(ipcRenderer: Pick<IpcRenderer, "send">) {
  if (typeof window.requestAnimationFrame !== "function") {
    return;
  }
  let previousFrameAt = performance.now();
  const tick = (frameAt: number) => {
    const frameGapMs = frameAt - previousFrameAt;
    if (frameGapMs >= rendererFrameGapThresholdMs) {
      record(ipcRenderer, {
        at: timestamp(),
        frameAtMs: round(frameAt),
        frameGapMs: round(frameGapMs),
        previousFrameAtMs: round(previousFrameAt),
        thresholdMs: rendererFrameGapThresholdMs,
        type: "renderer_animation_frame_gap",
        url: window.location.href,
        visibilityState: document.visibilityState,
      });
    }
    previousFrameAt = frameAt;
    window.requestAnimationFrame(tick);
  };
  window.requestAnimationFrame(tick);
}

function summarizeLongTaskAttribution(entry: PerformanceEntry) {
  const attribution = (entry as { attribution?: unknown }).attribution;
  if (!Array.isArray(attribution)) {
    return [];
  }
  return attribution.slice(0, maxLongTaskAttributionCount).map((item) => {
    const record = isRecord(item) ? item : {};
    return {
      containerId: stringRecordValue(record, "containerId"),
      containerName: stringRecordValue(record, "containerName"),
      containerSrc: stringRecordValue(record, "containerSrc"),
      containerType: stringRecordValue(record, "containerType"),
      name: stringRecordValue(record, "name"),
    };
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

function finiteNumberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? round(value) : null;
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

function workspaceGraphPerformanceDetail(event: Event): {
  reason: string;
  sample: unknown;
  surfaceId: string;
} {
  if (!(event instanceof CustomEvent) || !isRecord(event.detail)) {
    return { reason: "unknown", sample: null, surfaceId: "" };
  }
  const detail = event.detail;
  return {
    reason: typeof detail.reason === "string" && detail.reason !== "" ? detail.reason : "unknown",
    sample: "sample" in detail ? detail.sample : null,
    surfaceId: typeof detail.surfaceId === "string" ? detail.surfaceId : "",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringRecordValue(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return truncate(typeof value === "string" ? value : "");
}
