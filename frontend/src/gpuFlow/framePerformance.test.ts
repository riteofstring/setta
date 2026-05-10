import { describe, expect, it } from "vitest";

import {
  createGpuFlowFramePerformanceEvent,
  type GpuFlowFramePerformanceInput,
} from "./framePerformance";
import type { RenderHtmlSurfaceFrameResult } from "./htmlSurfaces/frame";
import { createHtmlSurfaceVisualScene } from "./htmlSurfaces/visualScene";

describe("framePerformance", () => {
  it("creates compact frame diagnostics without project instrumentation", () => {
    const input: GpuFlowFramePerformanceInput = {
      deferResolutionUpdates: true,
      frame: 7,
      frameReasons: ["paint", "texture-upload"],
      layerResult: createLayerResult(),
      renderDurationMs: 12.34,
      viewport: [10.12, 20.56, 0.55],
      viewportFrame: false,
    };

    const event = createGpuFlowFramePerformanceEvent(input);

    expect(event).toMatchObject({
      activeNodePresent: true,
      budgetExhausted: true,
      deferResolutionUpdates: true,
      domTransformParkedNodeCount: 1,
      domTransformUpdatedNodeCount: 2,
      drawnEdgeCount: 1,
      drawnNodeCount: 3,
      durationMs: 12.34,
      edgeVertexCount: 6,
      evictedTextureBytes: 128,
      evictedTextureNodeCount: 1,
      frame: 7,
      frameReasons: ["paint", "texture-upload"],
      interactionDiagnostics: null,
      remainingDirtyNodeCount: 2,
      renderBatchCount: 2,
      renderCommandCount: 3,
      retainedContentOcclusionRiskCount: 0,
      textureMemoryAllocatedBytes: 4096,
      textureMemoryBeforeEvictionAllocatedBytes: 8192,
      textureMemoryBeforeEvictionCount: 5,
      textureMemoryCount: 4,
      textureMemoryLargestBytes: 2048,
      textureMemoryVisibleBytes: 3072,
      textureMemoryVisibleCount: 3,
      textureLifecycleDiagnosticCount: 1,
      textureLifecycleDiagnostics: [
        expect.objectContaining({
          committed: expect.objectContaining({
            cssHeight: 50,
            cssWidth: 100,
            pixelHeight: 100,
            pixelWidth: 200,
          }),
          pending: expect.objectContaining({
            pixelHeight: 150,
            pixelWidth: 300,
          }),
          pendingResolution: expect.objectContaining({
            pixelHeight: 150,
            pixelWidth: 300,
          }),
          surfaceId: "node-12",
        }),
      ],
      textureUploadDeferredSurfaceCount: 1,
      textureUploadInitialDirtyWorkCounts: {
        animation: 1,
        content: 1,
        geometry: 0,
        hover: 0,
        resolution: 1,
        "source-window": 0,
      },
      textureUploadInitialDirtySurfaceCount: 3,
      textureUploadNoWorkReason: null,
      textureUploadPaintUnavailableSurfaceCount: 0,
      textureUploadRemainingDirtyWorkCounts: {
        animation: 0,
        content: 1,
        geometry: 0,
        hover: 0,
        resolution: 1,
        "source-window": 0,
      },
      textureUploadRemainingDirtySurfaceCount: 2,
      textureUploadSkippedSurfaceCount: 0,
      textureUploadUploadableRemainingDirtyWorkCounts: {
        animation: 0,
        content: 0,
        geometry: 0,
        hover: 0,
        resolution: 1,
        "source-window": 0,
      },
      textureUploadUploadableRemainingDirtySurfaceCount: 1,
      textureUploadUploadedSurfaceCount: 1,
      uploadDiagnosticCount: 1,
      uploadDiagnostics: [
        expect.objectContaining({
          cssHeight: 50,
          cssWidth: 100,
          dirtySourceRect: { height: 12.34, width: 24.67, x: 1.12, y: 2.23 },
          dirtyTileCount: 1,
          durationMs: 3.24,
          reasons: ["animation"],
          surfaceId: "node-12",
          uploadedBytes: 512,
          workKinds: ["animation"],
        }),
      ],
      uploadedNodeCount: 1,
      viewport: { x: 10.12, y: 20.56, zoom: 0.55 },
      visibleNodeCount: 4,
    });
    expect(event.frameReasons).not.toBe(input.frameReasons);
    expect(event.uploadDiagnostics[0]?.reasons).not.toBe(
      input.layerResult.uploadDiagnostics[0]?.reasons,
    );
    expect(event.textureLifecycleDiagnostics[0]?.committed).not.toBe(
      input.layerResult.textureLifecycleDiagnostics[0]?.committed,
    );
  });

  it("caps uploaded diagnostic details while preserving the total count", () => {
    const layerResult = createLayerResult({
      uploadDiagnostics: Array.from({ length: 14 }, (_, index) => ({
        ...createUploadDiagnostic(),
        surfaceId: `node-${index}`,
      })),
    });

    const event = createGpuFlowFramePerformanceEvent({
      deferResolutionUpdates: false,
      frame: 2,
      frameReasons: ["paint"],
      interactionDiagnostics: {
        activeDomIsland: null,
        activeMode: "retained-content",
        activeResizeNodeId: null,
        activeRetainedHit: {
          flowPoint: { x: 10, y: 20 },
          hitId: "control:param-0",
          hitKind: "control",
          localPoint: { x: 1, y: 2 },
          ownerSectionId: "section-a",
          rowControlKind: "switch",
          rowId: "param-0",
          rowLabel: "Enabled",
          rowState: null,
          screenPoint: { x: 100, y: 120 },
          subpartKind: null,
          surfaceId: "section-a:param-content:unpinned",
          zIndex: 1,
        },
        hoveredRetainedHit: null,
        lastPointer: null,
        nodeInteractionActiveNodeId: null,
        pointerCapture: { active: true, pointerId: 2 },
        viewport: {
          connectionStartHandlePresent: false,
          multiSelectionActive: false,
          nodeDragging: false,
          nodeResizing: false,
          nodesSelectionBounds: null,
          panScrolling: false,
          paneDragging: false,
          pointerPanning: false,
          selectionKeyPressed: false,
          transform: { x: 0, y: 0, zoom: 1 },
          userSelectionActive: false,
          userSelectionRect: null,
          viewportAnimating: false,
          viewportInteractionActive: true,
          wheelZooming: false,
        },
      },
      layerResult,
      renderDurationMs: 1,
      viewport: [0, 0, 1],
      viewportFrame: true,
    });

    expect(event.uploadDiagnosticCount).toBe(14);
    expect(event.uploadDiagnostics).toHaveLength(12);
    expect(event.interactionDiagnostics?.activeRetainedHit?.rowLabel).toBe(
      "Enabled",
    );
    expect(event.uploadDiagnostics.at(-1)?.surfaceId).toBe("node-11");
  });
});

