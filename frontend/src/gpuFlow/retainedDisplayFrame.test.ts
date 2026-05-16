import { describe, expect, it } from "vitest";

import type { HtmlSurfaceFlatVisual } from "./htmlSurfaces/visualScene";
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

  it("publishes current motion with pending strips when prepared coverage is missing", () => {
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
            fallback: true,
            sampleRectCss: { height: 16, width: 64, x: 0, y: 0 },
          }),
        ],
        frame: 2,
        targetDescriptors: [descriptor],
        uncoveredRectsCss: [missingRect],
      }),
      previous,
    });

    expect(next.id).toBe(2);
    expect(next.retainedRuntimeFrame.input.scrollRevision).toBe(2);
    expect(next.pageFrame).not.toBe(previous.pageFrame);
    expect(next.coverageProof.missingRects).toEqual([missingRect]);
    expect(next.coverageProof.pendingStrips).toEqual([
      { reason: "normal-edge-strip", rect: missingRect },
    ]);
    expect(next.coverageProof.rejectedPreparedFrameIds).toEqual([]);
    expect(next.diagnostics.coverageReadiness).toBe("pending-visible-strips");
    expect(next.diagnostics.lastRejectedPreparedFrameId).toBe(null);
    expect(next.diagnostics.scrollPublicationMode).toBe(
      "publish-motion-frame-with-pending-strips",
    );
  });

  it("records motion continuity while publishing pending scroll frames", () => {
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
            fallback: true,
            sampleRectCss: { height: 16, width: 64, x: 0, y: 0 },
          }),
        ],
        frame: 2,
        scrollOffsets: new Map([["surface", { x: 0, y: 24 }]]),
        targetDescriptors: [descriptor],
        uncoveredRectsCss: [missingRect],
      }),
      previous,
    });
    const secondPending = publishRetainedDisplayFrame({
      nowMs: 36,
      prepared: preparedFrame({
        drawQuads: [
          pageDrawQuad(descriptor, {
            fallback: true,
            sampleRectCss: { height: 16, width: 64, x: 0, y: 0 },
          }),
        ],
        frame: 3,
        scrollOffsets: new Map([["surface", { x: 0, y: 24 }]]),
        targetDescriptors: [descriptor],
        uncoveredRectsCss: [missingRect],
      }),
      previous: firstPending,
    });

    expect(firstPending.diagnostics.continuityProof).toMatchObject({
      maxConsecutivePendingFrames: 1,
      pendingAreaCssPx: 1024,
      pendingAreaRatio: 0.25,
      reason: "normal-edge-strip",
    });
    expect(secondPending.diagnostics.continuityProof).toMatchObject({
      maxConsecutivePendingFrames: 2,
      pendingAreaCssPx: 1024,
      reason: "normal-edge-strip",
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
            fallback: true,
            sampleRectCss: { height: 16, width: 64, x: 0, y: 0 },
          }),
        ],
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

  it("marks covered scroll frames as published motion frames", () => {
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

    expect(next.diagnostics.scrollPublicationMode).toBe("publish-motion-frame");
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
      "publish-initial-loading-state",
    );
  });
});

function preparedFrame({
  drawQuads = [],
  frame = 1,
  missingPageCount,
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
  const resolvedMissingPageCount = resolvePreparedFrameMissingPageCount({
    drawQuads,
    missingPageCount,
    uncoveredRectsCss,
  });
  const pageFrame: RetainedContentTexturePagePreparedFrame = {
    coverageCandidateCount: 0,
    drawQuadCount: drawQuads.length,
    drawQuads,
    fallbackDrawQuadCount: drawQuads.filter((quad) => quad.fallback).length,
    flatSurfaces: [flatVisual(`frame-${frame}`)],
    frame,
    mergedDrawQuadCount: 0,
    missingPageCount: resolvedMissingPageCount,
    pendingStripVisuals: [],
    protectedPageKeys: [],
    refinementDescriptors: targetDescriptors,
    staleFallbackDrawQuadCount: 0,
    targetDescriptors,
    uncoveredRectsCss,
    uncoveredRectCount: uncoveredRectsCss.length,
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

function resolvePreparedFrameMissingPageCount({
  drawQuads,
  missingPageCount,
  uncoveredRectsCss,
}: {
  readonly drawQuads: readonly RetainedTexturePageDrawQuad<RetainedContentTextureResources>[];
  readonly missingPageCount: number | undefined;
  readonly uncoveredRectsCss: readonly GpuRect[];
}): number {
  if (missingPageCount !== undefined) {
    return missingPageCount;
  }
  if (uncoveredRectsCss.length > 0) {
    return uncoveredRectsCss.length;
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
    fallback = false,
    sampleRectCss = descriptor.sourceRectCss,
  }: {
    readonly fallback?: boolean | undefined;
    readonly sampleRectCss?: GpuRect | undefined;
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
