/* @vitest-environment jsdom */

import { describe, expect, it } from "vitest";

import { createGpuRetainedRuntimeFrame } from "../retainedRuntimeFrame";
import type { GpuContentSurface } from "../scene";
import type { GpuRect } from "../viewportMath";
import {
  shouldDeferGpuFlowRetainedContentPostSubmitMaintenance,
  shouldReuseGpuFlowRetainedContentFrameCache,
  syncGpuFlowNodeInteractionState,
  type GpuFlowRetainedContentFrameCache,
} from "./flowFrame";
import { createGpuFlowRetainedPreparationRuntimeFrame } from "./flowRetainedPreparationRuntimeFrame";

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

  it("keeps visible true-hole repair active during viewport interaction", () => {
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

  it("limits retained preparation snapshot sources to current refinement pages", () => {
    const runtimeFrame = retainedFrameWithSnapshotSources([
      retainedSnapshotSource("source-a", "surface-a", {
        height: 20,
        width: 120,
        x: 10,
        y: 10,
      }),
      retainedSnapshotSource("source-b", "surface-b", {
        height: 20,
        width: 120,
        x: 10,
        y: 10,
      }),
      ...Array.from({ length: 64 }, (_, index) =>
        retainedSnapshotSource(`source-extra-${index}`, "surface-extra", {
          height: 20,
          width: 120,
          x: 0,
          y: index * 24,
        }),
      ),
    ]);
    const preparedFrame = {
      ...retainedFrameCache({
        contentSurfaces: [],
        refinementPageCount: 1,
        trueHoleRectCount: 1,
      }).preparedFrame,
      refinementDescriptors: [
        retainedTexturePageDescriptor("surface-a", {
          height: 64,
          width: 256,
          x: 0,
          y: 0,
        }),
      ],
    };

    const preparationFrame = createGpuFlowRetainedPreparationRuntimeFrame({
      preparedFrame,
      retainedRuntimeFrame: runtimeFrame,
    });

    expect(
      preparationFrame.descriptors.textLikeRowSnapshotSources.map(
        (source) => source.sourceId,
      ),
    ).toEqual(["source-a"]);
    expect(preparationFrame.diagnostics.textLikeSnapshotSourceCount).toBe(1);
  });
});

function retainedFrameCache({
  contentSurfaces,
  refinementPageCount = 0,
  trueHoleRectCount = 0,
}: {
  readonly contentSurfaces: readonly GpuContentSurface[];
  readonly refinementPageCount?: number | undefined;
  readonly trueHoleRectCount?: number | undefined;
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
      compatibleDrawQuadCount: 0,
      fidelityState: trueHoleRectCount > 0 ? "refining" : "target",
      flatSurfaces: [],
      frame: 1,
      mergedDrawQuadCount: 0,
      refinementPageCount,
      trueHoleVisuals: [],
      protectedPageKeys: [],
      rejectedStaleRects: [],
      refinementDescriptors: [],
      rejectedStaleRectCount: 0,
      targetDescriptors: [],
      trueHoleRectsCss: [],
      trueHoleRectCount,
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

function retainedFrameWithSnapshotSources(
  sources: GpuFlowRetainedContentFrameCache["retainedRuntimeFrame"]["descriptors"]["textLikeRowSnapshotSources"],
): GpuFlowRetainedContentFrameCache["retainedRuntimeFrame"] {
  const frame = createGpuRetainedRuntimeFrame({
    devicePixelRatioBucket: 2,
    frameId: 1,
    scene: undefined,
    scrollOffsets: new Map(),
    scrollRevision: 3,
    viewport: [0, 0, 1],
    viewportZoomBucket: 1,
  });
  return {
    ...frame,
    descriptors: {
      ...frame.descriptors,
      textLikeRowSnapshotSources: sources,
    },
    diagnostics: {
      ...frame.diagnostics,
      textLikeSnapshotSourceCount: sources.length,
    },
  };
}

function retainedSnapshotSource(
  sourceId: string,
  surfaceId: string,
  targetRectCss: GpuRect,
): GpuFlowRetainedContentFrameCache["retainedRuntimeFrame"]["descriptors"]["textLikeRowSnapshotSources"][number] {
  return {
    code: "",
    commitPolicy: "native-island",
    defaultValue: "",
    disabled: false,
    editorKind: "text",
    error: false,
    language: null,
    linePolicy: "single-line",
    maxVisibleLines: 1,
    minVisibleLines: 1,
    rendererFamily: "plain",
    rowId: sourceId,
    sectionId: "section-a",
    sourceHeight: targetRectCss.height,
    sourceId,
    sourceKey: `${surfaceId}:${sourceId}`,
    sourceWidth: targetRectCss.width,
    surfaceId,
    targetRectCss,
    wrapLines: false,
  };
}

function retainedTexturePageDescriptor(
  surfaceId: string,
  sourceRectCss: GpuRect,
): GpuFlowRetainedContentFrameCache["preparedFrame"]["refinementDescriptors"][number] {
  return {
    contentVersion: 1,
    devicePixelRatioBucket: 2,
    lodLevel: 0,
    lodScale: 1,
    pixelHeight: Math.ceil(sourceRectCss.height),
    pixelWidth: Math.ceil(sourceRectCss.width),
    scaleKey: "scale=1",
    sourceKey: `${surfaceId}:source`,
    sourceRectCss,
    sourceVersion: 1,
    sourceWindowCss: sourceRectCss,
    surfaceId,
    tileColumn: 0,
    tileRow: 0,
    viewportZoomBucket: 1,
  };
}
