import {
  freezeRect,
  intersectRects,
  rectKey,
  rectsEqual,
  sortedStringsEqual,
} from "./retainedCommittedCoverageGeometry";
import type {
  Matrix3,
  RetainedCommittedRegion,
  RetainedFidelityMetadata,
  RetainedRegionCompatibility,
  RetainedRegionContentSegment,
  RetainedRegionManifest,
  RetainedRegionTarget,
} from "./retainedCommittedCoverageStore";
import type { GpuRect } from "./viewportMath";

type RetainedCompatibilityRejectReason = Extract<
  RetainedRegionCompatibility,
  { readonly kind: "incompatible" }
>["reason"];

type RetainedContentProofKeys = {
  readonly segmentKeys: readonly string[];
};

type RetainedManifestContentCompatibility =
  | "deterministic-base"
  | "exact"
  | "mismatch";

export function retainedManifestIncompatibilityReason({
  candidate,
  target,
}: {
  readonly candidate: RetainedRegionManifest;
  readonly target: RetainedRegionManifest;
}): RetainedCompatibilityRejectReason | null {
  if (candidate.surfaceId !== target.surfaceId) {
    return "surface-mismatch";
  }
  if (!retainedManifestOwnerMatches(candidate, target)) {
    return "section-or-row-mismatch";
  }
  if (!retainedManifestStyleGenerationMatches(candidate, target)) {
    return "theme-or-font-generation-mismatch";
  }
  if (candidate.renderMode !== target.renderMode) {
    return "active-passive-mode-mismatch";
  }
  return null;
}

export function retainedManifestContentMatchesForRect({
  candidate,
  coverageRect,
  target,
}: {
  readonly candidate: RetainedRegionManifest;
  readonly coverageRect: GpuRect;
  readonly target: RetainedRegionManifest;
}): RetainedManifestContentCompatibility {
  const candidateProof = retainedContentProofKeysForRect(
    candidate,
    coverageRect,
  );
  const targetProof = retainedContentProofKeysForRect(target, coverageRect);
  if (!retainedContentProofPairHasKeys(candidateProof, targetProof)) {
    if (
      retainedManifestHasStructuredContentProof(candidate) ||
      retainedManifestHasStructuredContentProof(target)
    ) {
      return "exact";
    }
    return candidate.contentVersion === target.contentVersion
      ? "exact"
      : "mismatch";
  }
  if (
    !sortedStringsEqual(candidateProof.segmentKeys, targetProof.segmentKeys)
  ) {
    return "mismatch";
  }
  return "exact";
}

export function areRetainedRegionTargetsEquivalent(
  left: RetainedRegionTarget,
  right: RetainedRegionTarget,
): boolean {
  return (
    rectsEqual(left.contentRect, right.contentRect) &&
    rectsEqual(left.clipRect, right.clipRect) &&
    left.zLayer === right.zLayer &&
    retainedRegionManifestsMatch(left.manifest, right.manifest) &&
    retainedFidelityMetadataEqual(left.fidelity, right.fidelity)
  );
}

export function retainedRegionManifestsMatch(
  left: RetainedRegionManifest,
  right: RetainedRegionManifest,
): boolean {
  return [
    left.surfaceId === right.surfaceId,
    retainedManifestOwnerMatches(left, right),
    retainedManifestContentProofMatches(left, right),
    retainedManifestStyleGenerationMatches(left, right),
    left.renderMode === right.renderMode,
    (left.visualEpochKind ?? "base") === (right.visualEpochKind ?? "base"),
    rectsEqual(left.contentRect, right.contentRect),
    rectsEqual(left.clipRect, right.clipRect),
  ].every(Boolean);
}

export function freezeCommittedRegion<TTextureHandle>(
  region: RetainedCommittedRegion<TTextureHandle>,
): RetainedCommittedRegion<TTextureHandle> {
  return Object.freeze({
    ...region,
    clipRect: freezeRect(region.clipRect),
    contentRect: freezeRect(region.contentRect),
    contentToTexture: Object.freeze([...region.contentToTexture]) as Matrix3,
    fidelity: Object.freeze({ ...region.fidelity }),
    manifest: freezeRegionManifest(region.manifest),
  });
}

