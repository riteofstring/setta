import { NO_WHEEL_CLASS_NAME } from "utils/constants";
import type { GpuFrameReason } from "../gpuRenderer";
import type { GpuFlowScene } from "../scene";
import {
  resolveGpuSectionSceneWheelScroll,
  type GpuSectionSceneScrollOffsetMap,
  type GpuSectionSceneWheelScrollResult,
} from "../sceneScroll";
import { screenToFlowPosition } from "../viewportMath";
import {
  gpuFlowViewportStore,
  type GpuFlowViewportStoreApi,
} from "../viewportStore";

export type GpuSectionSceneScrollControllerOptions = {
  readonly disabled?: ((event: WheelEvent) => boolean) | undefined;
  readonly element: HTMLElement;
  readonly getScene: () => GpuFlowScene | undefined;
  readonly getScrollOffsets: () => GpuSectionSceneScrollOffsetMap;
  readonly onScrollOffsetsChange: (
    scrollOffsets: GpuSectionSceneScrollOffsetMap,
    result: GpuSectionSceneWheelScrollResult,
  ) => void;
  readonly requestFrame?: ((reason: GpuFrameReason) => void) | undefined;
  readonly store?: GpuFlowViewportStoreApi | undefined;
};

export function attachGpuSectionSceneScrollController(
  options: GpuSectionSceneScrollControllerOptions,
): () => void {
  const controller = new GpuSectionSceneScrollController(options);
  controller.attach();
  return () => controller.destroy();
}

class GpuSectionSceneScrollController {
  private readonly element: HTMLElement;
  private readonly options: GpuSectionSceneScrollControllerOptions;
  private readonly store: GpuFlowViewportStoreApi;

  constructor(options: GpuSectionSceneScrollControllerOptions) {
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
    this.element.removeEventListener("wheel", this.onWheel, { capture: true });
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
    const result = resolveGpuSectionSceneWheelScroll({
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
  const target = event.target;
  if (!(target instanceof Element)) {
    return false;
  }
  return Boolean(
    target.closest(
      [
        `.${NO_WHEEL_CLASS_NAME}`,
        '[data-gpu-flow-wheel-target="true"]',
        "input",
        "select",
        "textarea",
        '[contenteditable=""]',
        '[contenteditable="true"]',
      ].join(", "),
    ),
  );
}
