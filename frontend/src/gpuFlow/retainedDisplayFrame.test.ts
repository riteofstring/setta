import { describe, expect, it } from "vitest";

import type { HtmlSurfaceFlatVisual } from "./htmlSurfaces/visualScene";
import {
  createRetainedCommittedPageLifecycle,
  createRetainedRegionTargetFromDescriptor,
} from "./retainedContentLifecycle";
import type { RetainedContentTexturePagePreparedFrame } from "./retainedContentTexturePageManager";
import type { RetainedContentTextureResources } from "./retainedContentTextureResources";
import {
  createRetainedDisplayFrameInput,
  publishRetainedDisplayFrame,
} from "./retainedDisplayFrame";
import { createGpuRetainedRuntimeFrame } from "./retainedRuntimeFrame";
import {
  retainedTexturePageLodLevel,
  retainedTexturePageScaleKey,
  type RetainedTexturePageDescriptor,
} from "./retainedTexturePages";
import type {
  RetainedDrawRegion,
  RetainedVisibleCoveragePlan,
  RetainedVisibleRegionTarget,
} from "./retainedVisibleCoveragePlanner";
import type { GpuDomIsland, GpuFlowScene } from "./scene";
import type { GpuRect } from "./viewportMath";

describe("retained display frame publisher", () => {
  it("publishes prepared frames with complete visible coverage", () => {
    const descriptor = pageDescriptor();
    const drawRegion = pageDrawRegion(descriptor);
    const frame = publishRetainedDisplayFrame({
      prepared: preparedFrame({
        drawRegions: [drawRegion],
        visibleRegionTargets: [descriptor],
      }),
      previous: null,
    });

    expect(frame.coverageProof.trueHoleRects).toEqual([]);
    expect(frame.coverageProof.visibleContentRects).toEqual([
      descriptor.sourceRectCss,
    ]);
    expect(frame.coverageProof.exactCoverageRects).toEqual([
      descriptor.sourceRectCss,
    ]);
    expect(frame.diagnostics.coverageReadiness).toBe("covered");
    expect(frame.diagnostics.fidelityReadiness).toBe("target");
    expect(frame.pageFrame.flatSurfaces).toEqual([
      expect.objectContaining({ surfaceId: "frame-1" }),
    ]);
  });

  it("rejects current motion when committed visual epoch coverage is missing", () => {
    const descriptor = pageDescriptor();
    const previous = publishRetainedDisplayFrame({
      prepared: preparedFrame({
        drawRegions: [pageDrawRegion(descriptor)],
        frame: 1,
        visibleRegionTargets: [descriptor],
      }),
      previous: null,
    });
    const missingRect = { height: 32, width: 32, x: 16, y: 16 };
    expect(() =>
      publishRetainedDisplayFrame({
        prepared: preparedFrame({
          drawRegions: [
            pageDrawRegion(descriptor, {
              coverageKind: "compatible",
              sampleRectCss: { height: 16, width: 64, x: 0, y: 0 },
            }),
          ],
          frame: 2,
          visibleRegionTargets: [descriptor],
          trueHoleRectsCss: [missingRect],
        }),
        previous,
      }),
    ).toThrow(/committed visual epoch coverage/);
  });

  it("rejects scroll frames that would expose true-hole coverage", () => {
    const descriptor = pageDescriptor();
    const previous = publishRetainedDisplayFrame({
      nowMs: 10,
      prepared: preparedFrame({
        drawRegions: [pageDrawRegion(descriptor)],
        frame: 1,
        scrollOffsets: new Map([["surface", { x: 0, y: 0 }]]),
        visibleRegionTargets: [descriptor],
      }),
      previous: null,
    });
    const missingRect = { height: 32, width: 32, x: 16, y: 16 };
    expect(() =>
      publishRetainedDisplayFrame({
        nowMs: 20,
        prepared: preparedFrame({
          drawRegions: [
            pageDrawRegion(descriptor, {
              coverageKind: "compatible",
              sampleRectCss: { height: 16, width: 64, x: 0, y: 0 },
            }),
          ],
          frame: 2,
          scrollOffsets: new Map([["surface", { x: 0, y: 24 }]]),
          visibleRegionTargets: [descriptor],
          trueHoleRectsCss: [missingRect],
        }),
        previous,
      }),
    ).toThrow(/committed visual epoch coverage/);
  });

  it("rejects native-island detach frames that would expose passive true holes", () => {
    const descriptor = pageDescriptor();
    const previous = publishRetainedDisplayFrame({
      prepared: preparedFrame({
        drawRegions: [pageDrawRegion(descriptor)],
        frame: 1,
        nativeDomIslands: [nativeIsland("island-a")],
        visibleRegionTargets: [descriptor],
      }),
      previous: null,
    });

    expect(previous.diagnostics.activeIslandTransaction.mode).toBe("attach");
    expect(() =>
      publishRetainedDisplayFrame({
        prepared: preparedFrame({
          drawRegions: [
            pageDrawRegion(descriptor, {
              coverageKind: "compatible",
              sampleRectCss: { height: 16, width: 64, x: 0, y: 0 },
            }),
          ],
          frame: 2,
          nativeDomIslands: [],
          visibleRegionTargets: [descriptor],
          trueHoleRectsCss: [{ height: 12, width: 12, x: 0, y: 0 }],
        }),
        previous,
      }),
    ).toThrow(/committed visual epoch coverage/);
  });

  it("records compatible coverage without treating it as true-hole coverage", () => {
    const descriptor = pageDescriptor();
    const frame = publishRetainedDisplayFrame({
      prepared: preparedFrame({
        drawRegions: [
          pageDrawRegion(descriptor, { coverageKind: "compatible" }),
        ],
        refinementPageCount: 1,
        visibleRegionTargets: [descriptor],
      }),
      previous: null,
    });

    expect(frame.coverageProof.trueHoleRects).toEqual([]);
    expect(frame.coverageProof.compatibleCoverageRects).toEqual([
      descriptor.sourceRectCss,
    ]);
    expect(frame.diagnostics.compatiblePageCount).toBe(1);
    expect(frame.diagnostics.fidelityReadiness).toBe("compatible-lower-lod");
  });

  it("marks compatible covered scroll frames as covered motion frames", () => {
    const descriptor = pageDescriptor();
    const previous = publishRetainedDisplayFrame({
      prepared: preparedFrame({
        drawRegions: [pageDrawRegion(descriptor)],
        frame: 1,
        visibleRegionTargets: [descriptor],
      }),
      previous: null,
    });
    const next = publishRetainedDisplayFrame({
      prepared: preparedFrame({
        drawRegions: [
          pageDrawRegion(descriptor, { coverageKind: "compatible" }),
        ],
        frame: 2,
        visibleRegionTargets: [descriptor],
      }),
      previous,
    });

    expect(next.diagnostics.coverageReadiness).toBe("covered");
  });

  it("rejects an initial frame that has no committed visual epoch coverage", () => {
    const descriptor = pageDescriptor();
    const missingRect = { height: 64, width: 64, x: 0, y: 0 };
    expect(() =>
      publishRetainedDisplayFrame({
        prepared: preparedFrame({
          visibleRegionTargets: [descriptor],
          trueHoleRectsCss: [missingRect],
        }),
        previous: null,
      }),
    ).toThrow(/committed visual epoch coverage/);
  });
});

