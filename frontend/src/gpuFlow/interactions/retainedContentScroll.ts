import { NO_WHEEL_CLASS_NAME } from "utils/constants";
import type { GpuFrameReason } from "../gpuRenderer";
import {
  resolveGpuRetainedContentWheelScroll,
  type GpuRetainedContentScrollOffsetMap,
  type GpuRetainedContentScrollResult,
} from "../retainedContentScroll";
import type { GpuFlowScene } from "../scene";
import { screenToFlowPosition } from "../viewportMath";
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
  }

  private readonly onWheel = (event: WheelEvent) => {
    if (
      event.defaultPrevented ||
      event.ctrlKey ||
      this.options.disabled?.(event) ||
      shouldPreserveNativeWheelTarget(event)
    ) {
      return;
    }
    const scene = this.options.getScene();
    if (!scene) {
      return;
    }
    const result = resolveGpuRetainedContentWheelScroll({
      event,
      point: getWheelFlowPoint(event, this.element, this.store),
      scene,
      scrollOffsets: this.options.getScrollOffsets(),
    });
    if (!result.changed) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    this.options.onScrollOffsetsChange(result.scrollOffsets, result);
    this.options.requestFrame?.("viewport");
  };
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
