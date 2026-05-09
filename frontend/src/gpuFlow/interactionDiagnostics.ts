import type { GpuRetainedContentInteractionHit } from "./interactions/retainedContentInteraction";
import type { GpuRetainedContentHitTarget } from "./retainedContentHitTest";
import type {
  GpuRetainedContentRow,
  GpuRetainedContentRowState,
} from "./retainedContentScene";
import {
  normalizeGpuViewport,
  type GpuPoint,
  type GpuRect,
} from "./viewportMath";
import type { GpuFlowViewportStore } from "./viewportStore";

export type GpuFlowInteractionMode =
  | "none"
  | "connection"
  | "node-drag"
  | "node-resize"
  | "pane-drag"
  | "pan-scroll"
  | "pointer-pan"
  | "retained-content"
  | "retained-content-drag"
  | "selection"
  | "viewport"
  | "wheel-zoom";

export type GpuFlowElementDiagnostics = {
  readonly className: string | null;
  readonly gpuFlowDomIslandId: string | null;
  readonly gpuFlowDomIslandKind: string | null;
  readonly gpuFlowInteractive: string | null;
  readonly gpuFlowNodeId: string | null;
  readonly gpuFlowRetainedContentCanvasId: string | null;
  readonly gpuFlowSourceId: string | null;
  readonly id: string | null;
  readonly projectParamId: string | null;
  readonly tagName: string;
  readonly testId: string | null;
};

export type GpuFlowRetainedHitDiagnostics = {
  readonly flowPoint: GpuPoint;
  readonly hitId: string;
  readonly hitKind: string;
  readonly localPoint: GpuPoint;
  readonly ownerSectionId: string;
  readonly rowControlKind: string | null;
  readonly rowId: string;
  readonly rowLabel: string | null;
  readonly rowState: GpuRetainedContentRowState | null;
  readonly screenPoint: GpuPoint | null;
  readonly subpartKind: string | null;
  readonly surfaceId: string;
  readonly zIndex: number;
};

export type GpuFlowPointerDiagnostics = {
  readonly button: number;
  readonly buttons: number;
  readonly clientX: number;
  readonly clientY: number;
  readonly defaultPrevented: boolean;
  readonly elementFromPoint: GpuFlowElementDiagnostics | null;
  readonly pointerId: number;
  readonly pointerType: string;
  readonly target: GpuFlowElementDiagnostics | null;
  readonly type: string;
};

export type GpuFlowPointerCaptureDiagnostics = {
  readonly active: boolean;
  readonly pointerId: number;
};

export type MutableGpuFlowInteractionDiagnostics = {
  activeRetainedHit: GpuFlowRetainedHitDiagnostics | null;
  activeRetainedPointerDragging: boolean;
  activeRetainedPointerId: number | null;
  hoveredRetainedHit: GpuFlowRetainedHitDiagnostics | null;
  lastPointer: GpuFlowPointerDiagnostics | null;
  pointerCapture: GpuFlowPointerCaptureDiagnostics | null;
};

export type GpuFlowInteractionDiagnostics = {
  readonly activeDomIsland: GpuFlowElementDiagnostics | null;
  readonly activeMode: GpuFlowInteractionMode;
  readonly activeResizeNodeId: string | null;
  readonly activeRetainedHit: GpuFlowRetainedHitDiagnostics | null;
  readonly hoveredRetainedHit: GpuFlowRetainedHitDiagnostics | null;
  readonly lastPointer: GpuFlowPointerDiagnostics | null;
  readonly nodeInteractionActiveNodeId: string | null;
  readonly pointerCapture: GpuFlowPointerCaptureDiagnostics | null;
  readonly viewport: {
    readonly connectionStartHandlePresent: boolean;
    readonly multiSelectionActive: boolean;
    readonly nodeDragging: boolean;
    readonly nodeResizing: boolean;
    readonly nodesSelectionBounds: GpuRect | null;
    readonly panScrolling: boolean;
    readonly paneDragging: boolean;
    readonly pointerPanning: boolean;
    readonly selectionKeyPressed: boolean;
    readonly transform: {
      readonly x: number;
      readonly y: number;
      readonly zoom: number;
    };
    readonly userSelectionActive: boolean;
    readonly userSelectionRect: GpuRect | null;
    readonly viewportAnimating: boolean;
    readonly viewportInteractionActive: boolean;
    readonly wheelZooming: boolean;
  };
};

