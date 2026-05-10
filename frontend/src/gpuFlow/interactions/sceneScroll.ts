import {
  isChromeReproActive,
  nowChromeReproPerformanceMs,
  postChromeReproEvent,
  roundChromeReproMs,
} from "state/actions/chromeRepro";
import { NO_WHEEL_CLASS_NAME } from "utils/constants";
import type { GpuFrameReason } from "../gpuRenderer";
import type { GpuFlowScene } from "../scene";
import {
  resolveGpuSectionSceneKeyboardScroll,
  resolveGpuSectionSceneWheelScroll,
  type GpuSectionSceneKeyboardScrollCommand,
  type GpuSectionSceneScrollOffsetMap,
  type GpuSectionSceneScrollResult,
} from "../sceneScroll";
import { screenToFlowPosition, type GpuPoint } from "../viewportMath";
import {
  gpuFlowViewportStore,
  type GpuFlowViewportStoreApi,
} from "../viewportStore";
import { isGpuViewportWheelGestureActive } from "./wheelOwnership";

export type GpuSectionSceneScrollControllerOptions = {
  readonly disabled?:
    | ((event: KeyboardEvent | WheelEvent) => boolean)
    | undefined;
  readonly element: HTMLElement;
  readonly getKeyboardScrollParentSectionId?:
    | ((scene: GpuFlowScene, event: KeyboardEvent) => string | null)
    | undefined;
  readonly getScene: () => GpuFlowScene | undefined;
  readonly getScrollOffsets: () => GpuSectionSceneScrollOffsetMap;
  readonly onScrollOffsetsChange: (
    scrollOffsets: GpuSectionSceneScrollOffsetMap,
    result: GpuSectionSceneScrollResult,
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
    this.element.addEventListener("keydown", this.onKeyDown, {
      capture: true,
    });
    this.element.addEventListener("wheel", this.onWheel, {
      capture: true,
      passive: false,
    });
  }

  destroy() {
    this.element.removeEventListener("keydown", this.onKeyDown, {
      capture: true,
    });
    this.element.removeEventListener("wheel", this.onWheel, { capture: true });
  }

  private readonly onKeyDown = (event: KeyboardEvent) => {
    if (shouldSkipKeyboardScrollEvent(event, this.options.disabled)) {
      return;
    }
    const command = getKeyboardScrollCommand(event);
    if (!command) {
      return;
    }
    const scene = this.options.getScene();
    if (!scene) {
      return;
    }
    const parentSectionId =
      this.options.getKeyboardScrollParentSectionId?.(scene, event) ?? null;
    if (!parentSectionId) {
      return;
    }
    const scrollOffsets = this.options.getScrollOffsets();
    const resolveStartedAtMs = nowChromeReproPerformanceMs();
    const result = resolveGpuSectionSceneKeyboardScroll({
      command,
      parentSectionId,
      scene,
      scrollOffsets,
    });
    this.applyScrollResult(event, result, {
      inputKind: "keyboard",
      previousScrollOffsets: scrollOffsets,
      resolveDurationMs: nowChromeReproPerformanceMs() - resolveStartedAtMs,
      scene,
    });
  };

  private readonly onWheel = (event: WheelEvent) => {
    if (
      event.defaultPrevented ||
      event.ctrlKey ||
      this.options.disabled?.(event) ||
      isGpuViewportWheelGestureActive(this.store) ||
      shouldPreserveNativeWheelTarget(event)
    ) {
      return;
    }
    const scene = this.options.getScene();
    if (!scene) {
      return;
    }
    const scrollOffsets = this.options.getScrollOffsets();
    const resolveStartedAtMs = nowChromeReproPerformanceMs();
    const result = resolveGpuSectionSceneWheelScroll({
      event,
      point: getWheelFlowPoint(event, this.element, this.store),
      scene,
      scrollOffsets,
    });
    if (!result.handled) {
      return;
    }
    this.applyScrollResult(event, result, {
      consumeUnchanged: true,
      inputKind: "wheel",
      previousScrollOffsets: scrollOffsets,
      resolveDurationMs: nowChromeReproPerformanceMs() - resolveStartedAtMs,
      scene,
      wheel: {
        deltaMode: event.deltaMode,
        deltaX: event.deltaX,
        deltaY: event.deltaY,
        shiftKey: event.shiftKey,
      },
    });
  };

  private applyScrollResult(
    event: KeyboardEvent | WheelEvent,
    result: GpuSectionSceneScrollResult,
    options: {
      readonly consumeUnchanged?: boolean | undefined;
      readonly inputKind?: "keyboard" | "wheel" | undefined;
      readonly previousScrollOffsets?:
        | GpuSectionSceneScrollOffsetMap
        | undefined;
      readonly resolveDurationMs?: number | undefined;
      readonly scene?: GpuFlowScene | undefined;
      readonly wheel?:
        | {
            readonly deltaMode: number;
            readonly deltaX: number;
            readonly deltaY: number;
            readonly shiftKey: boolean;
          }
        | undefined;
    } = {},
  ) {
    if (!result.changed && !options.consumeUnchanged) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!result.changed) {
      this.postSectionSceneScrollChromeReproEvent({
        commitDurationMs: 0,
        options,
        requestFrame: false,
        result,
      });
      return;
    }
    const commitStartedAtMs = nowChromeReproPerformanceMs();
    this.options.onScrollOffsetsChange(result.scrollOffsets, result);
    const commitDurationMs = nowChromeReproPerformanceMs() - commitStartedAtMs;
    this.options.requestFrame?.("viewport");
    this.postSectionSceneScrollChromeReproEvent({
      commitDurationMs,
      options,
      requestFrame: true,
      result,
    });
  }

  private postSectionSceneScrollChromeReproEvent({
    commitDurationMs,
    options,
    requestFrame,
    result,
  }: {
    readonly commitDurationMs: number;
    readonly options: {
      readonly inputKind?: "keyboard" | "wheel" | undefined;
      readonly previousScrollOffsets?:
        | GpuSectionSceneScrollOffsetMap
        | undefined;
      readonly resolveDurationMs?: number | undefined;
      readonly scene?: GpuFlowScene | undefined;
      readonly wheel?:
        | {
            readonly deltaMode: number;
            readonly deltaX: number;
            readonly deltaY: number;
            readonly shiftKey: boolean;
          }
        | undefined;
    };
    readonly requestFrame: boolean;
    readonly result: GpuSectionSceneScrollResult;
  }) {
    if (!isChromeReproActive()) {
      return;
    }
    const parentSectionId = result.parentSectionId;
    const previousOffset =
      parentSectionId && options.scene
        ? options.previousScrollOffsets?.get(parentSectionId) ??
          getSectionSceneScrollOffset(options.scene, parentSectionId)
        : null;
    const nextOffset =
      parentSectionId && result.scrollOffsets.has(parentSectionId)
        ? result.scrollOffsets.get(parentSectionId) ?? null
        : null;
    postChromeReproEvent("gpu-flow-section-scene-scroll", {
      changed: result.changed,
      commitDurationMs: roundChromeReproMs(commitDurationMs),
      inputKind: options.inputKind ?? "unknown",
      nextOffset: nextOffset ? roundGpuPointForChromeRepro(nextOffset) : null,
      parentSectionId,
      previousOffset: previousOffset
        ? roundGpuPointForChromeRepro(previousOffset)
        : null,
      requestFrame,
      requestFrameReason: requestFrame ? "viewport" : null,
      resolveDurationMs:
        options.resolveDurationMs === undefined
          ? null
          : roundChromeReproMs(options.resolveDurationMs),
      scrollDelta:
        previousOffset && nextOffset
          ? {
              x: roundChromeReproMs(nextOffset.x - previousOffset.x),
              y: roundChromeReproMs(nextOffset.y - previousOffset.y),
            }
          : null,
      wheel: options.wheel
        ? {
            deltaMode: options.wheel.deltaMode,
            deltaX: roundChromeReproMs(options.wheel.deltaX),
            deltaY: roundChromeReproMs(options.wheel.deltaY),
            shiftKey: options.wheel.shiftKey,
          }
        : null,
    });
  }
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

