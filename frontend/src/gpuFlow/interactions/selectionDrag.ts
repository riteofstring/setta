import { NO_DRAG_CLASS_NAME } from "utils/constants";

import { GPU_FLOW_SELECTORS } from "../gpuFlowDomClasses";
import type { GpuFrameReason } from "../gpuRenderer";
import type {
  GpuFlowLayoutChangePhase,
  GpuFlowLayoutInteractionFlags,
  GpuFlowLayoutNode,
  GpuFlowLayoutNodePatch,
  GpuFlowLayoutStoreApi,
} from "../layoutStore";
import { panGpuViewport } from "../viewportActions";
import { screenToFlowPosition, type GpuPoint } from "../viewportMath";
import {
  gpuFlowViewportStore,
  type GpuFlowViewportStoreApi,
} from "../viewportStore";
import { getGpuNodeDragAutoPanDelta } from "./nodeDrag";

export type GpuSelectionDragPhase = "cancel" | "drag" | "start" | "stop";

export type GpuSelectionDragItem = {
  readonly height: number | null;
  readonly nodeId: string;
  readonly position: GpuPoint;
  readonly width: number | null;
};

export type GpuSelectionDragChange = {
  readonly active: boolean;
  readonly delta: GpuPoint;
  readonly items: readonly GpuSelectionDragItem[];
  readonly phase: GpuSelectionDragPhase;
  readonly selectedNodeIds: readonly string[];
};

export type GpuSelectionKeyboardNudgeChange = {
  readonly delta: GpuPoint;
  readonly items: readonly GpuSelectionDragItem[];
  readonly selectedNodeIds: readonly string[];
};

export type GpuSelectionDragAutoPanInsets = {
  readonly bottom?: number | undefined;
  readonly left?: number | undefined;
  readonly right?: number | undefined;
  readonly top?: number | undefined;
};

export type GpuSelectionDragControllerOptions = {
  readonly autoPanInsetsPx?: GpuSelectionDragAutoPanInsets | undefined;
  readonly autoPanMarginPx?: number | undefined;
  readonly autoPanMaxSpeedPx?: number | undefined;
  readonly autoPanOnSelectionDrag?: boolean | undefined;
  readonly canDragNode?: ((nodeId: string) => boolean) | undefined;
  readonly disabled?: boolean | (() => boolean) | undefined;
  readonly element: HTMLElement;
  readonly layoutStore: GpuFlowLayoutStoreApi;
  readonly onSelectionContextMenu?:
    | ((event: MouseEvent, selectedNodeIds: readonly string[]) => void)
    | undefined;
  readonly onSelectionDrag?:
    | ((change: GpuSelectionDragChange) => void)
    | undefined;
  readonly onSelectionDragCancel?:
    | ((change: GpuSelectionDragChange) => void)
    | undefined;
  readonly onSelectionDragStart?:
    | ((change: GpuSelectionDragChange) => void)
    | undefined;
  readonly onSelectionDragStop?:
    | ((change: GpuSelectionDragChange) => void)
    | undefined;
  readonly onSelectionKeyboardNudge?:
    | ((change: GpuSelectionKeyboardNudgeChange) => void)
    | undefined;
  readonly onSelectionElementChange?:
    | ((element: HTMLElement | null) => void)
    | undefined;
  readonly primaryNodeId?: string | null | undefined;
  readonly requestFrame?: ((reason: GpuFrameReason) => void) | undefined;
  readonly selectedNodeIds?: readonly string[] | undefined;
  readonly snapGrid?: readonly [number, number] | undefined;
  readonly snapToGrid?: boolean | (() => boolean) | undefined;
  readonly store?: GpuFlowViewportStoreApi | undefined;
};

type ActiveGpuSelectionDrag = {
  items: readonly GpuSelectionDragItem[];
  lastFlowPoint: GpuPoint;
  lastScreenPoint: GpuPoint;
  pointerId: number;
  readonly rectElement: HTMLElement;
  readonly selectedNodeIds: readonly string[];
};

type GpuSelectionKeyboardNudgePlan = {
  readonly delta: GpuPoint;
  readonly items: readonly GpuSelectionDragItem[];
};

const DEFAULT_NUDGE_PIXELS = 5;
const DEFAULT_NUDGE_SHIFT_FACTOR = 4;
const DEFAULT_SNAP_GRID: readonly [number, number] = [15, 15];
const SELECTION_ARROW_KEY_DIFFS: Readonly<Record<string, GpuPoint>> = {
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
};

