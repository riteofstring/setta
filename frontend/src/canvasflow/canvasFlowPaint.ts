import {
  drawCanvasFlowConnectionPreview,
  drawCanvasFlowEdges,
} from "./canvasFlowEdges";
import { getVisibleNodeDrawRecords } from "./canvasFlowGeometry";
import type {
  CanvasFlowConnectionState,
  CanvasFlowDrawableEdge,
  CanvasFlowHandlePosition,
  CanvasFlowNode,
  CanvasFlowNodeDrawRecord,
  CanvasFlowNodeElementMap,
  CanvasFlowPaintStats,
  CanvasFlowRenderingContext,
  CanvasFlowSize,
  CanvasFlowViewport,
} from "./canvasFlowTypes";
import { expandWorldRect, getVisibleWorldRect } from "./canvasFlowViewport";

const DEFAULT_OVERSCAN = 600;
const PAINT_STATS_SAMPLE_INTERVAL_MS = 250;
const CANVAS_FLOW_DIAGNOSTICS_ENABLED = "enabled";
const CANVAS_FLOW_PERF_VARIANTS = new Set([
  "no-edges",
  "rect-nodes",
  "skip-transform",
]);

type CanvasFlowStatsCanvas = HTMLCanvasElement & {
  __canvasFlowLastStatsWriteMs?: number;
};
type CanvasFlowPerfVariant =
  | "default"
  | "no-edges"
  | "rect-nodes"
  | "skip-transform";
type CanvasFlowPerfWindow = typeof window & {
  __settaCanvasFlowPerfVariant?: string;
};

type PaintCanvasFlowParams = {
  canvas: HTMLCanvasElement;
  connectionState: CanvasFlowConnectionState;
  ctx: CanvasFlowRenderingContext;
  darkMode: boolean;
  edges: CanvasFlowDrawableEdge[];
  edgeHandlePositions: Record<string, CanvasFlowHandlePosition>;
  gridSize: number;
  nodeElements: CanvasFlowNodeElementMap;
  nodes: CanvasFlowNode[];
  overscan?: number;
  previousInteractiveNodeIds: Set<string>;
  showGridLines: boolean;
  size: CanvasFlowSize;
  viewport: CanvasFlowViewport;
  wireColor: string;
};

export function paintCanvasFlow({
  canvas,
  connectionState,
  ctx,
  darkMode,
  edges,
  edgeHandlePositions,
  gridSize,
  nodeElements,
  nodes,
  overscan = DEFAULT_OVERSCAN,
  previousInteractiveNodeIds,
  showGridLines,
  size,
  viewport,
  wireColor,
}: PaintCanvasFlowParams): CanvasFlowPaintStats {
  const perfVariant = getCanvasFlowPerfVariant();
  const paintStart = performance.now();
  resetCanvasContext(ctx);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(size.pixelRatio, 0, 0, size.pixelRatio, 0, 0);

  drawBackground({
    ctx,
    darkMode,
    gridSize,
    showGridLines,
    size,
    viewport,
  });

  ctx.save();
  ctx.translate(viewport.x, viewport.y);
  ctx.scale(viewport.zoom, viewport.zoom);
  const edgeDrawStart = performance.now();
  if (perfVariant !== "no-edges") {
    drawCanvasFlowEdges({ ctx, edges, wireColor });
    drawCanvasFlowConnectionPreview({
      connectionState,
      ctx,
      positions: edgeHandlePositions,
      viewport,
    });
  }
  const edgeDrawMs = performance.now() - edgeDrawStart;
  ctx.restore();

  const visibleRect = expandWorldRect(
    getVisibleWorldRect(size, viewport),
    overscan,
  );
  const visibilityScanStart = performance.now();
  const visibleNodes = getVisibleNodeDrawRecords({
    nodes,
    nodeElements,
    visibleRect,
  });
  const visibilityScanMs = performance.now() - visibilityScanStart;
  const nextInteractiveNodeIds = new Set<string>();
  let drawElementImageMs = 0;
  let transformAssignmentMs = 0;
  let drawnNodeCount = 0;

  for (const node of visibleNodes) {
    const element = getNodeElement(canvas, nodeElements, node.id);
    if (!element) {
      continue;
    }
    drawnNodeCount += 1;
    const screenRect = getNodeScreenDrawRect(node, viewport);
    if (perfVariant === "rect-nodes") {
      drawNodeDiagnosticRect(ctx, node, screenRect);
      continue;
    }
    const drawStart = performance.now();
    const transform = ctx.drawElementImage(
      element,
      screenRect.x,
      screenRect.y,
      screenRect.width,
      screenRect.height,
    );
    drawElementImageMs += performance.now() - drawStart;

    const transformStart = performance.now();
    if (perfVariant !== "skip-transform") {
      assignNodePaintStyle(element, transform.toString());
    }
    transformAssignmentMs += performance.now() - transformStart;
    nextInteractiveNodeIds.add(node.id);
  }

  disableCulledNodePointerEvents({
    nodeElements,
    previousInteractiveNodeIds,
    nextInteractiveNodeIds,
  });
  previousInteractiveNodeIds.clear();
  for (const nodeId of nextInteractiveNodeIds) {
    previousInteractiveNodeIds.add(nodeId);
  }

  const paintEnd = performance.now();
  const stats = {
    edgeCount: edges.length,
    edgeDrawMs,
    visibleNodeCount: visibleNodes.length,
    drawnNodeCount,
    registeredNodeCount: nodes.length,
    mountedNodeCount: nodeElements.size,
    drawElementImageMs,
    visibilityScanMs,
    transformAssignmentMs,
    totalPaintMs: paintEnd - paintStart,
  };
  writePaintStats(canvas, stats, viewport, paintEnd);
  return stats;
}

