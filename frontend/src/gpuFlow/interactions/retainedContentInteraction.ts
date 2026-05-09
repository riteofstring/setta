import type { GpuFrameReason } from "../gpuRenderer";
import {
  recordGpuFlowPointerDiagnostics,
  toGpuFlowRetainedHitDiagnostics,
  type MutableGpuFlowInteractionDiagnostics,
} from "../interactionDiagnostics";
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

type GpuRetainedContentPointerMissEvent<
  NativeEvent extends PointerEvent = PointerEvent,
> = {
  readonly nativeEvent: NativeEvent;
  readonly screenPoint: GpuPoint;
};

export type GpuRetainedContentDragEvent<
  NativeEvent extends PointerEvent = PointerEvent,
> = {
  readonly activeHit: GpuRetainedContentInteractionHit;
  readonly flowPoint: GpuPoint;
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

export type GpuRetainedContentInteractionDiagnosticsRef = {
  readonly current: MutableGpuFlowInteractionDiagnostics;
};

export type GpuRetainedContentInteractionControllerOptions = {
  readonly disabled?: boolean | (() => boolean) | undefined;
  readonly dragThresholdPx?: number | undefined;
  readonly element: HTMLElement;
  readonly getScene: () => GpuFlowScene | undefined;
  readonly interactionDiagnostics?:
    | GpuRetainedContentInteractionDiagnosticsRef
    | undefined;
  readonly onHitClick?:
    | ((event: GpuRetainedContentInteractionEvent) => void)
    | undefined;
  readonly onHitDragCancel?:
    | ((event: GpuRetainedContentDragCancelEvent) => void)
    | undefined;
  readonly onHitDragEnd?:
    | ((event: GpuRetainedContentDragEvent) => void)
    | undefined;
  readonly onHitDragFrame?:
    | ((event: GpuRetainedContentDragEvent) => boolean | void)
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
  readonly onPointerDownMiss?:
    | ((event: GpuRetainedContentPointerMissEvent) => void)
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
  readonly lastNativeEvent: PointerEvent;
};

type SuppressedRetainedContentClick = {
  readonly clientX: number;
  readonly clientY: number;
};

const MAX_RETAINED_CONTENT_CLICK_DRAG_DISTANCE_PX = 4;
export const GPU_RETAINED_CONTENT_NATIVE_TARGET_SELECTORS = [
  '[data-gpu-flow-dom-island="true"]',
  '[data-gpu-flow-retained-content-native="true"]',
] as const;

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
  private dragAnimationFrame: number | null = null;
  private hoveredHitKey: string | null = null;
  private suppressNextClick: SuppressedRetainedContentClick | null = null;
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
    this.element.addEventListener(
      "lostpointercapture",
      this.onLostPointerCapture,
      { capture: true },
    );
    this.element.addEventListener("pointerleave", this.onPointerLeave, {
      capture: true,
    });
    this.element.addEventListener("click", this.onClick, {
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
    this.element.removeEventListener(
      "lostpointercapture",
      this.onLostPointerCapture,
      true,
    );
    this.element.removeEventListener("pointerleave", this.onPointerLeave, true);
    this.element.removeEventListener("click", this.onClick, true);
    this.activePointer = null;
    this.suppressNextClick = null;
    this.cancelDragFrameLoop();
    this.clearHover();
    this.clearInteractionDiagnostics();
  }

  private readonly onPointerDown = (event: PointerEvent) => {
    this.recordPointerDiagnostics(event);
    if (this.shouldSkipPointerEvent(event)) {
      return;
    }
    const hit = this.hitTestEvent(event);
    if (!hit) {
      this.options.onPointerDownMiss?.({
        nativeEvent: event,
        screenPoint: getEventPointRelativeToElement(event, this.element),
      });
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
      lastNativeEvent: event,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startHit: hit,
      surfaceId: hit.surfaceId,
    };
    this.element.setPointerCapture?.(event.pointerId);
    this.setPointerCaptureDiagnostics(
      event.pointerId,
      this.element.hasPointerCapture?.(event.pointerId) ?? true,
    );
    this.setActiveRetainedHitDiagnostics(hit, event.pointerId, false);
    this.options.onHitPointerDown?.({ ...hit, nativeEvent: event });
  };

  private readonly onPointerMove = (event: PointerEvent) => {
    this.recordPointerDiagnostics(event);
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
    this.setHoveredRetainedHitDiagnostics(hit);
    this.options.onHitPointerMove?.({ hit, nativeEvent: event });
  };

  private readonly onPointerUp = (event: PointerEvent) => {
    this.recordPointerDiagnostics(event);
    const activePointer = this.activePointer;
    if (!isEventForActiveRetainedContentPointer(activePointer, event)) {
      return;
    }
    preventRetainedContentEvent(event);
    this.releasePointerCapture(event.pointerId);
    this.clearPointerCaptureDiagnostics(event.pointerId);
    this.clearActiveRetainedHitDiagnostics(event.pointerId);
    this.activePointer = null;
    this.cancelDragFrameLoop();
    if (activePointer.dragging) {
      this.emitActivePointerDragEnd(event, activePointer);
      return;
    }
    this.emitActivePointerClick(event, activePointer);
  };

  private readonly onPointerCancel = (event: PointerEvent) => {
    this.recordPointerDiagnostics(event);
    const activePointer = this.activePointer;
    if (!activePointer || activePointer.pointerId !== event.pointerId) {
      return;
    }
    preventRetainedContentEvent(event);
    this.cancelActivePointer(event);
  };

  private readonly onLostPointerCapture = (event: PointerEvent) => {
    this.recordPointerDiagnostics(event);
    const activePointer = this.activePointer;
    if (!activePointer || activePointer.pointerId !== event.pointerId) {
      return;
    }
    this.clearPointerCaptureDiagnostics(event.pointerId);
    this.cancelActivePointer(event, { releaseCapture: false });
  };

  private readonly onPointerLeave = (event: PointerEvent) => {
    this.recordPointerDiagnostics(event);
    this.clearHover();
  };

  private readonly onClick = (event: MouseEvent) => {
    const suppressedClick = this.suppressNextClick;
    if (!suppressedClick) {
      return;
    }
    this.suppressNextClick = null;
    if (!isSuppressedRetainedContentClickEvent(suppressedClick, event)) {
      return;
    }
    preventRetainedContentFollowUpClickEvent(event);
  };

  private hitTestEvent(
    event: Pick<PointerEvent, "clientX" | "clientY" | "target">,
    hitFilter:
      | ((hit: GpuRetainedContentInteractionHit) => boolean)
      | undefined = this.options.shouldHandleHit,
  ): GpuRetainedContentInteractionHit | null {
    if (this.shouldSkipPointerEvent(event)) {
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

  private shouldSkipPointerEvent(event: Pick<PointerEvent, "target">): boolean {
    return (
      isRetainedContentInteractionDisabled(this.options.disabled) ||
      shouldPreserveGpuRetainedContentNativeTarget(event)
    );
  }

  private clearHover() {
    if (!this.hoveredHitKey) {
      return;
    }
    this.hoveredHitKey = null;
    this.setHoveredRetainedHitDiagnostics(null);
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
        lastNativeEvent: event,
      };
      this.activePointer = nextActivePointer;
      this.setActiveRetainedPointerDragging(activePointer.pointerId, true);
      this.options.onHitDragStart?.({
        ...activePointer.startHit,
        nativeEvent: event,
      });
      this.startDragFrameLoop();
    } else {
      nextActivePointer = {
        ...activePointer,
        lastNativeEvent: event,
      };
      this.activePointer = nextActivePointer;
    }

    this.options.onHitDragMove?.(
      this.createActivePointerDragEvent(event, nextActivePointer),
    );
    this.options.requestFrame?.("manual");
  }

  private cancelActivePointer(
    event: PointerEvent,
    options?: { readonly releaseCapture?: boolean },
  ) {
    const activePointer = this.activePointer;
    if (options?.releaseCapture !== false) {
      this.releasePointerCapture(event.pointerId);
      this.clearPointerCaptureDiagnostics(event.pointerId);
    }
    this.clearActiveRetainedHitDiagnostics(event.pointerId);
    this.activePointer = null;
    this.cancelDragFrameLoop();
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
    this.options.onHitDragEnd?.(
      this.createActivePointerDragEvent(event, activePointer),
    );
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
    this.suppressNextClick = {
      clientX: event.clientX,
      clientY: event.clientY,
    };
    const hit = this.hitTestEvent(event);
    if (!isRetainedContentActivePointerHit(activePointer, hit)) {
      return;
    }
    this.options.onHitClick?.({ ...hit, nativeEvent: event });
    this.options.requestFrame?.("manual");
  }

  private createActivePointerDragEvent(
    event: PointerEvent,
    activePointer: ActiveRetainedContentPointer,
  ): GpuRetainedContentDragEvent {
    const screenPoint = getEventPointRelativeToElement(event, this.element);
    return {
      activeHit: activePointer.startHit,
      flowPoint: screenToFlowPosition(
        screenPoint,
        this.store.getState().transform,
      ),
      hit: this.hitTestEvent(event, this.getDragMoveHitFilter()),
      nativeEvent: event,
      screenPoint,
    };
  }

  private startDragFrameLoop() {
    if (!this.options.onHitDragFrame || this.dragAnimationFrame !== null) {
      return;
    }
    this.dragAnimationFrame = requestAnimationFrame(this.runDragFrame);
  }

  private readonly runDragFrame = () => {
    this.dragAnimationFrame = null;
    const activePointer = this.activePointer;
    if (!activePointer?.dragging) {
      return;
    }
    if (isRetainedContentInteractionDisabled(this.options.disabled)) {
      this.cancelActivePointer(activePointer.lastNativeEvent);
      return;
    }
    const changed = this.options.onHitDragFrame?.(
      this.createActivePointerDragEvent(
        activePointer.lastNativeEvent,
        activePointer,
      ),
    );
    if (changed) {
      this.options.requestFrame?.("manual");
    }
    this.startDragFrameLoop();
  };

  private cancelDragFrameLoop() {
    if (this.dragAnimationFrame === null) {
      return;
    }
    cancelAnimationFrame(this.dragAnimationFrame);
    this.dragAnimationFrame = null;
  }

  private releasePointerCapture(pointerId: number) {
    if (this.element.hasPointerCapture?.(pointerId)) {
      this.element.releasePointerCapture?.(pointerId);
    }
  }

  private recordPointerDiagnostics(event: PointerEvent) {
    const diagnostics = this.options.interactionDiagnostics?.current;
    if (!diagnostics) {
      return;
    }
    recordGpuFlowPointerDiagnostics({
      diagnostics,
      element: this.element,
      event,
    });
  }

  private setActiveRetainedHitDiagnostics(
    hit: GpuRetainedContentInteractionHit,
    pointerId: number,
    dragging: boolean,
  ) {
    const diagnostics = this.options.interactionDiagnostics?.current;
    if (!diagnostics) {
      return;
    }
    diagnostics.activeRetainedHit = toGpuFlowRetainedHitDiagnostics(hit);
    diagnostics.activeRetainedPointerDragging = dragging;
    diagnostics.activeRetainedPointerId = pointerId;
  }

  private setActiveRetainedPointerDragging(
    pointerId: number,
    dragging: boolean,
  ) {
    const diagnostics = this.options.interactionDiagnostics?.current;
    if (!diagnostics || diagnostics.activeRetainedPointerId !== pointerId) {
      return;
    }
    diagnostics.activeRetainedPointerDragging = dragging;
  }

  private clearActiveRetainedHitDiagnostics(pointerId: number) {
    const diagnostics = this.options.interactionDiagnostics?.current;
    if (!diagnostics || diagnostics.activeRetainedPointerId !== pointerId) {
      return;
    }
    diagnostics.activeRetainedHit = null;
    diagnostics.activeRetainedPointerDragging = false;
    diagnostics.activeRetainedPointerId = null;
  }

  private setHoveredRetainedHitDiagnostics(
    hit: GpuRetainedContentInteractionHit | null,
  ) {
    const diagnostics = this.options.interactionDiagnostics?.current;
    if (!diagnostics) {
      return;
    }
    diagnostics.hoveredRetainedHit = toGpuFlowRetainedHitDiagnostics(hit);
  }

  private setPointerCaptureDiagnostics(pointerId: number, active: boolean) {
    const diagnostics = this.options.interactionDiagnostics?.current;
    if (!diagnostics) {
      return;
    }
    diagnostics.pointerCapture = { active, pointerId };
  }

  private clearPointerCaptureDiagnostics(pointerId: number) {
    const diagnostics = this.options.interactionDiagnostics?.current;
    if (!diagnostics || diagnostics.pointerCapture?.pointerId !== pointerId) {
      return;
    }
    diagnostics.pointerCapture = { active: false, pointerId };
  }

  private clearInteractionDiagnostics() {
    const diagnostics = this.options.interactionDiagnostics?.current;
    if (!diagnostics) {
      return;
    }
    diagnostics.activeRetainedHit = null;
    diagnostics.activeRetainedPointerDragging = false;
    diagnostics.activeRetainedPointerId = null;
    diagnostics.hoveredRetainedHit = null;
    diagnostics.pointerCapture = null;
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

function isSuppressedRetainedContentClickEvent(
  suppressedClick: SuppressedRetainedContentClick,
  event: Pick<MouseEvent, "clientX" | "clientY">,
): boolean {
  return isRetainedContentClickDistance(
    {
      startClientX: suppressedClick.clientX,
      startClientY: suppressedClick.clientY,
    },
    event,
  );
}

function shouldStartRetainedContentDrag(
  options: GpuRetainedContentInteractionControllerOptions,
  activePointer: ActiveRetainedContentPointer,
  event: Pick<PointerEvent, "clientX" | "clientY">,
): boolean {
  if (
    !options.onHitDragStart &&
    !options.onHitDragFrame &&
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

export function shouldPreserveGpuRetainedContentNativeTarget(
  event: Pick<PointerEvent, "target">,
): boolean {
  return isGpuRetainedContentNativeTarget(event.target);
}

export function isGpuRetainedContentNativeTarget(
  target: EventTarget | null,
  selectors: readonly string[] = GPU_RETAINED_CONTENT_NATIVE_TARGET_SELECTORS,
): boolean {
  if (!(target instanceof Element)) {
    return false;
  }
  return Boolean(target.closest(selectors.join(", ")));
}

function preventRetainedContentEvent(event: PointerEvent) {
  event.preventDefault();
  event.stopImmediatePropagation();
}

function preventRetainedContentFollowUpClickEvent(event: MouseEvent) {
  event.preventDefault();
  event.stopImmediatePropagation();
}

function stopRetainedContentEvent(event: PointerEvent) {
  event.stopImmediatePropagation();
}
