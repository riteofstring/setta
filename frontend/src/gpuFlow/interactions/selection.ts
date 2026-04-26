import { NO_PAN_CLASS_NAME } from "utils/constants";
import { SelectionModeEnum } from "utils/generatedTypes";
import type { GpuNodeLayout } from "../GpuNodeLayer";
import {
  rectsIntersect,
  screenToFlowPosition,
  type GpuPoint,
  type GpuRect,
} from "../viewportMath";
import {
  gpuFlowViewportStore,
  type GpuFlowViewportStoreApi,
  type GpuUserSelectionRect,
} from "../viewportStore";

type GpuSelectionMode =
  (typeof SelectionModeEnum)[keyof typeof SelectionModeEnum];

type GpuSelectionPhase = "start" | "change" | "end" | "cancel";

type GpuSelectionChange = {
  readonly active: boolean;
  readonly phase: GpuSelectionPhase;
  readonly rect: GpuUserSelectionRect | null;
  readonly selectedNodeIds: readonly string[];
};

export type GpuSelectionControllerOptions = {
  readonly element: HTMLElement;
  readonly getNodes: () => readonly GpuNodeLayout[];
  readonly isSelecting?: boolean | (() => boolean) | undefined;
  readonly minDragDistancePx?: number | undefined;
  readonly mode?: GpuSelectionMode | undefined;
  readonly onSelectionChange?:
    | ((change: GpuSelectionChange) => void)
    | undefined;
  readonly store?: GpuFlowViewportStoreApi | undefined;
};

type ActiveGpuSelection = {
  lastSelectedNodeIds: readonly string[];
  pointerId: number;
  startX: number;
  startY: number;
};

const DEFAULT_MIN_DRAG_DISTANCE_PX = 1;

export function attachGpuSelectionController(
  options: GpuSelectionControllerOptions,
): () => void {
  const controller = new GpuSelectionController(options);
  controller.attach();
  return () => controller.destroy();
}

export function getGpuNodesInsideSelectionRect({
  mode = SelectionModeEnum.full,
  nodes,
  rect,
  viewport,
}: {
  readonly mode?: GpuSelectionMode | undefined;
  readonly nodes: readonly GpuNodeLayout[];
  readonly rect: GpuUserSelectionRect;
  readonly viewport: Parameters<typeof screenToFlowPosition>[1];
}): string[] {
  const flowRect = userSelectionRectToFlowRect(rect, viewport);
  const selectedNodeIds: string[] = [];
  for (const node of nodes) {
    const nodeRect = getNodeRect(node);
    if (!nodeRect) {
      continue;
    }
    const selected =
      mode === SelectionModeEnum.partial
        ? rectsIntersect(flowRect, nodeRect)
        : rectContainsRect(flowRect, nodeRect);
    if (selected) {
      selectedNodeIds.push(node.nodeId);
    }
  }
  return selectedNodeIds;
}

export function getGpuNodeSelectionBounds(
  nodes: readonly GpuNodeLayout[],
  selectedNodeIds: readonly string[],
): GpuRect | null {
  if (selectedNodeIds.length === 0) {
    return null;
  }
  const selectedIds = new Set(selectedNodeIds);
  let bounds: GpuRect | null = null;
  for (const node of nodes) {
    if (!selectedIds.has(node.nodeId)) {
      continue;
    }
    const rect = getNodeRect(node);
    if (!rect) {
      continue;
    }
    bounds = bounds ? getBoundsOfGpuRects(bounds, rect) : rect;
  }
  return bounds;
}

class GpuSelectionController {
  private activeSelection: ActiveGpuSelection | null = null;
  private readonly element: HTMLElement;
  private readonly getNodes: () => readonly GpuNodeLayout[];
  private readonly isSelecting: boolean | (() => boolean) | undefined;
  private readonly minDragDistancePx: number;
  private readonly mode: GpuSelectionMode;
  private readonly onSelectionChange:
    | ((change: GpuSelectionChange) => void)
    | undefined;
  private readonly store: GpuFlowViewportStoreApi;