function getCanvasFlowPerfVariant(): CanvasFlowPerfVariant {
  if (typeof window === "undefined") {
    return "default";
  }
  const variant = (window as CanvasFlowPerfWindow).__settaCanvasFlowPerfVariant;
  if (variant && CANVAS_FLOW_PERF_VARIANTS.has(variant)) {
    return variant as CanvasFlowPerfVariant;
  }
  return "default";
}

function drawNodeDiagnosticRect(
  ctx: CanvasRenderingContext2D,
  node: CanvasFlowNodeDrawRecord,
  screenRect: ReturnType<typeof getNodeScreenDrawRect>,
) {
  ctx.fillStyle = "rgba(59, 130, 246, 0.22)";
  ctx.fillRect(screenRect.x, screenRect.y, screenRect.width, screenRect.height);
  ctx.strokeStyle = "rgba(30, 64, 175, 0.72)";
  ctx.lineWidth = 1;
  ctx.strokeRect(
    screenRect.x,
    screenRect.y,
    screenRect.width,
    screenRect.height,
  );
  if (screenRect.width < 36 || screenRect.height < 18) {
    return;
  }
  ctx.fillStyle = "rgba(15, 23, 42, 0.86)";
  ctx.font = "11px sans-serif";
  ctx.fillText(node.id, screenRect.x + 6, screenRect.y + 14);
}

function getNodeScreenDrawRect(
  node: Pick<CanvasFlowNodeDrawRecord, "x" | "y" | "width" | "height">,
  viewport: CanvasFlowViewport,
) {
  return {
    x: viewport.x + node.x * viewport.zoom,
    y: viewport.y + node.y * viewport.zoom,
    width: node.width * viewport.zoom,
    height: node.height * viewport.zoom,
  };
}

function getNodeElement(
  canvas: HTMLCanvasElement,
  nodeElements: CanvasFlowNodeElementMap,
  nodeId: string,
): HTMLElement | null {
  const existing = nodeElements.get(nodeId);
  if (existing) {
    return existing;
  }
  for (const child of canvas.children) {
    if (!(child instanceof HTMLElement)) {
      continue;
    }
    if (child.dataset.id === nodeId) {
      nodeElements.set(nodeId, child);
      return child;
    }
  }
  return null;
}

function resetCanvasContext(ctx: CanvasRenderingContext2D) {
  if (typeof ctx.reset === "function") {
    ctx.reset();
    return;
  }
  ctx.resetTransform();
}

