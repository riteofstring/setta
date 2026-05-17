import {
  isChromeReproActive,
  nowChromeReproPerformanceMs,
  postChromeReproEvent,
  roundChromeReproMs,
} from "state/actions/chromeRepro";
import { NO_WHEEL_CLASS_NAME } from "utils/constants";
import type { GpuFrameReason } from "../gpuRenderer";
import {
  resolveGpuRetainedContentWheelScrollOffset,
  type GpuRetainedContentScrollOffsetMap,
  type GpuRetainedContentScrollResult,
  type GpuRetainedContentWheelScrollOffsetResult,
} from "../retainedContentScroll";
import type { GpuRetainedRuntimeFrame } from "../retainedRuntimeFrame";
import type { GpuFlowScene } from "../scene";
import { screenToFlowPosition, type GpuPoint } from "../viewportMath";
import {
  gpuFlowViewportStore,
  type GpuFlowViewportStoreApi,
} from "../viewportStore";
import {
  GPU_RETAINED_CONTENT_NATIVE_TARGET_SELECTORS,
  isGpuRetainedContentNativeTarget,
} from "./retainedContentInteraction";
import {
  getGpuWheelGestureOwnershipArbiter,
  isGpuViewportWheelGestureActive,
  type GpuWheelGestureOwnershipArbiter,
} from "./wheelOwnership";

export type GpuRetainedContentScrollControllerOptions = {
  readonly disabled?: ((event: WheelEvent) => boolean) | undefined;
  readonly element: HTMLElement;
  readonly getScene: () => GpuFlowScene | undefined;
  readonly getRetainedRuntimeFrame?:
    | (() => GpuRetainedRuntimeFrame | null | undefined)
    | undefined;
  readonly getScrollOffsets: () => GpuRetainedContentScrollOffsetMap;
  readonly onScrollOffsetsChange: (
    scrollOffsets: GpuRetainedContentScrollOffsetMap,
    result: GpuRetainedContentScrollResult,
  ) => void;
  readonly requestFrame?: ((reason: GpuFrameReason) => void) | undefined;
  readonly store?: GpuFlowViewportStoreApi | undefined;
};

export function attachGpuRetainedContentScrollController(
  options: GpuRetainedContentScrollControllerOptions,
): () => void {
  const controller = new GpuRetainedContentScrollController(options);
  controller.attach();
  return () => controller.destroy();
}

class GpuRetainedContentScrollController {
  private readonly element: HTMLElement;
  private readonly options: GpuRetainedContentScrollControllerOptions;
  private pendingAnimationFrame: GpuRetainedContentScrollAnimationFrame | null =
    null;
  private readonly pendingScrollDiagnosticsBySurfaceId = new Map<
    string,
    PendingRetainedContentScrollDiagnostics
  >();
  private pendingScrollOffsets: Map<string, GpuPoint> | null = null;
  private readonly pendingSurfaceIds = new Set<string>();
  private retainedScrollInteractionActive = false;
  private scrollIdleFrameTimeout: ReturnType<typeof setTimeout> | null = null;
  private readonly store: GpuFlowViewportStoreApi;
  private readonly wheelOwnership: GpuWheelGestureOwnershipArbiter;

  constructor(options: GpuRetainedContentScrollControllerOptions) {
    this.element = options.element;
    this.options = options;
    this.store = options.store ?? gpuFlowViewportStore;
    this.wheelOwnership = getGpuWheelGestureOwnershipArbiter(this.store);
  }

  attach() {
    this.element.addEventListener("wheel", this.onWheel, {
      capture: true,
      passive: false,
    });
  }

  destroy() {
    this.element.removeEventListener("wheel", this.onWheel, {
      capture: true,
    });
    this.cancelPendingScrollFlush();
    this.cancelScrollIdleFrame();
    this.wheelOwnership.releaseOwner(
      "ownedByRetainedSectionScroll",
      "retained-scroll-controller-destroyed",
    );
    this.setRetainedScrollInteractionActive(false);
    this.pendingScrollOffsets = null;
    this.pendingScrollDiagnosticsBySurfaceId.clear();
    this.pendingSurfaceIds.clear();
  }

