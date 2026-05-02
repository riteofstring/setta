// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import { postGpuFlowFrameChromeReproEvent } from "./chromeReproPerf";
import type { RenderHtmlSurfaceFrameResult } from "./htmlSurfaces/frame";

describe("chromeReproPerf", () => {
  afterEach(() => {
    window.__SETTA_CHROME_REPRO_ACTIVE__ = false;
    vi.restoreAllMocks();
  });

  it("does not post recorder events when repro capture is inactive", () => {
    const postSpy = vi.spyOn(window, "postMessage");

    postGpuFlowFrameChromeReproEvent({
      deferResolutionUpdates: false,
      frame: 1,
      frameReasons: ["paint"],
      layerResult: createLayerResult(),
      renderDurationMs: 4.2,
      viewport: [0, 0, 1],
      viewportFrame: false,
    });

    expect(postSpy).not.toHaveBeenCalled();
  });

  it("posts compact gpu flow frame metrics for chrome recordings", () => {
    window.__SETTA_CHROME_REPRO_ACTIVE__ = true;
    const postSpy = vi.spyOn(window, "postMessage");

    postGpuFlowFrameChromeReproEvent({
      deferResolutionUpdates: true,
      frame: 7,
      frameReasons: ["paint", "texture-upload"],
      layerResult: createLayerResult(),
      renderDurationMs: 12.34,
      viewport: [10.12, 20.56, 0.55],
      viewportFrame: false,
    });

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

function createLayerResult(): RenderHtmlSurfaceFrameResult {
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
    uploadDiagnostics: [
      {
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
      },
    ],
    uploadedNodeIds: ["node-12"],
    visibleNodeIds: ["node-1", "node-2", "node-3", "node-4"],
    visualScene: {
      effectSurfaces: [],
      flatSurfaces: [],
      meshSurfaces: [],
      tiledFlatSurfaces: [],
    },
  };
}
