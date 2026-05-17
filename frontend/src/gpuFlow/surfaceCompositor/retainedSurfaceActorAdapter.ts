import type { RetainedContentTexturePagePreparedFrame } from "../retainedContentTexturePageManager";
import type { GpuRetainedRuntimeFrame } from "../retainedRuntimeFrame";
import type { RetainedDrawRegion } from "../retainedVisibleCoveragePlanner";
import { normalizeGpuViewport, type GpuRect } from "../viewportMath";
import {
  createSurfaceActor,
  createSurfaceActorSnapshot,
  type SurfaceActorSnapshot,
} from "./surfaceActor";
import {
  createSurfaceCoverageProof,
  type ProtectedSurfaceResourceHandle,
  type SurfaceCompatibilityProof,
  type SurfaceCoverageEntry,
  type SurfaceCoverageProof,
  type SurfaceRejectedCoverageCandidate,
  type SurfaceResourceHandle,
} from "./surfaceCoverage";
import {
  createSurfaceGeneration,
  type SurfaceGeneration,
  type SurfaceRendererBucket,
} from "./surfaceGeneration";
import { createSurfaceWorkRequest } from "./surfaceScheduler";
import type {
  SurfaceDisplayTransaction,
  SurfaceDrawCommand,
} from "./surfaceTransaction";

const RETAINED_RENDERER_BUCKET_ORDER: readonly SurfaceRendererBucket[] =
  Object.freeze([
    "native-underlay",
    "retained-content",
    "retained-overlay",
    "native-control",
  ]);

const RETAINED_COMPATIBILITY_PROOF: SurfaceCompatibilityProof = Object.freeze({
  compatibleForActiveDomIsland: true,
  compatibleForClipChain: true,
  compatibleForHitTesting: true,
  compatibleForMotion: true,
  compatibleForSourceWindow: true,
  compatibleForVisuals: true,
  rejectedCandidates: Object.freeze([]),
});

type RetainedSurfaceTransactionSnapshot = {
  readonly actorSnapshots: readonly SurfaceActorSnapshot[];
  readonly transaction: SurfaceDisplayTransaction;
};

export function createRetainedSurfaceTransactionSnapshot({
  id,
  nowMs,
  pageFrame,
  retainedRuntimeFrame,
}: {
  readonly id: string;
  readonly nowMs: number;
  readonly pageFrame: RetainedContentTexturePagePreparedFrame;
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame;
}): RetainedSurfaceTransactionSnapshot {
  const retainedContentActorSnapshots =
    createRetainedContentActorSnapshots(pageFrame);
  const generationBySurfaceId = new Map(
    retainedContentActorSnapshots.map(({ generation }) => [
      generation.surfaceId,
      generation,
    ]),
  );
  const actorSnapshots = retainedContentActorSnapshots;
  const coverageProof = createRetainedSurfaceCoverageProof({
    actorSnapshots,
    generationBySurfaceId,
    pageFrame,
  });
  return Object.freeze({
    actorSnapshots,
    transaction: Object.freeze({
      activeDomIslandTransaction: Object.freeze({
        islands: Object.freeze([]),
        mode: "none",
      }),
      coverageProof,
      desiredSurfaceGenerations: Object.freeze(
        actorSnapshots.map(({ generation }) => generation),
      ),
      diagnostics: Object.freeze({
        hold: null,
        publishedAtMs: nowMs,
      }),
      drawCommands: createRetainedSurfaceDrawCommands(coverageProof),
      followUpWorkRequests: Object.freeze(
        coverageProof.blockingSurfaceIds.map((surfaceId, index) =>
          createSurfaceWorkRequest({
            generationId:
              coverageProof.blockingGenerationIds[index] ??
              `retained-missing:${surfaceId}`,
            kind: "retained-raster",
            priority: "visible-edge",
            reason: "coverage-missing",
            surfaceId,
          }),
        ),
      ),
      hitIndex: Object.freeze({
        generationIds: Object.freeze(
          actorSnapshots.map(({ generation }) => generation.generationId),
        ),
        id: `retained-hit:${id}`,
      }),
      id,
      motionFrame: Object.freeze({
        activeIslands: Object.freeze([]),
        retainedScrollOffset: firstRetainedScrollOffset(
          retainedRuntimeFrame.input.scrollOffsets,
        ),
        viewport: normalizeGpuViewport(retainedRuntimeFrame.input.viewport),
      }),
      protectedResourceHandles: coverageProof.protectedResourceHandles,
      rendererBuckets: coverageProof.rendererBuckets,
      zOrder: coverageProof.zOrder,
    } satisfies SurfaceDisplayTransaction),
  });
}