export function attachGpuSelectionDragController(
  options: GpuSelectionDragControllerOptions,
): () => void {
  const controller = new GpuSelectionDragController(options);
  controller.attach();
  return () => controller.destroy();
}

export function getGpuSelectionDragItems({
  canDragNode,
  layoutStore,
  selectedNodeIds,
}: {
  readonly canDragNode?: ((nodeId: string) => boolean) | undefined;
  readonly layoutStore: GpuFlowLayoutStoreApi;
  readonly selectedNodeIds: readonly string[];
}): GpuSelectionDragItem[] {
  if (selectedNodeIds.length === 0) {
    return [];
  }
  const selectedIds = new Set(selectedNodeIds);
  const items: GpuSelectionDragItem[] = [];
  for (const node of layoutStore.getState().getNodes()) {
    if (!selectedIds.has(node.nodeId)) {
      continue;
    }
    if (canDragNode?.(node.nodeId) === false) {
      continue;
    }
    items.push(gpuSelectionDragItemFromNode(node));
  }
  return items;
}

export function moveGpuSelectionDragItems({
  items,
  lastFlowPoint,
  nextFlowPoint,
}: {
  readonly items: readonly GpuSelectionDragItem[];
  readonly lastFlowPoint: GpuPoint;
  readonly nextFlowPoint: GpuPoint;
}): {
  readonly changed: boolean;
  readonly delta: GpuPoint;
  readonly items: readonly GpuSelectionDragItem[];
} {
  const delta = {
    x: nextFlowPoint.x - lastFlowPoint.x,
    y: nextFlowPoint.y - lastFlowPoint.y,
  };
  if (delta.x === 0 && delta.y === 0) {
    return {
      changed: false,
      delta,
      items: [...items],
    };
  }
  return {
    changed: true,
    delta,
    items: items.map((item) => ({
      ...item,
      position: {
        x: item.position.x + delta.x,
        y: item.position.y + delta.y,
      },
    })),
  };
}

export function snapGpuSelectionDragItems({
  items,
  snapGrid = DEFAULT_SNAP_GRID,
}: {
  readonly items: readonly GpuSelectionDragItem[];
  readonly snapGrid?: readonly [number, number] | undefined;
}): {
  readonly changed: boolean;
  readonly delta: GpuPoint;
  readonly items: readonly GpuSelectionDragItem[];
} {
  const nextItems = items.map((item) => ({
    ...item,
    position: snapGpuSelectionNodePosition(item.position, snapGrid),
  }));
  return {
    changed: haveGpuSelectionDragItemsMoved(items, nextItems),
    delta: getGpuSelectionDragItemsDelta(items, nextItems),
    items: nextItems,
  };
}

export function buildGpuSelectionKeyboardNudgePlan({
  direction,
  isShiftPressed,
  items,
  snapGrid = DEFAULT_SNAP_GRID,
  snapToGrid = false,
}: {
  readonly direction: GpuPoint;
  readonly isShiftPressed: boolean;
  readonly items: readonly GpuSelectionDragItem[];
  readonly snapGrid?: readonly [number, number] | undefined;
  readonly snapToGrid?: boolean | undefined;
}): GpuSelectionKeyboardNudgePlan | null {
  if (items.length === 0) {
    return null;
  }
  const xVelocity = snapToGrid ? snapGrid[0] : DEFAULT_NUDGE_PIXELS;
  const yVelocity = snapToGrid ? snapGrid[1] : DEFAULT_NUDGE_PIXELS;
  const factor = isShiftPressed ? DEFAULT_NUDGE_SHIFT_FACTOR : 1;
  const delta = {
    x: direction.x * xVelocity * factor,
    y: direction.y * yVelocity * factor,
  };
  return {
    delta,
    items: items.map((item) => {
      const nextPosition = {
        x: item.position.x + delta.x,
        y: item.position.y + delta.y,
      };
      return {
        ...item,
        position: snapToGrid
          ? snapGpuSelectionNodePosition(nextPosition, snapGrid)
          : nextPosition,
      };
    }),
  };
}

