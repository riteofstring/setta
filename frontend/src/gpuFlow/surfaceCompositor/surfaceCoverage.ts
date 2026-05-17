import type { GpuRect } from "../viewportMath";
import {
  freezeRect,
  type SurfaceGeneration,
  type SurfaceGenerationId,
  type SurfaceId,
  type SurfaceRendererBucket,
} from "./surfaceGeneration";

type SurfaceCoverageFidelity = "exact" | "compatible";

export type SurfaceResourceProtectionReason =
  | "published-transaction"
  | "held-previous-transaction"
  | "active-dom-island"
  | "pending-exact-coverage"
  | "interactive-source";

export type SurfaceResourceHandle = {
  readonly id: string;
  readonly kind: "texture" | "page" | "native-dom-island" | "source";
};

export type ProtectedSurfaceResourceHandle = SurfaceResourceHandle & {
  readonly reason: SurfaceResourceProtectionReason;
};

export type SurfaceCoverageEntry = {
  readonly coverageRect: GpuRect;
  readonly fidelity: SurfaceCoverageFidelity;
  readonly generationId: SurfaceGenerationId;
  readonly rendererBucket: SurfaceRendererBucket;
  readonly resourceHandles: readonly SurfaceResourceHandle[];
  readonly surfaceId: SurfaceId;
  readonly zIndex: number;
};

export type SurfaceRejectedCoverageCandidate = {
  readonly generationId: SurfaceGenerationId;
  readonly reason: string;
  readonly surfaceId: SurfaceId;
};

export type SurfaceCompatibilityProof = {
  readonly compatibleForVisuals: boolean;
  readonly compatibleForHitTesting: boolean;
  readonly compatibleForActiveDomIsland: boolean;
  readonly compatibleForMotion: boolean;
  readonly compatibleForClipChain: boolean;
  readonly compatibleForSourceWindow: boolean;
  readonly rejectedCandidates: readonly SurfaceRejectedCoverageCandidate[];
};

export type SurfaceCoverageProof = {
  readonly blockingGenerationIds: readonly SurfaceGenerationId[];
  readonly blockingSurfaceIds: readonly SurfaceId[];
  readonly compatibilityProof: SurfaceCompatibilityProof;
  readonly compatibleCoverage: readonly SurfaceCoverageEntry[];
  readonly exactCoverage: readonly SurfaceCoverageEntry[];
  readonly protectedResourceHandles: readonly ProtectedSurfaceResourceHandle[];
  readonly rendererBuckets: readonly SurfaceRendererBucket[];
  readonly trueHoleRects: readonly GpuRect[];
  readonly visibleRects: readonly GpuRect[];
  readonly zOrder: readonly SurfaceId[];
};

export function createSurfaceCompatibilityProof(
  input: SurfaceCompatibilityProof,
): SurfaceCompatibilityProof {
  return Object.freeze({
    ...input,
    rejectedCandidates: Object.freeze(
      input.rejectedCandidates.map((candidate) =>
        Object.freeze({ ...candidate }),
      ),
    ),
  });
}

export function createSurfaceCoverageProof(
  input: SurfaceCoverageProof,
): SurfaceCoverageProof {
  return Object.freeze({
    blockingGenerationIds: Object.freeze([...input.blockingGenerationIds]),
    blockingSurfaceIds: Object.freeze([...input.blockingSurfaceIds]),
    compatibilityProof: createSurfaceCompatibilityProof(
      input.compatibilityProof,
    ),
    compatibleCoverage: Object.freeze(
      input.compatibleCoverage.map(freezeCoverageEntry),
    ),
    exactCoverage: Object.freeze(input.exactCoverage.map(freezeCoverageEntry)),
    protectedResourceHandles: Object.freeze(
      input.protectedResourceHandles.map((handle) =>
        Object.freeze({ ...handle }),
      ),
    ),
    rendererBuckets: Object.freeze([...input.rendererBuckets]),
    trueHoleRects: Object.freeze(input.trueHoleRects.map(freezeRect)),
    visibleRects: Object.freeze(input.visibleRects.map(freezeRect)),
    zOrder: Object.freeze([...input.zOrder]),
  });
}

export function createExactSurfaceCoverageEntry({
  generation,
  resourceHandles,
}: {
  readonly generation: SurfaceGeneration;
  readonly resourceHandles: readonly SurfaceResourceHandle[];
}): SurfaceCoverageEntry {
  return Object.freeze({
    coverageRect: freezeRect(generation.sourceWindow.sourceRect),
    fidelity: "exact",
    generationId: generation.generationId,
    rendererBucket: generation.rendererBucket,
    resourceHandles: Object.freeze(
      resourceHandles.map((handle) => Object.freeze({ ...handle })),
    ),
    surfaceId: generation.surfaceId,
    zIndex: generation.zIndex,
  });
}

export function assertSurfaceCoverageHasNoTrueHoles(
  proof: SurfaceCoverageProof,
): void {
  if (proof.trueHoleRects.length === 0) {
    return;
  }
  throw new Error(
    `Surface transaction cannot publish ${proof.trueHoleRects.length} true-hole rects.`,
  );
}

export function assertSurfaceResourcesNotEvicted({
  evictedResourceIds,
  protectedResourceHandles,
}: {
  readonly evictedResourceIds: readonly string[];
  readonly protectedResourceHandles: readonly ProtectedSurfaceResourceHandle[];
}): void {
  const protectedResourceIds = new Set(
    protectedResourceHandles.map((handle) => handle.id),
  );
  const evictedProtectedIds = evictedResourceIds.filter((id) =>
    protectedResourceIds.has(id),
  );
  if (evictedProtectedIds.length === 0) {
    return;
  }
  throw new Error(
    `Surface scheduler cannot evict protected resources: ${evictedProtectedIds.join(", ")}.`,
  );
}

export function surfaceCoverageIsComplete(
  proof: SurfaceCoverageProof,
): boolean {
  return proof.trueHoleRects.length === 0;
}

function freezeCoverageEntry(
  entry: SurfaceCoverageEntry,
): SurfaceCoverageEntry {
  return Object.freeze({
    ...entry,
    coverageRect: freezeRect(entry.coverageRect),
    resourceHandles: Object.freeze(
      entry.resourceHandles.map((handle) => Object.freeze({ ...handle })),
    ),
  });
}
