import type {
  GpuEdgeScene,
  GpuEdgeSceneHitTestResult,
} from "../edges/edgeSources";
import { hitTestGpuEdgeScene, type GpuEdgeFamily } from "../edges/edgeSources";
import {
  screenToFlowPosition,
  type GpuPoint,
  type GpuViewportInput,
} from "../viewportMath";
import {
  gpuFlowViewportStore,
  type GpuFlowViewportStoreApi,
} from "../viewportStore";

export type GpuEdgeInteractionHit = {
  readonly distance: number;
  readonly edgeId: string;
  readonly family: GpuEdgeFamily;
  readonly flowPoint: GpuPoint;
  readonly sceneEdgeId: string;
  readonly screenPoint: GpuPoint;
  readonly sourceEdgeId: string;
  readonly zIndex: number;
};

export type GpuEdgeInteractionEvent<
  NativeEvent extends PointerEvent | MouseEvent = PointerEvent | MouseEvent,
> = GpuEdgeInteractionHit & {
  readonly nativeEvent: NativeEvent;
};

export type GpuEdgeInteractionHoverEvent = {
  readonly hit: GpuEdgeInteractionHit | null;
  readonly nativeEvent: PointerEvent;
};

export type GpuEdgeInteractionControllerOptions = {
  readonly element: HTMLElement;
  readonly getScene: () => GpuEdgeScene | null | undefined;
  readonly onEdgeClick?:
    | ((event: GpuEdgeInteractionEvent<PointerEvent>) => void)
    | undefined;
  readonly onEdgeContextMenu?:
    | ((event: GpuEdgeInteractionEvent<MouseEvent>) => void)
    | undefined;
  readonly onEdgePointerDown?:
    | ((event: GpuEdgeInteractionEvent<PointerEvent>) => void)
    | undefined;
  readonly onEdgePointerLeave?: (() => void) | undefined;
  readonly onEdgePointerMove?:
    | ((event: GpuEdgeInteractionHoverEvent) => void)
    | undefined;
  readonly screenTolerancePx?: number | undefined;
  readonly store?: GpuFlowViewportStoreApi | undefined;
};

type ActiveEdgePointer = {
  readonly edgeId: string;
  readonly hit: GpuEdgeInteractionHit;
  readonly pointerId: number;
  readonly startClientX: number;
  readonly startClientY: number;
};

const DEFAULT_EDGE_HIT_TOLERANCE_PX = 8;
const MAX_EDGE_CLICK_DRAG_DISTANCE_PX = 4;

export function attachGpuEdgeInteractionController(
  options: GpuEdgeInteractionControllerOptions,
): () => void {
  const controller = new GpuEdgeInteractionController(options);
  controller.attach();
  return () => controller.destroy();
}

export function hitTestGpuEdgeInteraction({
  event,
  getScene,
  screenTolerancePx = DEFAULT_EDGE_HIT_TOLERANCE_PX,
  store = gpuFlowViewportStore,
}: {
  readonly event: Pick<MouseEvent, "clientX" | "clientY">;
  readonly getScene: () => GpuEdgeScene | null | undefined;
  readonly screenTolerancePx?: number | undefined;
  readonly store?: GpuFlowViewportStoreApi | undefined;
}): GpuEdgeInteractionHit | null {
  const scene = getScene();
  if (!scene || scene.hitTestEdges.length === 0) {
    return null;
  }
  const viewport = store.getState().transform;
  const screenPoint = getEventPointRelativeToStoreDomNode(event, store);
  const flowPoint = screenToFlowPosition(screenPoint, viewport);
  const result = hitTestGpuEdgeScene({
    point: flowPoint,
    scene,
    tolerance: resolveFlowTolerance(screenTolerancePx, viewport),
  });
  return result
    ? toGpuEdgeInteractionHit(result, flowPoint, screenPoint)
    : null;
}

class GpuEdgeInteractionController {
  private activePointer: ActiveEdgePointer | null = null;
  private hoveredSceneEdgeId: string | null = null;
  private readonly element: HTMLElement;
  private readonly getScene: () => GpuEdgeScene | null | undefined;
  private readonly onEdgeClick:
    | ((event: GpuEdgeInteractionEvent<PointerEvent>) => void)
    | undefined;
  private readonly onEdgeContextMenu:
    | ((event: GpuEdgeInteractionEvent<MouseEvent>) => void)
    | undefined;
  private readonly onEdgePointerDown:
    | ((event: GpuEdgeInteractionEvent<PointerEvent>) => void)
    | undefined;
  private readonly onEdgePointerLeave: (() => void) | undefined;
  private readonly onEdgePointerMove:
    | ((event: GpuEdgeInteractionHoverEvent) => void)
    | undefined;
  private readonly screenTolerancePx: number;
  private readonly store: GpuFlowViewportStoreApi;

