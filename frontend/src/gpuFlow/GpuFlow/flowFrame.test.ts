/* @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";

import type {
  RetainedContentTexturePageMaintenanceResult,
  RetainedContentTexturePageManager,
  RetainedContentTexturePagePreparedFrame,
} from "../retainedContentTexturePageManager";
import { createGpuRetainedRuntimeFrame } from "../retainedRuntimeFrame";
import type { GpuContentSurface } from "../scene";
import type { GpuRect } from "../viewportMath";
import {
  shouldDeferGpuFlowRetainedContentPostSubmitMaintenance,
  shouldReuseGpuFlowRetainedContentFrameCache,
  syncGpuFlowNodeInteractionState,
  type GpuFlowRetainedContentFrameCache,
} from "./flowFrame";
import { runGpuFlowRetainedPageMaintenanceBeforePublish } from "./flowRetainedPageMaintenance";
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

  it("repairs all true-hole coverage before retained display publication", () => {
    const initialFrame = retainedFrameCache({
      trueHoleRectCount: 2,
    }).preparedFrame;
    const partialFrame = retainedFrameCache({
      trueHoleRectCount: 1,
    }).preparedFrame;
    const repairedFrame = retainedFrameCache({
      trueHoleRectCount: 0,
    }).preparedFrame;
    const manager = {
      runPostSubmitMaintenance: vi
        .fn()
        .mockReturnValueOnce(
          retainedMaintenanceResult({
            preparedFrame: initialFrame,
            repairedPreparedFrame: partialFrame,
          }),
        )
        .mockReturnValueOnce(
          retainedMaintenanceResult({
            preparedFrame: partialFrame,
            repairedPreparedFrame: repairedFrame,
          }),
        ),
    } as unknown as RetainedContentTexturePageManager;

    const result = runGpuFlowRetainedPageMaintenanceBeforePublish({
      darkMode: false,
      deferResolutionUpdates: true,
      preparedFrame: initialFrame,
      retainedContentPageManager: manager,
      textLikeSnapshotElementById: new Map(),
    });

    expect(manager.runPostSubmitMaintenance).toHaveBeenCalledTimes(2);
    expect(result?.result.repairedPreparedFrame).toBe(repairedFrame);
    expect(result?.result.trueHoleRectCount).toBe(0);
    expect(result?.result.uploadCount).toBe(2);
  });

  it("continues pre-publish repair when true-hole area shrinks without changing rect count", () => {
    const initialFrame = retainedFrameCache({
      trueHoleRectsCss: [{ height: 100, width: 100, x: 0, y: 0 }],
    }).preparedFrame;
    const partialFrame = retainedFrameCache({
      trueHoleRectsCss: [{ height: 50, width: 100, x: 0, y: 50 }],
    }).preparedFrame;
    const repairedFrame = retainedFrameCache({
      trueHoleRectsCss: [],
    }).preparedFrame;
    const manager = {
      runPostSubmitMaintenance: vi
        .fn()
        .mockReturnValueOnce(
          retainedMaintenanceResult({
            preparedFrame: initialFrame,
            repairedPreparedFrame: partialFrame,
          }),
        )
        .mockReturnValueOnce(
          retainedMaintenanceResult({
            preparedFrame: partialFrame,
            repairedPreparedFrame: repairedFrame,
          }),
        ),
    } as unknown as RetainedContentTexturePageManager;

    const result = runGpuFlowRetainedPageMaintenanceBeforePublish({
      darkMode: false,
      deferResolutionUpdates: true,
      preparedFrame: initialFrame,
      retainedContentPageManager: manager,
      textLikeSnapshotElementById: new Map(),
    });

    expect(manager.runPostSubmitMaintenance).toHaveBeenCalledTimes(2);
    expect(result?.result.repairedPreparedFrame).toBe(repairedFrame);
    expect(result?.result.trueHoleRectCount).toBe(0);
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
      ...Array.from({ length: 160 }, (_, index) =>
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

  it("prioritizes large retained preparation snapshot descriptors beyond the initial order", () => {
    const runtimeFrame = retainedFrameWithSnapshotSources([
      retainedSnapshotSource("source-late", "surface-30", {
        height: 20,
        width: 120,
        x: 10,
        y: 10,
      }),
      ...Array.from({ length: 160 }, (_, index) =>
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
        refinementPageCount: 32,
        trueHoleRectCount: 32,
      }).preparedFrame,
      refinementDescriptors: Array.from({ length: 32 }, (_, index) =>
        retainedTexturePageDescriptor(`surface-${index}`, {
          height: index === 30 ? 256 : 8,
          width: index === 30 ? 256 : 8,
          x: 0,
          y: 0,
        }),
      ),
    };

    const preparationFrame = createGpuFlowRetainedPreparationRuntimeFrame({
      preparedFrame,
      retainedRuntimeFrame: runtimeFrame,
    });

    expect(
      preparationFrame.descriptors.textLikeRowSnapshotSources.map(
        (source) => source.sourceId,
      ),
    ).toEqual(["source-late"]);
  });

  it("rotates snapshot-blocked retained preparation descriptors ahead of larger stale holes", () => {
    const runtimeFrame = retainedFrameWithSnapshotSources([
      retainedSnapshotSource("source-latest-blocked", "surface-30", {
        height: 4,
        width: 4,
        x: 1,
        y: 1,
      }),
      retainedSnapshotSource("source-large-blocked", "surface-0", {
        height: 20,
        width: 120,
        x: 10,
        y: 10,
      }),
      ...Array.from({ length: 160 }, (_, index) =>
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
        refinementPageCount: 32,
        trueHoleRectCount: 32,
      }).preparedFrame,
      replacementDescriptors: Array.from({ length: 32 }, (_, index) =>
        retainedReplacementDescriptor({
          descriptor: retainedTexturePageDescriptor(`surface-${index}`, {
            height: index === 30 ? 8 : 256,
            width: index === 30 ? 8 : 256,
            x: 0,
            y: 0,
          }),
          snapshotBlockSequence: index,
        }),
      ),
    };

    const preparationFrame = createGpuFlowRetainedPreparationRuntimeFrame({
      preparedFrame,
      retainedRuntimeFrame: runtimeFrame,
    });

    expect(
      preparationFrame.descriptors.textLikeRowSnapshotSources.map(
        (source) => source.sourceId,
      ),
    ).toContain("source-latest-blocked");
  });
});

function retainedFrameCache({
  contentSurfaces = [],
  refinementPageCount = 0,
  trueHoleRectCount = 0,
  trueHoleRectsCss,
}: {
  readonly contentSurfaces: readonly GpuContentSurface[];
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

function retainedMaintenanceResult({
  preparedFrame,
  repairedPreparedFrame,
}: {
  readonly preparedFrame: RetainedContentTexturePagePreparedFrame;
  readonly repairedPreparedFrame: RetainedContentTexturePagePreparedFrame;
}): RetainedContentTexturePageMaintenanceResult {
  return {
    budgetExhausted: false,
    compatibleDrawQuadCount: preparedFrame.compatibleDrawQuadCount,
    coverageCandidateCount: preparedFrame.coverageCandidateCount,
    diagnostics: [],
    drawQuadCount: preparedFrame.drawQuadCount,
    evicted: {
      evictedBytes: 0,
      evictedKeys: [],
      remainingBytes: 0,
    },
    executedItemCount: 1,
    fidelityState: repairedPreparedFrame.fidelityState,
    memory: {
      committedBytes: 0,
      committedCount: 0,
      pendingBytes: 0,
      pendingCount: 0,
      retiredBytes: 0,
      retiredCount: 0,
      totalBytes: 0,
    },
    mergedDrawQuadCount: preparedFrame.mergedDrawQuadCount,
    needsFollowUpFrame: repairedPreparedFrame.trueHoleRectCount > 0,
    postMaintenanceRefinementPageCount:
      repairedPreparedFrame.refinementPageCount,
    queuedWorkCount: 0,
    queuedWorkCountBeforeUpload: 1,
    rasterMs: 1,
    refinementPageCount: preparedFrame.refinementPageCount,
    rejectedStaleRectCount: repairedPreparedFrame.rejectedStaleRectCount,
    remainingUploadableWorkCount: 0,
    repairedPreparedFrame,
    skippedItemCount: 0,
    targetDescriptorCount: preparedFrame.refinementDescriptors.length,
    trueHoleRectCount: preparedFrame.trueHoleRectCount,
    trueHoleVisuals: preparedFrame.trueHoleVisuals,
    uploadedBytes: 1024,
    uploadedDrawCommandCount: 1,
    uploadCount: 1,
    uploadMs: 1,
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

function retainedReplacementDescriptor({
  descriptor,
  snapshotBlockSequence,
}: {
  readonly descriptor: GpuFlowRetainedContentFrameCache["preparedFrame"]["refinementDescriptors"][number];
  readonly snapshotBlockSequence: number;
}): GpuFlowRetainedContentFrameCache["preparedFrame"]["replacementDescriptors"][number] {
  return {
    descriptor,
    replacementRequest: {
      contentManifest: retainedRegionManifest(descriptor),
      key: {
        contentRect: descriptor.sourceRectCss,
        contentVersion: String(descriptor.contentVersion),
        fidelityTarget: {
          devicePixelRatioBucket: descriptor.devicePixelRatioBucket,
          lodLevel: descriptor.lodLevel,
          lodScale: descriptor.lodScale,
          pageGridGeneration: "test-grid",
          pixelHeight: descriptor.pixelHeight,
          pixelWidth: descriptor.pixelWidth,
          viewportZoomBucket: descriptor.viewportZoomBucket,
        },
        owner: descriptor.surfaceId,
      },
      priority: "visible-hole",
      reason: "true-hole",
      target: {
        clipRect: descriptor.sourceWindowCss,
        contentRect: descriptor.sourceRectCss,
        fidelity: {
          devicePixelRatioBucket: descriptor.devicePixelRatioBucket,
          lodLevel: descriptor.lodLevel,
          lodScale: descriptor.lodScale,
          pageGridGeneration: "test-grid",
          pixelHeight: descriptor.pixelHeight,
          pixelWidth: descriptor.pixelWidth,
          viewportZoomBucket: descriptor.viewportZoomBucket,
        },
        manifest: retainedRegionManifest(descriptor),
        reason: "newly-exposed",
        surfaceLayout: {
          height: descriptor.sourceRectCss.height,
          surfaceId: descriptor.surfaceId,
          textureSourceRect: descriptor.sourceWindowCss,
          width: descriptor.sourceRectCss.width,
          x: 0,
          y: 0,
        },
        zLayer: 0,
      },
    },
    snapshotBlockSequence,
    snapshotRequired: true,
  };
}

function retainedRegionManifest(
  descriptor: GpuFlowRetainedContentFrameCache["preparedFrame"]["refinementDescriptors"][number],
): GpuFlowRetainedContentFrameCache["preparedFrame"]["replacementDescriptors"][number]["replacementRequest"]["contentManifest"] {
  return {
    clipRect: descriptor.sourceWindowCss,
    contentRect: descriptor.sourceRectCss,
    contentSegments: [],
    contentVersion: descriptor.contentVersion,
    documentId: descriptor.sourceKey,
    fontGeneration: 0,
    renderMode: "passive",
    rowId: null,
    sectionId: descriptor.surfaceId,
    surfaceId: descriptor.surfaceId,
    textLikeSnapshots: [],
    themeGeneration: descriptor.sourceVersion,
  };
}
