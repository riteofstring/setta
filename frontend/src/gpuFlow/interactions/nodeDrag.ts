import { NO_DRAG_CLASS_NAME } from "utils/constants";
import { GPU_FLOW_SELECTORS } from "../gpuFlowDomClasses";
import type { GpuNodeLayout } from "../GpuNodeLayer";
import type { GpuFrameReason } from "../gpuRenderer";
import { panGpuViewport } from "../viewportActions";
import { screenToFlowPosition, type GpuPoint } from "../viewportMath";
import {
  gpuFlowViewportStore,
  type GpuFlowViewportStoreApi,
} from "../viewportStore";

type GpuNodeDragPhase = "start" | "drag" | "stop" | "cancel";

type GpuNodeDragItem = {
  readonly distance: GpuPoint;
  readonly height: number | null;
  readonly nodeId: string;
  readonly position: GpuPoint;
  readonly width: number | null;
};

type GpuNodeDragChange = {
  readonly active: boolean;
  readonly delta: GpuPoint;
  readonly items: readonly GpuNodeDragItem[];
  readonly nodeId: string;
  readonly phase: GpuNodeDragPhase;
};

type GpuNodeDragAutoPanInsets = {
  readonly bottom?: number | undefined;
  readonly left?: number | undefined;
  readonly right?: number | undefined;
  readonly top?: number | undefined;
};

export type GpuNodeDragControllerOptions = {
  readonly autoPanInsetsPx?: GpuNodeDragAutoPanInsets | undefined;
  readonly autoPanMarginPx?: number | undefined;
  readonly autoPanMaxSpeedPx?: number | undefined;
  readonly autoPanOnNodeDrag?: boolean | undefined;
  readonly canDragNode?: ((nodeId: string) => boolean) | undefined;
  readonly disabled?: boolean | (() => boolean) | undefined;
  readonly element: HTMLElement;
  readonly getNodes: () => readonly GpuNodeLayout[];
  readonly getSelectedNodeIds?: (() => readonly string[]) | undefined;
  readonly nodeDragThresholdPx?: number | undefined;
  readonly onNodeDrag?: ((change: GpuNodeDragChange) => void) | undefined;
  readonly onNodeDragCancel?: ((change: GpuNodeDragChange) => void) | undefined;
  readonly onNodeDragStart?: ((change: GpuNodeDragChange) => void) | undefined;
  readonly onNodeDragStop?: ((change: GpuNodeDragChange) => void) | undefined;
  readonly requestFrame?: ((reason: GpuFrameReason) => void) | undefined;
  readonly snapGrid?: readonly [number, number] | undefined;
  readonly snapToGrid?: boolean | (() => boolean) | undefined;
  readonly store?: GpuFlowViewportStoreApi | undefined;
};

type NormalizedGpuNodeDragAutoPanInput = {
  readonly bottomInsetPx: number;
  readonly leftInsetPx: number;
  readonly marginPx: number;
  readonly maxSpeedPx: number;
  readonly rightInsetPx: number;
  readonly topInsetPx: number;
  readonly viewportHeight: number;
  readonly viewportWidth: number;
};

type PendingGpuNodeDrag = {
  readonly nodeElement: HTMLElement;
  readonly nodeId: string;
  readonly startFlowPoint: GpuPoint;
  readonly pointerId: number;
  readonly startScreenPoint: GpuPoint;
  lastScreenPoint: GpuPoint;
};

type ActiveGpuNodeDrag = PendingGpuNodeDrag & {
  items: readonly GpuNodeDragItem[];
  lastPointerFlow: GpuPoint;
};

const DEFAULT_AUTO_PAN_MARGIN_PX = 35;
const DEFAULT_AUTO_PAN_MAX_SPEED_PX = 20;
const DEFAULT_NODE_DRAG_THRESHOLD_PX = 1;
const DEFAULT_SNAP_GRID: readonly [number, number] = [15, 15];

export function attachGpuNodeDragController(
  options: GpuNodeDragControllerOptions,
): () => void {
  const controller = new GpuNodeDragController(options);
  controller.attach();
  return () => controller.destroy();
}