function createLayerResult(
  overrides: Partial<RenderHtmlSurfaceFrameResult> = {},
): RenderHtmlSurfaceFrameResult {
  return {
    activeNodeId: "node-1",
    budgetExhausted: true,
    domTransformParkedNodeIds: ["node-5"],
    domTransformUpdatedNodeIds: ["node-1", "node-2"],
    drawnEdgeIds: ["edge-1"],
    drawnNodeIds: ["node-1", "node-2", "node-3"],
    edgeVertexCount: 6,
    evictedTextureBytes: 128,
    evictedTextureNodeIds: ["node-6"],
    missingElementNodeIds: ["node-7"],
    missingTextureNodeIds: ["node-8"],
    remainingDirtyNodeIds: ["node-9", "node-10"],
    renderBatchCount: 2,
    renderCommandCount: 3,
    renderCommandCountsByLayer: { "section-shell": 2 },
    renderCommandCountsByPipeline: { flat: 2 },
    renderCommandCountsByRole: { "section-shell": 2 },
    retainedContentOcclusionDiagnostics: [],
    skippedNodeIds: ["node-11"],
    textureMemory: {
      allocatedBytes: 4096,
      largestTextureBytes: 2048,
      textureCount: 4,
      visibleBytes: 3072,
      visibleTextureCount: 3,
    },
    textureMemoryBeforeEviction: {
      allocatedBytes: 8192,
      largestTextureBytes: 4096,
      textureCount: 5,
      visibleBytes: 3072,
      visibleTextureCount: 3,
    },
    textureLifecycleDiagnostics: [createTextureLifecycleDiagnostic()],
    uploadDiagnostics: [createUploadDiagnostic()],
    uploadWorkSummary: {
      deferredSurfaceCount: 1,
      initialDirtyWorkCounts: {
        animation: 1,
        content: 1,
        geometry: 0,
        hover: 0,
        resolution: 1,
        "source-window": 0,
      },
      initialDirtySurfaceCount: 3,
      noUploadReason: null,
      paintUnavailableSurfaceCount: 0,
      remainingDirtyWorkCounts: {
        animation: 0,
        content: 1,
        geometry: 0,
        hover: 0,
        resolution: 1,
        "source-window": 0,
      },
      remainingDirtySurfaceCount: 2,
      skippedSurfaceCount: 0,
      uploadableRemainingDirtyWorkCounts: {
        animation: 0,
        content: 0,
        geometry: 0,
        hover: 0,
        resolution: 1,
        "source-window": 0,
      },
      uploadableRemainingDirtySurfaceCount: 1,
      uploadedSurfaceCount: 1,
    },
    uploadedNodeIds: ["node-12"],
    visibleNodeIds: ["node-1", "node-2", "node-3", "node-4"],
    visualScene: createHtmlSurfaceVisualScene(),
    ...overrides,
  };
}

