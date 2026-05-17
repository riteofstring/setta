import type { GpuRect } from "../viewportMath";

export type SurfaceId = string;
export type SurfaceGenerationId = string;
export type SurfaceSourceKey = string;
export type SurfaceContentVersion = number | string;
export type SurfaceVisualVersion = number | string;

export type SurfaceReadiness = "missing" | "pending" | "ready";

export type SurfaceFidelity =
  | "exact"
  | "compatible"
  | "compatible-lower-lod"
  | "compatible-previous-generation"
  | "placeholder";

export type SurfaceRendererBucket =
  | "native-underlay"
  | "dom-section"
  | "retained-content"
  | "retained-overlay"
  | "edge-label"
  | "selection-overlay"
  | "drag-overlay"
  | "native-control";

export type SurfaceSourceWindow = {
  readonly sourceRect: GpuRect;
  readonly contentToTextureKey: string;
};

export type SurfaceHitIndex = {
  readonly generationId: SurfaceGenerationId;
  readonly entries: readonly SurfaceHitIndexEntry[];
};

export type SurfaceHitIndexEntry = {
  readonly id: string;
  readonly rect: GpuRect;
  readonly role: string;
};

export type SurfaceActiveDomIslandGeneration = {
  readonly focusIdentity: string | null;
  readonly generationId: SurfaceGenerationId;
  readonly islandId: string;
  readonly ownerSurfaceId: SurfaceId;
  readonly rect: GpuRect;
};

export type SurfaceGeneration = {
  readonly activeDomIsland: SurfaceActiveDomIslandGeneration | null;
  readonly clipRect: GpuRect;
  readonly contentVersion: SurfaceContentVersion;
  readonly fidelity: SurfaceFidelity;
  readonly flowRect: GpuRect;
  readonly generationId: SurfaceGenerationId;
  readonly hitIndex: SurfaceHitIndex;
  readonly paintReadiness: SurfaceReadiness;
  readonly rendererBucket: SurfaceRendererBucket;
  readonly sourceKey: SurfaceSourceKey;
  readonly sourceWindow: SurfaceSourceWindow;
  readonly surfaceId: SurfaceId;
  readonly textureReadiness: SurfaceReadiness;
  readonly visualVersion: SurfaceVisualVersion;
  readonly zIndex: number;
};

export function createSurfaceGeneration(
  input: SurfaceGeneration,
): SurfaceGeneration {
  return Object.freeze({
    ...input,
    activeDomIsland: input.activeDomIsland
      ? freezeActiveDomIslandGeneration(input.activeDomIsland)
      : null,
    clipRect: freezeRect(input.clipRect),
    flowRect: freezeRect(input.flowRect),
    hitIndex: freezeHitIndex(input.hitIndex),
    sourceWindow: Object.freeze({
      contentToTextureKey: input.sourceWindow.contentToTextureKey,
      sourceRect: freezeRect(input.sourceWindow.sourceRect),
    }),
  });
}

export function surfaceGenerationKey(
  generation: Pick<SurfaceGeneration, "generationId" | "surfaceId">,
): string {
  return `${generation.surfaceId}:${generation.generationId}`;
}

function freezeActiveDomIslandGeneration(
  island: SurfaceActiveDomIslandGeneration,
): SurfaceActiveDomIslandGeneration {
  return Object.freeze({
    ...island,
    rect: freezeRect(island.rect),
  });
}

function freezeHitIndex(hitIndex: SurfaceHitIndex): SurfaceHitIndex {
  return Object.freeze({
    generationId: hitIndex.generationId,
    entries: Object.freeze(
      hitIndex.entries.map((entry) =>
        Object.freeze({
          ...entry,
          rect: freezeRect(entry.rect),
        }),
      ),
    ),
  });
}

export function freezeRect(rect: GpuRect): GpuRect {
  return Object.freeze({ ...rect });
}
