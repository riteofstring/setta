import type { HtmlSurfaceFlatVisual } from "./htmlSurfaces/visualScene";
import type { RetainedContentTexturePagePreparedFrame } from "./retainedContentTexturePageManager";
import type { RetainedContentTextureResources } from "./retainedContentTextureResources";
import {
  createPublishedNativeIslandRects,
  resolveNativeIslandPublicationTransaction,
  type NativeIslandPublicationTransaction,
  type PublishedNativeIslandRect,
} from "./retainedNativeIslandTransactions";
import type { GpuRetainedRuntimeFrame } from "./retainedRuntimeFrame";
import type { RetainedTextureBudget } from "./retainedTextureBudget";
import type { RetainedTexturePageDrawQuad } from "./retainedTexturePageGrid";
import type { RetainedTexturePageDescriptor } from "./retainedTexturePages";
import type { GpuRect } from "./viewportMath";

export type {
  NativeIslandPublicationTransaction,
  PublishedNativeIslandRect,
  RetainedTextureBudget,
};

export type RetainedFrameId = number;
export type RetainedSourceId = string;
export type RetainedSourceRevision = number;
export type RetainedPageId = string;
export type RetainedScaleBucket = number;

export type CoverageReadiness =
  | "complete"
  | "missing-visible-coverage"
  | "explicit-loading-state";

export type TextureReadiness = "ready" | "fallback" | "missing";

export type ScrollPublicationMode =
  | "transform-only-within-covered-window"
  | "publish-covered-scroll-frame"
  | "hold-previous-frame-with-scroll-lag"
  | "explicit-loading-state";

export type RetainedFallbackCompatibility =
  | "exact"
  | "same-scroll-origin-lod-fallback";

export type DesiredRetainedFrame = {
  readonly id: RetainedFrameId;
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame;
};

export type PreparedRetainedFrame = DesiredRetainedFrame & {
  readonly pageFrame: RetainedContentTexturePagePreparedFrame;
};

export type PublishedRetainedPage =
  RetainedTexturePageDrawQuad<RetainedContentTextureResources>;

export type PublishedRetainedFallbackPage = PublishedRetainedPage & {
  readonly fallback: true;
};

export type PublishedRetainedHitIndex = {
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame;
};

export type VisibleCoverageProof = {
  readonly coveredRects: readonly GpuRect[];
  readonly fallbackRects: readonly GpuRect[];
  readonly missingRects: readonly GpuRect[];
  readonly rejectedPreparedFrameIds: readonly RetainedFrameId[];
  readonly visibleRects: readonly GpuRect[];
};

export type PublishedRetainedScrollLagDiagnostics = {
  readonly heldFrameCount: number;
  readonly heldWithoutVisiblePreparationProgressFrameCount: number;
  readonly lagCssPx: number;
  readonly lagCssPxPerMs: number;
  readonly lagDurationMs: number;
  readonly lagStartedAtMs: number | null;
  readonly publishedScrollRevision: number;
  readonly visiblePreparationProgressCount: number;
  readonly visiblePreparationProgressSignature: string;
};

export type PublishedFrameDiagnostics = {
  readonly activeIslandTransaction: NativeIslandPublicationTransaction;
  readonly coverageReadiness: CoverageReadiness;
  readonly desiredScrollRevision: number;
  readonly fallbackPageCount: number;
  readonly lastRejectedPreparedFrameId: RetainedFrameId | null;
  readonly missingPageCount: number;
  readonly publishedPreparedFrameId: RetainedFrameId;
  readonly rejectedFrameCount: number;
  readonly scrollLag: PublishedRetainedScrollLagDiagnostics;
  readonly scrollPublicationMode: ScrollPublicationMode;
  readonly textureReadiness: TextureReadiness;
  readonly uncoveredRectCount: number;
};

export type PublishedRetainedFrame = {
  readonly activeIslandRects: readonly PublishedNativeIslandRect[];
  readonly coverageProof: VisibleCoverageProof;
  readonly diagnostics: PublishedFrameDiagnostics;
  readonly fallbackPages: readonly PublishedRetainedFallbackPage[];
  readonly flatSurfaces: readonly HtmlSurfaceFlatVisual[];
  readonly hitIndex: PublishedRetainedHitIndex;
  readonly id: RetainedFrameId;
  readonly pageFrame: RetainedContentTexturePagePreparedFrame;
  readonly pages: readonly PublishedRetainedPage[];
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame;
};

