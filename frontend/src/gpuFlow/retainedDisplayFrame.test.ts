import { TEST_GPU_RETAINED_SINGLE_LINE_TEXT_POLICY } from "testUtils/gpuRetainedTextLikePolicy";
import { describe, expect, it } from "vitest";

import type { HtmlSurfaceFlatVisual } from "./htmlSurfaces/visualScene";
import {
  createRetainedCommittedPageLifecycle,
  createRetainedRegionTargetFromDescriptor,
} from "./retainedContentLifecycle";
import { createGpuRetainedRowContentScene } from "./retainedContentScene";
import type { RetainedContentTexturePagePreparedFrame } from "./retainedContentTexturePageManager";
import type { RetainedContentTextureResources } from "./retainedContentTextureResources";
import {
  createRetainedDisplayFrameInput,
  publishRetainedDisplayFrame,
  resolveRetainedDisplayFrameTransaction,
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
    expect(
      frame.surfaceActorSnapshots.map(({ actor }) => actor.kind),
    ).toContain("retained-parameter-content");
    expect(frame.surfaceTransaction.coverageProof.exactCoverage).toHaveLength(
      1,
    );
    expect(
      frame.surfaceTransaction.coverageProof.protectedResourceHandles,
    ).toEqual([
      expect.objectContaining({
        id: "page",
        kind: "page",
        reason: "published-transaction",
      }),
    ]);
  });

  it("holds previous visuals when current motion coverage is missing", () => {
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
    const outcome = resolveRetainedDisplayFrameTransaction({
      nowMs: 20,
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
    });

    expect(outcome.kind).toBe("hold-previous");
    expect(outcome.kind === "hold-previous" ? outcome.frame.id : null).toBe(
      previous.id,
    );
    expect(
      outcome.kind === "hold-previous"
        ? outcome.frame.diagnostics.coverageReadiness
        : null,
    ).toBe("held-previous");
    expect(
      outcome.kind === "hold-previous"
        ? outcome.frame.surfaceTransaction.id
        : null,
    ).toBe(previous.surfaceTransaction.id);
    expect(
      outcome.kind === "hold-previous"
        ? outcome.diagnostics.blockingSurfaceIds
        : [],
    ).toEqual(["surface"]);
  });

  it("holds scroll frames that would expose true-hole coverage", () => {
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
    const outcome = resolveRetainedDisplayFrameTransaction({
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
    });

    expect(outcome.kind).toBe("hold-previous");
    expect(
      outcome.kind === "hold-previous"
        ? outcome.diagnostics.desiredScrollOffset
        : null,
    ).toBe(24);
    expect(
      outcome.kind === "hold-previous"
        ? outcome.diagnostics.publishedScrollOffset
        : null,
    ).toBe(0);
  });

  it("holds native-island detach frames that would expose passive true holes", () => {
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
    const outcome = resolveRetainedDisplayFrameTransaction({
      nowMs: 20,
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
    });

    expect(outcome.kind).toBe("hold-previous");
    expect(
      outcome.kind === "hold-previous"
        ? outcome.frame.activeIslandRects.map((island) => island.id)
        : [],
    ).toEqual(["island-a"]);
    expect(
      outcome.kind === "hold-previous"
        ? outcome.frame.diagnostics.activeIslandTransaction.mode
        : null,
    ).toBe("attach");
  });

  it("publishRetainedDisplayFrame returns the held frame for missing covered motion", () => {
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
    const frame = publishRetainedDisplayFrame({
      nowMs: 20,
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
    });
    expect(frame.id).toBe(previous.id);
    expect(frame.diagnostics.coverageReadiness).toBe("held-previous");
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
    const outcome = resolveRetainedDisplayFrameTransaction({
      prepared: preparedFrame({
        visibleRegionTargets: [descriptor],
        trueHoleRectsCss: [missingRect],
      }),
      previous: null,
    });

    expect(outcome.kind).toBe("block-cold-first-coverage");
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

  it("blocks first publication when visible browser text actors have no representation coverage", () => {
    const outcome = resolveRetainedDisplayFrameTransaction({
      prepared: preparedFrame({
        scene: sceneWithTextRows(100),
        viewportSize: { height: 3000, width: 400 },
      }),
      previous: null,
    });

    expect(outcome.kind).toBe("block-cold-first-coverage");
  });

  it("holds previous coverage when visible browser text actor coverage is blocked", () => {
    const previous = publishRetainedDisplayFrame({
      prepared: preparedFrame({
        frame: 1,
        scene: sceneWithTextRows(12),
        viewportSize: { height: 360, width: 400 },
      }),
      previous: null,
    });
    const outcome = resolveRetainedDisplayFrameTransaction({
      nowMs: 20,
      prepared: preparedFrame({
        frame: 2,
        scene: sceneWithTextRows(100),
        viewportSize: { height: 3000, width: 400 },
      }),
      previous,
    });

    expect(outcome.kind).toBe("hold-previous");
    expect(
      outcome.kind === "hold-previous"
        ? outcome.diagnostics.blockingSurfaceIds.some((surfaceId) =>
            surfaceId.startsWith("dom-control:"),
          )
        : false,
    ).toBe(true);
  });
});