  private readonly onWheel = (event: WheelEvent) => {
    if (this.shouldSkipWheelEvent(event)) {
      return;
    }
    const scene = this.options.getScene();
    if (!scene) {
      return;
    }
    const scrollOffsets =
      this.pendingScrollOffsets ?? this.options.getScrollOffsets();
    const resolveStartedAtMs = nowChromeReproPerformanceMs();
    const result = resolveGpuRetainedContentWheelScrollOffset({
      event,
      point: getWheelFlowPoint(event, this.element, this.store),
      retainedRuntimeFrame: this.resolveRetainedRuntimeFrame(),
      scene,
      scrollOffsets,
    });
    const resolveDurationMs =
      nowChromeReproPerformanceMs() - resolveStartedAtMs;
    if (!result.handled) {
      return;
    }
    const ownership = this.wheelOwnership.resolveOwner({
      candidateOwner: "ownedByRetainedSectionScroll",
      reason: "retained-section-wheel",
    });
    if (ownership.owner !== "ownedByRetainedSectionScroll") {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!result.changed) {
      return;
    }
    this.recordPendingScrollDiagnostics({
      event,
      previousOffset:
        scrollOffsets.get(result.surfaceId) ??
        getRetainedContentSurfaceScrollOffset(scene, result.surfaceId),
      resolveDurationMs,
      result,
    });
    if (!this.pendingScrollOffsets) {
      this.pendingScrollOffsets = new Map(this.options.getScrollOffsets());
    }
    this.setRetainedScrollInteractionActive(true);
    this.pendingScrollOffsets.set(result.surfaceId, result.scrollOffset);
    this.pendingSurfaceIds.add(result.surfaceId);
    this.schedulePendingScrollFlush();
  };

  private resolveRetainedRuntimeFrame(): GpuRetainedRuntimeFrame | null {
    return this.options.getRetainedRuntimeFrame?.() ?? null;
  }

  private shouldSkipWheelEvent(event: WheelEvent): boolean {
    return (
      event.defaultPrevented ||
      event.ctrlKey ||
      Boolean(this.options.disabled?.(event)) ||
      isGpuViewportWheelGestureActive(this.store) ||
      shouldPreserveNativeWheelTarget(event)
    );
  }

  private schedulePendingScrollFlush() {
    if (this.pendingAnimationFrame) {
      return;
    }
    this.pendingAnimationFrame = requestGpuRetainedContentScrollFrame(() => {
      this.pendingAnimationFrame = null;
      this.flushPendingScroll();
    });
  }

  private flushPendingScroll() {
    const scrollOffsets = this.pendingScrollOffsets;
    if (!scrollOffsets || this.pendingSurfaceIds.size === 0) {
      return;
    }
    const surfaceIds = [...this.pendingSurfaceIds];
    this.pendingScrollOffsets = null;
    this.pendingSurfaceIds.clear();
    const diagnostics = surfaceIds
      .map((surfaceId) =>
        this.pendingScrollDiagnosticsBySurfaceId.get(surfaceId),
      )
      .filter(
        (diagnostic): diagnostic is PendingRetainedContentScrollDiagnostics =>
          diagnostic !== undefined,
      );
    for (const surfaceId of surfaceIds) {
      this.pendingScrollDiagnosticsBySurfaceId.delete(surfaceId);
    }
    const commitStartedAtMs = nowChromeReproPerformanceMs();
    for (const surfaceId of surfaceIds) {
      this.options.onScrollOffsetsChange(scrollOffsets, {
        changed: true,
        scrollOffsets,
        surfaceId,
      });
    }
    const commitDurationMs = nowChromeReproPerformanceMs() - commitStartedAtMs;
    this.options.requestFrame?.("viewport");
    this.scheduleScrollIdleFrame();
    this.postPendingScrollFlushChromeReproEvent({
      commitDurationMs,
      diagnostics,
      surfaceIds,
    });
  }

  private cancelPendingScrollFlush() {
    if (!this.pendingAnimationFrame) {
      return;
    }
    cancelGpuRetainedContentScrollFrame(this.pendingAnimationFrame);
    this.pendingAnimationFrame = null;
  }