export type RetainedFrameTransaction = {
  readonly nowMs?: number | undefined;
  readonly prepared: PreparedRetainedFrame;
  readonly previous: PublishedRetainedFrame | null;
};

const MAX_REJECTED_PREPARED_FRAME_IDS = 32;

export function createPreparedRetainedFrame({
  pageFrame,
  retainedRuntimeFrame,
}: {
  readonly pageFrame: RetainedContentTexturePagePreparedFrame;
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame;
}): PreparedRetainedFrame {
  return Object.freeze({
    id: retainedRuntimeFrame.frameId,
    pageFrame,
    retainedRuntimeFrame,
  });
}

export function publishRetainedDisplayFrame({
  nowMs = 0,
  prepared,
  previous,
}: RetainedFrameTransaction): PublishedRetainedFrame {
  const proof = createVisibleCoverageProof({
    prepared,
    rejectedPreparedFrameIds: previous?.coverageProof.rejectedPreparedFrameIds,
  });
  if (proof.missingRects.length === 0) {
    return createPublishedRetainedFrame({
      coverageReadiness: "complete",
      diagnosticsPrevious: previous,
      prepared,
      proof,
      scrollPublicationMode: resolveCoveredScrollPublicationMode({
        prepared,
        previous,
      }),
      textureReadiness:
        prepared.pageFrame.fallbackDrawQuadCount > 0 ? "fallback" : "ready",
    });
  }
  if (!previous) {
    return createPublishedRetainedFrame({
      coverageReadiness: "explicit-loading-state",
      diagnosticsPrevious: null,
      prepared,
      proof,
      scrollPublicationMode: "explicit-loading-state",
      textureReadiness: "missing",
    });
  }
  return retainPreviousPublishedFrame({
    nowMs,
    prepared,
    previous,
  });
}

function createPublishedRetainedFrame({
  coverageReadiness,
  diagnosticsPrevious,
  prepared,
  proof,
  scrollPublicationMode,
  textureReadiness,
}: {
  readonly coverageReadiness: CoverageReadiness;
  readonly diagnosticsPrevious: PublishedRetainedFrame | null;
  readonly prepared: PreparedRetainedFrame;
  readonly proof: VisibleCoverageProof;
  readonly scrollPublicationMode: ScrollPublicationMode;
  readonly textureReadiness: TextureReadiness;
}): PublishedRetainedFrame {
  const fallbackPages = prepared.pageFrame.drawQuads.filter(
    (page): page is PublishedRetainedFallbackPage => page.fallback,
  );
  const activeIslandRects = createPublishedNativeIslandRects(
    prepared.retainedRuntimeFrame,
  );
  const activeIslandTransaction = resolveNativeIslandPublicationTransaction({
    blockedByCoverage: false,
    desiredIslandIds: prepared.retainedRuntimeFrame.input.activeNativeIslandIds,
    previousIslandIds: getPublishedNativeIslandIds(diagnosticsPrevious),
    publishedIslandIds: activeIslandRects.map((island) => island.id),
  });
  return Object.freeze({
    activeIslandRects,
    coverageProof: proof,
    diagnostics: Object.freeze({
      activeIslandTransaction,
      coverageReadiness,
      desiredScrollRevision: prepared.retainedRuntimeFrame.input.scrollRevision,
      fallbackPageCount: fallbackPages.length,
      lastRejectedPreparedFrameId: null,
      missingPageCount: prepared.pageFrame.missingPageCount,
      publishedPreparedFrameId: prepared.id,
      rejectedFrameCount:
        diagnosticsPrevious?.diagnostics.rejectedFrameCount ?? 0,
      scrollLag: createCoveredScrollLagDiagnostics({
        prepared,
      }),
      scrollPublicationMode,
      textureReadiness,
      uncoveredRectCount: prepared.pageFrame.uncoveredRectCount,
    }),
    fallbackPages: Object.freeze(fallbackPages),
    flatSurfaces: prepared.pageFrame.flatSurfaces,
    hitIndex: Object.freeze({
      retainedRuntimeFrame: prepared.retainedRuntimeFrame,
    }),
    id: prepared.id,
    pageFrame: prepared.pageFrame,
    pages: prepared.pageFrame.drawQuads,
    retainedRuntimeFrame: prepared.retainedRuntimeFrame,
  });
}