export function syncGpuSelectionBoundsFromLayoutStore({
  layoutStore,
  selectedNodeIds,
  store = gpuFlowViewportStore,
}: {
  readonly layoutStore: GpuFlowLayoutStoreApi;
  readonly selectedNodeIds: readonly string[];
  readonly store?: GpuFlowViewportStoreApi | undefined;
}) {
  if (selectedNodeIds.length === 0) {
    store.getState().setNodesSelectionBounds(null);
    return;
  }
  store.getState().setNodesSelectionBounds(
    layoutStore.getState().getNodesBounds(selectedNodeIds) ?? {
      height: 0,
      width: 0,
      x: 0,
      y: 0,
    },
  );
}

class GpuSelectionDragController {
  private activeDrag: ActiveGpuSelectionDrag | null = null;
  private autoPanAnimationFrame: number | null = null;
  private readonly element: HTMLElement;
  private readonly layoutStore: GpuFlowLayoutStoreApi;
  private readonly options: Omit<
    GpuSelectionDragControllerOptions,
    "element" | "layoutStore" | "store"
  >;
  private readonly store: GpuFlowViewportStoreApi;

  constructor(options: GpuSelectionDragControllerOptions) {
    this.element = options.element;
    this.layoutStore = options.layoutStore;
    this.options = options;
    this.store = options.store ?? gpuFlowViewportStore;
  }

  attach() {
    this.element.addEventListener("contextmenu", this.onContextMenu);
    this.element.addEventListener("keydown", this.onKeyDown);
    this.element.addEventListener("pointerdown", this.onPointerDown);
    this.element.addEventListener("pointermove", this.onPointerMove);
    this.element.addEventListener("pointerup", this.onPointerEnd);
    this.element.addEventListener("pointercancel", this.onPointerCancel);
  }

  destroy() {
    this.element.removeEventListener("contextmenu", this.onContextMenu);
    this.element.removeEventListener("keydown", this.onKeyDown);
    this.element.removeEventListener("pointerdown", this.onPointerDown);
    this.element.removeEventListener("pointermove", this.onPointerMove);
    this.element.removeEventListener("pointerup", this.onPointerEnd);
    this.element.removeEventListener("pointercancel", this.onPointerCancel);
    this.cancelAutoPanLoop();
    this.cancelActiveDrag();
  }

  private readonly onContextMenu = (event: MouseEvent) => {
    const rectElement = getEventSelectionRectElement(event);
    if (!rectElement) {
      return;
    }
    this.options.onSelectionContextMenu?.(event, this.getExistingSelectedIds());
  };

  private readonly onKeyDown = (event: KeyboardEvent) => {
    if (!getEventSelectionRectElement(event)) {
      return;
    }
    const direction = SELECTION_ARROW_KEY_DIFFS[event.key];
    if (!direction) {
      return;
    }
    const items = this.getDraggableSelectedItems();
    const plan = buildGpuSelectionKeyboardNudgePlan({
      direction,
      isShiftPressed: event.shiftKey,
      items,
      snapGrid: this.options.snapGrid,
      snapToGrid: isSnapToGridEnabled(this.options.snapToGrid),
    });
    if (!plan) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    this.applySelectionDragLayoutChange(plan.items, "commit", "keyboard");
    this.options.onSelectionKeyboardNudge?.({
      delta: plan.delta,
      items: plan.items,
      selectedNodeIds: plan.items.map((item) => item.nodeId),
    });
    this.options.requestFrame?.("viewport");
  };

  private readonly onPointerDown = (event: PointerEvent) => {
    const rectElement = getEventSelectionRectElement(event);
    if (!rectElement || !this.shouldStartSelectionDrag(event, rectElement)) {
      return;
    }
    const items = this.getDraggableSelectedItems();
    if (items.length === 0) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    rectElement.focus({ preventScroll: true });
    rectElement.setPointerCapture?.(event.pointerId);
    const lastScreenPoint = getEventPointRelativeToElement(event, this.element);
    this.activeDrag = {
      items,
      lastFlowPoint: this.screenPointToFlowPoint(lastScreenPoint),
      lastScreenPoint,
      pointerId: event.pointerId,
      rectElement,
      selectedNodeIds: items.map((item) => item.nodeId),
    };
    this.applySelectionDragStartState(items);
    this.store.getState().setViewportInteractionFlags({ nodeDragging: true });
    this.options.onSelectionDragStart?.({
      active: true,
      delta: { x: 0, y: 0 },
      items,
      phase: "start",
      selectedNodeIds: items.map((item) => item.nodeId),
    });
    this.options.requestFrame?.("viewport");
    this.startAutoPanLoop();
  };