function preparedFrame({
  drawRegions = [],
  frame = 1,
  refinementPageCount,
  nativeDomIslands = [],
  scrollOffsets = new Map(),
  visibleRegionTargets = [],
  trueHoleRectsCss = [],
}: {
  readonly drawRegions?: readonly RetainedDrawRegion<RetainedContentTextureResources>[];
  readonly frame?: number | undefined;
  readonly refinementPageCount?: number | undefined;
  readonly nativeDomIslands?: readonly GpuDomIsland[] | undefined;
  readonly scrollOffsets?: ReadonlyMap<
    string,
    { readonly x: number; readonly y: number }
  >;
  readonly visibleRegionTargets?: readonly RetainedTexturePageDescriptor[];
  readonly trueHoleRectsCss?: readonly GpuRect[];
}) {
  const resolvedRefinementPageCount = resolvePreparedFrameRefinementPageCount({
    drawRegions,
    refinementPageCount,
    trueHoleRectsCss,
  });
  const visibleTargets = visibleRegionTargets.map(
    visibleRegionTargetFromDescriptor,
  );
  const fidelityState = drawRegions.some(
    (region) => region.coverageKind === "compatible",
  )
    ? "compatible-lower-lod"
    : trueHoleRectsCss.length > 0
      ? "refining"
      : "target";
  const pageFrame: RetainedContentTexturePagePreparedFrame = {
    coveragePlan: testCoveragePlan({
      drawRegions,
      trueHoleRectsCss,
      visibleTargets,
    }),
    coverageCandidateCount: 0,
    drawRegions,
    drawQuadCount: drawRegions.length,
    compatibleDrawQuadCount: drawRegions.filter(
      (region) => region.coverageKind === "compatible",
    ).length,
    fidelityState,
    flatSurfaces: [flatVisual(`frame-${frame}`)],
    frame,
    mergedDrawQuadCount: 0,
    refinementPageCount: resolvedRefinementPageCount,
    trueHoleVisuals: [],
    protectedPageKeys: [],
    rejectedStaleRects: [],
    replacementDescriptors: [],
    replacementRequests: [],
    refinementDescriptors: visibleRegionTargets,
    rejectedStaleRectCount: 0,
    trueHoleRectsCss,
    trueHoleRectCount: trueHoleRectsCss.length,
    visibleRegionTargets: visibleTargets,
  };
  return createRetainedDisplayFrameInput({
    pageFrame,
    retainedRuntimeFrame: createGpuRetainedRuntimeFrame({
      devicePixelRatioBucket: 1,
      frameId: frame,
      scene: sceneWithNativeDomIslands(nativeDomIslands),
      scrollOffsets,
      scrollRevision: frame,
      viewport: [0, 0, 1],
      viewportZoomBucket: 1,
    }),
  });
}