function retainPreviousPublishedFrame({
  nowMs,
  prepared,
  previous,
}: {
  readonly nowMs: number;
  readonly prepared: PreparedRetainedFrame;
  readonly previous: PublishedRetainedFrame;
}): PublishedRetainedFrame {
  const rejectedPreparedFrameIds = appendRejectedPreparedFrameId({
    frameId: prepared.id,
    previousIds: previous.coverageProof.rejectedPreparedFrameIds,
  });
  const activeIslandTransaction = resolveNativeIslandPublicationTransaction({
    blockedByCoverage: true,
    desiredIslandIds: prepared.retainedRuntimeFrame.input.activeNativeIslandIds,
    previousIslandIds: previous.activeIslandRects.map((island) => island.id),
    publishedIslandIds: previous.activeIslandRects.map((island) => island.id),
  });
  return Object.freeze({
    ...previous,
    coverageProof: Object.freeze({
      ...previous.coverageProof,
      rejectedPreparedFrameIds,
    }),
    diagnostics: Object.freeze({
      ...previous.diagnostics,
      activeIslandTransaction,
      coverageReadiness: "missing-visible-coverage",
      desiredScrollRevision: prepared.retainedRuntimeFrame.input.scrollRevision,
      lastRejectedPreparedFrameId: prepared.id,
      rejectedFrameCount: previous.diagnostics.rejectedFrameCount + 1,
      scrollLag: createHeldScrollLagDiagnostics({
        nowMs,
        prepared,
        previous,
      }),
      scrollPublicationMode: "hold-previous-frame-with-scroll-lag",
      textureReadiness: "missing",
    }),
  });
}

function createCoveredScrollLagDiagnostics({
  prepared,
}: {
  readonly prepared: PreparedRetainedFrame;
}): PublishedRetainedScrollLagDiagnostics {
  return Object.freeze({
    heldFrameCount: 0,
    heldWithoutVisiblePreparationProgressFrameCount: 0,
    lagCssPx: 0,
    lagCssPxPerMs: 0,
    lagDurationMs: 0,
    lagStartedAtMs: null,
    publishedScrollRevision: prepared.retainedRuntimeFrame.input.scrollRevision,
    visiblePreparationProgressCount: 0,
    visiblePreparationProgressSignature:
      createVisiblePreparationProgressSignature(prepared),
  });
}

function createHeldScrollLagDiagnostics({
  nowMs,
  prepared,
  previous,
}: {
  readonly nowMs: number;
  readonly prepared: PreparedRetainedFrame;
  readonly previous: PublishedRetainedFrame;
}): PublishedRetainedScrollLagDiagnostics {
  const lagCssPx = getMaxScrollLagCssPx({
    desired: prepared.retainedRuntimeFrame.input.scrollOffsets,
    published: previous.retainedRuntimeFrame.input.scrollOffsets,
  });
  if (lagCssPx <= 0) {
    return createCoveredScrollLagDiagnostics({
      prepared,
    });
  }
  const previousLag = previous.diagnostics.scrollLag;
  const lagStartedAtMs = previousLag.lagStartedAtMs ?? nowMs;
  const lagDurationMs = Math.max(0, nowMs - lagStartedAtMs);
  const visiblePreparationProgressSignature =
    createVisiblePreparationProgressSignature(prepared);
  const visiblePreparationProgressChanged =
    previousLag.heldFrameCount === 0 ||
    previousLag.visiblePreparationProgressSignature !==
      visiblePreparationProgressSignature;
  const visiblePreparationProgressCount =
    previousLag.visiblePreparationProgressCount +
    (visiblePreparationProgressChanged ? 1 : 0);
  return Object.freeze({
    heldFrameCount: previousLag.heldFrameCount + 1,
    heldWithoutVisiblePreparationProgressFrameCount:
      visiblePreparationProgressChanged
        ? 0
        : previousLag.heldWithoutVisiblePreparationProgressFrameCount + 1,
    lagCssPx,
    lagCssPxPerMs: lagDurationMs > 0 ? lagCssPx / lagDurationMs : 0,
    lagDurationMs,
    lagStartedAtMs,
    publishedScrollRevision: previous.retainedRuntimeFrame.input.scrollRevision,
    visiblePreparationProgressCount,
    visiblePreparationProgressSignature,
  });
}