export function getGpuNodeDragItems({
  canDragNode,
  nodeId,
  nodes,
  pointerPosition,
  selectedNodeIds = [],
}: {
  readonly canDragNode?: ((nodeId: string) => boolean) | undefined;
  readonly nodeId: string;
  readonly nodes: readonly GpuNodeLayout[];
  readonly pointerPosition: GpuPoint;
  readonly selectedNodeIds?: readonly string[] | undefined;
}): GpuNodeDragItem[] {
  const draggedIds = getDraggedNodeIds(nodeId, selectedNodeIds);
  const items: GpuNodeDragItem[] = [];
  for (const node of nodes) {
    if (!draggedIds.has(node.nodeId)) {
      continue;
    }
    if (canDragNode?.(node.nodeId) === false) {
      continue;
    }
    items.push({
      distance: {
        x: pointerPosition.x - node.x,
        y: pointerPosition.y - node.y,
      },
      height: node.height,
      nodeId: node.nodeId,
      position: { x: node.x, y: node.y },
      width: node.width,
    });
  }
  return items;
}

export function moveGpuNodeDragItems({
  pointerPosition,
  snapGrid = DEFAULT_SNAP_GRID,
  snapToGrid = false,
  items,
}: {
  readonly items: readonly GpuNodeDragItem[];
  readonly pointerPosition: GpuPoint;
  readonly snapGrid?: readonly [number, number] | undefined;
  readonly snapToGrid?: boolean | undefined;
}): {
  readonly changed: boolean;
  readonly delta: GpuPoint;
  readonly items: readonly GpuNodeDragItem[];
} {
  const nextItems = items.map((item) => {
    const nextPosition = {
      x: pointerPosition.x - item.distance.x,
      y: pointerPosition.y - item.distance.y,
    };
    return {
      ...item,
      position: snapToGrid
        ? snapGpuNodePosition(nextPosition, snapGrid)
        : nextPosition,
    };
  });
  const changed = nextItems.some((item, index) => {
    const previousItem = items[index];
    return (
      previousItem !== undefined &&
      (item.position.x !== previousItem.position.x ||
        item.position.y !== previousItem.position.y)
    );
  });
  return {
    changed,
    delta: getGpuNodeDragItemsDelta(items, nextItems),
    items: nextItems,
  };
}

export function getGpuNodeDragAutoPanDelta({
  insetsPx,
  marginPx = DEFAULT_AUTO_PAN_MARGIN_PX,
  maxSpeedPx = DEFAULT_AUTO_PAN_MAX_SPEED_PX,
  point,
  viewportSize,
}: {
  readonly insetsPx?: GpuNodeDragAutoPanInsets | undefined;
  readonly marginPx?: number | undefined;
  readonly maxSpeedPx?: number | undefined;
  readonly point: GpuPoint;
  readonly viewportSize: {
    readonly height: number;
    readonly width: number;
  };
}): GpuPoint {
  const input = normalizeGpuNodeDragAutoPanInput({
    insetsPx,
    marginPx,
    maxSpeedPx,
    viewportSize,
  });
  if (input.viewportWidth === 0 || input.viewportHeight === 0) {
    return { x: 0, y: 0 };
  }
  return {
    x: getGpuNodeAutoPanAxisDelta({
      maxInsetPx: input.rightInsetPx,
      maxSpeedPx: input.maxSpeedPx,
      minInsetPx: input.leftInsetPx,
      pointValue: point.x,
      size: input.viewportWidth,
      marginPx: input.marginPx,
    }),
    y: getGpuNodeAutoPanAxisDelta({
      maxInsetPx: input.bottomInsetPx,
      maxSpeedPx: input.maxSpeedPx,
      minInsetPx: input.topInsetPx,
      pointValue: point.y,
      size: input.viewportHeight,
      marginPx: input.marginPx,
    }),
  };
}

class GpuNodeDragController {
  private activeDrag: ActiveGpuNodeDrag | null = null;
  private autoPanAnimationFrame: number | null = null;
  private readonly element: HTMLElement;
  private readonly options: Omit<
    GpuNodeDragControllerOptions,
    "element" | "store"
  >;
  private pendingDrag: PendingGpuNodeDrag | null = null;
  private readonly store: GpuFlowViewportStoreApi;

  constructor(options: GpuNodeDragControllerOptions) {
    this.element = options.element;
    this.options = options;
    this.store = options.store ?? gpuFlowViewportStore;
  }

  attach() {
    this.element.addEventListener("pointerdown", this.onPointerDown);
  }

  destroy() {
    this.element.removeEventListener("pointerdown", this.onPointerDown);
    this.removeDocumentListeners();
    this.cancelAutoPanLoop();
    this.cancelActiveDrag();
  }