  private readonly onPointerMove = (event: PointerEvent) => {
    const drag = this.activeDrag;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    drag.lastScreenPoint = getEventPointRelativeToElement(event, this.element);
    this.updateActiveDragFromScreenPoint(drag.lastScreenPoint);
  };

  private readonly onPointerEnd = (event: PointerEvent) => {
    const drag = this.activeDrag;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    drag.rectElement.releasePointerCapture?.(event.pointerId);
    this.stopActiveDrag();
  };

  private readonly onPointerCancel = (event: PointerEvent) => {
    const drag = this.activeDrag;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    drag.rectElement.releasePointerCapture?.(event.pointerId);
    this.cancelActiveDrag();
  };

  private shouldStartSelectionDrag(
    event: PointerEvent,
    rectElement: HTMLElement,
  ): boolean {
    if (event.button !== 0 || isSelectionDragDisabled(this.options.disabled)) {
      return false;
    }
    return !isEventTargetWrappedWithClass(
      event,
      NO_DRAG_CLASS_NAME,
      rectElement,
    );
  }

  private getDraggableSelectedItems(): GpuSelectionDragItem[] {
    return getGpuSelectionDragItems({
      canDragNode: this.options.canDragNode,
      layoutStore: this.layoutStore,
      selectedNodeIds: this.options.selectedNodeIds ?? [],
    });
  }

  private getExistingSelectedIds(): readonly string[] {
    const selectedIds = new Set(this.options.selectedNodeIds ?? []);
    if (selectedIds.size === 0) {
      return [];
    }
    return this.layoutStore
      .getState()
      .getNodes()
      .filter((node) => selectedIds.has(node.nodeId))
      .map((node) => node.nodeId);
  }

  private updateActiveDragFromScreenPoint(screenPoint: GpuPoint): boolean {
    const activeDrag = this.activeDrag;
    if (!activeDrag) {
      return false;
    }
    const nextFlowPoint = this.screenPointToFlowPoint(screenPoint);
    const result = moveGpuSelectionDragItems({
      items: activeDrag.items,
      lastFlowPoint: activeDrag.lastFlowPoint,
      nextFlowPoint,
    });
    activeDrag.lastFlowPoint = nextFlowPoint;
    if (!result.changed) {
      return false;
    }
    activeDrag.items = result.items;
    this.applySelectionDragLayoutChange(activeDrag.items, "change", "drag");
    this.options.onSelectionDrag?.({
      active: true,
      delta: result.delta,
      items: activeDrag.items,
      phase: "drag",
      selectedNodeIds: activeDrag.selectedNodeIds,
    });
    this.options.requestFrame?.("viewport");
    return true;
  }

  private stopActiveDrag() {
    const activeDrag = this.activeDrag;
    if (!activeDrag) {
      return;
    }
    let items = activeDrag.items;
    let delta = { x: 0, y: 0 };
    if (isSnapToGridEnabled(this.options.snapToGrid)) {
      const snapResult = snapGpuSelectionDragItems({
        items,
        snapGrid: this.options.snapGrid,
      });
      items = snapResult.items;
      delta = snapResult.delta;
    }
    activeDrag.items = items;
    this.applySelectionDragStopState(items, "commit");
    this.options.onSelectionDragStop?.({
      active: false,
      delta,
      items,
      phase: "stop",
      selectedNodeIds: activeDrag.selectedNodeIds,
    });
    this.clearActiveDrag();
  }

  private cancelActiveDrag() {
    const activeDrag = this.activeDrag;
    if (!activeDrag) {
      return;
    }
    this.applySelectionDragStopState(activeDrag.items, "cancel");
    this.options.onSelectionDragCancel?.({
      active: false,
      delta: { x: 0, y: 0 },
      items: activeDrag.items,
      phase: "cancel",
      selectedNodeIds: activeDrag.selectedNodeIds,
    });
    this.clearActiveDrag();
  }

  private clearActiveDrag() {
    this.activeDrag = null;
    this.cancelAutoPanLoop();
    this.store.getState().setViewportInteractionFlags({ nodeDragging: false });
    this.options.requestFrame?.("texture-upload");
  }