  constructor(options: GpuEdgeInteractionControllerOptions) {
    this.element = options.element;
    this.getScene = options.getScene;
    this.onEdgeClick = options.onEdgeClick;
    this.onEdgeContextMenu = options.onEdgeContextMenu;
    this.onEdgePointerDown = options.onEdgePointerDown;
    this.onEdgePointerLeave = options.onEdgePointerLeave;
    this.onEdgePointerMove = options.onEdgePointerMove;
    this.screenTolerancePx =
      options.screenTolerancePx ?? DEFAULT_EDGE_HIT_TOLERANCE_PX;
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
    this.element.addEventListener("contextmenu", this.onContextMenu, {
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
    this.element.removeEventListener("contextmenu", this.onContextMenu, true);
    this.activePointer = null;
    this.clearHover();
  }

  private readonly onPointerDown = (event: PointerEvent) => {
    const hit = this.hitTestEvent(event);
    if (!hit) {
      return;
    }
    preventGpuEdgeEvent(event);
    this.activePointer = {
      edgeId: hit.sceneEdgeId,
      hit,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
    };
    this.element.setPointerCapture?.(event.pointerId);
    this.onEdgePointerDown?.({ ...hit, nativeEvent: event });
  };

  private readonly onPointerMove = (event: PointerEvent) => {
    const activePointer = this.activePointer;
    if (activePointer && activePointer.pointerId === event.pointerId) {
      preventGpuEdgeEvent(event);
      return;
    }
    const hit = this.hitTestEvent(event);
    const nextHoveredSceneEdgeId = hit?.sceneEdgeId ?? null;
    if (this.hoveredSceneEdgeId === nextHoveredSceneEdgeId) {
      return;
    }
    this.hoveredSceneEdgeId = nextHoveredSceneEdgeId;
    this.onEdgePointerMove?.({ hit, nativeEvent: event });
  };

  private readonly onPointerUp = (event: PointerEvent) => {
    const activePointer = this.activePointer;
    if (!activePointer || activePointer.pointerId !== event.pointerId) {
      return;
    }
    preventGpuEdgeEvent(event);
    this.element.releasePointerCapture?.(event.pointerId);
    this.activePointer = null;
    if (!isPointerClickDistance(activePointer, event)) {
      return;
    }
    const hit = this.hitTestEvent(event);
    if (hit?.sceneEdgeId !== activePointer.edgeId) {
      return;
    }
    this.onEdgeClick?.({ ...hit, nativeEvent: event });
  };

  private readonly onPointerCancel = (event: PointerEvent) => {
    const activePointer = this.activePointer;
    if (!activePointer || activePointer.pointerId !== event.pointerId) {
      return;
    }
    preventGpuEdgeEvent(event);
    this.element.releasePointerCapture?.(event.pointerId);
    this.activePointer = null;
  };

  private readonly onPointerLeave = () => {
    this.clearHover();
  };

  private readonly onContextMenu = (event: MouseEvent) => {
    const hit = this.hitTestEvent(event);
    if (!hit) {
      return;
    }
    preventGpuEdgeEvent(event);
    this.onEdgeContextMenu?.({ ...hit, nativeEvent: event });
  };

  private hitTestEvent(event: MouseEvent): GpuEdgeInteractionHit | null {
    if (!isGpuFlowEdgeInteractionTarget(event, this.element)) {
      return null;
    }
    return hitTestGpuEdgeInteraction({
      event,
      getScene: this.getScene,
      screenTolerancePx: this.screenTolerancePx,
      store: this.store,
    });
  }

  private clearHover() {
    if (this.hoveredSceneEdgeId === null) {
      return;
    }
    this.hoveredSceneEdgeId = null;
    this.onEdgePointerLeave?.();
  }
}

function toGpuEdgeInteractionHit(
  result: GpuEdgeSceneHitTestResult,
  flowPoint: GpuPoint,
  screenPoint: GpuPoint,
): GpuEdgeInteractionHit {
  return {
    distance: result.distance,
    edgeId: result.entry.sourceEdgeId,
    family: result.entry.family,
    flowPoint,
    sceneEdgeId: result.edgeId,
    screenPoint,
    sourceEdgeId: result.entry.sourceEdgeId,
    zIndex: result.zIndex,
  };
}

function isGpuFlowEdgeInteractionTarget(
  event: Event,
  element: HTMLElement,
): boolean {
  const target = event.target;
  if (!(target instanceof Element)) {
    return false;
  }
  if (target.closest(".setta-gpu-flow__node") !== null) {
    return false;
  }
  if (target.closest(".react-flow__node") !== null) {
    return false;
  }
  return (
    target === element ||
    target.closest("[data-gpu-flow-surface='true']") !== null
  );
}

function getEventPointRelativeToStoreDomNode(
  event: Pick<MouseEvent, "clientX" | "clientY">,
  store: GpuFlowViewportStoreApi,
): GpuPoint {
  const domNode = store.getState().domNode;
  if (!domNode) {
    return {
      x: event.clientX,
      y: event.clientY,
    };
  }
  const rect = domNode.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

function resolveFlowTolerance(
  screenTolerancePx: number,
  viewport: GpuViewportInput,
): number {
  if (!Number.isFinite(screenTolerancePx) || screenTolerancePx < 0) {
    throw new Error(
      "GPU edge hit tolerance must be a finite non-negative number.",
    );
  }
  const zoom = Array.isArray(viewport) ? viewport[2] : viewport.zoom;
  return screenTolerancePx / zoom;
}

function preventGpuEdgeEvent(event: Event) {
  event.preventDefault();
  event.stopImmediatePropagation();
}

function isPointerClickDistance(
  activePointer: ActiveEdgePointer,
  event: PointerEvent,
): boolean {
  return (
    Math.hypot(
      event.clientX - activePointer.startClientX,
      event.clientY - activePointer.startClientY,
    ) <= MAX_EDGE_CLICK_DRAG_DISTANCE_PX
  );
}