function getMaxScrollLagCssPx({
  desired,
  published,
}: {
  readonly desired: ReadonlyMap<
    string,
    { readonly x: number; readonly y: number }
  >;
  readonly published: ReadonlyMap<
    string,
    { readonly x: number; readonly y: number }
  >;
}): number {
  const surfaceIds = new Set([...desired.keys(), ...published.keys()]);
  let maxLag = 0;
  for (const surfaceId of surfaceIds) {
    const desiredOffset = desired.get(surfaceId) ?? { x: 0, y: 0 };
    const publishedOffset = published.get(surfaceId) ?? { x: 0, y: 0 };
    maxLag = Math.max(
      maxLag,
      Math.hypot(
        desiredOffset.x - publishedOffset.x,
        desiredOffset.y - publishedOffset.y,
      ),
    );
  }
  return maxLag;
}

function createVisiblePreparationProgressSignature(
  prepared: PreparedRetainedFrame,
): string {
  return [
    prepared.pageFrame.drawQuadCount,
    prepared.pageFrame.fallbackDrawQuadCount,
    prepared.pageFrame.missingPageCount,
    prepared.pageFrame.uncoveredRectCount,
    prepared.pageFrame.refinementDescriptors.length,
    prepared.pageFrame.coverageCandidateCount,
  ].join(":");
}

function getPublishedNativeIslandIds(
  frame: PublishedRetainedFrame | null,
): readonly string[] {
  return frame?.activeIslandRects.map((island) => island.id) ?? [];
}

function createVisibleCoverageProof({
  prepared,
  rejectedPreparedFrameIds = [],
}: {
  readonly prepared: PreparedRetainedFrame;
  readonly rejectedPreparedFrameIds?: readonly RetainedFrameId[] | undefined;
}): VisibleCoverageProof {
  return Object.freeze({
    coveredRects: freezeRects(
      prepared.pageFrame.drawQuads.map((quad) => quad.sampleRectCss),
    ),
    fallbackRects: freezeRects(
      prepared.pageFrame.drawQuads
        .filter((quad) => quad.fallback)
        .map((quad) => quad.sampleRectCss),
    ),
    missingRects: freezeRects(prepared.pageFrame.uncoveredRectsCss),
    rejectedPreparedFrameIds: Object.freeze([...rejectedPreparedFrameIds]),
    visibleRects: freezeRects(
      prepared.pageFrame.targetDescriptors.map(
        (descriptor: RetainedTexturePageDescriptor) => descriptor.sourceRectCss,
      ),
    ),
  });
}

function resolveCoveredScrollPublicationMode({
  prepared,
  previous,
}: {
  readonly prepared: PreparedRetainedFrame;
  readonly previous: PublishedRetainedFrame | null;
}): ScrollPublicationMode {
  if (
    previous &&
    previous.retainedRuntimeFrame.input.scrollRevision !==
      prepared.retainedRuntimeFrame.input.scrollRevision
  ) {
    if (
      prepared.pageFrame.drawQuadCount > 0 &&
      prepared.pageFrame.drawQuadCount ===
        prepared.pageFrame.fallbackDrawQuadCount
    ) {
      return "transform-only-within-covered-window";
    }
    return "publish-covered-scroll-frame";
  }
  return "publish-covered-scroll-frame";
}

function appendRejectedPreparedFrameId({
  frameId,
  previousIds,
}: {
  readonly frameId: RetainedFrameId;
  readonly previousIds: readonly RetainedFrameId[];
}): readonly RetainedFrameId[] {
  return Object.freeze(
    [...previousIds, frameId].slice(-MAX_REJECTED_PREPARED_FRAME_IDS),
  );
}

function freezeRects(rects: readonly GpuRect[]): readonly GpuRect[] {
  return Object.freeze(rects.map((rect) => Object.freeze({ ...rect })));
}