  private readonly onPointerDown = (event: PointerEvent) => {
    if (!this.shouldStartPointerDrag(event)) {
      return;
    }
    const nodeElement = getEventNodeElement(event);
    const nodeId = nodeElement?.dataset.id ?? null;
    if (!nodeElement || !nodeId) {
      return;
    }

    const startScreenPoint = getEventPointRelativeToElement(
      event,
      this.element,
    );
    this.pendingDrag = {
      lastScreenPoint: startScreenPoint,
      nodeElement,
      nodeId,
      pointerId: event.pointerId,
      startFlowPoint: this.screenPointToFlowPoint(startScreenPoint),
      startScreenPoint,
    };
    nodeElement.setPointerCapture?.(event.pointerId);
    this.addDocumentListeners();
    if (
      (this.options.nodeDragThresholdPx ?? DEFAULT_NODE_DRAG_THRESHOLD_PX) <= 0
    ) {
      this.startDragFromPending(event);
    }
  };

  private readonly onPointerMove = (event: PointerEvent) => {
    const drag = this.activeDrag ?? this.pendingDrag;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    drag.lastScreenPoint = getEventPointRelativeToElement(event, this.element);
    if (!this.activeDrag) {
      if (!this.isDragThresholdMet(drag)) {
        return;
      }
      this.startDragFromPending(event);
    }
    if (!this.activeDrag) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    this.updateActiveDragFromScreenPoint(drag.lastScreenPoint, "drag");
  };

  private readonly onPointerEnd = (event: PointerEvent) => {
    const drag = this.activeDrag ?? this.pendingDrag;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    drag.nodeElement.releasePointerCapture?.(event.pointerId);
    if (!this.activeDrag) {
      this.clearPendingDrag();
      return;
    }

    this.stopActiveDrag();
  };

  private readonly onPointerCancel = (event: PointerEvent) => {
    const drag = this.activeDrag ?? this.pendingDrag;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    drag.nodeElement.releasePointerCapture?.(event.pointerId);
    if (!this.activeDrag) {
      this.clearPendingDrag();
      return;
    }

    this.options.onNodeDragCancel?.({
      active: false,
      delta: { x: 0, y: 0 },
      items: this.activeDrag.items,
      nodeId: this.activeDrag.nodeId,
      phase: "cancel",
    });
    this.clearActiveDrag();
  };

  private shouldStartPointerDrag(event: PointerEvent): boolean {
    if (isDragDisabled(this.options.disabled)) {
      return false;
    }
    if (event.button !== 0) {
      return false;
    }
    const nodeElement = getEventNodeElement(event);
    if (!nodeElement) {
      return false;
    }
    const nodeId = nodeElement.dataset.id;
    if (nodeId && this.options.canDragNode?.(nodeId) === false) {
      return false;
    }
    return !isEventTargetWrappedWithClass(
      event,
      NO_DRAG_CLASS_NAME,
      nodeElement,
    );
  }

  private isDragThresholdMet(drag: PendingGpuNodeDrag): boolean {
    const threshold =
      this.options.nodeDragThresholdPx ?? DEFAULT_NODE_DRAG_THRESHOLD_PX;
    const deltaX = drag.lastScreenPoint.x - drag.startScreenPoint.x;
    const deltaY = drag.lastScreenPoint.y - drag.startScreenPoint.y;
    return Math.hypot(deltaX, deltaY) >= threshold;
  }

