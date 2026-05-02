import {
  isChromeReproActive,
  postChromeReproEvent,
  roundChromeReproMs,
} from "state/actions/chromeRepro";

import type { GpuFrameReason } from "./gpuRenderer";
import type { RenderHtmlSurfaceFrameResult } from "./htmlSurfaces/frame";
import { normalizeGpuViewport, type GpuViewportInput } from "./viewportMath";

type GpuFlowFrameChromeReproInput = {
  readonly deferResolutionUpdates: boolean;
  readonly frame: number;
  readonly frameReasons: readonly GpuFrameReason[];
  readonly layerResult: RenderHtmlSurfaceFrameResult;
  readonly renderDurationMs: number;
  readonly viewport: GpuViewportInput;
  readonly viewportFrame: boolean;
};

export function postGpuFlowFrameChromeReproEvent({
  deferResolutionUpdates,
  frame,
  frameReasons,
  layerResult,
  renderDurationMs,
  viewport,
  viewportFrame,
}: GpuFlowFrameChromeReproInput): void {
  if (!isChromeReproActive()) {
    return;
  }
  const normalizedViewport = normalizeGpuViewport(viewport);
  const textureMemory = layerResult.textureMemory;
  const textureMemoryBeforeEviction = layerResult.textureMemoryBeforeEviction;
  const uploadDiagnostics = layerResult.uploadDiagnostics;
  postChromeReproEvent("gpu-flow-frame", {
    activeNodePresent: layerResult.activeNodeId !== null,
    budgetExhausted: layerResult.budgetExhausted,
    deferResolutionUpdates,
    domTransformParkedNodeCount: layerResult.domTransformParkedNodeIds.length,
    domTransformUpdatedNodeCount: layerResult.domTransformUpdatedNodeIds.length,
    drawnEdgeCount: layerResult.drawnEdgeIds.length,
    drawnNodeCount: layerResult.drawnNodeIds.length,
    durationMs: roundChromeReproMs(renderDurationMs),
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
      cssHeight: roundChromeReproMs(diagnostic.cssHeight),
      cssWidth: roundChromeReproMs(diagnostic.cssWidth),
      dirtyContent: diagnostic.dirtyContent,
      dirtyResolution: diagnostic.dirtyResolution,
      dirtySourceRect: diagnostic.dirtySourceRect
        ? {
            height: roundChromeReproMs(diagnostic.dirtySourceRect.height),
            width: roundChromeReproMs(diagnostic.dirtySourceRect.width),
            x: roundChromeReproMs(diagnostic.dirtySourceRect.x),
            y: roundChromeReproMs(diagnostic.dirtySourceRect.y),
          }
        : null,
      dirtyTileBytes: diagnostic.dirtyTileBytes,
      dirtyTileCount: diagnostic.dirtyTileCount,
      durationMs: roundChromeReproMs(diagnostic.durationMs),
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
      x: roundChromeReproMs(normalizedViewport.x),
      y: roundChromeReproMs(normalizedViewport.y),
      zoom: roundChromeReproMs(normalizedViewport.zoom),
    },
    viewportFrame,
    visibleNodeCount: layerResult.visibleNodeIds.length,
  });
}