export function freezeRegionTarget(
  target: RetainedRegionTarget,
): RetainedRegionTarget {
  return Object.freeze({
    ...target,
    clipRect: freezeRect(target.clipRect),
    contentRect: freezeRect(target.contentRect),
    fidelity: Object.freeze({ ...target.fidelity }),
    manifest: freezeRegionManifest(target.manifest),
  });
}

export function freezeRegionManifest(
  manifest: RetainedRegionManifest,
): RetainedRegionManifest {
  return Object.freeze({
    ...manifest,
    clipRect: freezeRect(manifest.clipRect),
    contentSegments: Object.freeze(
      (manifest.contentSegments ?? []).map((segment) =>
        Object.freeze({
          ...segment,
          rectCss: freezeRect(segment.rectCss),
        }),
      ),
    ),
    contentRect: freezeRect(manifest.contentRect),
  });
}

function retainedManifestOwnerMatches(
  left: RetainedRegionManifest,
  right: RetainedRegionManifest,
): boolean {
  return [
    left.documentId === right.documentId,
    left.sectionId === right.sectionId,
    left.rowId === right.rowId,
  ].every(Boolean);
}

function retainedManifestStyleGenerationMatches(
  left: RetainedRegionManifest,
  right: RetainedRegionManifest,
): boolean {
  return [
    left.themeGeneration === right.themeGeneration,
    left.fontGeneration === right.fontGeneration,
  ].every(Boolean);
}

function retainedManifestContentProofMatches(
  left: RetainedRegionManifest,
  right: RetainedRegionManifest,
): boolean {
  return [
    left.contentVersion === right.contentVersion,
    contentSegmentsEqual(left.contentSegments, right.contentSegments),
  ].every(Boolean);
}

function retainedFidelityMetadataEqual(
  left: RetainedFidelityMetadata,
  right: RetainedFidelityMetadata,
): boolean {
  return (
    left.devicePixelRatioBucket === right.devicePixelRatioBucket &&
    left.lodLevel === right.lodLevel &&
    left.lodScale === right.lodScale &&
    left.pageGridGeneration === right.pageGridGeneration &&
    left.pixelHeight === right.pixelHeight &&
    left.pixelWidth === right.pixelWidth &&
    left.viewportZoomBucket === right.viewportZoomBucket
  );
}

function retainedContentProofKeysForRect(
  manifest: RetainedRegionManifest,
  coverageRect: GpuRect,
): RetainedContentProofKeys {
  return {
    segmentKeys: contentSegmentKeysForRect(
      manifest.contentSegments ?? [],
      coverageRect,
    ),
  };
}

function retainedContentProofPairHasKeys(
  candidate: RetainedContentProofKeys,
  target: RetainedContentProofKeys,
): boolean {
  return (
    retainedContentProofHasKeys(candidate) ||
    retainedContentProofHasKeys(target)
  );
}

function retainedContentProofHasKeys(proof: RetainedContentProofKeys): boolean {
  return proof.segmentKeys.length > 0;
}

function retainedManifestHasStructuredContentProof(
  manifest: RetainedRegionManifest,
): boolean {
  return Boolean(manifest.contentSegments?.length);
}

function contentSegmentKeysForRect(
  segments: readonly RetainedRegionContentSegment[],
  coverageRect: GpuRect,
): readonly string[] {
  return segments
    .filter((segment) => intersectRects(segment.rectCss, coverageRect))
    .map((segment) => `${segment.id}:${segment.contentVersion}`)
    .sort();
}

function contentSegmentsEqual(
  left: readonly RetainedRegionContentSegment[] | undefined,
  right: readonly RetainedRegionContentSegment[] | undefined,
): boolean {
  const leftSegments = left ?? [];
  const rightSegments = right ?? [];
  return sortedStringsEqual(
    leftSegments.map(
      (segment) =>
        `${segment.id}:${segment.contentVersion}:${rectKey(segment.rectCss)}`,
    ),
    rightSegments.map(
      (segment) =>
        `${segment.id}:${segment.contentVersion}:${rectKey(segment.rectCss)}`,
    ),
  );
}
