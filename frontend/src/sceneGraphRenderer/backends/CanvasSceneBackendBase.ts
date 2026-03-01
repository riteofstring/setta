import type { SceneGraphRendererCapabilities } from "sceneGraphRenderer/capabilities";
import type {
  SceneGraphCamera,
  SceneGraphFrameState,
  SceneGraphRenderSnapshot,
  SceneGraphRenderSnapshotDiff,
  SceneGraphResourceCacheStats,
} from "sceneGraphRenderer/types";
import type { RendererBackend } from "./RendererBackend";

const DEFAULT_SECTION_CACHE_CAPACITY = 2048;
const DEFAULT_EDGE_CACHE_CAPACITY = 4096;

export abstract class CanvasSceneBackendBase implements RendererBackend {
  private canvas: HTMLCanvasElement | null = null;
  private context: CanvasRenderingContext2D | null = null;
  private readonly sectionResourceCache = new Map<string, number>();
  private readonly edgeResourceCache = new Map<string, number>();
  private cacheTouchCounter = 0;
  private sectionEvictionCount = 0;
  private edgeEvictionCount = 0;
  private readonly sectionCacheCapacity: number;
  private readonly edgeCacheCapacity: number;

  protected constructor(cacheConfig?: {
    sectionCacheCapacity?: number;
    edgeCacheCapacity?: number;
  }) {
    this.sectionCacheCapacity = sanitizeCacheCapacity(
      cacheConfig?.sectionCacheCapacity,
      DEFAULT_SECTION_CACHE_CAPACITY,
    );
    this.edgeCacheCapacity = sanitizeCacheCapacity(
      cacheConfig?.edgeCacheCapacity,
      DEFAULT_EDGE_CACHE_CAPACITY,
    );
  }

  init(
    canvas: HTMLCanvasElement,
    _capabilities: SceneGraphRendererCapabilities,
  ): void {
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Scene graph renderer requires a 2D canvas context.");
    }
    this.canvas = canvas;
    this.context = context;
  }

  updateResources(diff: SceneGraphRenderSnapshotDiff): void {
    touchResourceIds(this.sectionResourceCache, diff.addedSectionIds, this);
    touchResourceIds(this.sectionResourceCache, diff.changedSectionIds, this);
    touchResourceIds(this.edgeResourceCache, diff.addedEdgeIds, this);
    touchResourceIds(this.edgeResourceCache, diff.changedEdgeIds, this);

    deleteResourceIds(this.sectionResourceCache, diff.removedSectionIds);
    deleteResourceIds(this.edgeResourceCache, diff.removedEdgeIds);

    this.sectionEvictionCount += evictOverflow(
      this.sectionResourceCache,
      this.sectionCacheCapacity,
    );
    this.edgeEvictionCount += evictOverflow(
      this.edgeResourceCache,
      this.edgeCacheCapacity,
    );
  }

  render(
    snapshot: SceneGraphRenderSnapshot,
    camera: SceneGraphCamera,
    frameState: SceneGraphFrameState,
  ): void {
    if (!this.canvas || !this.context) {
      return;
    }

    resizeCanvas(this.canvas, camera);
    const context = this.context;
    context.setTransform(
      camera.devicePixelRatio,
      0,
      0,
      camera.devicePixelRatio,
      0,
      0,
    );
    context.clearRect(0, 0, camera.viewportWidth, camera.viewportHeight);

    drawEdges(context, snapshot, camera, frameState);
    drawSections(context, snapshot, camera, frameState);

    if (frameState.debugOverlay) {
      drawDebugOverlay(context, this.getDebugLabel(), snapshot, frameState);
    }
  }

  dispose(): void {
    if (this.canvas && this.context) {
      this.context.setTransform(1, 0, 0, 1, 0, 0);
      this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
    this.sectionResourceCache.clear();
    this.edgeResourceCache.clear();
    this.cacheTouchCounter = 0;
    this.sectionEvictionCount = 0;
    this.edgeEvictionCount = 0;
    this.canvas = null;
    this.context = null;
  }

  getResourceCacheStats(): SceneGraphResourceCacheStats {
    const sectionPressure = computePressure(
      this.sectionResourceCache.size,
      this.sectionCacheCapacity,
    );
    const edgePressure = computePressure(
      this.edgeResourceCache.size,
      this.edgeCacheCapacity,
    );
    return {
      sectionCacheSize: this.sectionResourceCache.size,
      edgeCacheSize: this.edgeResourceCache.size,
      sectionCacheCapacity: this.sectionCacheCapacity,
      edgeCacheCapacity: this.edgeCacheCapacity,
      sectionEvictions: this.sectionEvictionCount,
      edgeEvictions: this.edgeEvictionCount,
      totalEvictions: this.sectionEvictionCount + this.edgeEvictionCount,
      pressure: Math.max(sectionPressure, edgePressure),
    };
  }

  nextCacheTouch(): number {
    this.cacheTouchCounter += 1;
    return this.cacheTouchCounter;
  }

  protected abstract getDebugLabel(): string;
}

function sanitizeCacheCapacity(
  capacity: number | undefined,
  fallbackCapacity: number,
): number {
  if (!Number.isInteger(capacity) || capacity <= 0) {
    return fallbackCapacity;
  }
  return capacity;
}