  constructor(options: GpuSelectionControllerOptions) {
    this.element = options.element;
    this.getNodes = options.getNodes;
    this.isSelecting = options.isSelecting;
    this.minDragDistancePx =
      options.minDragDistancePx ?? DEFAULT_MIN_DRAG_DISTANCE_PX;
    this.mode = options.mode ?? SelectionModeEnum.full;
    this.onSelectionChange = options.onSelectionChange;
    this.store = options.store ?? gpuFlowViewportStore;
  }

  attach() {
    this.element.addEventListener("pointerdown", this.onPointerDown);
    this.element.addEventListener("pointermove", this.onPointerMove);
    this.element.addEventListener("pointerup", this.onPointerUp);
    this.element.addEventListener("pointercancel", this.onPointerCancel);
  }

  destroy() {
    this.element.removeEventListener("pointerdown", this.onPointerDown);
    this.element.removeEventListener("pointermove", this.onPointerMove);
    this.element.removeEventListener("pointerup", this.onPointerUp);
    this.element.removeEventListener("pointercancel", this.onPointerCancel);
    this.cancelSelection();
  }

  private readonly onPointerDown = (event: PointerEvent) => {
    if (!this.shouldStartSelection(event)) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    const point = getEventPointRelativeToElement(event, this.element);
    const rect = createUserSelectionRect(point, point);
    this.activeSelection = {
      lastSelectedNodeIds: [],
      pointerId: event.pointerId,
      startX: point.x,
      startY: point.y,
    };
    this.store.getState().setUserSelection({
      active: false,
      rect,
    });
    this.store.getState().setNodesSelectionBounds(null);
    this.element.setPointerCapture?.(event.pointerId);
    this.emitSelectionChange({
      active: false,
      phase: "start",
      rect,
      selectedNodeIds: [],
    });
  };

