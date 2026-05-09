import type { GpuFrameReason } from "./gpuRenderer";
import type { RenderHtmlSurfaceFrameResult } from "./htmlSurfaces/frame";
import { normalizeGpuViewport, type GpuViewportInput } from "./viewportMath";

export type GpuFlowFramePerformanceInput = {
  readonly deferResolutionUpdates: boolean;
  readonly frame: number;
  readonly frameReasons: readonly GpuFrameReason[];
  readonly layerResult: RenderHtmlSurfaceFrameResult;
  readonly renderDurationMs: number;
  readonly viewport: GpuViewportInput;
  readonly viewportFrame: boolean;
};

export type GpuFlowFrameUploadDiagnostic = {
  readonly cssHeight: number;
  readonly cssWidth: number;
  readonly dirtyContent: boolean;
  readonly dirtyResolution: boolean;
  readonly dirtySourceRect: {
    readonly height: number;
    readonly width: number;
    readonly x: number;
    readonly y: number;
  } | null;
  readonly dirtyTileBytes: number;
  readonly dirtyTileCount: number;
  readonly durationMs: number;
  readonly pixelHeight: number;
  readonly pixelWidth: number;
  readonly priority: string;
  readonly reasons: readonly string[];
  readonly surfaceId: string;
  readonly textureBytes: number;
  readonly textureLayoutKind: string;
  readonly uploadedBytes: number;
  readonly uploadedTextureCount: number;
  readonly uploadedTileCount: number;
};

export type GpuFlowFramePerformanceEvent = {
  readonly activeNodeId: string | null;
  readonly activeNodePresent: boolean;
  readonly budgetExhausted: boolean;
  readonly deferResolutionUpdates: boolean;
  readonly domTransformParkedNodeCount: number;
  readonly domTransformUpdatedNodeCount: number;
  readonly drawnEdgeCount: number;
  readonly drawnNodeCount: number;
  readonly durationMs: number;
  readonly edgeVertexCount: number;
  readonly evictedTextureBytes: number;
  readonly evictedTextureNodeCount: number;
  readonly frame: number;
  readonly frameReasons: readonly GpuFrameReason[];
  readonly missingElementNodeCount: number;
  readonly missingTextureNodeCount: number;
  readonly remainingDirtyNodeCount: number;
  readonly skippedNodeCount: number;
  readonly textureMemoryAllocatedBytes: number;
  readonly textureMemoryBeforeEvictionAllocatedBytes: number;
  readonly textureMemoryBeforeEvictionCount: number;
  readonly textureMemoryCount: number;
  readonly textureMemoryLargestBytes: number;
  readonly textureMemoryVisibleBytes: number;
  readonly textureMemoryVisibleCount: number;
  readonly uploadDiagnosticCount: number;
  readonly uploadDiagnostics: readonly GpuFlowFrameUploadDiagnostic[];
  readonly uploadedNodeCount: number;
  readonly viewport: {
    readonly x: number;
    readonly y: number;
    readonly zoom: number;
  };
  readonly viewportFrame: boolean;
  readonly visibleNodeCount: number;
};

export type GpuFlowFramePerformanceReporter = {
  readonly isEnabled?: (() => boolean) | undefined;
  readonly onFrame: (event: GpuFlowFramePerformanceEvent) => void;
};

export function createGpuFlowFramePerformanceEvent({
  deferResolutionUpdates,
  frame,
  frameReasons,
  layerResult,
  renderDurationMs,
  viewport,
  viewportFrame,
}: GpuFlowFramePerformanceInput): GpuFlowFramePerformanceEvent {
  const normalizedViewport = normalizeGpuViewport(viewport);
  const textureMemory = layerResult.textureMemory;
  const textureMemoryBeforeEviction = layerResult.textureMemoryBeforeEviction;
  const uploadDiagnostics = layerResult.uploadDiagnostics;
  return {
    activeNodeId: layerResult.activeNodeId,
    activeNodePresent: layerResult.activeNodeId !== null,
    budgetExhausted: layerResult.budgetExhausted,
    deferResolutionUpdates,
    domTransformParkedNodeCount: layerResult.domTransformParkedNodeIds.length,
    domTransformUpdatedNodeCount: layerResult.domTransformUpdatedNodeIds.length,
    drawnEdgeCount: layerResult.drawnEdgeIds.length,
    drawnNodeCount: layerResult.drawnNodeIds.length,
    durationMs: renderDurationMs,
    edgeVertexCount: layerResult.edgeVertexCount,
    evictedTextureBytes: layerResult.evictedTextureBytes,
    evictedTextureNodeCount: layerResult.evictedTextureNodeIds.length,
    frame,
    frameReasons: [...frameReasons],
    missingElementNodeCount: layerResult.missingElementNodeIds.length,
    missingTextureNodeCount: layerResult.missingTextureNodeIds.length,
    remainingDirtyNodeCount: layerResult.remainingDirtyNodeIds.length,
    skippedNodeCount: layerResult.skippedNodeIds.length,
    textureMemoryAllocatedBytes: textureMemory.allocatedBytes,
    textureMemoryBeforeEvictionAllocatedBytes:
      textureMemoryBeforeEviction.allocatedBytes,
    textureMemoryBeforeEvictionCount: textureMemoryBeforeEviction.textureCount,
    textureMemoryCount: textureMemory.textureCount,
    textureMemoryLargestBytes: textureMemory.largestTextureBytes,
    textureMemoryVisibleBytes: textureMemory.visibleBytes,
    textureMemoryVisibleCount: textureMemory.visibleTextureCount,
    uploadDiagnosticCount: uploadDiagnostics.length,
    uploadDiagnostics: uploadDiagnostics.slice(0, 12).map((diagnostic) => ({
      cssHeight: diagnostic.cssHeight,
      cssWidth: diagnostic.cssWidth,
      dirtyContent: diagnostic.dirtyContent,
      dirtyResolution: diagnostic.dirtyResolution,
      dirtySourceRect: diagnostic.dirtySourceRect
        ? {
            height: diagnostic.dirtySourceRect.height,
            width: diagnostic.dirtySourceRect.width,
            x: diagnostic.dirtySourceRect.x,
            y: diagnostic.dirtySourceRect.y,
          }
        : null,
      dirtyTileBytes: diagnostic.dirtyTileBytes,
      dirtyTileCount: diagnostic.dirtyTileCount,
      durationMs: diagnostic.durationMs,
      pixelHeight: diagnostic.pixelHeight,
      pixelWidth: diagnostic.pixelWidth,
      priority: diagnostic.priority,
      reasons: [...diagnostic.reasons],
      surfaceId: diagnostic.surfaceId,
      textureBytes: diagnostic.textureBytes,
      textureLayoutKind: diagnostic.textureLayoutKind,
      uploadedBytes: diagnostic.uploadedBytes,
      uploadedTextureCount: diagnostic.uploadedTextureCount,
      uploadedTileCount: diagnostic.uploadedTileCount,
    })),
    uploadedNodeCount: layerResult.uploadedNodeIds.length,
    viewport: {
      x: normalizedViewport.x,
      y: normalizedViewport.y,
      zoom: normalizedViewport.zoom,
    },
    viewportFrame,
    visibleNodeCount: layerResult.visibleNodeIds.length,
  };
}
