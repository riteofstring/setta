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
import {
  getGpuWheelGestureOwnershipArbiter,
  isGpuViewportWheelGestureActive,
  type GpuWheelGestureOwnershipArbiter,
} from "./wheelOwnership";

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

type GpuSectionSceneWheelMetrics = {
  readonly deltaMode: number;
  readonly deltaX: number;
  readonly deltaY: number;
  readonly shiftKey: boolean;
};

type GpuSectionSceneScrollTelemetry = {
  readonly consumeUnchanged?: boolean | undefined;
  readonly inputKind?: "keyboard" | "wheel" | undefined;
  readonly previousScrollOffsets?: GpuSectionSceneScrollOffsetMap | undefined;
  readonly resolveDurationMs?: number | undefined;
  readonly scene?: GpuFlowScene | undefined;
  readonly wheel?: GpuSectionSceneWheelMetrics | undefined;
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
  private readonly wheelOwnership: GpuWheelGestureOwnershipArbiter;

  constructor(options: GpuSectionSceneScrollControllerOptions) {
    this.element = options.element;
    this.options = options;
    this.store = options.store ?? gpuFlowViewportStore;
    this.wheelOwnership = getGpuWheelGestureOwnershipArbiter(this.store);
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
    this.wheelOwnership.releaseOwner(
      "ownedByRetainedSectionScroll",
      "section-scene-scroll-controller-destroyed",
    );
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
      shouldSkipSectionSceneWheelEvent(event, this.options.disabled, this.store)
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
    if (!this.claimWheelOwnership()) {
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
    options: GpuSectionSceneScrollTelemetry = {},
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
    readonly options: GpuSectionSceneScrollTelemetry;
    readonly requestFrame: boolean;
    readonly result: GpuSectionSceneScrollResult;
  }) {
    if (!isChromeReproActive()) {
      return;
    }
    postChromeReproEvent(
      "gpu-flow-section-scene-scroll",
      createSectionSceneScrollChromeReproPayload({
        commitDurationMs,
        options,
        requestFrame,
        result,
      }),
    );
  }

  private claimWheelOwnership(): boolean {
    const ownership = this.wheelOwnership.resolveOwner({
      candidateOwner: "ownedByRetainedSectionScroll",
      reason: "section-scene-wheel",
    });
    return ownership.owner === "ownedByRetainedSectionScroll";
  }
}

function createSectionSceneScrollChromeReproPayload({
  commitDurationMs,
  options,
  requestFrame,
  result,
}: {
  readonly commitDurationMs: number;
  readonly options: GpuSectionSceneScrollTelemetry;
  readonly requestFrame: boolean;
  readonly result: GpuSectionSceneScrollResult;
}) {
  const offsets = resolveSectionSceneScrollChromeReproOffsets(result, options);
  return {
    changed: result.changed,
    commitDurationMs: roundChromeReproMs(commitDurationMs),
    inputKind: options.inputKind ?? "unknown",
    nextOffset: roundOptionalGpuPointForChromeRepro(offsets.nextOffset),
    parentSectionId: result.parentSectionId,
    previousOffset: roundOptionalGpuPointForChromeRepro(offsets.previousOffset),
    requestFrame,
    requestFrameReason: getSectionSceneScrollRequestFrameReason(requestFrame),
    resolveDurationMs: roundOptionalChromeReproMs(options.resolveDurationMs),
    scrollDelta: getSectionSceneScrollDeltaForChromeRepro(offsets),
    wheel: roundSectionSceneWheelForChromeRepro(options.wheel),
  };
}

function resolveSectionSceneScrollChromeReproOffsets(
  result: GpuSectionSceneScrollResult,
  options: GpuSectionSceneScrollTelemetry,
): {
  readonly nextOffset: GpuPoint | null;
  readonly previousOffset: GpuPoint | null;
} {
  const parentSectionId = result.parentSectionId;
  if (!parentSectionId) {
    return { nextOffset: null, previousOffset: null };
  }
  return {
    nextOffset: result.scrollOffsets.get(parentSectionId) ?? null,
    previousOffset: resolvePreviousSectionSceneScrollOffset(
      parentSectionId,
      options,
    ),
  };
}

function resolvePreviousSectionSceneScrollOffset(
  parentSectionId: string,
  options: GpuSectionSceneScrollTelemetry,
): GpuPoint | null {
  if (!options.scene) {
    return null;
  }
  return (
    options.previousScrollOffsets?.get(parentSectionId) ??
    getSectionSceneScrollOffset(options.scene, parentSectionId)
  );
}

function getSectionSceneScrollDeltaForChromeRepro({
  nextOffset,
  previousOffset,
}: {
  readonly nextOffset: GpuPoint | null;
  readonly previousOffset: GpuPoint | null;
}) {
  if (!previousOffset || !nextOffset) {
    return null;
  }
  return {
    x: roundChromeReproMs(nextOffset.x - previousOffset.x),
    y: roundChromeReproMs(nextOffset.y - previousOffset.y),
  };
}

function roundSectionSceneWheelForChromeRepro(
  wheel: GpuSectionSceneWheelMetrics | undefined,
) {
  if (!wheel) {
    return null;
  }
  return {
    deltaMode: wheel.deltaMode,
    deltaX: roundChromeReproMs(wheel.deltaX),
    deltaY: roundChromeReproMs(wheel.deltaY),
    shiftKey: wheel.shiftKey,
  };
}

function getSectionSceneScrollRequestFrameReason(
  requestFrame: boolean,
): GpuFrameReason | null {
  return requestFrame ? "viewport" : null;
}

function roundOptionalChromeReproMs(value: number | undefined): number | null {
  if (value === undefined) {
    return null;
  }
  return roundChromeReproMs(value);
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

function roundOptionalGpuPointForChromeRepro(
  point: GpuPoint | null,
): GpuPoint | null {
  if (!point) {
    return null;
  }
  return roundGpuPointForChromeRepro(point);
}

function shouldSkipSectionSceneWheelEvent(
  event: WheelEvent,
  disabled: ((event: KeyboardEvent | WheelEvent) => boolean) | undefined,
  store: GpuFlowViewportStoreApi,
): boolean {
  return (
    event.defaultPrevented ||
    event.ctrlKey ||
    Boolean(disabled?.(event)) ||
    isGpuViewportWheelGestureActive(store) ||
    shouldPreserveNativeWheelTarget(event)
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
