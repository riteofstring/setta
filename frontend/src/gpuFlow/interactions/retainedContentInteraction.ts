import { NO_PAN_CLASS_NAME } from "utils/constants";
import type { GpuFrameReason } from "../gpuRenderer";
import {
  hitTestGpuRetainedContentScene,
  type GpuRetainedContentHitTarget,
} from "../retainedContentHitTest";
import type { GpuFlowScene } from "../scene";
import { screenToFlowPosition, type GpuPoint } from "../viewportMath";
import {
  gpuFlowViewportStore,
  type GpuFlowViewportStoreApi,
} from "../viewportStore";

export type GpuRetainedContentInteractionHit = GpuRetainedContentHitTarget & {
  readonly screenPoint: GpuPoint;
};

export type GpuRetainedContentInteractionEvent<
  NativeEvent extends PointerEvent = PointerEvent,
> = GpuRetainedContentInteractionHit & {
  readonly nativeEvent: NativeEvent;
};

export type GpuRetainedContentDragEvent<
  NativeEvent extends PointerEvent = PointerEvent,
> = {
  readonly activeHit: GpuRetainedContentInteractionHit;
  readonly hit: GpuRetainedContentInteractionHit | null;
  readonly nativeEvent: NativeEvent;
  readonly screenPoint: GpuPoint;
};

export type GpuRetainedContentDragCancelEvent<
  NativeEvent extends PointerEvent = PointerEvent,
> = {
  readonly activeHit: GpuRetainedContentInteractionHit;
  readonly nativeEvent: NativeEvent;
};

export type GpuRetainedContentInteractionControllerOptions = {
  readonly disabled?: boolean | (() => boolean) | undefined;
  readonly dragThresholdPx?: number | undefined;
  readonly element: HTMLElement;
  readonly getScene: () => GpuFlowScene | undefined;
  readonly onHitClick?:
    | ((event: GpuRetainedContentInteractionEvent) => void)
    | undefined;
  readonly onHitDragCancel?:
    | ((event: GpuRetainedContentDragCancelEvent) => void)
    | undefined;
  readonly onHitDragEnd?:
    | ((event: GpuRetainedContentDragEvent) => void)
    | undefined;
  readonly onHitDragMove?:
    | ((event: GpuRetainedContentDragEvent) => void)
    | undefined;
  readonly onHitDragStart?:
    | ((event: GpuRetainedContentInteractionEvent) => void)
    | undefined;
  readonly onHitPointerDown?:
    | ((event: GpuRetainedContentInteractionEvent) => void)
    | undefined;
  readonly onHitPointerLeave?: (() => void) | undefined;
  readonly onHitPointerMove?:
    | ((event: {
        readonly hit: GpuRetainedContentInteractionHit | null;
        readonly nativeEvent: PointerEvent;
      }) => void)
    | undefined;
  readonly requestFrame?: ((reason: GpuFrameReason) => void) | undefined;
  readonly shouldHandleHit?:
    | ((hit: GpuRetainedContentInteractionHit) => boolean)
    | undefined;
  readonly shouldHandleDragMoveHit?:
    | ((hit: GpuRetainedContentInteractionHit) => boolean)
    | undefined;
  readonly shouldHandlePointerMoveHit?:
    | ((hit: GpuRetainedContentInteractionHit) => boolean)
    | undefined;
  readonly shouldStartDrag?:
    | ((hit: GpuRetainedContentInteractionHit) => boolean)
    | undefined;
  readonly store?: GpuFlowViewportStoreApi | undefined;
};

type ActiveRetainedContentPointer = {
  readonly dragging: boolean;
  readonly hitId: string;
  readonly pointerId: number;
  readonly startClientX: number;
  readonly startClientY: number;
  readonly startHit: GpuRetainedContentInteractionHit;
  readonly surfaceId: string;
};

const MAX_RETAINED_CONTENT_CLICK_DRAG_DISTANCE_PX = 4;