export type GpuFlowRetainedRowDebugEntry = {
  readonly canvasCssSize: { readonly height: number; readonly width: number };
  readonly canvasSamplePoint: GpuPoint;
  readonly clientRect: GpuRect;
  readonly controlClientPoint: GpuPoint | null;
  readonly controlKind: string | null;
  readonly ownerSectionId: string;
  readonly rowId: string;
  readonly rowLabel: string;
  readonly rowState: GpuRetainedContentRowState;
  readonly surfaceId: string;
};

export function createGpuFlowInteractionDiagnosticsState(): MutableGpuFlowInteractionDiagnostics {
  return {
    activeRetainedHit: null,
    activeRetainedPointerDragging: false,
    activeRetainedPointerId: null,
    hoveredRetainedHit: null,
    lastPointer: null,
    pointerCapture: null,
  };
}

export function createGpuFlowInteractionDiagnosticsSnapshot({
  activeResizeNodeId,
  diagnostics,
  nodeInteractionActiveNodeId,
  ownerDocument,
  viewportState,
}: {
  readonly activeResizeNodeId: string | null;
  readonly diagnostics: MutableGpuFlowInteractionDiagnostics;
  readonly nodeInteractionActiveNodeId: string | null;
  readonly ownerDocument: Document | null;
  readonly viewportState: GpuFlowViewportStore;
}): GpuFlowInteractionDiagnostics {
  const viewport = normalizeGpuViewport(viewportState.transform);
  return {
    activeDomIsland: toGpuFlowElementDiagnostics(
      ownerDocument?.activeElement ?? null,
    ),
    activeMode: resolveGpuFlowInteractionMode({
      activeResizeNodeId,
      diagnostics,
      nodeInteractionActiveNodeId,
      viewportState,
    }),
    activeResizeNodeId,
    activeRetainedHit: diagnostics.activeRetainedHit,
    hoveredRetainedHit: diagnostics.hoveredRetainedHit,
    lastPointer: diagnostics.lastPointer,
    nodeInteractionActiveNodeId,
    pointerCapture: diagnostics.pointerCapture,
    viewport: {
      connectionStartHandlePresent:
        viewportState.connectionStartHandle !== null,
      multiSelectionActive: viewportState.multiSelectionActive,
      nodeDragging: viewportState.nodeDragging,
      nodeResizing: viewportState.nodeResizing,
      nodesSelectionBounds: copyGpuRect(viewportState.nodesSelectionBounds),
      panScrolling: viewportState.panScrolling,
      paneDragging: viewportState.paneDragging,
      pointerPanning: viewportState.pointerPanning,
      selectionKeyPressed: viewportState.selectionKeyPressed,
      transform: {
        x: roundGpuFlowDiagnosticsNumber(viewport.x),
        y: roundGpuFlowDiagnosticsNumber(viewport.y),
        zoom: roundGpuFlowDiagnosticsNumber(viewport.zoom),
      },
      userSelectionActive: viewportState.userSelectionActive,
      userSelectionRect: copyGpuRect(viewportState.userSelectionRect),
      viewportAnimating: viewportState.viewportAnimating,
      viewportInteractionActive: viewportState.viewportInteractionActive,
      wheelZooming: viewportState.wheelZooming,
    },
  };
}

export function toGpuFlowRetainedHitDiagnostics(
  hit: GpuRetainedContentInteractionHit | GpuRetainedContentHitTarget | null,
): GpuFlowRetainedHitDiagnostics | null {
  if (!hit) {
    return null;
  }
  const row = findGpuFlowRetainedHitRow(hit);
  return {
    flowPoint: copyGpuPoint(hit.flowPoint),
    hitId: hit.hit.id,
    hitKind: hit.hit.kind,
    localPoint: copyGpuPoint(hit.localPoint),
    ownerSectionId: hit.ownerSectionId,
    rowControlKind: getGpuFlowRetainedHitRowControlKind(row),
    rowId: hit.hit.ownerRowId,
    rowLabel: row?.label ?? null,
    rowState: row ? { ...row.state } : null,
    screenPoint: getGpuFlowRetainedHitScreenPoint(hit),
    subpartKind: hit.hit.subpartKind ?? null,
    surfaceId: hit.surfaceId,
    zIndex: hit.zIndex,
  };
}

