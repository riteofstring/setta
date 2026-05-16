// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import type { GpuFlowFramePerformanceEvent } from "gpuFlow/framePerformance";

import {
  postProjectGpuFlowFrameChromeReproEvent,
  PROJECT_GPU_FLOW_FRAME_PERFORMANCE_REPORTER,
} from "./projectGpuFramePerformance";

describe("projectGpuFramePerformance", () => {
  afterEach(() => {
    window.__SETTA_CHROME_REPRO_ACTIVE__ = false;
    vi.restoreAllMocks();
  });

  it("does not post recorder events when repro capture is inactive", () => {
    const postSpy = vi.spyOn(window, "postMessage");

    postProjectGpuFlowFrameChromeReproEvent(createFramePerformanceEvent());

    expect(postSpy).not.toHaveBeenCalled();
    expect(PROJECT_GPU_FLOW_FRAME_PERFORMANCE_REPORTER.isEnabled?.()).toBe(
      false,
    );
  });

  it("posts rounded gpu flow frame metrics for chrome recordings", () => {
    window.__SETTA_CHROME_REPRO_ACTIVE__ = true;
    const postSpy = vi.spyOn(window, "postMessage");

    postProjectGpuFlowFrameChromeReproEvent(createFramePerformanceEvent());

    expect(PROJECT_GPU_FLOW_FRAME_PERFORMANCE_REPORTER.isEnabled?.()).toBe(
      true,
    );
    expect(postSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "gpu-flow-frame",
        payload: expect.objectContaining({
          budgetExhausted: true,
          deferResolutionUpdates: true,
          drawnNodeCount: 3,
          durationMs: 12.3,
          evictedTextureBytes: 128,
          frame: 7,
          frameReasons: ["paint", "texture-upload"],
          interactionDiagnostics: expect.objectContaining({
            activeMode: "retained-content",
            activeRetainedHit: expect.objectContaining({
              hitKind: "control",
              rowControlKind: "switch",
              rowId: "param-0",
              rowLabel: "Enabled",
            }),
            pointerCapture: { active: true, pointerId: 2 },
          }),
          remainingDirtyNodeCount: 2,
          retainedTexturePageBudgetExhausted: true,
          retainedTexturePageMemoryCommittedBytes: 4096,
          retainedTexturePageMissingPageCount: 3,
          retainedTexturePageRasterMs: 1.2,
          retainedTexturePageTargetDescriptorCount: 8,
          retainedTexturePageUploadedBytes: 1024,
          retainedTexturePageUploadCount: 2,
          retainedTexturePageUploadMs: 2.4,
          textureMemoryAllocatedBytes: 4096,
          uploadDiagnosticCount: 1,
          uploadDiagnosticSummary: [
            expect.objectContaining({
              count: 1,
              dirtyTileBytes: 512,
              dirtyTileCount: 1,
              durationMs: 3.2,
              priority: "interactive",
              reasons: ["animation"],
              sampleSurfaceIds: ["node-12"],
              textureLayoutKind: "single",
              uploadedBytes: 512,
              uploadedTextureCount: 1,
              uploadedTileCount: 1,
              workKinds: ["content"],
            }),
          ],
          uploadDiagnostics: [],
          uploadedNodeCount: 1,
          viewport: { x: 10.1, y: 20.6, zoom: 0.6 },
          visibleNodeCount: 4,
        }),
      }),
      "*",
    );
  });
});

function createFramePerformanceEvent(): GpuFlowFramePerformanceEvent {
  return {
    activeNodeId: "node-1",
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
    missingElementNodeCount: 1,
    missingTextureNodeCount: 1,
    remainingDirtyNodeCount: 2,
    retainedTexturePageBudgetExhausted: true,
    retainedTexturePageCoverageCandidateCount: 5,
    retainedTexturePageDiagnosticCount: 1,
    retainedTexturePageDrawQuadCount: 1,
    retainedTexturePageEvictedBytes: 512,
    retainedTexturePageEvictedCount: 1,
    retainedTexturePageFallbackDrawQuadCount: 0,
    retainedTexturePageMemoryCommittedBytes: 4096,
    retainedTexturePageMemoryCommittedCount: 4,
    retainedTexturePageMemoryRetiredBytes: 0,
    retainedTexturePageMemoryRetiredCount: 0,
    retainedTexturePageMemoryTotalBytes: 5120,
    retainedTexturePageMergedDrawQuadCount: 1,
    retainedTexturePageMissingPageCount: 3,
    retainedTexturePageRasterMs: 1.23,
    retainedTexturePageStaleFallbackDrawQuadCount: 2,
    retainedTexturePageTargetDescriptorCount: 8,
    retainedTexturePageUncoveredRectCount: 0,
    retainedTexturePageUploadedBytes: 1024,
    retainedTexturePageUploadedDrawCommandCount: 12,
    retainedTexturePageUploadCount: 2,
    retainedTexturePageUploadMs: 2.35,
    skippedNodeCount: 1,
    solidRoundedRectSurfaceCount: 0,
    textureMemoryAllocatedBytes: 4096,
    textureMemoryBeforeEvictionAllocatedBytes: 8192,
    textureMemoryBeforeEvictionCount: 5,
    textureMemoryCount: 4,
    textureMemoryLargestBytes: 2048,
    textureMemoryVisibleBytes: 3072,
    textureMemoryVisibleCount: 3,
    textureLifecycleDiagnosticCount: 0,
    textureLifecycleDiagnostics: [],
    textureUploadDeferredSurfaceCount: 0,
    textureUploadInitialDirtySurfaceCount: 1,
    textureUploadInitialDirtyWorkCounts: createDirtyWorkCounts({
      content: 1,
    }),
    textureUploadNoWorkReason: null,
    textureUploadPaintUnavailableSurfaceCount: 0,
    textureUploadRemainingDirtySurfaceCount: 0,
    textureUploadRemainingDirtyWorkCounts: createDirtyWorkCounts(),
    textureUploadSkippedSurfaceCount: 0,
    textureUploadUploadableRemainingDirtySurfaceCount: 0,
    textureUploadUploadableRemainingDirtyWorkCounts: createDirtyWorkCounts(),
    textureUploadUploadedSurfaceCount: 1,
    uploadDiagnosticCount: 1,
    uploadDiagnostics: [
      {
        cssHeight: 50.05,
        cssWidth: 100.36,
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
        workKinds: ["content"],
      },
    ],
    uploadedNodeCount: 1,
    viewport: { x: 10.12, y: 20.56, zoom: 0.55 },
    viewportFrame: false,
    visibleNodeCount: 4,
  };
}

function createDirtyWorkCounts(
  overrides: Partial<
    Record<
      | "animation"
      | "content"
      | "geometry"
      | "hover"
      | "resolution"
      | "source-window",
      number
    >
  > = {},
) {
  return {
    animation: overrides.animation ?? 0,
    content: overrides.content ?? 0,
    geometry: overrides.geometry ?? 0,
    hover: overrides.hover ?? 0,
    resolution: overrides.resolution ?? 0,
    "source-window": overrides["source-window"] ?? 0,
  };
}
