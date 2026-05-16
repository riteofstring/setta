import { describe, expect, it } from "vitest";

import type { HtmlSurfaceFlatVisual } from "./htmlSurfaces/visualScene";
import type { RetainedContentTexturePagePreparedFrame } from "./retainedContentTexturePageManager";
import type { RetainedContentTextureResources } from "./retainedContentTextureResources";
import {
  createPreparedRetainedFrame,
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

    expect(frame.coverageProof.missingRects).toEqual([]);
    expect(frame.coverageProof.visibleRects).toEqual([
      descriptor.sourceRectCss,
    ]);
    expect(frame.coverageProof.coveredRects).toEqual([
      descriptor.sourceRectCss,
    ]);
    expect(frame.diagnostics.coverageReadiness).toBe("complete");
    expect(frame.diagnostics.textureReadiness).toBe("ready");
    expect(frame.pageFrame.flatSurfaces).toEqual([
      expect.objectContaining({ surfaceId: "frame-1" }),
    ]);
  });

  it("keeps the previous published frame when prepared coverage is missing", () => {
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
        frame: 2,
        targetDescriptors: [descriptor],
        uncoveredRectsCss: [missingRect],
      }),
      previous,
    });

    expect(next.id).toBe(previous.id);
    expect(next.retainedRuntimeFrame).toBe(previous.retainedRuntimeFrame);
    expect(next.pageFrame).toBe(previous.pageFrame);
    expect(next.coverageProof.missingRects).toEqual([]);
    expect(next.coverageProof.rejectedPreparedFrameIds).toEqual([2]);
    expect(next.diagnostics.coverageReadiness).toBe("missing-visible-coverage");
    expect(next.diagnostics.lastRejectedPreparedFrameId).toBe(2);
    expect(next.diagnostics.scrollPublicationMode).toBe(
      "hold-previous-frame-with-scroll-lag",
    );
  });

  it("reports held scroll lag and repeated held frames without visible preparation progress", () => {
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
    const firstHeld = publishRetainedDisplayFrame({
      nowMs: 20,
      prepared: preparedFrame({
        frame: 2,
        scrollOffsets: new Map([["surface", { x: 0, y: 24 }]]),
        targetDescriptors: [descriptor],
        uncoveredRectsCss: [missingRect],
      }),
      previous,
    });
    const secondHeld = publishRetainedDisplayFrame({
      nowMs: 36,
      prepared: preparedFrame({
        frame: 3,
        scrollOffsets: new Map([["surface", { x: 0, y: 24 }]]),
        targetDescriptors: [descriptor],
        uncoveredRectsCss: [missingRect],
      }),
      previous: firstHeld,
    });

    expect(firstHeld.diagnostics.scrollLag).toMatchObject({
      heldFrameCount: 1,
      heldWithoutVisiblePreparationProgressFrameCount: 0,
      lagCssPx: 24,
      lagDurationMs: 0,
      publishedScrollRevision: 1,
      visiblePreparationProgressCount: 1,
    });
    expect(secondHeld.diagnostics.scrollLag).toMatchObject({
      heldFrameCount: 2,
      heldWithoutVisiblePreparationProgressFrameCount: 1,
      lagCssPx: 24,
      lagDurationMs: 16,
      publishedScrollRevision: 1,
      visiblePreparationProgressCount: 1,
    });
    expect(secondHeld.diagnostics.scrollLag.lagCssPxPerMs).toBe(1.5);
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
        frame: 2,
        nativeDomIslands: [],
        targetDescriptors: [descriptor],
        uncoveredRectsCss: [{ height: 12, width: 12, x: 0, y: 0 }],
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

  it("records fallback coverage without treating it as missing coverage", () => {
    const descriptor = pageDescriptor();
    const frame = publishRetainedDisplayFrame({
      prepared: preparedFrame({
        drawQuads: [pageDrawQuad(descriptor, { fallback: true })],
        missingPageCount: 1,
        targetDescriptors: [descriptor],
      }),
      previous: null,
    });

    expect(frame.coverageProof.missingRects).toEqual([]);
    expect(frame.coverageProof.fallbackRects).toEqual([
      descriptor.sourceRectCss,
    ]);
    expect(frame.diagnostics.fallbackPageCount).toBe(1);
    expect(frame.diagnostics.textureReadiness).toBe("fallback");
  });

  it("marks covered scroll frames that draw only fallback pages as transform-only", () => {
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
        drawQuads: [pageDrawQuad(descriptor, { fallback: true })],
        frame: 2,
        targetDescriptors: [descriptor],
      }),
      previous,
    });

    expect(next.diagnostics.scrollPublicationMode).toBe(
      "transform-only-within-covered-window",
    );
  });

  it("allows only the initial frame to publish an explicit loading state", () => {
    const descriptor = pageDescriptor();
    const missingRect = { height: 64, width: 64, x: 0, y: 0 };
    const frame = publishRetainedDisplayFrame({
      prepared: preparedFrame({
        targetDescriptors: [descriptor],
        uncoveredRectsCss: [missingRect],
      }),
      previous: null,
    });

    expect(frame.coverageProof.missingRects).toEqual([missingRect]);
    expect(frame.diagnostics.coverageReadiness).toBe("explicit-loading-state");
    expect(frame.diagnostics.scrollPublicationMode).toBe(
      "explicit-loading-state",
    );
  });
});

function preparedFrame({
  drawQuads = [],
  frame = 1,
  missingPageCount = drawQuads.length === 0 ? 1 : 0,
  nativeDomIslands = [],
  scrollOffsets = new Map(),
  targetDescriptors = [],
  uncoveredRectsCss = [],
}: {
  readonly drawQuads?: readonly RetainedTexturePageDrawQuad<RetainedContentTextureResources>[];
  readonly frame?: number | undefined;
  readonly missingPageCount?: number | undefined;
  readonly nativeDomIslands?: readonly GpuDomIsland[] | undefined;
  readonly scrollOffsets?: ReadonlyMap<
    string,
    { readonly x: number; readonly y: number }
  >;
  readonly targetDescriptors?: readonly RetainedTexturePageDescriptor[];
  readonly uncoveredRectsCss?: readonly GpuRect[];
}) {
  const pageFrame: RetainedContentTexturePagePreparedFrame = {
    coverageCandidateCount: 0,
    drawQuadCount: drawQuads.length,
    drawQuads,
    fallbackDrawQuadCount: drawQuads.filter((quad) => quad.fallback).length,
    flatSurfaces: [flatVisual(`frame-${frame}`)],
    frame,
    mergedDrawQuadCount: 0,
    missingPageCount,
    protectedPageKeys: [],
    refinementDescriptors: targetDescriptors,
    staleFallbackDrawQuadCount: 0,
    targetDescriptors,
    uncoveredRectsCss,
    uncoveredRectCount: uncoveredRectsCss.length,
  };
  return createPreparedRetainedFrame({
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
    fallback = false,
  }: {
    readonly fallback?: boolean | undefined;
  } = {},
): RetainedTexturePageDrawQuad<RetainedContentTextureResources> {
  return {
    desiredDescriptor: descriptor,
    fallback,
    page: {
      byteSize: 1,
      committedFrame: 1,
      descriptor,
      key: "page",
      lastUsedFrame: 1,
      resource: {} as RetainedContentTextureResources,
    },
    sampleRectCss: descriptor.sourceRectCss,
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
