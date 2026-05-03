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

export type GpuRetainedContentInteractionControllerOptions = {
  readonly disabled?: boolean | (() => boolean) | undefined;
  readonly element: HTMLElement;
  readonly getScene: () => GpuFlowScene | undefined;
  readonly onHitClick?:
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
  readonly store?: GpuFlowViewportStoreApi | undefined;
};

type ActiveRetainedContentPointer = {
  readonly hitId: string;
  readonly pointerId: number;
  readonly startClientX: number;
  readonly startClientY: number;
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
      hitId: hit.hit.id,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
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
        this.element.releasePointerCapture?.(event.pointerId);
        this.activePointer = null;
      }
      return;
    }
    const hit = this.hitTestEvent(event);
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
  };

  private readonly onPointerCancel = (event: PointerEvent) => {
    const activePointer = this.activePointer;
    if (!activePointer || activePointer.pointerId !== event.pointerId) {
      return;
    }
    preventRetainedContentEvent(event);
    this.element.releasePointerCapture?.(event.pointerId);
    this.activePointer = null;
  };

  private readonly onPointerLeave = () => {
    this.clearHover();
  };

  private hitTestEvent(
    event: Pick<PointerEvent, "clientX" | "clientY" | "target">,
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
    if (!hit || this.options.shouldHandleHit?.(hit) === false) {
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