  private startDragFromPending(event: PointerEvent) {
    const pendingDrag = this.pendingDrag;
    if (!pendingDrag) {
      return;
    }
    if (!this.canStartPendingDrag(pendingDrag)) {
      this.abortPendingDrag(pendingDrag);
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    const items = getGpuNodeDragItems({
      canDragNode: this.options.canDragNode,
      nodeId: pendingDrag.nodeId,
      nodes: this.options.getNodes(),
      pointerPosition: pendingDrag.startFlowPoint,
      selectedNodeIds: this.options.getSelectedNodeIds?.() ?? [],
    });
    if (items.length === 0) {
      this.abortPendingDrag(pendingDrag);
      return;
    }

    this.activeDrag = {
      ...pendingDrag,
      items,
      lastPointerFlow: pendingDrag.startFlowPoint,
    };
    this.pendingDrag = null;
    this.store.getState().setViewportInteractionFlags({ nodeDragging: true });
    const change = {
      active: true,
      delta: { x: 0, y: 0 },
      items,
      nodeId: pendingDrag.nodeId,
      phase: "start" as const,
    };
    this.options.onNodeDragStart?.(change);
    this.options.requestFrame?.("viewport");
    this.startAutoPanLoop();
  }

  private canStartPendingDrag(drag: PendingGpuNodeDrag): boolean {
    if (isDragDisabled(this.options.disabled)) {
      return false;
    }
    if (this.options.canDragNode?.(drag.nodeId) === false) {
      return false;
    }
    return true;
  }

  private updateActiveDragFromScreenPoint(
    screenPoint: GpuPoint,
    phase: "drag" | "stop",
  ): boolean {
    const activeDrag = this.activeDrag;
    if (!activeDrag) {
      return false;
    }
    const pointerFlow = this.screenPointToFlowPoint(screenPoint);
    const result = moveGpuNodeDragItems({
      items: activeDrag.items,
      pointerPosition: pointerFlow,
      snapGrid: this.options.snapGrid,
      snapToGrid:
        phase === "stop" && isSnapToGridEnabled(this.options.snapToGrid),
    });
    activeDrag.lastPointerFlow = pointerFlow;
    if (!result.changed && phase === "drag") {
      return false;
    }
    activeDrag.items = result.items;
    const change = {
      active: phase !== "stop",
      delta: result.delta,
      items: activeDrag.items,
      nodeId: activeDrag.nodeId,
      phase,
    };
    if (phase === "drag") {
      this.options.onNodeDrag?.(change);
    } else {
      this.options.onNodeDragStop?.(change);
    }
    this.options.requestFrame?.("viewport");
    return result.changed;
  }

  private stopActiveDrag() {
    const activeDrag = this.activeDrag;
    if (!activeDrag) {
      return;
    }
    this.updateActiveDragFromScreenPoint(activeDrag.lastScreenPoint, "stop");
    this.clearActiveDrag();
  }

  private cancelActiveDrag() {
    const activeDrag = this.activeDrag;
    if (!activeDrag) {
      this.clearPendingDrag();
      return;
    }
    this.options.onNodeDragCancel?.({
      active: false,
      delta: { x: 0, y: 0 },
      items: activeDrag.items,
      nodeId: activeDrag.nodeId,
      phase: "cancel",
    });
    this.clearActiveDrag();
  }

  private clearActiveDrag() {
    this.activeDrag = null;
    this.clearPendingDrag();
    this.cancelAutoPanLoop();
    this.store.getState().setViewportInteractionFlags({ nodeDragging: false });
    this.options.requestFrame?.("texture-upload");
  }

  private clearPendingDrag() {
    this.pendingDrag = null;
    this.removeDocumentListeners();
  }

  private abortPendingDrag(drag: PendingGpuNodeDrag) {
    drag.nodeElement.releasePointerCapture?.(drag.pointerId);
    this.clearPendingDrag();
  }

  private addDocumentListeners() {
    document.addEventListener("pointermove", this.onPointerMove);
    document.addEventListener("pointerup", this.onPointerEnd);
    document.addEventListener("pointercancel", this.onPointerCancel);
  }

  private removeDocumentListeners() {
    document.removeEventListener("pointermove", this.onPointerMove);
    document.removeEventListener("pointerup", this.onPointerEnd);
    document.removeEventListener("pointercancel", this.onPointerCancel);
  }

  private screenPointToFlowPoint(point: GpuPoint): GpuPoint {
    return screenToFlowPosition(point, this.store.getState().transform);
  }

  private startAutoPanLoop() {
    if (
      this.options.autoPanOnNodeDrag === false ||
      this.autoPanAnimationFrame !== null
    ) {
      return;
    }
    this.autoPanAnimationFrame = requestAnimationFrame(this.runAutoPanFrame);
  }

  private readonly runAutoPanFrame = () => {
    this.autoPanAnimationFrame = null;
    const activeDrag = this.activeDrag;
    if (!activeDrag) {
      return;
    }
    const delta = getGpuNodeDragAutoPanDelta({
      insetsPx: this.options.autoPanInsetsPx,
      marginPx: this.options.autoPanMarginPx,
      maxSpeedPx: this.options.autoPanMaxSpeedPx,
      point: activeDrag.lastScreenPoint,
      viewportSize: {
        height: this.store.getState().height,
        width: this.store.getState().width,
      },
    });
    if (
      (delta.x !== 0 || delta.y !== 0) &&
      panGpuViewport(delta, { store: this.store })
    ) {
      this.updateActiveDragFromScreenPoint(activeDrag.lastScreenPoint, "drag");
      this.options.requestFrame?.("viewport");
    }
    this.startAutoPanLoop();
  };

  private cancelAutoPanLoop() {
    if (this.autoPanAnimationFrame !== null) {
      cancelAnimationFrame(this.autoPanAnimationFrame);
      this.autoPanAnimationFrame = null;
    }
  }
}

function getDraggedNodeIds(
  nodeId: string,
  selectedNodeIds: readonly string[],
): ReadonlySet<string> {
  const selectedIds = new Set(selectedNodeIds);
  if (selectedIds.has(nodeId)) {
    return selectedIds;
  }
  return new Set([nodeId]);
}

function snapGpuNodePosition(
  position: GpuPoint,
  snapGrid: readonly [number, number],
): GpuPoint {
  const [xGrid, yGrid] = snapGrid;
  assertFinitePositive("snap grid x", xGrid);
  assertFinitePositive("snap grid y", yGrid);
  return {
    x: xGrid * Math.round(position.x / xGrid),
    y: yGrid * Math.round(position.y / yGrid),
  };
}

function getGpuNodeDragItemsDelta(
  previousItems: readonly GpuNodeDragItem[],
  nextItems: readonly GpuNodeDragItem[],
): GpuPoint {
  if (previousItems.length === 0 || nextItems.length === 0) {
    return { x: 0, y: 0 };
  }
  const previousItem = previousItems[0];
  const nextItem = nextItems[0];
  if (!previousItem || !nextItem) {
    return { x: 0, y: 0 };
  }
  return {
    x: nextItem.position.x - previousItem.position.x,
    y: nextItem.position.y - previousItem.position.y,
  };
}

function isSnapToGridEnabled(
  snapToGrid: boolean | (() => boolean) | undefined,
): boolean {
  return typeof snapToGrid === "function" ? snapToGrid() : Boolean(snapToGrid);
}

function isDragDisabled(
  disabled: boolean | (() => boolean) | undefined,
): boolean {
  return typeof disabled === "function" ? disabled() : Boolean(disabled);
}

function getEventNodeElement(event: Event): HTMLElement | null {
  const target = event.target;
  if (!(target instanceof Element)) {
    return null;
  }
  const element = target.closest<HTMLElement>(GPU_FLOW_SELECTORS.node);
  if (!element || element.dataset.gpuFlowNode === "false") {
    return null;
  }
  return element;
}

function getEventPointRelativeToElement(
  event: Pick<MouseEvent, "clientX" | "clientY">,
  element: HTMLElement,
): GpuPoint {
  const rect = element.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

function isEventTargetWrappedWithClass(
  event: Event,
  className: string,
  stopElement: Element,
): boolean {
  const target = event.target;
  if (!(target instanceof Element)) {
    return false;
  }
  let current: Element | null = target;
  while (current) {
    if (current.classList.contains(className)) {
      return true;
    }
    if (current === stopElement) {
      return false;
    }
    current = current.parentElement;
  }
  return false;
}

function getGpuNodeAutoPanVelocity(
  value: number,
  min: number,
  max: number,
): number {
  if (value < min) {
    return clampNumber(Math.abs(value - min), 1, 50) / 50;
  }
  if (value > max) {
    return -clampNumber(Math.abs(value - max), 1, 50) / 50;
  }
  return 0;
}

function normalizeGpuNodeDragAutoPanInput({
  insetsPx,
  marginPx,
  maxSpeedPx,
  viewportSize,
}: {
  readonly insetsPx?: GpuNodeDragAutoPanInsets | undefined;
  readonly marginPx: number;
  readonly maxSpeedPx: number;
  readonly viewportSize: {
    readonly height: number;
    readonly width: number;
  };
}): NormalizedGpuNodeDragAutoPanInput {
  assertFiniteNonNegative("auto-pan margin", marginPx);
  assertFiniteNonNegative("auto-pan max speed", maxSpeedPx);
  assertFiniteNonNegative("viewport width", viewportSize.width);
  assertFiniteNonNegative("viewport height", viewportSize.height);
  return {
    bottomInsetPx: insetsPx?.bottom ?? 0,
    leftInsetPx: insetsPx?.left ?? 0,
    marginPx,
    maxSpeedPx,
    rightInsetPx: insetsPx?.right ?? 0,
    topInsetPx: insetsPx?.top ?? 0,
    viewportHeight: viewportSize.height,
    viewportWidth: viewportSize.width,
  };
}

function getGpuNodeAutoPanAxisDelta({
  marginPx,
  maxInsetPx,
  maxSpeedPx,
  minInsetPx,
  pointValue,
  size,
}: {
  readonly marginPx: number;
  readonly maxInsetPx: number;
  readonly maxSpeedPx: number;
  readonly minInsetPx: number;
  readonly pointValue: number;
  readonly size: number;
}): number {
  return (
    getGpuNodeAutoPanVelocity(
      pointValue,
      minInsetPx + marginPx,
      size - maxInsetPx - marginPx,
    ) * maxSpeedPx
  );
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function assertFiniteNonNegative(name: string, value: number) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a finite non-negative number.`);
  }
}

function assertFinitePositive(name: string, value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a finite positive number.`);
  }
}