function findGpuFlowRetainedHitRow(
  hit: GpuRetainedContentInteractionHit | GpuRetainedContentHitTarget,
): GpuRetainedContentRow | null {
  return (
    hit.retainedScene.rows.find(
      (candidate) => candidate.id === hit.hit.ownerRowId,
    ) ?? null
  );
}

function getGpuFlowRetainedHitRowControlKind(
  row: GpuRetainedContentRow | null,
): string | null {
  if (!row) {
    return null;
  }
  return row.control?.kind ?? row.controlKind;
}

function getGpuFlowRetainedHitScreenPoint(
  hit: GpuRetainedContentInteractionHit | GpuRetainedContentHitTarget,
): GpuPoint | null {
  if (!("screenPoint" in hit)) {
    return null;
  }
  return copyGpuPoint(hit.screenPoint);
}

export function recordGpuFlowPointerDiagnostics({
  diagnostics,
  element,
  event,
}: {
  readonly diagnostics: MutableGpuFlowInteractionDiagnostics;
  readonly element: HTMLElement;
  readonly event: PointerEvent;
}) {
  const elementFromPoint =
    element.ownerDocument.elementFromPoint?.(event.clientX, event.clientY) ??
    null;
  diagnostics.lastPointer = {
    button: event.button,
    buttons: event.buttons,
    clientX: roundGpuFlowDiagnosticsNumber(event.clientX),
    clientY: roundGpuFlowDiagnosticsNumber(event.clientY),
    defaultPrevented: event.defaultPrevented,
    elementFromPoint: toGpuFlowElementDiagnostics(elementFromPoint),
    pointerId: event.pointerId,
    pointerType: event.pointerType,
    target: toGpuFlowElementDiagnostics(event.target),
    type: event.type,
  };
}

export function toGpuFlowElementDiagnostics(
  value: EventTarget | Element | null | undefined,
): GpuFlowElementDiagnostics | null {
  if (!isGpuFlowDiagnosticsElement(value)) {
    return null;
  }
  return {
    className: getGpuFlowElementClassName(value),
    gpuFlowDomIslandId: getClosestGpuFlowElementAttribute(
      value,
      "[data-gpu-flow-dom-island-id]",
      "data-gpu-flow-dom-island-id",
    ),
    gpuFlowDomIslandKind: getClosestGpuFlowElementAttribute(
      value,
      "[data-gpu-flow-dom-island-id]",
      "data-gpu-flow-dom-island-kind",
    ),
    gpuFlowInteractive: getClosestGpuFlowElementAttribute(
      value,
      "[data-gpu-flow-interactive]",
      "data-gpu-flow-interactive",
    ),
    gpuFlowNodeId: getClosestGpuFlowElementAttribute(
      value,
      "[data-gpu-flow-node='true']",
      "data-gpu-flow-source-id",
    ),
    gpuFlowRetainedContentCanvasId: getClosestGpuFlowElementAttribute(
      value,
      "[data-gpu-flow-retained-content-canvas='true']",
      "data-gpu-flow-retained-content-id",
    ),
    gpuFlowSourceId: getClosestGpuFlowElementAttribute(
      value,
      "[data-gpu-flow-source-id]",
      "data-gpu-flow-source-id",
    ),
    id: value.id || null,
    projectParamId: getClosestGpuFlowElementAttribute(
      value,
      "[data-param-id]",
      "data-param-id",
    ),
    tagName: value.tagName.toLowerCase(),
    testId: value.getAttribute("data-testid"),
  };
}

function isGpuFlowDiagnosticsElement(
  value: EventTarget | Element | null | undefined,
): value is Element {
  return typeof Element !== "undefined" && value instanceof Element;
}

function getGpuFlowElementClassName(value: Element): string | null {
  const className = value.className;
  if (typeof className !== "string" || className.length === 0) {
    return null;
  }
  return className;
}