  private scheduleScrollIdleFrame() {
    this.cancelScrollIdleFrame();
    this.scrollIdleFrameTimeout = setTimeout(() => {
      this.scrollIdleFrameTimeout = null;
      this.setRetainedScrollInteractionActive(false);
      this.wheelOwnership.releaseOwner(
        "ownedByRetainedSectionScroll",
        "retained-section-scroll-idle",
      );
      if (this.store.getState().viewportInteractionActive) {
        this.scheduleScrollIdleFrame();
        return;
      }
      this.options.requestFrame?.("texture-upload");
    }, 120);
  }

  private cancelScrollIdleFrame() {
    if (this.scrollIdleFrameTimeout === null) {
      return;
    }
    clearTimeout(this.scrollIdleFrameTimeout);
    this.scrollIdleFrameTimeout = null;
  }

  private setRetainedScrollInteractionActive(active: boolean) {
    if (this.retainedScrollInteractionActive === active) {
      return;
    }
    this.retainedScrollInteractionActive = active;
    this.store
      .getState()
      .setViewportInteractionFlags({ retainedContentScrolling: active });
  }

  private recordPendingScrollDiagnostics({
    event,
    previousOffset,
    resolveDurationMs,
    result,
  }: {
    readonly event: WheelEvent;
    readonly previousOffset: GpuPoint;
    readonly resolveDurationMs: number;
    readonly result: Extract<
      GpuRetainedContentWheelScrollOffsetResult,
      { readonly changed: true }
    >;
  }) {
    if (!isChromeReproActive()) {
      return;
    }
    const nowMs = nowChromeReproPerformanceMs();
    const existing = this.pendingScrollDiagnosticsBySurfaceId.get(
      result.surfaceId,
    ) ?? {
      firstInputAtMs: nowMs,
      lastInputAtMs: nowMs,
      maxAbsWheelDeltaX: 0,
      maxAbsWheelDeltaY: 0,
      nextOffset: result.scrollOffset,
      previousOffset,
      resolveDurationMsMax: 0,
      resolveDurationMsTotal: 0,
      surfaceId: result.surfaceId,
      totalWheelDeltaX: 0,
      totalWheelDeltaY: 0,
      wheelCount: 0,
    };
    existing.lastInputAtMs = nowMs;
    existing.maxAbsWheelDeltaX = Math.max(
      existing.maxAbsWheelDeltaX,
      Math.abs(event.deltaX),
    );
    existing.maxAbsWheelDeltaY = Math.max(
      existing.maxAbsWheelDeltaY,
      Math.abs(event.deltaY),
    );
    existing.nextOffset = result.scrollOffset;
    existing.resolveDurationMsMax = Math.max(
      existing.resolveDurationMsMax,
      resolveDurationMs,
    );
    existing.resolveDurationMsTotal += resolveDurationMs;
    existing.totalWheelDeltaX += event.deltaX;
    existing.totalWheelDeltaY += event.deltaY;
    existing.wheelCount += 1;
    this.pendingScrollDiagnosticsBySurfaceId.set(result.surfaceId, existing);
  }

  private postPendingScrollFlushChromeReproEvent({
    commitDurationMs,
    diagnostics,
    surfaceIds,
  }: {
    readonly commitDurationMs: number;
    readonly diagnostics: readonly PendingRetainedContentScrollDiagnostics[];
    readonly surfaceIds: readonly string[];
  }) {
    if (!isChromeReproActive() || diagnostics.length === 0) {
      return;
    }
    const nowMs = nowChromeReproPerformanceMs();
    const coalescedWheelCount = diagnostics.reduce(
      (total, diagnostic) => total + diagnostic.wheelCount,
      0,
    );
    const flushLatencyMs = diagnostics.reduce(
      (maxLatencyMs, diagnostic) =>
        Math.max(maxLatencyMs, nowMs - diagnostic.firstInputAtMs),
      0,
    );
    postChromeReproEvent("gpu-flow-retained-content-scroll-flush", {
      coalescedWheelCount,
      commitDurationMs: roundChromeReproMs(commitDurationMs),
      flushLatencyMs: roundChromeReproMs(flushLatencyMs),
      requestFrameReason: "viewport",
      surfaceCount: surfaceIds.length,
      surfaceIds: surfaceIds.slice(0, 12),
      surfaces: diagnostics.slice(0, 8).map((diagnostic) => ({
        deltaOffset: {
          x: roundChromeReproMs(
            diagnostic.nextOffset.x - diagnostic.previousOffset.x,
          ),
          y: roundChromeReproMs(
            diagnostic.nextOffset.y - diagnostic.previousOffset.y,
          ),
        },
        maxAbsWheelDeltaX: roundChromeReproMs(diagnostic.maxAbsWheelDeltaX),
        maxAbsWheelDeltaY: roundChromeReproMs(diagnostic.maxAbsWheelDeltaY),
        nextOffset: roundGpuPointForChromeRepro(diagnostic.nextOffset),
        previousOffset: roundGpuPointForChromeRepro(diagnostic.previousOffset),
        resolveDurationMsMax: roundChromeReproMs(
          diagnostic.resolveDurationMsMax,
        ),
        resolveDurationMsTotal: roundChromeReproMs(
          diagnostic.resolveDurationMsTotal,
        ),
        surfaceId: diagnostic.surfaceId,
        totalWheelDeltaX: roundChromeReproMs(diagnostic.totalWheelDeltaX),
        totalWheelDeltaY: roundChromeReproMs(diagnostic.totalWheelDeltaY),
        wheelCount: diagnostic.wheelCount,
      })),
    });
  }
}