function createTextureLifecycleDiagnostic(): RenderHtmlSurfaceFrameResult["textureLifecycleDiagnostics"][number] {
  return {
    committed: {
      clampedByMaxTexture: false,
      cssHeight: 50,
      cssWidth: 100,
      dirtyContent: false,
      dirtyResolution: false,
      lastUploadFrame: 4,
      pixelHeight: 100,
      pixelWidth: 200,
      requestedScale: 2,
      resolutionScale: 2,
      textureBytes: 80_000,
      textureLayoutKind: "single",
      tileCount: 1,
      zoomBucket: 1,
    },
    pending: {
      clampedByMaxTexture: false,
      cssHeight: 50,
      cssWidth: 100,
      dirtyContent: true,
      dirtyResolution: true,
      lastUploadFrame: 5,
      pixelHeight: 150,
      pixelWidth: 300,
      requestedScale: 3,
      resolutionScale: 3,
      textureBytes: 180_000,
      textureLayoutKind: "single",
      tileCount: 1,
      zoomBucket: 1.5,
    },
    pendingResolution: {
      clampedByMaxTexture: false,
      cssHeight: 50,
      cssWidth: 100,
      maxTextureDimension2D: 4096,
      pixelHeight: 150,
      pixelWidth: 300,
      requestedScale: 3,
      resolutionScale: 3,
      zoomBucket: 1.5,
    },
    priority: "visible",
    surfaceId: "node-12",
  };
}

function createUploadDiagnostic(): RenderHtmlSurfaceFrameResult["uploadDiagnostics"][number] {
  return {
    cssHeight: 50,
    cssWidth: 100,
    dirtyContent: true,
    dirtyResolution: false,
    dirtySourceRect: {
      height: 12.34,
      width: 24.67,
      x: 1.12,
      y: 2.23,
    },
    dirtyTileBytes: 512,
    dirtyTileCount: 1,
    durationMs: 3.24,
    pixelHeight: 100,
    pixelWidth: 200,
    priority: "interactive",
    reasons: ["animation"],
    surfaceId: "node-12",
    textureBytes: 80_000,
    textureLayoutKind: "single",
    uploadedBytes: 512,
    uploadedTextureCount: 1,
    uploadedTileCount: 1,
    workKinds: ["animation"],
  };
}
