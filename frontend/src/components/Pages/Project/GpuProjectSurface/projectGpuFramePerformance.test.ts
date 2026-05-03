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
          remainingDirtyNodeCount: 2,
          textureMemoryAllocatedBytes: 4096,
          uploadDiagnosticCount: 1,
          uploadDiagnostics: [
            expect.objectContaining({
              cssHeight: 50.1,
              cssWidth: 100.4,
              dirtySourceRect: { height: 12.3, width: 24.7, x: 1.1, y: 2.2 },
              dirtyTileCount: 1,
              durationMs: 3.2,
              reasons: ["animation"],
              surfaceId: "node-12",
              uploadedBytes: 512,
            }),
          ],
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
    missingElementNodeCount: 1,
    missingTextureNodeCount: 1,
    remainingDirtyNodeCount: 2,
    skippedNodeCount: 1,
    textureMemoryAllocatedBytes: 4096,
    textureMemoryBeforeEvictionAllocatedBytes: 8192,
    textureMemoryBeforeEvictionCount: 5,
    textureMemoryCount: 4,
    textureMemoryLargestBytes: 2048,
    textureMemoryVisibleBytes: 3072,
    textureMemoryVisibleCount: 3,
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
      },
    ],
    uploadedNodeCount: 1,
    viewport: { x: 10.12, y: 20.56, zoom: 0.55 },
    viewportFrame: false,
    visibleNodeCount: 4,
  };
}