function resolvePreparedFrameRefinementPageCount({
  drawRegions,
  refinementPageCount,
  trueHoleRectsCss,
}: {
  readonly drawRegions: readonly RetainedDrawRegion<RetainedContentTextureResources>[];
  readonly refinementPageCount: number | undefined;
  readonly trueHoleRectsCss: readonly GpuRect[];
}): number {
  if (refinementPageCount !== undefined) {
    return refinementPageCount;
  }
  if (trueHoleRectsCss.length > 0) {
    return trueHoleRectsCss.length;
  }
  return drawRegions.length === 0 ? 1 : 0;
}

function sceneWithNativeDomIslands(
  nativeDomIslands: readonly GpuDomIsland[],
): GpuFlowScene | undefined {
  if (nativeDomIslands.length === 0) {
    return undefined;
  }
  return {
    contentSurfaces: [],
    domIslands: nativeDomIslands,
    edges: [],
    revision: 1,
    sections: [],
  };
}

function testCoveragePlan({
  drawRegions,
  trueHoleRectsCss,
  visibleTargets,
}: {
  readonly drawRegions: readonly RetainedDrawRegion<RetainedContentTextureResources>[];
  readonly trueHoleRectsCss: readonly GpuRect[];
  readonly visibleTargets: readonly RetainedVisibleRegionTarget[];
}): RetainedVisibleCoveragePlan<RetainedContentTextureResources> {
  const exactCoveredAreaCssPx = rectSetArea(
    drawRegions
      .filter((region) => region.coverageKind === "exact")
      .map((region) => region.sampleRectCss),
  );
  const compatibleCoveredAreaCssPx = rectSetArea(
    drawRegions
      .filter((region) => region.coverageKind === "compatible")
      .map((region) => region.sampleRectCss),
  );
  const trueHoleAreaCssPx = rectSetArea(trueHoleRectsCss);
  return {
    diagnostics: {
      committedCandidateCount: drawRegions.length,
      compatibleRegionCount: drawRegions.filter(
        (region) => region.coverageKind === "compatible",
      ).length,
      compatibilityDurationMs: 0,
      cost: {
        allocatedDiagnosticRectCount: 0,
        candidateCount: drawRegions.length,
        compatibilityCheckCount: drawRegions.length,
        coverageFragmentCount: drawRegions.length + trueHoleRectsCss.length,
        drawRegionCount: drawRegions.length,
        maxFragmentsPerVisibleTarget: drawRegions.length,
        rejectedSampleCount: 0,
        sliverDiscardedAreaCssPx: 0,
        spatialQueryCount: visibleTargets.length,
        visibleRegionCount: visibleTargets.length,
        visibleRegionGroupCount: visibleTargets.length,
      },
      coverageFragmentCount: drawRegions.length + trueHoleRectsCss.length,
      coveragePlanDurationMs: 0,
      drawRegionCount: drawRegions.length,
      exactRegionCount: drawRegions.filter(
        (region) => region.coverageKind === "exact",
      ).length,
      maxFragmentsPerVisibleTarget: drawRegions.length,
      rejectedCoverageCountByReason: {},
      sampledRejectedCoverage: [],
      spatialQueryDurationMs: 0,
      trueHoleAreaCssPx,
      trueHoleRectCount: trueHoleRectsCss.length,
      visibleRegionCount: visibleTargets.length,
    },
    drawRegions,
    nativeIslandRegions: [],
    proof: {
      compatibleCoveredAreaCssPx,
      exactCoveredAreaCssPx,
      rejectedCoverageCountByReason: {},
      replacementRequestedAreaCssPx: trueHoleAreaCssPx,
      trueHoleAreaCssPx,
      visibleAreaCssPx: rectSetArea(
        visibleTargets.map((target) => target.contentRect),
      ),
    },
    protectedPageKeys: drawRegions.map((region) => region.textureHandle),
    replacementRequests: [],
    trueHoles: trueHoleRectsCss,
    visibleRegionTargets: visibleTargets,
  };
}