type PendingRetainedContentScrollDiagnostics = {
  firstInputAtMs: number;
  lastInputAtMs: number;
  maxAbsWheelDeltaX: number;
  maxAbsWheelDeltaY: number;
  nextOffset: GpuPoint;
  previousOffset: GpuPoint;
  resolveDurationMsMax: number;
  resolveDurationMsTotal: number;
  readonly surfaceId: string;
  totalWheelDeltaX: number;
  totalWheelDeltaY: number;
  wheelCount: number;
};

type GpuRetainedContentScrollAnimationFrame =
  | {
      readonly id: number;
      readonly kind: "animation-frame";
    }
  | {
      readonly id: ReturnType<typeof globalThis.setTimeout>;
      readonly kind: "timeout";
    };

function requestGpuRetainedContentScrollFrame(
  callback: FrameRequestCallback,
): GpuRetainedContentScrollAnimationFrame {
  if (typeof globalThis.requestAnimationFrame === "function") {
    return {
      id: globalThis.requestAnimationFrame(callback),
      kind: "animation-frame",
    };
  }
  return {
    id: globalThis.setTimeout(() => callback(performance.now()), 16),
    kind: "timeout",
  };
}

function cancelGpuRetainedContentScrollFrame(
  frame: GpuRetainedContentScrollAnimationFrame,
) {
  if (frame.kind === "animation-frame") {
    globalThis.cancelAnimationFrame(frame.id);
    return;
  }
  globalThis.clearTimeout(frame.id);
}

function getWheelFlowPoint(
  event: Pick<WheelEvent, "clientX" | "clientY">,
  element: HTMLElement,
  store: GpuFlowViewportStoreApi,
) {
  const rect = element.getBoundingClientRect();
  return screenToFlowPosition(
    {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    },
    store.getState().transform,
  );
}

function getRetainedContentSurfaceScrollOffset(
  scene: GpuFlowScene,
  surfaceId: string,
): GpuPoint {
  const surface = scene.contentSurfaces.find(
    (candidate) => candidate.id === surfaceId,
  );
  return surface?.retainedScene?.scrollOffset ?? { x: 0, y: 0 };
}

function roundGpuPointForChromeRepro(point: GpuPoint): GpuPoint {
  return {
    x: roundChromeReproMs(point.x),
    y: roundChromeReproMs(point.y),
  };
}

function shouldPreserveNativeWheelTarget(event: WheelEvent): boolean {
  if (!(event.target instanceof Element)) {
    return false;
  }
  const target = event.target;
  const nativeTarget = target.closest(
    GPU_RETAINED_CONTENT_NATIVE_TARGET_SELECTORS.join(", "),
  );
  const editor = target.closest(".cm-editor");
  if (nativeTarget && editor) {
    const editorCanConsumeWheel = canNativeWheelTargetConsumeDelta(
      target,
      event,
    );
    postRetainedActiveEditorWheelOwnershipChromeReproEvent({
      decision: editorCanConsumeWheel
        ? "editor-consume"
        : "retained-section-handoff",
      editor,
      event,
      nativeTarget,
      target,
    });
    return editorCanConsumeWheel;
  }
  return isGpuRetainedContentNativeTarget(target, [
    `.${NO_WHEEL_CLASS_NAME}`,
    '[data-gpu-flow-wheel-target="true"]',
    ...GPU_RETAINED_CONTENT_NATIVE_TARGET_SELECTORS,
  ]);
}