function drawBackground({
  ctx,
  darkMode,
  size,
}: {
  ctx: CanvasRenderingContext2D;
  darkMode: boolean;
  gridSize: number;
  showGridLines: boolean;
  size: CanvasFlowSize;
  viewport: CanvasFlowViewport;
}) {
  ctx.fillStyle = darkMode ? "#101827" : "#f8fafc";
  ctx.fillRect(0, 0, size.cssWidth, size.cssHeight);
  /*
  Grid drawing is disabled temporarily to isolate canvas paint performance.
  if (!showGridLines) {
    return;
  }
  const scaledGridSize = Math.max(gridSize * viewport.zoom, 1);
  if (scaledGridSize < 6) {
    return;
  }
  const startX = positiveModulo(viewport.x, scaledGridSize);
  const startY = positiveModulo(viewport.y, scaledGridSize);
  ctx.beginPath();
  for (let x = startX; x <= size.cssWidth; x += scaledGridSize) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, size.cssHeight);
  }
  for (let y = startY; y <= size.cssHeight; y += scaledGridSize) {
    ctx.moveTo(0, y);
    ctx.lineTo(size.cssWidth, y);
  }
  ctx.strokeStyle = darkMode
    ? "rgba(148, 163, 184, 0.18)"
    : "rgba(100, 116, 139, 0.18)";
  ctx.lineWidth = 1;
  ctx.stroke();
  */
}

function disableCulledNodePointerEvents({
  nodeElements,
  previousInteractiveNodeIds,
  nextInteractiveNodeIds,
}: {
  nodeElements: CanvasFlowNodeElementMap;
  previousInteractiveNodeIds: Set<string>;
  nextInteractiveNodeIds: Set<string>;
}) {
  for (const nodeId of previousInteractiveNodeIds) {
    if (nextInteractiveNodeIds.has(nodeId)) {
      continue;
    }
    const element = nodeElements.get(nodeId);
    if (element && element.style.pointerEvents !== "none") {
      element.style.pointerEvents = "none";
    }
  }
}

function assignNodePaintStyle(element: HTMLElement, transform: string) {
  if (element.style.transform !== transform) {
    element.style.transform = transform;
  }
  if (element.style.pointerEvents !== "all") {
    element.style.pointerEvents = "all";
  }
}

/*
function positiveModulo(value: number, modulo: number) {
  return ((value % modulo) + modulo) % modulo;
}
*/

function writePaintStats(
  canvas: HTMLCanvasElement,
  stats: CanvasFlowPaintStats,
  viewport: CanvasFlowViewport,
  now: number,
) {
  if (!shouldWritePaintStats(canvas, now)) {
    return;
  }
  canvas.dataset.paintSequence = String(
    Number.parseInt(canvas.dataset.paintSequence ?? "0", 10) + 1,
  );
  canvas.dataset.visibleNodes = String(stats.visibleNodeCount);
  canvas.dataset.drawnNodes = String(stats.drawnNodeCount);
  canvas.dataset.registeredNodes = String(stats.registeredNodeCount);
  canvas.dataset.mountedNodes = String(stats.mountedNodeCount);
  canvas.dataset.edgeCount = String(stats.edgeCount);
  canvas.dataset.edgeDrawMs = stats.edgeDrawMs.toFixed(2);
  canvas.dataset.drawElementImageMs = stats.drawElementImageMs.toFixed(2);
  canvas.dataset.visibilityScanMs = stats.visibilityScanMs.toFixed(2);
  canvas.dataset.transformAssignmentMs = stats.transformAssignmentMs.toFixed(2);
  canvas.dataset.totalPaintMs = stats.totalPaintMs.toFixed(2);
  canvas.dataset.viewportX = viewport.x.toFixed(2);
  canvas.dataset.viewportY = viewport.y.toFixed(2);
  canvas.dataset.viewportZoom = viewport.zoom.toFixed(4);
}

function shouldWritePaintStats(canvas: HTMLCanvasElement, now: number) {
  if (
    canvas.dataset.canvasFlowDiagnostics === CANVAS_FLOW_DIAGNOSTICS_ENABLED
  ) {
    (canvas as CanvasFlowStatsCanvas).__canvasFlowLastStatsWriteMs = now;
    return true;
  }
  const statsCanvas = canvas as CanvasFlowStatsCanvas;
  const previousWrite = statsCanvas.__canvasFlowLastStatsWriteMs;
  if (
    previousWrite !== undefined &&
    now - previousWrite < PAINT_STATS_SAMPLE_INTERVAL_MS
  ) {
    return false;
  }
  statsCanvas.__canvasFlowLastStatsWriteMs = now;
  return true;
}