  private readonly onPointerMove = (event: PointerEvent) => {
    const selection = this.activeSelection;
    if (!selection || selection.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    const point = getEventPointRelativeToElement(event, this.element);
    const start = { x: selection.startX, y: selection.startY };
    const rect = createUserSelectionRect(start, point);
    const active = isSelectionDragActive({
      minDragDistancePx: this.minDragDistancePx,
      point,
      start,
    });
    const selectedNodeIds = active
      ? getGpuNodesInsideSelectionRect({
          mode: this.mode,
          nodes: this.getNodes(),
          rect,
          viewport: this.store.getState().transform,
        })
      : [];

    this.store.getState().setUserSelection({ active, rect });
    this.store
      .getState()
      .setNodesSelectionBounds(
        active
          ? getGpuNodeSelectionBounds(this.getNodes(), selectedNodeIds)
          : null,
      );
    if (!areStringArraysEqual(selection.lastSelectedNodeIds, selectedNodeIds)) {
      selection.lastSelectedNodeIds = selectedNodeIds;
      this.emitSelectionChange({
        active,
        phase: "change",
        rect,
        selectedNodeIds,
      });
    }
  };

  private readonly onPointerUp = (event: PointerEvent) => {
    const selection = this.activeSelection;
    if (!selection || selection.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    this.element.releasePointerCapture?.(event.pointerId);
    const state = this.store.getState();
    this.emitSelectionChange({
      active: state.userSelectionActive,
      phase: "end",
      rect: state.userSelectionRect,
      selectedNodeIds: selection.lastSelectedNodeIds,
    });
    this.activeSelection = null;
    state.resetUserSelection();
  };

  private readonly onPointerCancel = (event: PointerEvent) => {
    const selection = this.activeSelection;
    if (!selection || selection.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    this.element.releasePointerCapture?.(event.pointerId);
    this.emitSelectionChange({
      active: false,
      phase: "cancel",
      rect: this.store.getState().userSelectionRect,
      selectedNodeIds: [],
    });
    this.cancelSelection();
  };

  private shouldStartSelection(event: PointerEvent): boolean {
    if (event.button !== 0) {
      return false;
    }
    if (!this.isSelectionEnabled()) {
      return false;
    }
    if (!isGpuFlowBackgroundSelectionTarget(event, this.element)) {
      return false;
    }
    return !isEventTargetWrappedWithClass(event, NO_PAN_CLASS_NAME);
  }

  private isSelectionEnabled(): boolean {
    if (typeof this.isSelecting === "function") {
      return this.isSelecting();
    }
    if (this.isSelecting !== undefined) {
      return this.isSelecting;
    }
    return this.store.getState().selectionKeyPressed;
  }

  private cancelSelection() {
    this.activeSelection = null;
    this.store.getState().resetUserSelection();
  }

  private emitSelectionChange(change: GpuSelectionChange) {
    this.onSelectionChange?.(change);
  }
}

function createUserSelectionRect(
  start: GpuPoint,
  point: GpuPoint,
): GpuUserSelectionRect {
  return {
    height: Math.abs(point.y - start.y),
    startX: start.x,
    startY: start.y,
    width: Math.abs(point.x - start.x),
    x: Math.min(point.x, start.x),
    y: Math.min(point.y, start.y),
  };
}

function userSelectionRectToFlowRect(
  rect: GpuUserSelectionRect,
  viewport: Parameters<typeof screenToFlowPosition>[1],
): GpuRect {
  const topLeft = screenToFlowPosition({ x: rect.x, y: rect.y }, viewport);
  const bottomRight = screenToFlowPosition(
    {
      x: rect.x + rect.width,
      y: rect.y + rect.height,
    },
    viewport,
  );
  return {
    height: bottomRight.y - topLeft.y,
    width: bottomRight.x - topLeft.x,
    x: topLeft.x,
    y: topLeft.y,
  };
}

function getNodeRect(node: GpuNodeLayout): GpuRect | null {
  if (
    node.width === null ||
    node.height === null ||
    node.width <= 0 ||
    node.height <= 0
  ) {
    return null;
  }
  return {
    height: node.height,
    width: node.width,
    x: node.x,
    y: node.y,
  };
}

function getBoundsOfGpuRects(left: GpuRect, right: GpuRect): GpuRect {
  const x = Math.min(left.x, right.x);
  const y = Math.min(left.y, right.y);
  const x2 = Math.max(left.x + left.width, right.x + right.width);
  const y2 = Math.max(left.y + left.height, right.y + right.height);
  return {
    height: y2 - y,
    width: x2 - x,
    x,
    y,
  };
}

function rectContainsRect(outer: GpuRect, inner: GpuRect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

function isSelectionDragActive({
  minDragDistancePx,
  point,
  start,
}: {
  readonly minDragDistancePx: number;
  readonly point: GpuPoint;
  readonly start: GpuPoint;
}): boolean {
  const deltaX = point.x - start.x;
  const deltaY = point.y - start.y;
  return Math.hypot(deltaX, deltaY) >= minDragDistancePx;
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

function isGpuFlowBackgroundSelectionTarget(
  event: Event,
  element: HTMLElement,
): boolean {
  const target = event.target;
  if (!(target instanceof Element)) {
    return false;
  }
  if (target === element) {
    return true;
  }
  return (
    target.closest(".setta-gpu-flow__node") === null &&
    target.closest(".react-flow__node") === null &&
    target.closest("[data-gpu-flow-surface='true']") !== null
  );
}

function isEventTargetWrappedWithClass(
  event: Event,
  className: string,
): boolean {
  const target = event.target;
  if (!(target instanceof Element)) {
    return false;
  }
  return target.closest(`.${className}`) !== null;
}

function areStringArraysEqual(
  left: readonly string[],
  right: readonly string[],
): boolean {
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}