type RetainedActiveEditorWheelOwnershipDecision =
  | "editor-consume"
  | "retained-section-handoff";

function postRetainedActiveEditorWheelOwnershipChromeReproEvent({
  decision,
  editor,
  event,
  nativeTarget,
  target,
}: {
  readonly decision: RetainedActiveEditorWheelOwnershipDecision;
  readonly editor: Element;
  readonly event: WheelEvent;
  readonly nativeTarget: Element;
  readonly target: Element;
}) {
  if (!isChromeReproActive()) {
    return;
  }
  const scroller = editor.querySelector(".cm-scroller");
  postChromeReproEvent("gpu-flow-retained-active-editor-wheel-ownership", {
    activeControlId:
      editor
        .closest("[data-gpu-flow-control]")
        ?.getAttribute("data-gpu-flow-control") ?? null,
    decision,
    deltaMode: event.deltaMode,
    deltaX: roundChromeReproMs(event.deltaX),
    deltaY: roundChromeReproMs(event.deltaY),
    editorScroll:
      scroller instanceof HTMLElement
        ? {
            clientHeight: roundChromeReproMs(scroller.clientHeight),
            clientWidth: roundChromeReproMs(scroller.clientWidth),
            scrollHeight: roundChromeReproMs(scroller.scrollHeight),
            scrollLeft: roundChromeReproMs(scroller.scrollLeft),
            scrollTop: roundChromeReproMs(scroller.scrollTop),
            scrollWidth: roundChromeReproMs(scroller.scrollWidth),
          }
        : null,
    nativeTargetKind: resolveNativeTargetKind(nativeTarget),
    shiftKey: event.shiftKey,
    targetTagName: target.tagName.toLowerCase(),
  });
}

function resolveNativeTargetKind(element: Element): string {
  for (const selector of GPU_RETAINED_CONTENT_NATIVE_TARGET_SELECTORS) {
    if (element.matches(selector)) {
      return selector;
    }
  }
  return "unknown";
}

function canNativeWheelTargetConsumeDelta(
  target: Element,
  event: Pick<WheelEvent, "deltaX" | "deltaY" | "shiftKey">,
): boolean {
  for (let element: Element | null = target; element; ) {
    if (
      element instanceof HTMLElement &&
      canElementConsumeWheelDelta(element, event)
    ) {
      return true;
    }
    if (
      element.matches(GPU_RETAINED_CONTENT_NATIVE_TARGET_SELECTORS.join(", "))
    ) {
      break;
    }
    element = element.parentElement;
  }
  return false;
}

function canElementConsumeWheelDelta(
  element: HTMLElement,
  event: Pick<WheelEvent, "deltaX" | "deltaY" | "shiftKey">,
): boolean {
  const deltaY = event.deltaY;
  const deltaX =
    event.deltaX !== 0 ? event.deltaX : event.shiftKey ? deltaY : 0;
  return (
    canElementConsumeAxisWheelDelta({
      clientSize: element.clientHeight,
      delta: deltaY,
      scrollOffset: element.scrollTop,
      scrollSize: element.scrollHeight,
    }) ||
    canElementConsumeAxisWheelDelta({
      clientSize: element.clientWidth,
      delta: deltaX,
      scrollOffset: element.scrollLeft,
      scrollSize: element.scrollWidth,
    })
  );
}

function canElementConsumeAxisWheelDelta({
  clientSize,
  delta,
  scrollOffset,
  scrollSize,
}: {
  readonly clientSize: number;
  readonly delta: number;
  readonly scrollOffset: number;
  readonly scrollSize: number;
}): boolean {
  if (delta === 0 || scrollSize <= clientSize + 1) {
    return false;
  }
  const maxScrollOffset = scrollSize - clientSize;
  return delta < 0 ? scrollOffset > 0 : scrollOffset < maxScrollOffset - 1;
}
