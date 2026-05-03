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
    if (!result.changed) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    const surfaceId = result.surfaceId;
    const scrollOffset = result.scrollOffset;
    if (!surfaceId || !scrollOffset) {
      return;
    }
    if (!this.pendingScrollOffsets) {
      this.pendingScrollOffsets = new Map(this.options.getScrollOffsets());
    }
    this.pendingScrollOffsets.set(surfaceId, scrollOffset);
    this.pendingSurfaceIds.add(surfaceId);
    this.schedulePendingScrollFlush();
  };

  private shouldSkipWheelEvent(event: WheelEvent): boolean {
    return (
      event.defaultPrevented ||
      event.ctrlKey ||
      Boolean(this.options.disabled?.(event)) ||
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
  return isGpuRetainedContentNativeTarget(event.target, [
    `.${NO_WHEEL_CLASS_NAME}`,
    '[data-gpu-flow-wheel-target="true"]',
    ...GPU_RETAINED_CONTENT_NATIVE_TARGET_SELECTORS,
  ]);
}
