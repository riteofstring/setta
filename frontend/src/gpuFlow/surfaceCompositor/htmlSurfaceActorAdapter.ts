import type { GpuRect } from "../viewportMath";
import {
  createSurfaceActor,
  type SurfaceActor,
  type SurfaceActorKind,
  type SurfaceSourcePolicy,
} from "./surfaceActor";
import {
  createSurfaceCoverageProof,
  type SurfaceCompatibilityProof,
  type SurfaceCoverageEntry,
  type SurfaceCoverageProof,
  type SurfaceResourceHandle,
} from "./surfaceCoverage";
import {
  createSurfaceGeneration,
  type SurfaceGeneration,
  type SurfaceRendererBucket,
} from "./surfaceGeneration";

export type HtmlSurfaceActorLayout = {
  readonly actorKind?: SurfaceActorKind | undefined;
  readonly height: number;
  readonly rendererBucket: SurfaceRendererBucket;
  readonly sourceKey?: string | undefined;
  readonly sourcePolicy: SurfaceSourcePolicy;
  readonly surfaceId: string;
  readonly textureContentKey?: string | undefined;
  readonly textureCssHeight?: number | undefined;
  readonly textureCssWidth?: number | undefined;
  readonly textureSourceRect?: GpuRect | undefined;
  readonly width: number;
  readonly x: number;
  readonly y: number;
  readonly zIndex: number;
};

export type HtmlSurfaceActorSnapshot = {
  readonly actor: SurfaceActor;
  readonly generation: SurfaceGeneration;
};

export type HtmlSurfaceCompositorTextureSnapshot = {
  readonly lastUploadFrame: number;
  readonly surfaceId: string;
  readonly textureContentKey?: string | undefined;
  readonly textureSourceRect?: GpuRect | undefined;
};

export type HtmlSurfaceActorCoverageSnapshot = {
  readonly actorSnapshots: readonly HtmlSurfaceActorSnapshot[];
  readonly coverageProof: SurfaceCoverageProof;
};

const HTML_SURFACE_COMPATIBILITY_PROOF: SurfaceCompatibilityProof =
  Object.freeze({
    compatibleForActiveDomIsland: true,
    compatibleForClipChain: true,
    compatibleForHitTesting: true,
    compatibleForMotion: true,
    compatibleForSourceWindow: true,
    compatibleForVisuals: true,
    rejectedCandidates: Object.freeze([]),
  });

export function createHtmlSurfaceActorCoverageSnapshot({
  actorKind,
  layouts,
  textureBySurfaceId,
}: {
  readonly actorKind: SurfaceActorKind;
  readonly layouts: readonly HtmlSurfaceActorLayout[];
  readonly textureBySurfaceId: ReadonlyMap<
    string,
    HtmlSurfaceCompositorTextureSnapshot
  >;
}): HtmlSurfaceActorCoverageSnapshot {
  const actorSnapshots = layouts.map((layout) =>
    createHtmlSurfaceActorSnapshot({
      actorKind: layout.actorKind ?? actorKind,
      layout,
    }),
  );
  return Object.freeze({
    actorSnapshots: Object.freeze(actorSnapshots),
    coverageProof: createHtmlSurfaceActorCoverageProof({
      actorSnapshots,
      textureBySurfaceId,
    }),
  });
}

export function createHtmlSurfaceActorSnapshot({
  actorKind,
  layout,
}: {
  readonly actorKind: SurfaceActorKind;
  readonly layout: HtmlSurfaceActorLayout;
}): HtmlSurfaceActorSnapshot {
  const generation = createHtmlSurfaceGeneration(layout);
  return Object.freeze({
    actor: createSurfaceActor({
      currentGenerationId: generation.generationId,
      kind: actorKind,
      rendererBucket: layout.rendererBucket,
      sourceKey: generation.sourceKey,
      sourcePolicy: layout.sourcePolicy,
      surfaceId: layout.surfaceId,
    }),
    generation,
  });
}