export function createRetainedColdPlaceholderSurfaceTransaction({
  id,
  nowMs,
  retainedRuntimeFrame,
}: {
  readonly id: string;
  readonly nowMs: number;
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame;
}): RetainedSurfaceTransactionSnapshot {
  const coverageProof = createSurfaceCoverageProof({
    blockingGenerationIds: [],
    blockingSurfaceIds: [],
    compatibilityProof: RETAINED_COMPATIBILITY_PROOF,
    compatibleCoverage: [],
    exactCoverage: [],
    protectedResourceHandles: [],
    rendererBuckets: [],
    trueHoleRects: [],
    visibleRects: [],
    zOrder: [],
  });
  return Object.freeze({
    actorSnapshots: Object.freeze([]),
    transaction: Object.freeze({
      activeDomIslandTransaction: Object.freeze({
        islands: Object.freeze([]),
        mode: "none",
      }),
      coverageProof,
      desiredSurfaceGenerations: Object.freeze([]),
      diagnostics: Object.freeze({
        hold: null,
        publishedAtMs: nowMs,
      }),
      drawCommands: Object.freeze([]),
      followUpWorkRequests: Object.freeze([]),
      hitIndex: Object.freeze({
        generationIds: Object.freeze([]),
        id: `retained-hit:${id}`,
      }),
      id,
      motionFrame: Object.freeze({
        activeIslands: Object.freeze([]),
        retainedScrollOffset: firstRetainedScrollOffset(
          retainedRuntimeFrame.input.scrollOffsets,
        ),
        viewport: normalizeGpuViewport(retainedRuntimeFrame.input.viewport),
      }),
      protectedResourceHandles: coverageProof.protectedResourceHandles,
      rendererBuckets: coverageProof.rendererBuckets,
      zOrder: coverageProof.zOrder,
    }),
  });
}

function createRetainedContentActorSnapshots(
  pageFrame: RetainedContentTexturePagePreparedFrame,
): readonly SurfaceActorSnapshot[] {
  return Object.freeze(
    Array.from(groupVisibleTargetsBySurfaceId(pageFrame).entries()).map(
      ([surfaceId, targets]) => {
        const generation = createRetainedContentSurfaceGeneration({
          surfaceId,
          targets,
        });
        return createSurfaceActorSnapshot({
          actor: createSurfaceActor({
            currentGenerationId: generation.generationId,
            kind: "retained-parameter-content",
            rendererBucket: "retained-content",
            sourceKey: generation.sourceKey,
            sourcePolicy: "retained-display-list",
            surfaceId,
          }),
          generation,
        });
      },
    ),
  );
}

function createRetainedContentSurfaceGeneration({
  surfaceId,
  targets,
}: {
  readonly surfaceId: string;
  readonly targets: RetainedContentTexturePagePreparedFrame["visibleRegionTargets"];
}): SurfaceGeneration {
  const sourceRects = targets.map((target) => target.contentRect);
  const flowRects = targets.map((target) =>
    retainedContentRectToFlowRect({
      contentRect: target.contentRect,
      surfaceLayout: target.surfaceLayout,
    }),
  );
  const sourceRect = unionRects(sourceRects);
  const flowRect = unionRects(flowRects);
  const clipRect = unionRects(
    targets.map((target) => ({
      height: target.surfaceLayout.height,
      width: target.surfaceLayout.width,
      x: target.surfaceLayout.x,
      y: target.surfaceLayout.y,
    })),
  );
  const sourceKey = uniqueKey(
    targets.map((target) => target.manifest.documentId),
  );
  const contentVersion = uniqueKey(
    targets.map((target) => String(target.manifest.contentVersion)),
  );
  const visualVersion = uniqueKey(
    targets.map((target) =>
      [
        target.manifest.themeGeneration,
        target.manifest.visualEpochKind ?? "base",
      ].join(":"),
    ),
  );
  const generationId = [
    "retained-content",
    surfaceId,
    sourceKey,
    contentVersion,
    visualVersion,
    rectKey(sourceRect),
    rectKey(flowRect),
  ].join("|");
  return createSurfaceGeneration({
    activeDomIsland: null,
    clipRect,
    contentVersion,
    fidelity: "exact",
    flowRect,
    generationId,
    hitIndex: {
      entries: Object.freeze(
        targets.map((target) =>
          Object.freeze({
            id: target.manifest.surfaceId,
            rect: retainedContentRectToFlowRect({
              contentRect: target.contentRect,
              surfaceLayout: target.surfaceLayout,
            }),
            role: "retained-parameter-content",
          }),
        ),
      ),
      generationId,
    },
    paintReadiness: "ready",
    rendererBucket: "retained-content",
    sourceKey,
    sourceWindow: {
      contentToTextureKey: [surfaceId, sourceKey, rectKey(sourceRect)].join(
        "|",
      ),
      sourceRect,
    },
    surfaceId,
    textureReadiness: "ready",
    visualVersion,
    zIndex: Math.max(...targets.map((target) => target.zLayer), 0),
  });
}