export function attachGpuRetainedContentInteractionController(
  options: GpuRetainedContentInteractionControllerOptions,
): () => void {
  const controller = new GpuRetainedContentInteractionController(options);
  controller.attach();
  return () => controller.destroy();
}

export function hitTestGpuRetainedContentInteraction({
  element,
  event,
  getScene,
  store = gpuFlowViewportStore,
}: {
  readonly element?: HTMLElement | undefined;
  readonly event: Pick<PointerEvent, "clientX" | "clientY">;
  readonly getScene: () => GpuFlowScene | undefined;
  readonly store?: GpuFlowViewportStoreApi | undefined;
}): GpuRetainedContentInteractionHit | null {
  const scene = getScene();
  const domNode = element ?? store.getState().domNode;
  if (!scene || !domNode) {
    return null;
  }
  const screenPoint = getEventPointRelativeToElement(event, domNode);
  const flowPoint = screenToFlowPosition(
    screenPoint,
    store.getState().transform,
  );
  const hit = hitTestGpuRetainedContentScene({ point: flowPoint, scene });
  return hit ? { ...hit, screenPoint } : null;
}

class GpuRetainedContentInteractionController {
  private activePointer: ActiveRetainedContentPointer | null = null;
  private hoveredHitKey: string | null = null;
  private readonly element: HTMLElement;
  private readonly options: GpuRetainedContentInteractionControllerOptions;
  private readonly store: GpuFlowViewportStoreApi;

  constructor(options: GpuRetainedContentInteractionControllerOptions) {
    this.element = options.element;
    this.options = options;
    this.store = options.store ?? gpuFlowViewportStore;
  }

  attach() {
    this.element.addEventListener("pointerdown", this.onPointerDown, {
      capture: true,
    });
    this.element.addEventListener("pointermove", this.onPointerMove, {
      capture: true,
    });
    this.element.addEventListener("pointerup", this.onPointerUp, {
      capture: true,
    });
    this.element.addEventListener("pointercancel", this.onPointerCancel, {
      capture: true,
    });
    this.element.addEventListener("pointerleave", this.onPointerLeave, {
      capture: true,
    });
  }

  destroy() {
    this.element.removeEventListener("pointerdown", this.onPointerDown, true);
    this.element.removeEventListener("pointermove", this.onPointerMove, true);
    this.element.removeEventListener("pointerup", this.onPointerUp, true);
    this.element.removeEventListener(
      "pointercancel",
      this.onPointerCancel,
      true,
    );
    this.element.removeEventListener("pointerleave", this.onPointerLeave, true);
    this.activePointer = null;
    this.clearHover();
  }

  private readonly onPointerDown = (event: PointerEvent) => {
    const hit = this.hitTestEvent(event);
    if (!hit) {
      return;
    }
    if (event.button !== 0) {
      stopRetainedContentEvent(event);
      return;
    }
    preventRetainedContentEvent(event);
    this.activePointer = {
      dragging: false,
      hitId: hit.hit.id,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startHit: hit,
      surfaceId: hit.surfaceId,
    };
    this.element.setPointerCapture?.(event.pointerId);
    this.options.onHitPointerDown?.({ ...hit, nativeEvent: event });
  };

  private readonly onPointerMove = (event: PointerEvent) => {
    const activePointer = this.activePointer;
    if (activePointer && activePointer.pointerId === event.pointerId) {
      preventRetainedContentEvent(event);
      if (isRetainedContentInteractionDisabled(this.options.disabled)) {
        this.cancelActivePointer(event);
        return;
      }
      this.updateActivePointerDrag(event, activePointer);
      return;
    }
    const hit = this.hitTestEvent(
      event,
      this.options.shouldHandlePointerMoveHit ?? this.options.shouldHandleHit,
    );
    const nextHoveredHitKey = hit ? getRetainedContentHitKey(hit) : null;
    if (this.hoveredHitKey === nextHoveredHitKey) {
      return;
    }
    this.hoveredHitKey = nextHoveredHitKey;
    this.options.onHitPointerMove?.({ hit, nativeEvent: event });
  };

