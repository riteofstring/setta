import {
  drawCanvasFlowConnectionPreview,
  drawCanvasFlowEdges,
} from "./canvasFlowEdges";
import { getVisibleNodeDrawRecords } from "./canvasFlowGeometry";
import type {
  CanvasFlowCanvasElement,
  CanvasFlowConnectionState,
  CanvasFlowDrawableEdge,
  CanvasFlowElementImage,
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
  "snapshot-cache",
  "skip-transform",
]);

type CanvasFlowStatsCanvas = HTMLCanvasElement & {
  __canvasFlowLastStatsWriteMs?: number;
};
type CanvasFlowSnapshotCacheEntry = {
  cssHeight: number;
  cssWidth: number;
  image: CanvasFlowElementImage;
};
type CanvasFlowNodePaintResult = {
  drawElementImageMs: number;
  drawn: boolean;
  interactive: boolean;
  snapshotCacheHitCount: number;
  snapshotCacheMissCount: number;
  snapshotCaptureMs: number;
  transformAssignmentMs: number;
};
type DrawVisibleNodesResult = {
  drawElementImageMs: number;
  drawnNodeCount: number;
  nextInteractiveNodeIds: Set<string>;
  snapshotCacheHitCount: number;
  snapshotCacheMissCount: number;
  snapshotCaptureMs: number;
  transformAssignmentMs: number;
};
type CanvasFlowPerfVariant =
  | "default"
  | "no-edges"
  | "rect-nodes"
  | "snapshot-cache"
  | "skip-transform";
type CanvasFlowPerfWindow = typeof window & {
  __settaCanvasFlowPerfVariant?: string;
};
const snapshotCaches = new WeakMap<
  HTMLCanvasElement,
  Map<string, CanvasFlowSnapshotCacheEntry>
>();