function getClosestGpuFlowElementAttribute(
  value: Element,
  selector: string,
  attribute: string,
): string | null {
  return value.closest<HTMLElement>(selector)?.getAttribute(attribute) ?? null;
}

function resolveGpuFlowInteractionMode({
  activeResizeNodeId,
  diagnostics,
  nodeInteractionActiveNodeId,
  viewportState,
}: {
  readonly activeResizeNodeId: string | null;
  readonly diagnostics: MutableGpuFlowInteractionDiagnostics;
  readonly nodeInteractionActiveNodeId: string | null;
  readonly viewportState: GpuFlowViewportStore;
}): GpuFlowInteractionMode {
  const retainedMode = resolveGpuFlowRetainedInteractionMode(diagnostics);
  if (retainedMode) {
    return retainedMode;
  }
  const activeModes: readonly {
    readonly active: boolean;
    readonly mode: GpuFlowInteractionMode;
  }[] = [
    {
      active: isGpuFlowNodeResizeModeActive(activeResizeNodeId, viewportState),
      mode: "node-resize",
    },
    {
      active: isGpuFlowNodeDragModeActive(
        nodeInteractionActiveNodeId,
        viewportState,
      ),
      mode: "node-drag",
    },
    {
      active: viewportState.connectionStartHandle !== null,
      mode: "connection",
    },
    {
      active: isGpuFlowSelectionModeActive(viewportState),
      mode: "selection",
    },
    { active: viewportState.pointerPanning, mode: "pointer-pan" },
    { active: viewportState.panScrolling, mode: "pan-scroll" },
    { active: viewportState.paneDragging, mode: "pane-drag" },
    { active: viewportState.wheelZooming, mode: "wheel-zoom" },
    { active: isGpuFlowViewportModeActive(viewportState), mode: "viewport" },
  ];
  return activeModes.find((entry) => entry.active)?.mode ?? "none";
}

function resolveGpuFlowRetainedInteractionMode(
  diagnostics: MutableGpuFlowInteractionDiagnostics,
): GpuFlowInteractionMode | null {
  if (diagnostics.activeRetainedHit) {
    return diagnostics.activeRetainedPointerDragging
      ? "retained-content-drag"
      : "retained-content";
  }
  return null;
}

function isGpuFlowNodeResizeModeActive(
  activeResizeNodeId: string | null,
  viewportState: GpuFlowViewportStore,
): boolean {
  return activeResizeNodeId !== null || viewportState.nodeResizing;
}

function isGpuFlowNodeDragModeActive(
  nodeInteractionActiveNodeId: string | null,
  viewportState: GpuFlowViewportStore,
): boolean {
  return nodeInteractionActiveNodeId !== null || viewportState.nodeDragging;
}

function isGpuFlowSelectionModeActive(
  viewportState: GpuFlowViewportStore,
): boolean {
  return (
    viewportState.userSelectionActive || viewportState.multiSelectionActive
  );
}

function isGpuFlowViewportModeActive(
  viewportState: GpuFlowViewportStore,
): boolean {
  return (
    viewportState.viewportAnimating || viewportState.viewportInteractionActive
  );
}

function copyGpuPoint(point: GpuPoint): GpuPoint {
  return {
    x: roundGpuFlowDiagnosticsNumber(point.x),
    y: roundGpuFlowDiagnosticsNumber(point.y),
  };
}

function copyGpuRect(rect: GpuRect | null): GpuRect | null {
  if (!rect) {
    return null;
  }
  return {
    height: roundGpuFlowDiagnosticsNumber(rect.height),
    width: roundGpuFlowDiagnosticsNumber(rect.width),
    x: roundGpuFlowDiagnosticsNumber(rect.x),
    y: roundGpuFlowDiagnosticsNumber(rect.y),
  };
}

function roundGpuFlowDiagnosticsNumber(value: number): number {
  return Math.round(value * 10) / 10;
}

declare global {
  interface Window {
    __SETTA_GPU_FLOW_DEBUG_SNAPSHOT__?:
      | (() => GpuFlowInteractionDiagnostics)
      | undefined;
    __SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?:
      | (() => readonly GpuFlowRetainedRowDebugEntry[])
      | undefined;
  }
}
