import {
  isChromeReproActive,
  postChromeReproEvent,
  roundChromeReproMs,
} from "state/actions/chromeRepro";
import { NO_WHEEL_CLASS_NAME } from "utils/constants";
import type { GpuFrameReason } from "../gpuRenderer";
import {
  resolveGpuRetainedContentWheelScrollOffset,
  type GpuRetainedContentScrollOffsetMap,
  type GpuRetainedContentScrollResult,
} from "../retainedContentScroll";
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
import { isGpuViewportWheelGestureActive } from "./wheelOwnership";

export type GpuRetainedContentScrollControllerOptions = {
  readonly disabled?: ((event: WheelEvent) => boolean) | undefined;
  readonly element: HTMLElement;
  readonly getScene: () => GpuFlowScene | undefined;
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
  private pendingScrollOffsets: Map<string, GpuPoint> | null = null;
  private readonly pendingSurfaceIds = new Set<string>();
  private readonly store: GpuFlowViewportStoreApi;

  constructor(options: GpuRetainedContentScrollControllerOptions) {
    this.element = options.element;
    this.options = options;
    this.store = options.store ?? gpuFlowViewportStore;
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
    this.pendingScrollOffsets = null;
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
    const result = resolveGpuRetainedContentWheelScrollOffset({
      event,
      point: getWheelFlowPoint(event, this.element, this.store),
      scene,
      scrollOffsets:
        this.pendingScrollOffsets ?? this.options.getScrollOffsets(),
    });
    if (!result.handled) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!result.changed) {
      return;
    }
    if (!this.pendingScrollOffsets) {
      this.pendingScrollOffsets = new Map(this.options.getScrollOffsets());
    }
    this.pendingScrollOffsets.set(result.surfaceId, result.scrollOffset);
    this.pendingSurfaceIds.add(result.surfaceId);
    this.schedulePendingScrollFlush();
  };

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
    for (const surfaceId of surfaceIds) {
      this.options.onScrollOffsetsChange(scrollOffsets, {
        changed: true,
        scrollOffsets,
        surfaceId,
      });
    }
    this.options.requestFrame?.("texture-upload");
  }

  private cancelPendingScrollFlush() {
    if (!this.pendingAnimationFrame) {
      return;
    }
    cancelGpuRetainedContentScrollFrame(this.pendingAnimationFrame);
    this.pendingAnimationFrame = null;
  }
}

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