function createRetainedSurfaceCoverageProof({
  actorSnapshots,
  generationBySurfaceId,
  pageFrame,
}: {
  readonly actorSnapshots: readonly SurfaceActorSnapshot[];
  readonly generationBySurfaceId: ReadonlyMap<string, SurfaceGeneration>;
  readonly pageFrame: RetainedContentTexturePagePreparedFrame;
}): SurfaceCoverageProof {
  const retainedEntries = pageFrame.drawRegions.map((region) =>
    retainedDrawRegionToCoverageEntry({ generationBySurfaceId, region }),
  );
  const entries = retainedEntries;
  const exactCoverage = entries.filter((entry) => entry.fidelity === "exact");
  const compatibleCoverage = entries.filter(
    (entry) => entry.fidelity === "compatible",
  );
  const retainedTrueHoleRects = createRetainedSurfaceTrueHoleRects(pageFrame);
  const trueHoleRects = Object.freeze([...retainedTrueHoleRects]);
  const retainedBlockingSurfaceIds = createRetainedSurfaceBlockingSurfaceIds({
    pageFrame,
    trueHoleRects: retainedTrueHoleRects,
  });
  const retainedBlockingGenerationIds = retainedBlockingSurfaceIds.map(
    (surfaceId) =>
      generationBySurfaceId.get(surfaceId)?.generationId ??
      `retained-missing:${surfaceId}`,
  );
  const protectedResourceHandles = createRetainedProtectedResourceHandles({
    entries,
    pageFrame,
  });
  const drawCommands = createSortedRetainedDrawCommands(entries);
  return createSurfaceCoverageProof({
    blockingGenerationIds: [...retainedBlockingGenerationIds],
    blockingSurfaceIds: [...retainedBlockingSurfaceIds],
    compatibilityProof: createRetainedCompatibilityProof({
      generationBySurfaceId,
      pageFrame,
    }),
    compatibleCoverage,
    exactCoverage,
    protectedResourceHandles,
    rendererBuckets: createRetainedRendererBuckets({
      actorSnapshots,
      drawCommands,
    }),
    trueHoleRects,
    visibleRects: actorSnapshots
      .filter(({ actor }) => actor.kind === "retained-parameter-content")
      .map(({ generation }) => generation.flowRect),
    zOrder: uniqueOrdered(drawCommands.map((command) => command.surfaceId)),
  });
}

function retainedDrawRegionToCoverageEntry({
  generationBySurfaceId,
  region,
}: {
  readonly generationBySurfaceId: ReadonlyMap<string, SurfaceGeneration>;
  readonly region: RetainedDrawRegion;
}): SurfaceCoverageEntry {
  const surfaceId = region.page.descriptor.surfaceId;
  const generation = generationBySurfaceId.get(surfaceId);
  const handle = retainedPageResourceHandle(region.textureHandle);
  return Object.freeze({
    coverageRect: Object.freeze({ ...region.flowRect }),
    fidelity: region.coverageKind,
    generationId:
      generation?.generationId ??
      [
        "retained-draw-region",
        surfaceId,
        region.textureHandle,
        rectKey(region.sampleRectCss),
      ].join("|"),
    rendererBucket: retainedRenderLayerToBucket(region.renderLayer),
    resourceHandles: Object.freeze([handle]),
    surfaceId,
    zIndex: region.zOrder,
  });
}