  private applySelectionDragStartState(items: readonly GpuSelectionDragItem[]) {
    const itemIds = new Set(items.map((item) => item.nodeId));
    this.layoutStore.getState().patchNodes(
      this.layoutStore
        .getState()
        .getNodes()
        .map((node) => ({
          interactionFlags: itemIds.has(node.nodeId)
            ? getNextGpuSelectionDragInteractionFlags(
                node.interactionFlags,
                true,
              )
            : node.interactionFlags,
          nodeId: node.nodeId,
          tempZIndex:
            (node.zIndex ?? 0) + (itemIds.has(node.nodeId) ? 1000 : 0),
        })),
      {
        phase: "start",
        reason: "drag",
      },
    );
  }

  private applySelectionDragStopState(
    items: readonly GpuSelectionDragItem[],
    phase: Extract<GpuFlowLayoutChangePhase, "cancel" | "commit">,
  ) {
    const itemsById = new Map(items.map((item) => [item.nodeId, item]));
    this.layoutStore.getState().patchNodes(
      this.layoutStore
        .getState()
        .getNodes()
        .map((node) => {
          const item = itemsById.get(node.nodeId);
          return {
            ...(item
              ? {
                  height: item.height,
                  interactionFlags: getNextGpuSelectionDragInteractionFlags(
                    node.interactionFlags,
                    false,
                  ),
                  width: item.width,
                  x: item.position.x,
                  y: item.position.y,
                }
              : {}),
            nodeId: node.nodeId,
            tempZIndex: node.zIndex,
          };
        }),
      {
        phase,
        reason: "drag",
      },
    );
  }

  private applySelectionDragLayoutChange(
    items: readonly GpuSelectionDragItem[],
    phase: GpuFlowLayoutChangePhase,
    reason: "drag" | "keyboard",
  ) {
    const dragging = reason === "drag" && phase !== "commit";
    const patches: GpuFlowLayoutNodePatch[] = items.map((item) => {
      const node = this.layoutStore.getState().getNode(item.nodeId);
      return {
        height: item.height,
        interactionFlags: getNextGpuSelectionDragInteractionFlags(
          node?.interactionFlags,
          dragging,
        ),
        nodeId: item.nodeId,
        width: item.width,
        x: item.position.x,
        y: item.position.y,
      };
    });
    this.layoutStore.getState().patchNodes(patches, {
      phase,
      reason,
    });
  }

  private screenPointToFlowPoint(point: GpuPoint): GpuPoint {
    return screenToFlowPosition(point, this.store.getState().transform);
  }

  private startAutoPanLoop() {
    if (
      this.options.autoPanOnSelectionDrag === false ||
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
      this.updateActiveDragFromScreenPoint(activeDrag.lastScreenPoint);
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

function gpuSelectionDragItemFromNode(
  node: GpuFlowLayoutNode,
): GpuSelectionDragItem {
  return {
    height: node.height,
    nodeId: node.nodeId,
    position: { x: node.x, y: node.y },
    width: node.width,
  };
}

function getNextGpuSelectionDragInteractionFlags(
  currentFlags: GpuFlowLayoutInteractionFlags | undefined,
  dragging: boolean,
): GpuFlowLayoutInteractionFlags | undefined {
  const nextFlags = { ...currentFlags, dragging };
  if (nextFlags.dragging || nextFlags.resizing || nextFlags.selected) {
    return nextFlags;
  }
  return undefined;
}

function snapGpuSelectionNodePosition(
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

function haveGpuSelectionDragItemsMoved(
  previousItems: readonly GpuSelectionDragItem[],
  nextItems: readonly GpuSelectionDragItem[],
): boolean {
  return nextItems.some((item, index) => {
    const previousItem = previousItems[index];
    return (
      previousItem !== undefined &&
      (item.position.x !== previousItem.position.x ||
        item.position.y !== previousItem.position.y)
    );
  });
}

function getGpuSelectionDragItemsDelta(
  previousItems: readonly GpuSelectionDragItem[],
  nextItems: readonly GpuSelectionDragItem[],
): GpuPoint {
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

function isSelectionDragDisabled(
  disabled: boolean | (() => boolean) | undefined,
): boolean {
  return typeof disabled === "function" ? disabled() : Boolean(disabled);
}

function getEventSelectionRectElement(event: Event): HTMLElement | null {
  const target = event.target;
  if (!(target instanceof Element)) {
    return null;
  }
  return target.closest<HTMLElement>(GPU_FLOW_SELECTORS.nodesSelectionRect);
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

function assertFinitePositive(name: string, value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a finite positive number.`);
  }
}