function visibleRegionTargetFromDescriptor(
  descriptor: RetainedTexturePageDescriptor,
): RetainedVisibleRegionTarget {
  return {
    ...createRetainedRegionTargetFromDescriptor(descriptor),
    reason: "visible",
    surfaceLayout: {
      height: descriptor.sourceWindowCss.height,
      surfaceId: descriptor.surfaceId,
      textureSourceRect: descriptor.sourceWindowCss,
      width: descriptor.sourceWindowCss.width,
      x: 0,
      y: 0,
    },
  };
}

function nativeIsland(id: string): GpuDomIsland {
  return {
    clipOwnerId: "surface",
    contentRect: { height: 16, width: 32, x: 0, y: 0 },
    id,
    kind: "retained-content-control",
    ownerSectionId: "section",
    rect: { height: 16, width: 32, x: 4, y: 8 },
    source: { kind: "custom" },
    zIndex: 1,
  };
}

function pageDescriptor(
  overrides: Partial<RetainedTexturePageDescriptor> = {},
): RetainedTexturePageDescriptor {
  const lodScale = overrides.lodScale ?? 1;
  return {
    contentVersion: 1,
    devicePixelRatioBucket: 1,
    lodLevel: retainedTexturePageLodLevel(lodScale),
    lodScale,
    pixelHeight: 64,
    pixelWidth: 64,
    scaleKey: retainedTexturePageScaleKey(lodScale),
    sourceKey: "source",
    sourceRectCss: { height: 64, width: 64, x: 0, y: 0 },
    sourceVersion: 1,
    sourceWindowCss: { height: 256, width: 256, x: 0, y: 0 },
    surfaceId: "surface",
    tileColumn: 0,
    tileRow: 0,
    viewportZoomBucket: 1,
    ...overrides,
  };
}

function pageDrawRegion(
  descriptor: RetainedTexturePageDescriptor,
  {
    coverageKind = "exact",
    sampleRectCss = descriptor.sourceRectCss,
  }: {
    readonly coverageKind?: "compatible" | "exact" | undefined;
    readonly sampleRectCss?: GpuRect | undefined;
  } = {},
): RetainedDrawRegion<RetainedContentTextureResources> {
  const page = {
    byteSize: 1,
    committedFrame: 1,
    descriptor,
    key: "page",
    lastUsedFrame: 1,
    resource: {} as RetainedContentTextureResources,
    ...createRetainedCommittedPageLifecycle(descriptor),
  };
  const uvRect = { u0: 0, u1: 1, v0: 0, v1: 1 };
  return {
    clipRect: descriptor.sourceWindowCss,
    coverageKind,
    fidelityState:
      coverageKind === "compatible" ? "compatible-lower-lod" : "target",
    flowRect: sampleRectCss,
    mappingProof: {
      clipRect: page.clipRect,
      contentRect: page.contentRect,
      dpr: page.dprBucket,
      fidelity: page.fidelityMetadata,
      generation: 1,
      ownerManifest: page.manifest,
      sourceRect: sampleRectCss,
      textureRect: {
        height: descriptor.pixelHeight,
        width: descriptor.pixelWidth,
        x: 0,
        y: 0,
      },
      uvRect,
      zoomBucket: descriptor.viewportZoomBucket,
    },
    page,
    renderLayer: "retained-content",
    sampleRectCss,
    textureHandle: page.key,
    uvRect,
    zOrder: 0,
  };
}

function rectSetArea(rects: readonly GpuRect[]): number {
  return rects.reduce((total, rect) => total + rect.width * rect.height, 0);
}

function flatVisual(surfaceId: string): HtmlSurfaceFlatVisual {
  return {
    height: 1,
    kind: "flat",
    surfaceId,
    texture: {} as HtmlSurfaceFlatVisual["texture"],
    textureCoordinates: { u0: 0, u1: 1, v0: 0, v1: 1 },
    width: 1,
    x: 0,
    y: 0,
    zIndex: 0,
  };
}