function getSectionSceneScrollOffset(
  scene: GpuFlowScene,
  parentSectionId: string,
): GpuPoint {
  return (
    scene.sections.find((section) => section.sectionId === parentSectionId)
      ?.scrollOffset ?? { x: 0, y: 0 }
  );
}

function roundGpuPointForChromeRepro(point: GpuPoint): GpuPoint {
  return {
    x: roundChromeReproMs(point.x),
    y: roundChromeReproMs(point.y),
  };
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

function shouldSkipKeyboardScrollEvent(
  event: KeyboardEvent,
  disabled: ((event: KeyboardEvent | WheelEvent) => boolean) | undefined,
): boolean {
  return (
    event.defaultPrevented ||
    hasKeyboardScrollModifier(event) ||
    Boolean(disabled?.(event)) ||
    shouldPreserveNativeKeyboardTarget(event)
  );
}

function hasKeyboardScrollModifier(
  event: Pick<KeyboardEvent, "altKey" | "ctrlKey" | "metaKey">,
): boolean {
  return event.altKey || event.ctrlKey || event.metaKey;
}

function shouldPreserveNativeKeyboardTarget(event: KeyboardEvent): boolean {
  const target = event.target;
  if (!(target instanceof Element)) {
    return false;
  }
  return Boolean(
    target.closest(
      [
        "input",
        "select",
        "textarea",
        '[contenteditable=""]',
        '[contenteditable="true"]',
      ].join(", "),
    ),
  );
}

function getKeyboardScrollCommand(
  event: Pick<KeyboardEvent, "key" | "shiftKey">,
): GpuSectionSceneKeyboardScrollCommand | null {
  if (event.key === "PageDown") {
    return "page-forward";
  }
  if (event.key === "PageUp") {
    return "page-backward";
  }
  if (event.key === "Home" && event.shiftKey) {
    return "start";
  }
  if (event.key === "End" && event.shiftKey) {
    return "end";
  }
  return null;
}