function createRetainedCompatibilityProof({
  generationBySurfaceId,
  pageFrame,
}: {
  readonly generationBySurfaceId: ReadonlyMap<string, SurfaceGeneration>;
  readonly pageFrame: RetainedContentTexturePagePreparedFrame;
}): SurfaceCompatibilityProof {
  const rejectedCandidates: SurfaceRejectedCoverageCandidate[] =
    pageFrame.rejectedStaleRects.map((entry, index) => {
      const surfaceId =
        pageFrame.visibleRegionTargets.find((target) =>
          rectsIntersect(target.contentRect, entry.rect),
        )?.manifest.surfaceId ?? `retained-rejected:${index}`;
      return {
        generationId:
          generationBySurfaceId.get(surfaceId)?.generationId ??
          `retained-rejected:${index}`,
        reason: entry.reason,
        surfaceId,
      };
    });
  return Object.freeze({
    ...RETAINED_COMPATIBILITY_PROOF,
    compatibleForVisuals: rejectedCandidates.length === 0,
    rejectedCandidates: Object.freeze(
      rejectedCandidates.map((candidate) => Object.freeze(candidate)),
    ),
  });
}

function createRetainedProtectedResourceHandles({
  entries,
  pageFrame,
}: {
  readonly entries: readonly SurfaceCoverageEntry[];
  readonly pageFrame: RetainedContentTexturePagePreparedFrame;
}): readonly ProtectedSurfaceResourceHandle[] {
  const handles = new Map<
    string,
    SurfaceResourceHandle | ProtectedSurfaceResourceHandle
  >();
  for (const entry of entries) {
    for (const handle of entry.resourceHandles) {
      handles.set(`${handle.kind}:${handle.id}`, handle);
    }
  }
  for (const pageKey of pageFrame.protectedPageKeys) {
    const handle = retainedPageResourceHandle(pageKey);
    handles.set(`${handle.kind}:${handle.id}`, handle);
  }
  return Object.freeze(
    Array.from(handles.values()).map((handle) =>
      Object.freeze({
        ...handle,
        reason:
          "reason" in handle
            ? handle.reason
            : handle.kind === "source"
              ? "interactive-source"
              : handle.kind === "native-dom-island"
                ? "active-dom-island"
                : "published-transaction",
      }),
    ),
  );
}

function createRetainedSurfaceDrawCommands(
  coverageProof: SurfaceCoverageProof,
): readonly SurfaceDrawCommand[] {
  return createSortedRetainedDrawCommands([
    ...coverageProof.exactCoverage,
    ...coverageProof.compatibleCoverage,
  ]);
}

function createSortedRetainedDrawCommands(
  entries: readonly SurfaceCoverageEntry[],
): readonly SurfaceDrawCommand[] {
  return Object.freeze(
    entries
      .map(
        (entry): SurfaceDrawCommand => ({
          coverageRect: entry.coverageRect,
          generationId: entry.generationId,
          rendererBucket: entry.rendererBucket,
          surfaceId: entry.surfaceId,
          zIndex: entry.zIndex,
        }),
      )
      .sort(compareRetainedSurfaceDrawCommands)
      .map((command) =>
        Object.freeze({
          ...command,
          coverageRect: Object.freeze({ ...command.coverageRect }),
        }),
      ),
  );
}

function compareRetainedSurfaceDrawCommands(
  left: SurfaceDrawCommand,
  right: SurfaceDrawCommand,
): number {
  return (
    retainedRendererBucketRank(left.rendererBucket) -
      retainedRendererBucketRank(right.rendererBucket) ||
    left.zIndex - right.zIndex ||
    left.surfaceId.localeCompare(right.surfaceId)
  );
}

function createRetainedRendererBuckets({
  actorSnapshots,
  drawCommands,
}: {
  readonly actorSnapshots: readonly SurfaceActorSnapshot[];
  readonly drawCommands: readonly SurfaceDrawCommand[];
}): readonly SurfaceRendererBucket[] {
  const usedBuckets = new Set<SurfaceRendererBucket>([
    ...actorSnapshots.map(({ generation }) => generation.rendererBucket),
    ...drawCommands.map((command) => command.rendererBucket),
  ]);
  return Object.freeze(
    RETAINED_RENDERER_BUCKET_ORDER.filter((bucket) => usedBuckets.has(bucket)),
  );
}

function createRetainedSurfaceTrueHoleRects(
  pageFrame: RetainedContentTexturePagePreparedFrame,
): readonly GpuRect[] {
  const replacementRects = pageFrame.replacementDescriptors
    .filter(
      ({ replacementRequest }) => replacementRequest.reason === "true-hole",
    )
    .map(({ replacementRequest }) =>
      retainedContentRectToFlowRect({
        contentRect: replacementRequest.target.contentRect,
        surfaceLayout: replacementRequest.target.surfaceLayout,
      }),
    );
  return Object.freeze(
    (replacementRects.length > 0
      ? replacementRects
      : pageFrame.trueHoleRectsCss
    ).map((rect) => Object.freeze({ ...rect })),
  );
}