function createHtmlSurfaceGeneration(
  layout: HtmlSurfaceActorLayout,
): SurfaceGeneration {
  const flowRect = rectFromLayout(layout);
  const sourceRect =
    layout.textureSourceRect ??
    ({
      height: layout.textureCssHeight ?? layout.height,
      width: layout.textureCssWidth ?? layout.width,
      x: 0,
      y: 0,
    } satisfies GpuRect);
  const sourceKey =
    layout.sourceKey ?? layout.textureContentKey ?? layout.surfaceId;
  const generationId = [
    layout.surfaceId,
    sourceKey,
    layout.rendererBucket,
    layout.zIndex,
    rectKey(flowRect),
    rectKey(sourceRect),
  ].join("|");
  return createSurfaceGeneration({
    activeDomIsland: null,
    clipRect: flowRect,
    contentVersion: sourceKey,
    fidelity: "exact",
    flowRect,
    generationId,
    hitIndex: {
      entries: Object.freeze([
        {
          id: layout.surfaceId,
          rect: flowRect,
          role: layout.sourcePolicy,
        },
      ]),
      generationId,
    },
    paintReadiness: "ready",
    rendererBucket: layout.rendererBucket,
    sourceKey,
    sourceWindow: {
      contentToTextureKey: [
        layout.textureContentKey ?? sourceKey,
        rectKey(sourceRect),
      ].join("|"),
      sourceRect,
    },
    surfaceId: layout.surfaceId,
    textureReadiness: "pending",
    visualVersion: layout.textureContentKey ?? sourceKey,
    zIndex: layout.zIndex,
  });
}

function createHtmlSurfaceActorCoverageProof({
  actorSnapshots,
  textureBySurfaceId,
}: {
  readonly actorSnapshots: readonly HtmlSurfaceActorSnapshot[];
  readonly textureBySurfaceId: ReadonlyMap<
    string,
    HtmlSurfaceCompositorTextureSnapshot
  >;
}): SurfaceCoverageProof {
  const exactCoverage: SurfaceCoverageEntry[] = [];
  const trueHoleRects: GpuRect[] = [];
  const blockingSurfaceIds: string[] = [];
  const blockingGenerationIds: string[] = [];
  const protectedResourceHandles: SurfaceResourceHandle[] = [];
  for (const { generation } of actorSnapshots) {
    const texture = textureBySurfaceId.get(generation.surfaceId);
    if (!texture || texture.lastUploadFrame < 0) {
      trueHoleRects.push(generation.flowRect);
      blockingSurfaceIds.push(generation.surfaceId);
      blockingGenerationIds.push(generation.generationId);
      continue;
    }
    const handle = {
      id: htmlSurfaceTextureResourceId(texture),
      kind: "texture" as const,
    };
    protectedResourceHandles.push(handle);
    exactCoverage.push({
      coverageRect: generation.flowRect,
      fidelity: "exact",
      generationId: generation.generationId,
      rendererBucket: generation.rendererBucket,
      resourceHandles: Object.freeze([handle]),
      surfaceId: generation.surfaceId,
      zIndex: generation.zIndex,
    });
  }
  return createSurfaceCoverageProof({
    blockingGenerationIds,
    blockingSurfaceIds,
    compatibilityProof: HTML_SURFACE_COMPATIBILITY_PROOF,
    compatibleCoverage: [],
    exactCoverage,
    protectedResourceHandles: protectedResourceHandles.map((handle) => ({
      ...handle,
      reason: "published-transaction",
    })),
    rendererBuckets: uniqueOrdered(
      actorSnapshots.map(({ generation }) => generation.rendererBucket),
    ),
    trueHoleRects,
    visibleRects: actorSnapshots.map(({ generation }) => generation.flowRect),
    zOrder: actorSnapshots.map(({ generation }) => generation.surfaceId),
  });
}

function htmlSurfaceTextureResourceId(
  texture: HtmlSurfaceCompositorTextureSnapshot,
): string {
  return [
    "html-surface-texture",
    texture.surfaceId,
    texture.textureContentKey ?? "content:none",
    texture.textureSourceRect
      ? rectKey(texture.textureSourceRect)
      : "rect:full",
    texture.lastUploadFrame,
  ].join(":");
}

function rectFromLayout(layout: HtmlSurfaceActorLayout): GpuRect {
  return {
    height: layout.height,
    width: layout.width,
    x: layout.x,
    y: layout.y,
  };
}

function rectKey(rect: GpuRect): string {
  return `${rect.x},${rect.y},${rect.width},${rect.height}`;
}

function uniqueOrdered<T>(values: readonly T[]): readonly T[] {
  return Object.freeze([...new Set(values)]);
}