type PaintCanvasFlowParams = {
  canvas: HTMLCanvasElement;
  changedNodeIds?: ReadonlySet<string>;
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
  changedNodeIds,
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
  const snapshotCache = resolveSnapshotCache({
    canvas,
    changedNodeIds,
    perfVariant,
  });
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
  const nodeDraw = drawVisibleCanvasFlowNodes({
    canvas,
    ctx,
    nodeElements,
    perfVariant,
    snapshotCache,
    viewport,
    visibleNodes,
  });

  disableCulledNodePointerEvents({
    nodeElements,
    previousInteractiveNodeIds,
    nextInteractiveNodeIds: nodeDraw.nextInteractiveNodeIds,
  });
  previousInteractiveNodeIds.clear();
  for (const nodeId of nodeDraw.nextInteractiveNodeIds) {
    previousInteractiveNodeIds.add(nodeId);
  }

  const paintEnd = performance.now();
  const stats = {
    edgeCount: edges.length,
    edgeDrawMs,
    snapshotCacheHitCount: nodeDraw.snapshotCacheHitCount,
    snapshotCacheMissCount: nodeDraw.snapshotCacheMissCount,
    snapshotCaptureMs: nodeDraw.snapshotCaptureMs,
    visibleNodeCount: visibleNodes.length,
    drawnNodeCount: nodeDraw.drawnNodeCount,
    registeredNodeCount: nodes.length,
    mountedNodeCount: nodeElements.size,
    drawElementImageMs: nodeDraw.drawElementImageMs,
    visibilityScanMs,
    transformAssignmentMs: nodeDraw.transformAssignmentMs,
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

function drawVisibleCanvasFlowNodes({
  canvas,
  ctx,
  nodeElements,
  perfVariant,
  snapshotCache,
  viewport,
  visibleNodes,
}: {
  canvas: HTMLCanvasElement;
  ctx: CanvasFlowRenderingContext;
  nodeElements: CanvasFlowNodeElementMap;
  perfVariant: CanvasFlowPerfVariant;
  snapshotCache: Map<string, CanvasFlowSnapshotCacheEntry> | null;
  viewport: CanvasFlowViewport;
  visibleNodes: CanvasFlowNodeDrawRecord[];
}): DrawVisibleNodesResult {
  const result = createDrawVisibleNodesResult();
  for (const node of visibleNodes) {
    const nodeResult = drawVisibleCanvasFlowNode({
      canvas,
      ctx,
      node,
      nodeElements,
      perfVariant,
      snapshotCache,
      viewport,
    });
    accumulateNodePaintResult(result, node.id, nodeResult);
  }
  return result;
}

function createDrawVisibleNodesResult(): DrawVisibleNodesResult {
  return {
    drawElementImageMs: 0,
    drawnNodeCount: 0,
    nextInteractiveNodeIds: new Set<string>(),
    snapshotCacheHitCount: 0,
    snapshotCacheMissCount: 0,
    snapshotCaptureMs: 0,
    transformAssignmentMs: 0,
  };
}

function accumulateNodePaintResult(
  aggregate: DrawVisibleNodesResult,
  nodeId: string,
  nodeResult: CanvasFlowNodePaintResult,
) {
  if (!nodeResult.drawn) {
    return;
  }
  aggregate.drawnNodeCount += 1;
  aggregate.drawElementImageMs += nodeResult.drawElementImageMs;
  aggregate.snapshotCaptureMs += nodeResult.snapshotCaptureMs;
  aggregate.snapshotCacheHitCount += nodeResult.snapshotCacheHitCount;
  aggregate.snapshotCacheMissCount += nodeResult.snapshotCacheMissCount;
  aggregate.transformAssignmentMs += nodeResult.transformAssignmentMs;
  if (nodeResult.interactive) {
    aggregate.nextInteractiveNodeIds.add(nodeId);
  }
}

function drawVisibleCanvasFlowNode({
  canvas,
  ctx,
  node,
  nodeElements,
  perfVariant,
  snapshotCache,
  viewport,
}: {
  canvas: HTMLCanvasElement;
  ctx: CanvasFlowRenderingContext;
  node: CanvasFlowNodeDrawRecord;
  nodeElements: CanvasFlowNodeElementMap;
  perfVariant: CanvasFlowPerfVariant;
  snapshotCache: Map<string, CanvasFlowSnapshotCacheEntry> | null;
  viewport: CanvasFlowViewport;
}): CanvasFlowNodePaintResult {
  const element = getNodeElement(canvas, nodeElements, node.id);
  if (!element) {
    return createNodePaintResult({ drawn: false, interactive: false });
  }
  const screenRect = getNodeScreenDrawRect(node, viewport);
  if (perfVariant === "rect-nodes") {
    drawNodeDiagnosticRect(ctx, node, screenRect);
    return createNodePaintResult({ drawn: true, interactive: false });
  }
  let snapshotCacheHitCount = 0;
  let snapshotCacheMissCount = 0;
  let snapshotCaptureMs = 0;
  if (snapshotCache) {
    const snapshotResult = drawSnapshotCachedNode({
      canvas,
      ctx,
      element,
      node,
      screenRect,
      snapshotCache,
    });
    snapshotCacheHitCount = snapshotResult.cacheHit ? 1 : 0;
    snapshotCacheMissCount = snapshotResult.cacheHit ? 0 : 1;
    snapshotCaptureMs = snapshotResult.snapshotCaptureMs;
    if (snapshotResult.transform) {
      return createNodePaintResult({
        drawElementImageMs: snapshotResult.drawElementImageMs,
        drawn: true,
        interactive: true,
        snapshotCacheHitCount,
        snapshotCacheMissCount,
        snapshotCaptureMs,
        transformAssignmentMs: assignNodeTransform(
          element,
          snapshotResult.transform,
          true,
        ),
      });
    }
  }
  const liveResult = drawLiveCanvasFlowNode({
    ctx,
    element,
    perfVariant,
    screenRect,
  });
  return {
    ...liveResult,
    snapshotCacheHitCount,
    snapshotCacheMissCount,
    snapshotCaptureMs,
  };
}

function drawLiveCanvasFlowNode({
  ctx,
  element,
  perfVariant,
  screenRect,
}: {
  ctx: CanvasFlowRenderingContext;
  element: HTMLElement;
  perfVariant: CanvasFlowPerfVariant;
  screenRect: ReturnType<typeof getNodeScreenDrawRect>;
}): CanvasFlowNodePaintResult {
  const drawStart = performance.now();
  const transform = ctx.drawElementImage(
    element,
    screenRect.x,
    screenRect.y,
    screenRect.width,
    screenRect.height,
  );
  return createNodePaintResult({
    drawElementImageMs: performance.now() - drawStart,
    drawn: true,
    interactive: true,
    transformAssignmentMs: assignNodeTransform(
      element,
      transform,
      perfVariant !== "skip-transform",
    ),
  });
}

function assignNodeTransform(
  element: HTMLElement,
  transform: DOMMatrix,
  shouldAssign: boolean,
) {
  const transformStart = performance.now();
  if (shouldAssign) {
    assignNodePaintStyle(element, transform.toString());
  }
  return performance.now() - transformStart;
}

function createNodePaintResult({
  drawElementImageMs = 0,
  drawn,
  interactive,
  snapshotCacheHitCount = 0,
  snapshotCacheMissCount = 0,
  snapshotCaptureMs = 0,
  transformAssignmentMs = 0,
}: Partial<CanvasFlowNodePaintResult> &
  Pick<CanvasFlowNodePaintResult, "drawn" | "interactive">) {
  return {
    drawElementImageMs,
    drawn,
    interactive,
    snapshotCacheHitCount,
    snapshotCacheMissCount,
    snapshotCaptureMs,
    transformAssignmentMs,
  };
}

function resolveSnapshotCache({
  canvas,
  changedNodeIds,
  perfVariant,
}: {
  canvas: HTMLCanvasElement;
  changedNodeIds?: ReadonlySet<string>;
  perfVariant: CanvasFlowPerfVariant;
}) {
  if (perfVariant !== "snapshot-cache") {
    closeSnapshotCache(canvas);
    return null;
  }
  const cache = getSnapshotCache(canvas);
  invalidateSnapshotCacheEntries(cache, changedNodeIds);
  return cache;
}

function getSnapshotCache(canvas: HTMLCanvasElement) {
  let cache = snapshotCaches.get(canvas);
  if (!cache) {
    cache = new Map<string, CanvasFlowSnapshotCacheEntry>();
    snapshotCaches.set(canvas, cache);
  }
  return cache;
}

function invalidateSnapshotCacheEntries(
  cache: Map<string, CanvasFlowSnapshotCacheEntry>,
  changedNodeIds: ReadonlySet<string> | undefined,
) {
  if (!changedNodeIds) {
    return;
  }
  for (const nodeId of changedNodeIds) {
    const entry = cache.get(nodeId);
    if (!entry) {
      continue;
    }
    entry.image.close();
    cache.delete(nodeId);
  }
}

function closeSnapshotCache(canvas: HTMLCanvasElement) {
  const cache = snapshotCaches.get(canvas);
  if (!cache) {
    return;
  }
  for (const entry of cache.values()) {
    entry.image.close();
  }
  cache.clear();
  snapshotCaches.delete(canvas);
}

function drawSnapshotCachedNode({
  canvas,
  ctx,
  element,
  node,
  screenRect,
  snapshotCache,
}: {
  canvas: HTMLCanvasElement;
  ctx: CanvasFlowRenderingContext;
  element: HTMLElement;
  node: CanvasFlowNodeDrawRecord;
  screenRect: ReturnType<typeof getNodeScreenDrawRect>;
  snapshotCache: Map<string, CanvasFlowSnapshotCacheEntry>;
}) {
  const existing = snapshotCache.get(node.id);
  const cacheHit =
    existing?.cssHeight === node.height && existing.cssWidth === node.width;
  if (cacheHit) {
    const drawResult = drawElementImageSnapshot(
      ctx,
      existing.image,
      screenRect,
    );
    return {
      cacheHit: true,
      drawElementImageMs: drawResult.durationMs,
      snapshotCaptureMs: 0,
      transform: drawResult.transform,
    };
  }

  if (existing) {
    existing.image.close();
    snapshotCache.delete(node.id);
  }
  const captureStart = performance.now();
  const image = captureCanvasFlowElementImage(canvas, element);
  const snapshotCaptureMs = performance.now() - captureStart;
  if (!image) {
    return {
      cacheHit: false,
      drawElementImageMs: 0,
      snapshotCaptureMs,
      transform: null,
    };
  }
  snapshotCache.set(node.id, {
    cssHeight: node.height,
    cssWidth: node.width,
    image,
  });
  const drawResult = drawElementImageSnapshot(ctx, image, screenRect);
  return {
    cacheHit: false,
    drawElementImageMs: drawResult.durationMs,
    snapshotCaptureMs,
    transform: drawResult.transform,
  };
}

function captureCanvasFlowElementImage(
  canvas: HTMLCanvasElement,
  element: HTMLElement,
) {
  const captureElementImage = (canvas as Partial<CanvasFlowCanvasElement>)
    .captureElementImage;
  if (typeof captureElementImage !== "function") {
    return null;
  }
  return captureElementImage.call(canvas, element);
}

function drawElementImageSnapshot(
  ctx: CanvasFlowRenderingContext,
  image: CanvasFlowElementImage,
  screenRect: ReturnType<typeof getNodeScreenDrawRect>,
) {
  const drawStart = performance.now();
  const transform = ctx.drawElementImage(
    image,
    screenRect.x,
    screenRect.y,
    screenRect.width,
    screenRect.height,
  );
  return {
    durationMs: performance.now() - drawStart,
    transform,
  };
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
  canvas.dataset.lastPaintTime = now.toFixed(2);
  canvas.dataset.snapshotCacheHits = String(stats.snapshotCacheHitCount);
  canvas.dataset.snapshotCacheMisses = String(stats.snapshotCacheMissCount);
  canvas.dataset.snapshotCaptureMs = stats.snapshotCaptureMs.toFixed(2);
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