function preparedFrame({
  drawRegions = [],
  frame = 1,
  refinementPageCount,
  nativeDomIslands = [],
  scene,
  scrollOffsets = new Map(),
  visibleRegionTargets = [],
  viewportSize,
  trueHoleRectsCss = [],
}: {
  readonly drawRegions?: readonly RetainedDrawRegion<RetainedContentTextureResources>[];
  readonly frame?: number | undefined;
  readonly refinementPageCount?: number | undefined;
  readonly nativeDomIslands?: readonly GpuDomIsland[] | undefined;
  readonly scene?: GpuFlowScene | undefined;
  readonly scrollOffsets?: ReadonlyMap<
    string,
    { readonly x: number; readonly y: number }
  >;
  readonly visibleRegionTargets?: readonly RetainedTexturePageDescriptor[];
  readonly viewportSize?:
    | { readonly height: number; readonly width: number }
    | undefined;
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
  const fidelityState = resolvePreparedFrameFidelityState({
    drawRegions,
    trueHoleRectsCss,
  });
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
    visualEpochs: [],
  };
  return createRetainedDisplayFrameInput({
    pageFrame,
    retainedRuntimeFrame: createGpuRetainedRuntimeFrame({
      devicePixelRatioBucket: 1,
      frameId: frame,
      scene: scene ?? sceneWithNativeDomIslands(nativeDomIslands),
      scrollOffsets,
      scrollRevision: frame,
      viewport: [0, 0, 1],
      viewportSize,
      viewportZoomBucket: 1,
    }),
  });
}

function resolvePreparedFrameFidelityState({
  drawRegions,
  trueHoleRectsCss,
}: {
  readonly drawRegions: readonly RetainedDrawRegion<RetainedContentTextureResources>[];
  readonly trueHoleRectsCss: readonly GpuRect[];
}): RetainedContentTexturePagePreparedFrame["fidelityState"] {
  if (drawRegions.some((region) => region.coverageKind === "compatible")) {
    return "compatible-lower-lod";
  }
  return trueHoleRectsCss.length > 0 ? "refining" : "target";
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

function sceneWithTextRows(rowCount: number): GpuFlowScene {
  const rect = { height: rowCount * 28, width: 360, x: 0, y: 0 };
  return {
    contentSurfaces: [
      {
        clipRect: rect,
        id: "surface",
        ownerSectionId: "section",
        rect,
        renderer: {
          kind: "canvas-content",
          surfaceId: "surface",
        },
        retainedScene: createGpuRetainedRowContentScene({
          id: "surface",
          ownerSectionId: "section",
          rowHeight: 28,
          rows: Array.from({ length: rowCount }, (_, index) => ({
            control: {
              commitPolicy: "native-island",
              defaultDisplayValue: "",
              displayValue: `value-${index}`,
              editorKind: "text" as const,
              kind: "text-like" as const,
              policy: TEST_GPU_RETAINED_SINGLE_LINE_TEXT_POLICY,
              rendererFamily: "text-like",
              renderOwner: "dom-owned" as const,
            },
            controlKind: "text-like" as const,
            depth: 0,
            id: `param-${index}`,
            label: `Param ${index}`,
          })),
          scrollOffset: { x: 0, y: 0 },
          viewportRect: rect,
        }),
        zIndex: 0,
      },
    ],
    domIslands: [],
    edges: [],
    revision: 1,
    sections: [],
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
