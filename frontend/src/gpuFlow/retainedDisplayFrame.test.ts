import { describe, expect, it } from "vitest";

import type { HtmlSurfaceFlatVisual } from "./htmlSurfaces/visualScene";
import { createRetainedCommittedPageLifecycle } from "./retainedContentLifecycle";
import type { RetainedContentTexturePagePreparedFrame } from "./retainedContentTexturePageManager";
import type { RetainedContentTextureResources } from "./retainedContentTextureResources";
import {
  createRetainedDisplayFrameInput,
  publishRetainedDisplayFrame,
} from "./retainedDisplayFrame";
import { createGpuRetainedRuntimeFrame } from "./retainedRuntimeFrame";
import type { RetainedTexturePageDrawQuad } from "./retainedTexturePageGrid";
import {
  retainedTexturePageLodLevel,
  retainedTexturePageScaleKey,
  type RetainedTexturePageDescriptor,
} from "./retainedTexturePages";
import type { GpuDomIsland, GpuFlowScene } from "./scene";
import type { GpuRect } from "./viewportMath";

describe("retained display frame publisher", () => {
  it("publishes prepared frames with complete visible coverage", () => {
    const descriptor = pageDescriptor();
    const drawQuad = pageDrawQuad(descriptor);
    const frame = publishRetainedDisplayFrame({
      prepared: preparedFrame({
        drawQuads: [drawQuad],
        targetDescriptors: [descriptor],
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

  it("publishes current motion with true-hole proof when compatible coverage is missing", () => {
    const descriptor = pageDescriptor();
    const previous = publishRetainedDisplayFrame({
      prepared: preparedFrame({
        drawQuads: [pageDrawQuad(descriptor)],
        frame: 1,
        targetDescriptors: [descriptor],
      }),
      previous: null,
    });
    const missingRect = { height: 32, width: 32, x: 16, y: 16 };
    const next = publishRetainedDisplayFrame({
      prepared: preparedFrame({
        drawQuads: [
          pageDrawQuad(descriptor, {
            coverageKind: "compatible",
            sampleRectCss: { height: 16, width: 64, x: 0, y: 0 },
          }),
        ],
        frame: 2,
        targetDescriptors: [descriptor],
        trueHoleRectsCss: [missingRect],
      }),
      previous,
    });

    expect(next.id).toBe(2);
    expect(next.retainedRuntimeFrame.input.scrollRevision).toBe(2);
    expect(next.pageFrame).not.toBe(previous.pageFrame);
    expect(next.coverageProof.trueHoleRects).toEqual([missingRect]);
    expect(next.coverageProof.rejectedPreparedFrameIds).toEqual([]);
    expect(next.diagnostics.coverageReadiness).toBe("true-holes");
    expect(next.diagnostics.lastRejectedPreparedFrameId).toBe(null);
    expect(next.diagnostics.trueHoleRectCount).toBe(1);
  });

  it("records motion continuity while publishing true-hole scroll frames", () => {
    const descriptor = pageDescriptor();
    const previous = publishRetainedDisplayFrame({
      nowMs: 10,
      prepared: preparedFrame({
        drawQuads: [pageDrawQuad(descriptor)],
        frame: 1,
        scrollOffsets: new Map([["surface", { x: 0, y: 0 }]]),
        targetDescriptors: [descriptor],
      }),
      previous: null,
    });
    const missingRect = { height: 32, width: 32, x: 16, y: 16 };
    const firstPending = publishRetainedDisplayFrame({
      nowMs: 20,
      prepared: preparedFrame({
        drawQuads: [
          pageDrawQuad(descriptor, {
            coverageKind: "compatible",
            sampleRectCss: { height: 16, width: 64, x: 0, y: 0 },
          }),
        ],
        frame: 2,
        scrollOffsets: new Map([["surface", { x: 0, y: 24 }]]),
        targetDescriptors: [descriptor],
        trueHoleRectsCss: [missingRect],
      }),
      previous,
    });
    const secondPending = publishRetainedDisplayFrame({
      nowMs: 36,
      prepared: preparedFrame({
        drawQuads: [
          pageDrawQuad(descriptor, {
            coverageKind: "compatible",
            sampleRectCss: { height: 16, width: 64, x: 0, y: 0 },
          }),
        ],
        frame: 3,
        scrollOffsets: new Map([["surface", { x: 0, y: 24 }]]),
        targetDescriptors: [descriptor],
        trueHoleRectsCss: [missingRect],
      }),
      previous: firstPending,
    });

    expect(firstPending.diagnostics.continuityProof).toMatchObject({
      maxConsecutiveTrueHoleFrames: 1,
      trueHoleAreaCssPx: 1024,
      trueHoleAreaRatio: 0.25,
      reason: "normal-visible-edge",
    });
    expect(secondPending.diagnostics.continuityProof).toMatchObject({
      maxConsecutiveTrueHoleFrames: 2,
      trueHoleAreaCssPx: 1024,
      reason: "normal-visible-edge",
    });
  });

  it("keeps an active native island published while detach waits for passive coverage", () => {
    const descriptor = pageDescriptor();
    const previous = publishRetainedDisplayFrame({
      prepared: preparedFrame({
        drawQuads: [pageDrawQuad(descriptor)],
        frame: 1,
        nativeDomIslands: [nativeIsland("island-a")],
        targetDescriptors: [descriptor],
      }),
      previous: null,
    });
    const next = publishRetainedDisplayFrame({
      prepared: preparedFrame({
        drawQuads: [
          pageDrawQuad(descriptor, {
            coverageKind: "compatible",
            sampleRectCss: { height: 16, width: 64, x: 0, y: 0 },
          }),
        ],
        frame: 2,
        nativeDomIslands: [],
        targetDescriptors: [descriptor],
        trueHoleRectsCss: [{ height: 12, width: 12, x: 0, y: 0 }],
      }),
      previous,
    });

    expect(previous.diagnostics.activeIslandTransaction.mode).toBe("attach");
    expect(next.activeIslandRects.map((island) => island.id)).toEqual([
      "island-a",
    ]);
    expect(next.diagnostics.activeIslandTransaction).toMatchObject({
      mode: "blocked-commit-detach",
      stalePassiveRevealBlocked: true,
    });
  });

  it("records compatible coverage without treating it as true-hole coverage", () => {
    const descriptor = pageDescriptor();
    const frame = publishRetainedDisplayFrame({
      prepared: preparedFrame({
        drawQuads: [pageDrawQuad(descriptor, { coverageKind: "compatible" })],
        refinementPageCount: 1,
        targetDescriptors: [descriptor],
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
        drawQuads: [pageDrawQuad(descriptor)],
        frame: 1,
        targetDescriptors: [descriptor],
      }),
      previous: null,
    });
    const next = publishRetainedDisplayFrame({
      prepared: preparedFrame({
        drawQuads: [pageDrawQuad(descriptor, { coverageKind: "compatible" })],
        frame: 2,
        targetDescriptors: [descriptor],
      }),
      previous,
    });

    expect(next.diagnostics.coverageReadiness).toBe("covered");
  });

  it("allows only the initial frame to publish an explicit loading state", () => {
    const descriptor = pageDescriptor();
    const missingRect = { height: 64, width: 64, x: 0, y: 0 };
    const frame = publishRetainedDisplayFrame({
      prepared: preparedFrame({
        targetDescriptors: [descriptor],
        trueHoleRectsCss: [missingRect],
      }),
      previous: null,
    });

    expect(frame.coverageProof.trueHoleRects).toEqual([missingRect]);
    expect(frame.diagnostics.coverageReadiness).toBe("initial-loading");
  });
});

function preparedFrame({
  drawQuads = [],
  frame = 1,
  refinementPageCount,
  nativeDomIslands = [],
  scrollOffsets = new Map(),
  targetDescriptors = [],
  trueHoleRectsCss = [],
}: {
  readonly drawQuads?: readonly RetainedTexturePageDrawQuad<RetainedContentTextureResources>[];
  readonly frame?: number | undefined;
  readonly refinementPageCount?: number | undefined;
  readonly nativeDomIslands?: readonly GpuDomIsland[] | undefined;
  readonly scrollOffsets?: ReadonlyMap<
    string,
    { readonly x: number; readonly y: number }
  >;
  readonly targetDescriptors?: readonly RetainedTexturePageDescriptor[];
  readonly trueHoleRectsCss?: readonly GpuRect[];
}) {
  const resolvedRefinementPageCount = resolvePreparedFrameRefinementPageCount({
    drawQuads,
    refinementPageCount,
    trueHoleRectsCss,
  });
  const pageFrame: RetainedContentTexturePagePreparedFrame = {
    coverageCandidateCount: 0,
    drawQuadCount: drawQuads.length,
    drawQuads,
    compatibleDrawQuadCount: drawQuads.filter(
      (quad) => quad.coverageKind === "compatible",
    ).length,
    fidelityState: drawQuads.some((quad) => quad.coverageKind === "compatible")
      ? "compatible-lower-lod"
      : trueHoleRectsCss.length > 0
        ? "refining"
        : "target",
    flatSurfaces: [flatVisual(`frame-${frame}`)],
    frame,
    mergedDrawQuadCount: 0,
    refinementPageCount: resolvedRefinementPageCount,
    trueHoleVisuals: [],
    protectedPageKeys: [],
    rejectedStaleRects: [],
    refinementDescriptors: targetDescriptors,
    rejectedStaleRectCount: 0,
    targetDescriptors,
    trueHoleRectsCss,
    trueHoleRectCount: trueHoleRectsCss.length,
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
  drawQuads,
  refinementPageCount,
  trueHoleRectsCss,
}: {
  readonly drawQuads: readonly RetainedTexturePageDrawQuad<RetainedContentTextureResources>[];
  readonly refinementPageCount: number | undefined;
  readonly trueHoleRectsCss: readonly GpuRect[];
}): number {
  if (refinementPageCount !== undefined) {
    return refinementPageCount;
  }
  if (trueHoleRectsCss.length > 0) {
    return trueHoleRectsCss.length;
  }
  return drawQuads.length === 0 ? 1 : 0;
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

function pageDrawQuad(
  descriptor: RetainedTexturePageDescriptor,
  {
    coverageKind = "exact",
    sampleRectCss = descriptor.sourceRectCss,
  }: {
    readonly coverageKind?: "compatible" | "exact" | undefined;
    readonly sampleRectCss?: GpuRect | undefined;
  } = {},
): RetainedTexturePageDrawQuad<RetainedContentTextureResources> {
  return {
    coverageKind,
    desiredDescriptor: descriptor,
    fidelityState:
      coverageKind === "compatible" ? "compatible-lower-lod" : "target",
    page: {
      byteSize: 1,
      committedFrame: 1,
      descriptor,
      key: "page",
      lastUsedFrame: 1,
      resource: {} as RetainedContentTextureResources,
      ...createRetainedCommittedPageLifecycle(descriptor),
    },
    sampleRectCss,
    staleContent: false,
  };
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