  private readonly onPointerUp = (event: PointerEvent) => {
    const activePointer = this.activePointer;
    if (!isEventForActiveRetainedContentPointer(activePointer, event)) {
      return;
    }
    preventRetainedContentEvent(event);
    this.element.releasePointerCapture?.(event.pointerId);
    this.activePointer = null;
    if (activePointer.dragging) {
      this.emitActivePointerDragEnd(event, activePointer);
      return;
    }
    this.emitActivePointerClick(event, activePointer);
  };

  private readonly onPointerCancel = (event: PointerEvent) => {
    const activePointer = this.activePointer;
    if (!activePointer || activePointer.pointerId !== event.pointerId) {
      return;
    }
    preventRetainedContentEvent(event);
    this.cancelActivePointer(event);
  };

  private readonly onPointerLeave = () => {
    this.clearHover();
  };

  private hitTestEvent(
    event: Pick<PointerEvent, "clientX" | "clientY" | "target">,
    hitFilter:
      | ((hit: GpuRetainedContentInteractionHit) => boolean)
      | undefined = this.options.shouldHandleHit,
  ): GpuRetainedContentInteractionHit | null {
    if (
      isRetainedContentInteractionDisabled(this.options.disabled) ||
      shouldPreserveNativeTarget(event)
    ) {
      return null;
    }
    const hit = hitTestGpuRetainedContentInteraction({
      element: this.element,
      event,
      getScene: this.options.getScene,
      store: this.store,
    });
    if (!hit || hitFilter?.(hit) === false) {
      return null;
    }
    return hit;
  }

  private clearHover() {
    if (!this.hoveredHitKey) {
      return;
    }
    this.hoveredHitKey = null;
    this.options.onHitPointerLeave?.();
  }

  private updateActivePointerDrag(
    event: PointerEvent,
    activePointer: ActiveRetainedContentPointer,
  ) {
    let nextActivePointer = activePointer;
    if (!activePointer.dragging) {
      if (!shouldStartRetainedContentDrag(this.options, activePointer, event)) {
        return;
      }
      nextActivePointer = {
        ...activePointer,
        dragging: true,
      };
      this.activePointer = nextActivePointer;
      this.options.onHitDragStart?.({
        ...activePointer.startHit,
        nativeEvent: event,
      });
    }

    this.options.onHitDragMove?.({
      activeHit: nextActivePointer.startHit,
      hit: this.hitTestEvent(event, this.getDragMoveHitFilter()),
      nativeEvent: event,
      screenPoint: getEventPointRelativeToElement(event, this.element),
    });
    this.options.requestFrame?.("manual");
  }

  private cancelActivePointer(event: PointerEvent) {
    const activePointer = this.activePointer;
    this.element.releasePointerCapture?.(event.pointerId);
    this.activePointer = null;
    if (!activePointer?.dragging) {
      return;
    }
    this.options.onHitDragCancel?.({
      activeHit: activePointer.startHit,
      nativeEvent: event,
    });
    this.options.requestFrame?.("manual");
  }

  private getDragMoveHitFilter() {
    return (
      this.options.shouldHandleDragMoveHit ??
      this.options.shouldHandlePointerMoveHit ??
      this.options.shouldHandleHit
    );
  }

  private emitActivePointerDragEnd(
    event: PointerEvent,
    activePointer: ActiveRetainedContentPointer,
  ) {
    this.options.onHitDragEnd?.({
      activeHit: activePointer.startHit,
      hit: this.hitTestEvent(event, this.getDragMoveHitFilter()),
      nativeEvent: event,
      screenPoint: getEventPointRelativeToElement(event, this.element),
    });
    this.options.requestFrame?.("manual");
  }