function createRetainedSurfaceBlockingSurfaceIds({
  pageFrame,
  trueHoleRects,
}: {
  readonly pageFrame: RetainedContentTexturePagePreparedFrame;
  readonly trueHoleRects: readonly GpuRect[];
}): readonly string[] {
  if (trueHoleRects.length === 0) {
    return Object.freeze([]);
  }
  const descriptorSurfaceIds = pageFrame.replacementDescriptors
    .filter(
      ({ replacementRequest }) => replacementRequest.reason === "true-hole",
    )
    .map(({ descriptor }) => descriptor.surfaceId);
  return Object.freeze(
    uniqueOrdered(
      descriptorSurfaceIds.length > 0
        ? descriptorSurfaceIds
        : pageFrame.visibleRegionTargets.map(
            (target) => target.manifest.surfaceId,
          ),
    ),
  );
}

function retainedContentRectToFlowRect({
  contentRect,
  surfaceLayout,
}: {
  readonly contentRect: GpuRect;
  readonly surfaceLayout: RetainedContentTexturePagePreparedFrame["visibleRegionTargets"][number]["surfaceLayout"];
}): GpuRect {
  const scaleX = surfaceLayout.width / surfaceLayout.textureSourceRect.width;
  const scaleY = surfaceLayout.height / surfaceLayout.textureSourceRect.height;
  return {
    height: contentRect.height * scaleY,
    width: contentRect.width * scaleX,
    x:
      surfaceLayout.x +
      (contentRect.x - surfaceLayout.textureSourceRect.x) * scaleX,
    y:
      surfaceLayout.y +
      (contentRect.y - surfaceLayout.textureSourceRect.y) * scaleY,
  };
}

function groupVisibleTargetsBySurfaceId(
  pageFrame: RetainedContentTexturePagePreparedFrame,
): ReadonlyMap<
  string,
  RetainedContentTexturePagePreparedFrame["visibleRegionTargets"]
> {
  const targetsBySurfaceId = new Map<
    string,
    RetainedContentTexturePagePreparedFrame["visibleRegionTargets"][number][]
  >();
  for (const target of pageFrame.visibleRegionTargets) {
    const targets = targetsBySurfaceId.get(target.manifest.surfaceId) ?? [];
    targets.push(target);
    targetsBySurfaceId.set(target.manifest.surfaceId, targets);
  }
  return targetsBySurfaceId;
}

function retainedRenderLayerToBucket(
  renderLayer: RetainedDrawRegion["renderLayer"],
): SurfaceRendererBucket {
  if (renderLayer === "native-underlay") {
    return "native-underlay";
  }
  if (renderLayer === "retained-overlay") {
    return "retained-overlay";
  }
  return "retained-content";
}

function retainedRendererBucketRank(bucket: SurfaceRendererBucket): number {
  const rank = RETAINED_RENDERER_BUCKET_ORDER.indexOf(bucket);
  return rank === -1 ? RETAINED_RENDERER_BUCKET_ORDER.length : rank;
}

function retainedPageResourceHandle(pageKey: string): SurfaceResourceHandle {
  return { id: pageKey, kind: "page" };
}

function firstRetainedScrollOffset(
  scrollOffsets: GpuRetainedRuntimeFrame["input"]["scrollOffsets"],
): number | null {
  const firstOffset = scrollOffsets.values().next().value as
    | { readonly y: number }
    | undefined;
  return firstOffset?.y ?? null;
}

function rectsIntersect(left: GpuRect, right: GpuRect): boolean {
  return (
    left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y
  );
}

function unionRects(rects: readonly GpuRect[]): GpuRect {
  if (rects.length === 0) {
    return { height: 0, width: 0, x: 0, y: 0 };
  }
  const minX = Math.min(...rects.map((rect) => rect.x));
  const minY = Math.min(...rects.map((rect) => rect.y));
  const maxX = Math.max(...rects.map((rect) => rect.x + rect.width));
  const maxY = Math.max(...rects.map((rect) => rect.y + rect.height));
  return {
    height: maxY - minY,
    width: maxX - minX,
    x: minX,
    y: minY,
  };
}

function rectKey(rect: GpuRect): string {
  return `${rect.x},${rect.y},${rect.width},${rect.height}`;
}

function uniqueKey(values: readonly string[]): string {
  return uniqueOrdered(values).join("+");
}

function uniqueOrdered<T>(values: readonly T[]): readonly T[] {
  return Object.freeze([...new Set(values)]);
}
