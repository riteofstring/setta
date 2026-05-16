/* @vitest-environment jsdom */

import { describe, expect, it } from "vitest";

import { createGpuRetainedRuntimeFrame } from "../retainedRuntimeFrame";
import type { GpuContentSurface } from "../scene";
import {
  shouldDeferGpuFlowRetainedContentPostSubmitMaintenance,
  shouldReuseGpuFlowRetainedContentFrameCache,
  syncGpuFlowNodeInteractionState,
  type GpuFlowRetainedContentFrameCache,
} from "./flowFrame";

describe("GPU flow frame helpers", () => {
  it("reports deactivated interaction nodes for final texture capture", () => {
    const activeElement = document.createElement("div");
    const nextElement = document.createElement("div");
    const nodeElementByIdRef = {
      current: new Map([
        ["node-a", activeElement],
        ["node-b", nextElement],
      ]),
    };
    const previousActiveNodeIdRef = { current: "node-a" };

    const deactivatedNodeIds = syncGpuFlowNodeInteractionState({
      nodeElementByIdRef,
      previousActiveNodeIdRef,
      state: { activeNodeId: "node-b" },
    });

    expect(deactivatedNodeIds).toEqual(["node-a"]);
    expect(activeElement.dataset.gpuFlowInteractive).toBe("false");
    expect(nextElement.dataset.gpuFlowInteractive).toBe("true");
  });

  it("keeps first-visible retained page uploads available during active viewport frames", () => {
    expect(
      shouldDeferGpuFlowRetainedContentPostSubmitMaintenance({
        deferResolutionUpdates: true,
        preparedFrame: { uncoveredRectCount: 0 },
      }),
    ).toBe(true);
    expect(
      shouldDeferGpuFlowRetainedContentPostSubmitMaintenance({
        deferResolutionUpdates: true,
        preparedFrame: { uncoveredRectCount: 1 },
      }),
    ).toBe(false);
    expect(
      shouldDeferGpuFlowRetainedContentPostSubmitMaintenance({
        deferResolutionUpdates: false,
        preparedFrame: { uncoveredRectCount: 0 },
      }),
    ).toBe(false);
  });

  it("reuses committed retained page coverage when scene, zoom, and scroll inputs are unchanged", () => {
    const contentSurfaces: readonly GpuContentSurface[] = [];
    const cachedFrame = retainedFrameCache({ contentSurfaces });

    expect(
      shouldReuseGpuFlowRetainedContentFrameCache({
        cachedFrame,
        contentSurfaces,
        devicePixelRatio: 2,
        pageDrawableRevision: 5,
        sceneRevision: 7,
        scrollRevision: 3,
        viewportZoomBucket: 1,
      }),
    ).toBe(true);
    expect(
      shouldReuseGpuFlowRetainedContentFrameCache({
        cachedFrame,
        contentSurfaces,
        devicePixelRatio: 2,
        pageDrawableRevision: 5,
        sceneRevision: 8,
        scrollRevision: 3,
        viewportZoomBucket: 1,
      }),
    ).toBe(false);
    expect(
      shouldReuseGpuFlowRetainedContentFrameCache({
        cachedFrame,
        contentSurfaces,
        devicePixelRatio: 2,
        pageDrawableRevision: 5,
        sceneRevision: 7,
        scrollRevision: 4,
        viewportZoomBucket: 1,
      }),
    ).toBe(false);
    expect(
      shouldReuseGpuFlowRetainedContentFrameCache({
        cachedFrame,
        contentSurfaces: [],
        devicePixelRatio: 2,
        pageDrawableRevision: 5,
        sceneRevision: 7,
        scrollRevision: 3,
        viewportZoomBucket: 1,
      }),
    ).toBe(false);
    expect(
      shouldReuseGpuFlowRetainedContentFrameCache({
        cachedFrame,
        contentSurfaces,
        devicePixelRatio: 2,
        pageDrawableRevision: 6,
        sceneRevision: 7,
        scrollRevision: 3,
        viewportZoomBucket: 1,
      }),
    ).toBe(false);
    expect(
      shouldReuseGpuFlowRetainedContentFrameCache({
        allowCoveredRefinementBacklog: true,
        cachedFrame: retainedFrameCache({
          contentSurfaces,
          missingPageCount: 1,
        }),
        contentSurfaces,
        devicePixelRatio: 2,
        pageDrawableRevision: 5,
        sceneRevision: 7,
        scrollRevision: 3,
        viewportZoomBucket: 1,
      }),
    ).toBe(true);
    expect(
      shouldReuseGpuFlowRetainedContentFrameCache({
        allowCoveredRefinementBacklog: true,
        cachedFrame: retainedFrameCache({
          contentSurfaces,
          missingPageCount: 1,
          uncoveredRectCount: 1,
        }),
        contentSurfaces,
        devicePixelRatio: 2,
        pageDrawableRevision: 5,
        sceneRevision: 7,
        scrollRevision: 3,
        viewportZoomBucket: 1,
      }),
    ).toBe(false);
    expect(
      shouldReuseGpuFlowRetainedContentFrameCache({
        cachedFrame: retainedFrameCache({
          contentSurfaces,
          missingPageCount: 1,
        }),
        contentSurfaces,
        devicePixelRatio: 2,
        pageDrawableRevision: 5,
        sceneRevision: 7,
        scrollRevision: 3,
        viewportZoomBucket: 1,
      }),
    ).toBe(false);
  });
});

function retainedFrameCache({
  contentSurfaces,
  missingPageCount = 0,
  uncoveredRectCount = 0,
}: {
  readonly contentSurfaces: readonly GpuContentSurface[];
  readonly missingPageCount?: number | undefined;
  readonly uncoveredRectCount?: number | undefined;
}): GpuFlowRetainedContentFrameCache {
  return {
    contentSurfaces,
    devicePixelRatio: 2,
    nativeVisualSignature: "{}",
    pageDrawableRevision: 5,
    preparedFrame: {
      coverageCandidateCount: 0,
      drawQuadCount: 0,
      drawQuads: [],
      fallbackDrawQuadCount: 0,
      flatSurfaces: [],
      frame: 1,
      mergedDrawQuadCount: 0,
      missingPageCount,
      protectedPageKeys: [],
      refinementDescriptors: [],
      staleFallbackDrawQuadCount: 0,
      targetDescriptors: [],
      uncoveredRectCount,
    },
    retainedRuntimeFrame: createGpuRetainedRuntimeFrame({
      devicePixelRatioBucket: 2,
      frameId: 1,
      scene: undefined,
      scrollOffsets: new Map(),
      scrollRevision: 3,
      viewport: [0, 0, 1],
      viewportZoomBucket: 1,
    }),
    sceneRevision: 7,
    scrollRevision: 3,
    viewportZoomBucket: 1,
  };
}