  private emitActivePointerClick(
    event: PointerEvent,
    activePointer: ActiveRetainedContentPointer,
  ) {
    if (
      !shouldEmitRetainedContentClick(
        this.options.disabled,
        activePointer,
        event,
      )
    ) {
      return;
    }
    const hit = this.hitTestEvent(event);
    if (!isRetainedContentActivePointerHit(activePointer, hit)) {
      return;
    }
    this.options.onHitClick?.({ ...hit, nativeEvent: event });
    this.options.requestFrame?.("manual");
  }
}

function getRetainedContentHitKey(
  hit: Pick<GpuRetainedContentInteractionHit, "hit" | "surfaceId">,
): string {
  return `${hit.surfaceId}:${hit.hit.id}`;
}

function isEventForActiveRetainedContentPointer(
  activePointer: ActiveRetainedContentPointer | null,
  event: Pick<PointerEvent, "pointerId">,
): activePointer is ActiveRetainedContentPointer {
  return Boolean(activePointer && activePointer.pointerId === event.pointerId);
}

function shouldEmitRetainedContentClick(
  disabled: boolean | (() => boolean) | undefined,
  activePointer: ActiveRetainedContentPointer,
  event: Pick<PointerEvent, "clientX" | "clientY">,
): boolean {
  return (
    !isRetainedContentInteractionDisabled(disabled) &&
    isRetainedContentClickDistance(activePointer, event)
  );
}

function isRetainedContentActivePointerHit(
  activePointer: Pick<ActiveRetainedContentPointer, "hitId" | "surfaceId">,
  hit: GpuRetainedContentInteractionHit | null,
): hit is GpuRetainedContentInteractionHit {
  return Boolean(
    hit &&
      hit.surfaceId === activePointer.surfaceId &&
      hit.hit.id === activePointer.hitId,
  );
}

function isRetainedContentClickDistance(
  activePointer: Pick<
    ActiveRetainedContentPointer,
    "startClientX" | "startClientY"
  >,
  event: Pick<PointerEvent, "clientX" | "clientY">,
): boolean {
  return (
    Math.hypot(
      event.clientX - activePointer.startClientX,
      event.clientY - activePointer.startClientY,
    ) <= MAX_RETAINED_CONTENT_CLICK_DRAG_DISTANCE_PX
  );
}

function shouldStartRetainedContentDrag(
  options: GpuRetainedContentInteractionControllerOptions,
  activePointer: ActiveRetainedContentPointer,
  event: Pick<PointerEvent, "clientX" | "clientY">,
): boolean {
  if (
    !options.onHitDragStart &&
    !options.onHitDragMove &&
    !options.onHitDragEnd
  ) {
    return false;
  }
  if (options.shouldStartDrag?.(activePointer.startHit) === false) {
    return false;
  }
  return (
    Math.hypot(
      event.clientX - activePointer.startClientX,
      event.clientY - activePointer.startClientY,
    ) > (options.dragThresholdPx ?? MAX_RETAINED_CONTENT_CLICK_DRAG_DISTANCE_PX)
  );
}

function isRetainedContentInteractionDisabled(
  disabled: boolean | (() => boolean) | undefined,
): boolean {
  return typeof disabled === "function" ? disabled() : Boolean(disabled);
}

function getEventPointRelativeToElement(
  event: Pick<PointerEvent, "clientX" | "clientY">,
  element: HTMLElement,
): GpuPoint {
  const rect = element.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

function shouldPreserveNativeTarget(
  event: Pick<PointerEvent, "target">,
): boolean {
  const target = event.target;
  if (!(target instanceof Element)) {
    return false;
  }
  return Boolean(
    target.closest(
      [
        `.${NO_PAN_CLASS_NAME}`,
        '[data-gpu-flow-retained-content-native="true"]',
        "button",
        "input",
        "select",
        "textarea",
        '[contenteditable=""]',
        '[contenteditable="true"]',
      ].join(", "),
    ),
  );
}

function preventRetainedContentEvent(event: PointerEvent) {
  event.preventDefault();
  event.stopImmediatePropagation();
}

function stopRetainedContentEvent(event: PointerEvent) {
  event.stopImmediatePropagation();
}
