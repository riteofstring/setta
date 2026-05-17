/* @vitest-environment jsdom */

import { describe, expect, it } from "vitest";

import { createGpuRetainedRuntimeFrame } from "../retainedRuntimeFrame";
import type { GpuContentSurface } from "../scene";
import type { GpuRect } from "../viewportMath";
import {
  shouldDeferGpuFlowRetainedContentPostSubmitMaintenance,
  shouldReuseGpuFlowRetainedContentFrameCache,
  shouldReuseGpuFlowRetainedRuntimeFrameForSample,
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

  it("keeps visible true-hole follow-up maintenance active during viewport interaction", () => {
    expect(
      shouldDeferGpuFlowRetainedContentPostSubmitMaintenance({
        deferResolutionUpdates: true,
        preparedFrame: retainedFrameCache({ trueHoleRectCount: 0 })
          .preparedFrame,
      }),
    ).toBe(true);
    expect(
      shouldDeferGpuFlowRetainedContentPostSubmitMaintenance({
        deferResolutionUpdates: true,
        preparedFrame: retainedFrameCache({ trueHoleRectCount: 1 })
          .preparedFrame,
      }),
    ).toBe(false);
    expect(
      shouldDeferGpuFlowRetainedContentPostSubmitMaintenance({
        deferResolutionUpdates: false,
        preparedFrame: retainedFrameCache({ trueHoleRectCount: 0 })
          .preparedFrame,
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
          refinementPageCount: 1,
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
          refinementPageCount: 1,
          trueHoleRectCount: 1,
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
          refinementPageCount: 1,
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

  it("rebuilds retained runtime frame metadata when the projection sample viewport changes", () => {
    const cachedFrame = retainedFrameCache({});

    expect(
      shouldReuseGpuFlowRetainedRuntimeFrameForSample({
        cachedFrame,
        nativeVisualSignature: cachedFrame.nativeVisualSignature,
        viewport: [0, 0, 1],
      }),
    ).toBe(true);
    expect(
      shouldReuseGpuFlowRetainedRuntimeFrameForSample({
        cachedFrame,
        nativeVisualSignature: cachedFrame.nativeVisualSignature,
        viewport: [40, 0, 1],
      }),
    ).toBe(false);
  });
});

function retainedFrameCache({
  contentSurfaces = [],
  refinementPageCount = 0,
  trueHoleRectCount = 0,
  trueHoleRectsCss,
}: {
  readonly contentSurfaces?: readonly GpuContentSurface[] | undefined;
  readonly refinementPageCount?: number | undefined;
  readonly trueHoleRectCount?: number | undefined;
  readonly trueHoleRectsCss?: readonly GpuRect[] | undefined;
}): GpuFlowRetainedContentFrameCache {
  const resolvedTrueHoleRectsCss =
    trueHoleRectsCss ??
    Array.from({ length: trueHoleRectCount }, (_, index) => ({
      height: 1,
      width: 1,
      x: index,
      y: 0,
    }));
  const resolvedTrueHoleRectCount = resolvedTrueHoleRectsCss.length;
  return {
    contentSurfaces,
    devicePixelRatio: 2,
    nativeVisualSignature: "{}",
    pageDrawableRevision: 5,
    preparedFrame: {
      coveragePlan: emptyCoveragePlan(),
      coverageCandidateCount: 0,
      drawRegions: [],
      drawQuadCount: 0,
      compatibleDrawQuadCount: 0,
      fidelityState: resolvedTrueHoleRectCount > 0 ? "refining" : "target",
      flatSurfaces: [],
      frame: 1,
      mergedDrawQuadCount: 0,
      refinementPageCount,
      trueHoleVisuals: [],
      protectedPageKeys: [],
      rejectedStaleRects: [],
      replacementDescriptors: [],
      replacementRequests: [],
      refinementDescriptors: [],
      rejectedStaleRectCount: 0,
      trueHoleRectsCss: resolvedTrueHoleRectsCss,
      trueHoleRectCount: resolvedTrueHoleRectCount,
      visibleRegionTargets: [],
      visualEpochs: [],
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
    viewportSize: { height: 600, width: 800 },
    viewportZoomBucket: 1,
  };
}

function emptyCoveragePlan() {
  return {
    diagnostics: {
      committedCandidateCount: 0,
      compatibleRegionCount: 0,
      compatibilityDurationMs: 0,
      cost: {
        allocatedDiagnosticRectCount: 0,
        candidateCount: 0,
        compatibilityCheckCount: 0,
        coverageFragmentCount: 0,
        drawRegionCount: 0,
        maxFragmentsPerVisibleTarget: 0,
        rejectedSampleCount: 0,
        sliverDiscardedAreaCssPx: 0,
        spatialQueryCount: 0,
        visibleRegionCount: 0,
        visibleRegionGroupCount: 0,
      },
      coverageFragmentCount: 0,
      coveragePlanDurationMs: 0,
      drawRegionCount: 0,
      exactRegionCount: 0,
      maxFragmentsPerVisibleTarget: 0,
      rejectedCoverageCountByReason: {},
      sampledRejectedCoverage: [],
      spatialQueryDurationMs: 0,
      trueHoleAreaCssPx: 0,
      trueHoleRectCount: 0,
      visibleRegionCount: 0,
    },
    drawRegions: [],
    nativeIslandRegions: [],
    proof: {
      compatibleCoveredAreaCssPx: 0,
      exactCoveredAreaCssPx: 0,
      rejectedCoverageCountByReason: {},
      replacementRequestedAreaCssPx: 0,
      trueHoleAreaCssPx: 0,
      visibleAreaCssPx: 0,
    },
    protectedPageKeys: [],
    replacementRequests: [],
    trueHoles: [],
    visibleRegionTargets: [],
  };
}
