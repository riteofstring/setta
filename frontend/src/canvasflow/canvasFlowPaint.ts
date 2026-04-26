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
  CanvasFlowNodeElementMap,
  CanvasFlowPaintStats,
  CanvasFlowRenderingContext,
  CanvasFlowSize,
  CanvasFlowViewport,
} from "./canvasFlowTypes";
import { expandWorldRect, getVisibleWorldRect } from "./canvasFlowViewport";

const DEFAULT_OVERSCAN = 600;

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
  drawCanvasFlowEdges({ ctx, edges, wireColor });
  drawCanvasFlowConnectionPreview({
    connectionState,
    ctx,
    positions: edgeHandlePositions,
    viewport,
  });

  const visibleRect = expandWorldRect(
    getVisibleWorldRect(size, viewport),
    overscan,
  );
  const visibleNodes = getVisibleNodeDrawRecords({
    nodes,
    nodeElements,
    visibleRect,
  });
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
    const drawStart = performance.now();
    const transform = ctx.drawElementImage(
      element,
      node.x,
      node.y,
      node.width,
      node.height,
    );
    drawElementImageMs += performance.now() - drawStart;

    const transformStart = performance.now();
    element.style.transform = transform.toString();
    element.style.pointerEvents = "all";
    transformAssignmentMs += performance.now() - transformStart;
    nextInteractiveNodeIds.add(node.id);
  }
  ctx.restore();

  disableCulledNodePointerEvents({
    nodeElements,
    previousInteractiveNodeIds,
    nextInteractiveNodeIds,
  });
  previousInteractiveNodeIds.clear();
  for (const nodeId of nextInteractiveNodeIds) {
    previousInteractiveNodeIds.add(nodeId);
  }

  const stats = {
    visibleNodeCount: visibleNodes.length,
    drawnNodeCount,
    registeredNodeCount: nodes.length,
    mountedNodeCount: nodeElements.size,
    drawElementImageMs,
    transformAssignmentMs,
    totalPaintMs: performance.now() - paintStart,
  };
  writePaintStats(canvas, stats, viewport);
  return stats;
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
  gridSize,
  showGridLines,
  size,
  viewport,
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
    if (element) {
      element.style.pointerEvents = "none";
    }
  }
}

function positiveModulo(value: number, modulo: number) {
  return ((value % modulo) + modulo) % modulo;
}

function writePaintStats(
  canvas: HTMLCanvasElement,
  stats: CanvasFlowPaintStats,
  viewport: CanvasFlowViewport,
) {
  canvas.dataset.paintSequence = String(
    Number.parseInt(canvas.dataset.paintSequence ?? "0", 10) + 1,
  );
  canvas.dataset.visibleNodes = String(stats.visibleNodeCount);
  canvas.dataset.drawnNodes = String(stats.drawnNodeCount);
  canvas.dataset.registeredNodes = String(stats.registeredNodeCount);
  canvas.dataset.mountedNodes = String(stats.mountedNodeCount);
  canvas.dataset.drawElementImageMs = stats.drawElementImageMs.toFixed(2);
  canvas.dataset.transformAssignmentMs = stats.transformAssignmentMs.toFixed(2);
  canvas.dataset.totalPaintMs = stats.totalPaintMs.toFixed(2);
  canvas.dataset.viewportX = viewport.x.toFixed(2);
  canvas.dataset.viewportY = viewport.y.toFixed(2);
  canvas.dataset.viewportZoom = viewport.zoom.toFixed(4);
}
