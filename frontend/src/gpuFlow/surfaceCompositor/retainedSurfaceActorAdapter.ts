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
  type SurfaceActiveDomIslandGeneration,
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
  const domControlActorSnapshots = createRetainedDomControlActorSnapshots({
    generationBySurfaceId,
    pageFrame,
    retainedRuntimeFrame,
  });
  const activeIslandSnapshot = createRetainedActiveIslandSnapshot({
    generationBySurfaceId,
    retainedRuntimeFrame,
  });
  const actorSnapshots = Object.freeze([
    ...retainedContentActorSnapshots,
    ...domControlActorSnapshots,
    ...activeIslandSnapshot.actorSnapshots,
  ]);
  const coverageProof = createRetainedSurfaceCoverageProof({
    actorSnapshots,
    generationBySurfaceId,
    pageFrame,
  });
  return Object.freeze({
    actorSnapshots,
    transaction: Object.freeze({
      activeDomIslandTransaction: Object.freeze({
        islands: activeIslandSnapshot.activeIslands,
        mode: activeIslandSnapshot.activeIslands.length > 0 ? "attach" : "none",
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
        activeIslands: activeIslandSnapshot.activeIslands,
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

function createRetainedDomControlActorSnapshots({
  generationBySurfaceId,
  pageFrame,
  retainedRuntimeFrame,
}: {
  readonly generationBySurfaceId: ReadonlyMap<string, SurfaceGeneration>;
  readonly pageFrame: RetainedContentTexturePagePreparedFrame;
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame;
}): readonly SurfaceActorSnapshot[] {
  const targetsBySurfaceId = groupVisibleTargetsBySurfaceId(pageFrame);
  const snapshots: SurfaceActorSnapshot[] = [];
  for (const source of retainedRuntimeFrame.descriptors.domControlSources) {
    const target = targetsBySurfaceId
      .get(source.surfaceId)
      ?.find((candidate) =>
        rectsIntersect(candidate.contentRect, source.textureRectCssPx),
      );
    if (!target) {
      continue;
    }
    const flowRect = retainedContentRectToFlowRect({
      contentRect: source.textureRectCssPx,
      surfaceLayout: target.surfaceLayout,
    });
    const ownerGeneration = generationBySurfaceId.get(source.surfaceId);
    const generationId = [
      "retained-dom-control",
      source.sourceId,
      source.sourceKey,
      source.lifecycleState,
      rectKey(source.textureRectCssPx),
      ownerGeneration?.generationId ?? "owner:none",
    ].join("|");
    const surfaceId = `retained-dom-control:${source.sourceId}`;
    const rendererBucket: SurfaceRendererBucket = source.active
      ? "native-control"
      : "retained-content";
    const generation = createSurfaceGeneration({
      activeDomIsland: null,
      clipRect: flowRect,
      contentVersion: source.sourceKey,
      fidelity: "exact",
      flowRect,
      generationId,
      hitIndex: {
        entries: Object.freeze([
          Object.freeze({
            id: source.sourceId,
            rect: flowRect,
            role: source.active
              ? "retained-active-dom-control"
              : "retained-passive-dom-control",
          }),
        ]),
        generationId,
      },
      paintReadiness: "ready",
      rendererBucket,
      sourceKey: source.sourceKey,
      sourceWindow: {
        contentToTextureKey: [
          source.sourceKey,
          rectKey(source.textureRectCssPx),
        ].join("|"),
        sourceRect: source.textureRectCssPx,
      },
      surfaceId,
      textureReadiness: "ready",
      visualVersion: source.sourceKey,
      zIndex: target.zLayer,
    });
    snapshots.push(
      createSurfaceActorSnapshot({
        actor: createSurfaceActor({
          currentGenerationId: generation.generationId,
          kind: source.active
            ? "retained-active-dom-control"
            : "retained-passive-dom-control",
          rendererBucket,
          sourceKey: generation.sourceKey,
          sourcePolicy: "layoutsubtree-dom",
          surfaceId,
        }),
        generation,
      }),
    );
  }
  return Object.freeze(snapshots);
}

function createRetainedActiveIslandSnapshot({
  generationBySurfaceId,
  retainedRuntimeFrame,
}: {
  readonly generationBySurfaceId: ReadonlyMap<string, SurfaceGeneration>;
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame;
}): {
  readonly activeIslands: readonly SurfaceActiveDomIslandGeneration[];
  readonly actorSnapshots: readonly SurfaceActorSnapshot[];
} {
  const activeIslands: SurfaceActiveDomIslandGeneration[] = [];
  const actorSnapshots: SurfaceActorSnapshot[] = [];
  for (const island of retainedRuntimeFrame.descriptors.nativeDomIslands) {
    const ownerGeneration = generationBySurfaceId.get(island.clipOwnerId);
    if (ownerGeneration) {
      activeIslands.push(
        createRetainedActiveIslandGeneration({
          generationId: ownerGeneration.generationId,
          ownerSurfaceId: ownerGeneration.surfaceId,
          rect: island.rect,
          islandId: island.id,
        }),
      );
      continue;
    }
    const surfaceId = `active-dom-island:${island.id}`;
    const generationId = [
      "active-dom-island",
      island.id,
      island.clipOwnerId,
      rectKey(island.rect),
    ].join("|");
    const activeIsland = createRetainedActiveIslandGeneration({
      generationId,
      islandId: island.id,
      ownerSurfaceId: surfaceId,
      rect: island.rect,
    });
    const generation = createSurfaceGeneration({
      activeDomIsland: activeIsland,
      clipRect: island.rect,
      contentVersion: island.id,
      fidelity: "exact",
      flowRect: island.rect,
      generationId,
      hitIndex: {
        entries: Object.freeze([
          Object.freeze({
            id: island.id,
            rect: island.rect,
            role: "active-dom-island",
          }),
        ]),
        generationId,
      },
      paintReadiness: "ready",
      rendererBucket: "native-control",
      sourceKey: island.id,
      sourceWindow: {
        contentToTextureKey: [island.id, rectKey(island.rect)].join("|"),
        sourceRect: island.rect,
      },
      surfaceId,
      textureReadiness: "ready",
      visualVersion: island.id,
      zIndex: island.zIndex,
    });
    actorSnapshots.push(
      createSurfaceActorSnapshot({
        actor: createSurfaceActor({
          currentGenerationId: generationId,
          kind: "active-dom-island",
          rendererBucket: "native-control",
          sourceKey: generation.sourceKey,
          sourcePolicy: "layoutsubtree-dom",
          surfaceId,
        }),
        generation,
      }),
    );
    activeIslands.push(activeIsland);
  }
  return {
    activeIslands: Object.freeze(activeIslands),
    actorSnapshots: Object.freeze(actorSnapshots),
  };
}

function createRetainedActiveIslandGeneration({
  generationId,
  islandId,
  ownerSurfaceId,
  rect,
}: {
  readonly generationId: string;
  readonly islandId: string;
  readonly ownerSurfaceId: string;
  readonly rect: GpuRect;
}): SurfaceActiveDomIslandGeneration {
  return Object.freeze({
    focusIdentity: islandId,
    generationId,
    islandId,
    ownerSurfaceId,
    rect: Object.freeze({ ...rect }),
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
  const entries = pageFrame.drawRegions.map((region) =>
    retainedDrawRegionToCoverageEntry({ generationBySurfaceId, region }),
  );
  const exactCoverage = entries.filter((entry) => entry.fidelity === "exact");
  const compatibleCoverage = entries.filter(
    (entry) => entry.fidelity === "compatible",
  );
  const trueHoleRects = createRetainedSurfaceTrueHoleRects(pageFrame);
  const blockingSurfaceIds = createRetainedSurfaceBlockingSurfaceIds({
    pageFrame,
    trueHoleRects,
  });
  const blockingGenerationIds = blockingSurfaceIds.map(
    (surfaceId) =>
      generationBySurfaceId.get(surfaceId)?.generationId ??
      `retained-missing:${surfaceId}`,
  );
  const protectedResourceHandles = createRetainedProtectedResourceHandles({
    actorSnapshots,
    entries,
    pageFrame,
  });
  const drawCommands = createSortedRetainedDrawCommands(entries);
  return createSurfaceCoverageProof({
    blockingGenerationIds,
    blockingSurfaceIds,
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
  actorSnapshots,
  entries,
  pageFrame,
}: {
  readonly actorSnapshots: readonly SurfaceActorSnapshot[];
  readonly entries: readonly SurfaceCoverageEntry[];
  readonly pageFrame: RetainedContentTexturePagePreparedFrame;
}): readonly ProtectedSurfaceResourceHandle[] {
  const handles = new Map<string, SurfaceResourceHandle>();
  for (const entry of entries) {
    for (const handle of entry.resourceHandles) {
      handles.set(`${handle.kind}:${handle.id}`, handle);
    }
  }
  for (const pageKey of pageFrame.protectedPageKeys) {
    const handle = retainedPageResourceHandle(pageKey);
    handles.set(`${handle.kind}:${handle.id}`, handle);
  }
  for (const { actor, generation } of actorSnapshots) {
    if (
      actor.kind !== "retained-passive-dom-control" &&
      actor.kind !== "retained-active-dom-control" &&
      actor.kind !== "active-dom-island"
    ) {
      continue;
    }
    const handle: SurfaceResourceHandle =
      actor.kind === "active-dom-island"
        ? { id: generation.sourceKey, kind: "native-dom-island" }
        : { id: generation.sourceKey, kind: "source" };
    handles.set(`${handle.kind}:${handle.id}`, handle);
  }
  return Object.freeze(
    Array.from(handles.values()).map((handle) =>
      Object.freeze({
        ...handle,
        reason:
          handle.kind === "source"
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