function touchResourceIds(
  cache: Map<string, number>,
  resourceIds: string[],
  backend: CanvasSceneBackendBase,
) {
  for (const resourceId of resourceIds) {
    cache.set(resourceId, backend.nextCacheTouch());
  }
}

function deleteResourceIds(cache: Map<string, number>, resourceIds: string[]) {
  for (const resourceId of resourceIds) {
    cache.delete(resourceId);
  }
}

function evictOverflow(cache: Map<string, number>, maxSize: number): number {
  let evictionCount = 0;
  while (cache.size > maxSize) {
    let oldestResourceId: string | null = null;
    let oldestTouch = Number.POSITIVE_INFINITY;
    for (const [resourceId, touch] of cache.entries()) {
      if (touch < oldestTouch) {
        oldestTouch = touch;
        oldestResourceId = resourceId;
      }
    }
    if (!oldestResourceId) {
      break;
    }
    cache.delete(oldestResourceId);
    evictionCount += 1;
  }
  return evictionCount;
}

function computePressure(size: number, capacity: number): number {
  if (capacity <= 0) {
    return 0;
  }
  return Number((size / capacity).toFixed(4));
}

function resizeCanvas(
  canvas: HTMLCanvasElement,
  camera: SceneGraphCamera,
): void {
  const targetPixelWidth = Math.max(
    1,
    Math.round(camera.viewportWidth * camera.devicePixelRatio),
  );
  const targetPixelHeight = Math.max(
    1,
    Math.round(camera.viewportHeight * camera.devicePixelRatio),
  );
  if (
    canvas.width !== targetPixelWidth ||
    canvas.height !== targetPixelHeight
  ) {
    canvas.width = targetPixelWidth;
    canvas.height = targetPixelHeight;
  }
}

function drawEdges(
  context: CanvasRenderingContext2D,
  snapshot: SceneGraphRenderSnapshot,
  camera: SceneGraphCamera,
  frameState: SceneGraphFrameState,
): void {
  for (const edge of snapshot.edges) {
    const isActiveEdge = edge.isSelected || edge.isHovered;
    context.strokeStyle = edge.isSelected
      ? "rgba(59, 130, 246, 0.95)"
      : edge.isHovered
        ? "rgba(37, 99, 235, 0.95)"
        : frameState.wireColor;
    context.lineWidth = edge.isSelected ? 2.25 : edge.isHovered ? 1.8 : 1.25;
    context.globalAlpha = isActiveEdge ? 1 : 0.85;

    const sourceX = edge.sourceX * camera.zoom + camera.x;
    const sourceY = edge.sourceY * camera.zoom + camera.y;
    const targetX = edge.targetX * camera.zoom + camera.x;
    const targetY = edge.targetY * camera.zoom + camera.y;
    context.beginPath();
    context.moveTo(sourceX, sourceY);
    context.lineTo(targetX, targetY);
    context.stroke();
  }

  context.globalAlpha = 1;
}

function drawSections(
  context: CanvasRenderingContext2D,
  snapshot: SceneGraphRenderSnapshot,
  camera: SceneGraphCamera,
  frameState: SceneGraphFrameState,
): void {
  for (const section of snapshot.sections) {
    const x = section.x * camera.zoom + camera.x;
    const y = section.y * camera.zoom + camera.y;
    const width = section.width * camera.zoom;
    const height = section.height * camera.zoom;
    if (width <= 0 || height <= 0) {
      continue;
    }
    context.fillStyle = frameState.sectionFillColor;
    context.strokeStyle = section.isActive
      ? "rgba(59, 130, 246, 0.92)"
      : section.isHovered
        ? "rgba(37, 99, 235, 0.92)"
        : frameState.sectionStrokeColor;
    context.lineWidth = section.isActive ? 2.25 : section.isHovered ? 1.6 : 1;

    context.fillRect(x, y, width, height);
    context.strokeRect(x, y, width, height);

    if (section.isActive || section.isHovered) {
      context.globalAlpha = section.isActive ? 0.2 : 0.14;
      context.fillStyle = section.isActive
        ? "rgba(59, 130, 246, 0.8)"
        : "rgba(37, 99, 235, 0.8)";
      context.fillRect(x, y, width, height);
      context.globalAlpha = 1;
    }
  }
}

function drawDebugOverlay(
  context: CanvasRenderingContext2D,
  debugLabel: string,
  snapshot: SceneGraphRenderSnapshot,
  frameState: SceneGraphFrameState,
): void {
  const activeSectionCount = snapshot.sections.reduce((count, section) => {
    return section.isActive ? count + 1 : count;
  }, 0);
  const selectedEdgeCount = snapshot.edges.reduce((count, edge) => {
    return edge.isSelected ? count + 1 : count;
  }, 0);

  context.globalAlpha = 0.88;
  context.fillStyle = "rgba(2, 6, 23, 0.8)";
  context.fillRect(8, 8, 280, 80);
  context.globalAlpha = 1;
  context.fillStyle = "rgba(241, 245, 249, 0.95)";
  context.font = "12px monospace";
  context.fillText(`scene backend: ${debugLabel}`, 14, 26);
  context.fillText(
    `sections: ${snapshot.sections.length} edges: ${snapshot.edges.length}`,
    14,
    42,
  );
  context.fillText(
    `active sections: ${activeSectionCount} selected edges: ${selectedEdgeCount}`,
    14,
    58,
  );
  context.fillText(`frame: ${frameState.frameNumber}`, 14, 74);
}
