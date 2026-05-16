import {
  freezeRect,
  intersectRects,
  rectArea,
  rectKey,
  rectsEqual,
  sortedStringsEqual,
  subtractRect,
} from "./retainedCommittedCoverageGeometry";
import type { GpuRect } from "./viewportMath";

export type Matrix3 = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

type RetainedSurfaceId = string;
type RetainedDocumentId = string;
type RetainedSectionId = string;
type RetainedRowId = string;
type RetainedContentVersion = number;
type RetainedThemeGeneration = number;
type RetainedFontGeneration = number;
type RetainedCommittedRegionId = string;
type RetainedLayerId = number;
type RetainedTextureHandle = unknown;

type ContentRect = GpuRect;

export type RetainedRegionManifest = {
  readonly surfaceId: RetainedSurfaceId;
  readonly documentId: RetainedDocumentId;
  readonly sectionId: RetainedSectionId;
  readonly rowId: RetainedRowId | null;
  readonly contentVersion: RetainedContentVersion;
  readonly contentSegments?: readonly RetainedRegionContentSegment[];
  readonly textLikeSnapshots?: readonly RetainedRegionTextLikeSnapshot[];
  readonly themeGeneration: RetainedThemeGeneration;
  readonly fontGeneration: RetainedFontGeneration;
  readonly renderMode: "active" | "passive";
  readonly contentRect: ContentRect;
  readonly clipRect: ContentRect;
};

export type RetainedRegionContentSegment = {
  readonly contentVersion: RetainedContentVersion;
  readonly id: string;
  readonly rectCss: ContentRect;
};

export type RetainedRegionTextLikeSnapshot = {
  readonly rectCss: ContentRect;
  readonly rowId: RetainedRowId;
  readonly sourceId: string;
  readonly sourceKey: string;
};

export type RetainedRegionCompatibility =
  | {
      readonly kind: "compatible";
      readonly fidelity:
        | "exact"
        | "lower-lod"
        | "previous-grid"
        | "compatible-mapped-region";
      readonly manifest: RetainedRegionManifest;
      readonly coverageRect: ContentRect;
    }
  | {
      readonly kind: "incompatible";
      readonly reason:
        | "surface-mismatch"
        | "section-or-row-mismatch"
        | "row-content-version-mismatch"
        | "theme-or-font-generation-mismatch"
        | "active-passive-mode-mismatch"
        | "clip-mapping-mismatch"
        | "content-coordinate-mapping-mismatch";
    };

export type RetainedFidelityMetadata = {
  readonly devicePixelRatioBucket: number;
  readonly lodLevel: number;
  readonly lodScale: number;
  readonly pageGridGeneration: string;
  readonly pixelHeight: number;
  readonly pixelWidth: number;
  readonly viewportZoomBucket: number;
};

export type RetainedCommittedRegion<TTextureHandle = RetainedTextureHandle> = {
  readonly id: RetainedCommittedRegionId;
  readonly manifest: RetainedRegionManifest;
  readonly contentRect: ContentRect;
  readonly clipRect: ContentRect;
  readonly zLayer: RetainedLayerId;
  readonly textureHandle: TTextureHandle;
  readonly contentToTexture: Matrix3;
  readonly fidelity: RetainedFidelityMetadata;
  readonly generation: number;
};

export type RetainedRegionTarget = {
  readonly manifest: RetainedRegionManifest;
  readonly contentRect: ContentRect;
  readonly clipRect: ContentRect;
  readonly zLayer: RetainedLayerId;
  readonly fidelity: RetainedFidelityMetadata;
};

type RetainedCoverageTarget = {
  readonly regions: readonly RetainedRegionTarget[];
};

type RetainedCoverageEntry<TTextureHandle = RetainedTextureHandle> = {
  readonly compatibility: Extract<
    RetainedRegionCompatibility,
    { readonly kind: "compatible" }
  >;
  readonly coverageRect: ContentRect;
  readonly region: RetainedCommittedRegion<TTextureHandle>;
  readonly target: RetainedRegionTarget;
};

type RetainedRejectedCoverage = {
  readonly reason: Extract<
    RetainedRegionCompatibility,
    { readonly kind: "incompatible" }
  >["reason"];
  readonly rect: ContentRect;
};

type RetainedCoveragePlan<TTextureHandle = RetainedTextureHandle> = {
  readonly compatibleCoverage: readonly RetainedCoverageEntry<TTextureHandle>[];
  readonly exactCoverage: readonly RetainedCoverageEntry<TTextureHandle>[];
  readonly protectedRegionIds: readonly RetainedCommittedRegionId[];
  readonly rejectedCoverage: readonly RetainedRejectedCoverage[];
  readonly uncoveredRegions: readonly ContentRect[];
};

export type RetainedReplacementTxn = {
  readonly id: string;
  readonly generation: number;
  readonly target: RetainedRegionTarget;
};

export type UploadedRetainedRegion<TTextureHandle = RetainedTextureHandle> =
  RetainedCommittedRegion<TTextureHandle> & {
    readonly byteSize: number;
  };

type RetainedRejectReason =
  | "obsolete"
  | "raster-failed"
  | "semantic-manifest-mismatch"
  | "texture-allocation-failed";

type RetainedProtectionWindow = {
  readonly regions: readonly RetainedRegionTarget[];
};

type RetainedProtectionStats = {
  readonly protectedRegionIds: readonly RetainedCommittedRegionId[];
  readonly protectedRegionCount: number;
};

type RetainedCoverageBudget = {
  readonly maxBytes: number;
  readonly protectedRegionIds?:
    | readonly RetainedCommittedRegionId[]
    | undefined;
};

type RetainedEvictionReport = {
  readonly evictedBytes: number;
  readonly evictedRegionIds: readonly RetainedCommittedRegionId[];
  readonly remainingBytes: number;
};

type StoredRegion<TTextureHandle> = {
  readonly byteSize: number;
  readonly region: RetainedCommittedRegion<TTextureHandle>;
};

type CoverageAccumulator<TTextureHandle> = {
  readonly compatibleCoverage: RetainedCoverageEntry<TTextureHandle>[];
  readonly exactCoverage: RetainedCoverageEntry<TTextureHandle>[];
  readonly protectedRegionIds: Set<RetainedCommittedRegionId>;
  readonly rejectedCoverage: RetainedRejectedCoverage[];
  readonly uncoveredRegions: ContentRect[];
};

type CollectedCoverageCandidates<TTextureHandle> = {
  readonly candidates: readonly RetainedCoverageEntry<TTextureHandle>[];
  readonly rejectedCoverage: readonly RetainedRejectedCoverage[];
};

type StoredCoverageCandidate<TTextureHandle> = {
  readonly candidate?: RetainedCoverageEntry<TTextureHandle> | undefined;
  readonly rejectedCoverage?: RetainedRejectedCoverage | undefined;
};

type AppliedCoverageCandidate<TTextureHandle> = {
  readonly entries: readonly RetainedCoverageEntry<TTextureHandle>[];
  readonly uncoveredRects: readonly ContentRect[];
};

type RetainedCompatibilityRejectReason = Extract<
  RetainedRegionCompatibility,
  { readonly kind: "incompatible" }
>["reason"];

type RetainedContentProofKeys = {
  readonly segmentKeys: readonly string[];
  readonly snapshotKeys: readonly string[];
};

interface RetainedCommittedCoverageStore<
  TTextureHandle = RetainedTextureHandle,
> {
  queryVisibleCoverage(
    target: RetainedCoverageTarget,
  ): RetainedCoveragePlan<TTextureHandle>;
  beginReplacement(target: RetainedRegionTarget): RetainedReplacementTxn;
  commitReplacement(
    txn: RetainedReplacementTxn,
    uploaded: UploadedRetainedRegion<TTextureHandle>,
  ): void;
  rejectReplacement(
    txn: RetainedReplacementTxn,
    reason: RetainedRejectReason,
  ): void;
  protectVisibleRegions(
    window: RetainedProtectionWindow,
  ): RetainedProtectionStats;
  evictToBudget(budget: RetainedCoverageBudget): RetainedEvictionReport;
}

export class RetainedCommittedCoverageMap<
  TTextureHandle = RetainedTextureHandle,
> implements RetainedCommittedCoverageStore<TTextureHandle>
{
  private readonly committedRegions = new Map<
    RetainedCommittedRegionId,
    StoredRegion<TTextureHandle>
  >();
  private generation = 0;
  private readonly pendingReplacements = new Map<
    string,
    RetainedReplacementTxn
  >();
  private readonly protectedRegionIds = new Set<RetainedCommittedRegionId>();
  private replacementSequence = 0;

  beginReplacement(target: RetainedRegionTarget): RetainedReplacementTxn {
    const txn = Object.freeze({
      generation: this.generation,
      id: `retained-replacement:${this.replacementSequence}`,
      target: freezeRegionTarget(target),
    });
    this.replacementSequence += 1;
    this.pendingReplacements.set(txn.id, txn);
    return txn;
  }

  clear() {
    this.committedRegions.clear();
    this.pendingReplacements.clear();
    this.protectedRegionIds.clear();
  }

  commitReplacement(
    txn: RetainedReplacementTxn,
    uploaded: UploadedRetainedRegion<TTextureHandle>,
  ): void {
    const currentTxn = this.pendingReplacements.get(txn.id);
    if (!currentTxn) {
      throw new Error(`Unknown retained replacement transaction "${txn.id}".`);
    }
    if (!areRetainedRegionTargetsEquivalent(currentTxn.target, txn.target)) {
      throw new Error(
        `Retained replacement transaction "${txn.id}" target changed before commit.`,
      );
    }
    if (
      !retainedRegionManifestsMatch(
        uploaded.manifest,
        currentTxn.target.manifest,
      ) ||
      !rectsEqual(uploaded.contentRect, currentTxn.target.contentRect) ||
      !rectsEqual(uploaded.clipRect, currentTxn.target.clipRect)
    ) {
      this.pendingReplacements.delete(txn.id);
      throw new Error(
        `Retained replacement transaction "${txn.id}" completed with a mismatched manifest.`,
      );
    }
    this.pendingReplacements.delete(txn.id);
    this.generation += 1;
    this.committedRegions.set(uploaded.id, {
      byteSize: uploaded.byteSize,
      region: freezeCommittedRegion({
        ...uploaded,
        generation: this.generation,
      }),
    });
  }

  evictToBudget({ maxBytes, protectedRegionIds = [] }: RetainedCoverageBudget) {
    const protectedIds = new Set([
      ...this.protectedRegionIds,
      ...protectedRegionIds,
    ]);
    let remainingBytes = this.committedByteSize;
    const evictedRegionIds: RetainedCommittedRegionId[] = [];
    let evictedBytes = 0;
    if (!Number.isFinite(maxBytes) || maxBytes < 0) {
      throw new Error("Retained coverage budget maxBytes must be finite.");
    }
    for (const stored of this.evictableRegions(protectedIds)) {
      if (remainingBytes <= maxBytes) {
        break;
      }
      this.committedRegions.delete(stored.region.id);
      evictedRegionIds.push(stored.region.id);
      evictedBytes += stored.byteSize;
      remainingBytes -= stored.byteSize;
    }
    return {
      evictedBytes,
      evictedRegionIds: Object.freeze(evictedRegionIds),
      remainingBytes,
    };
  }

  get committedByteSize(): number {
    let total = 0;
    for (const stored of this.committedRegions.values()) {
      total += stored.byteSize;
    }
    return total;
  }

  protectVisibleRegions(
    window: RetainedProtectionWindow,
  ): RetainedProtectionStats {
    const plan = this.queryVisibleCoverage({ regions: window.regions });
    for (const id of plan.protectedRegionIds) {
      this.protectedRegionIds.add(id);
    }
    return {
      protectedRegionCount: plan.protectedRegionIds.length,
      protectedRegionIds: plan.protectedRegionIds,
    };
  }

  queryVisibleCoverage({
    regions,
  }: RetainedCoverageTarget): RetainedCoveragePlan<TTextureHandle> {
    const coverage = createCoverageAccumulator<TTextureHandle>();
    for (const target of regions) {
      mergeCoverageAccumulator(coverage, this.queryTargetCoverage(target));
    }
    return freezeCoverageAccumulator(coverage);
  }

  private queryTargetCoverage(
    target: RetainedRegionTarget,
  ): RetainedCoveragePlan<TTextureHandle> {
    const collected = this.collectCoverageCandidates(target);
    const coverage = resolveTargetCoverage({
      candidates: collected.candidates,
      target,
    });
    return Object.freeze({
      ...coverage,
      rejectedCoverage: Object.freeze([...collected.rejectedCoverage]),
    });
  }

  private collectCoverageCandidates(
    target: RetainedRegionTarget,
  ): CollectedCoverageCandidates<TTextureHandle> {
    const candidates: RetainedCoverageEntry<TTextureHandle>[] = [];
    const rejectedCoverage: RetainedRejectedCoverage[] = [];
    for (const stored of this.committedRegions.values()) {
      const result = this.resolveStoredCoverageCandidate({ stored, target });
      if (result.candidate) {
        candidates.push(result.candidate);
      }
      if (result.rejectedCoverage) {
        rejectedCoverage.push(result.rejectedCoverage);
      }
    }
    return {
      candidates: Object.freeze(candidates.sort(compareCoverageEntries)),
      rejectedCoverage: Object.freeze(rejectedCoverage),
    };
  }

  private resolveStoredCoverageCandidate({
    stored,
    target,
  }: {
    readonly stored: StoredRegion<TTextureHandle>;
    readonly target: RetainedRegionTarget;
  }): StoredCoverageCandidate<TTextureHandle> {
    const compatibility = evaluateRetainedRegionCompatibility({
      candidate: stored.region,
      target,
    });
    if (compatibility.kind === "compatible") {
      return {
        candidate: {
          compatibility,
          coverageRect: compatibility.coverageRect,
          region: stored.region,
          target,
        },
      };
    }
    const rejectedRect = intersectRects(
      stored.region.contentRect,
      target.contentRect,
    );
    if (!rejectedRect) {
      return {};
    }
    return {
      rejectedCoverage: {
        reason: compatibility.reason,
        rect: rejectedRect,
      },
    };
  }

  rejectReplacement(
    txn: RetainedReplacementTxn,
    _reason: RetainedRejectReason,
  ): void {
    void _reason;
    this.pendingReplacements.delete(txn.id);
  }

  private evictableRegions(
    protectedIds: ReadonlySet<RetainedCommittedRegionId>,
  ): readonly StoredRegion<TTextureHandle>[] {
    return [...this.committedRegions.values()]
      .filter((stored) => !protectedIds.has(stored.region.id))
      .sort(compareEvictableRegions);
  }
}

function createCoverageAccumulator<
  TTextureHandle,
>(): CoverageAccumulator<TTextureHandle> {
  return {
    compatibleCoverage: [],
    exactCoverage: [],
    protectedRegionIds: new Set(),
    rejectedCoverage: [],
    uncoveredRegions: [],
  };
}

function mergeCoverageAccumulator<TTextureHandle>(
  accumulator: CoverageAccumulator<TTextureHandle>,
  plan: RetainedCoveragePlan<TTextureHandle>,
): void {
  accumulator.compatibleCoverage.push(...plan.compatibleCoverage);
  accumulator.exactCoverage.push(...plan.exactCoverage);
  accumulator.rejectedCoverage.push(...plan.rejectedCoverage);
  accumulator.uncoveredRegions.push(...plan.uncoveredRegions);
  for (const id of plan.protectedRegionIds) {
    accumulator.protectedRegionIds.add(id);
  }
}

function freezeCoverageAccumulator<TTextureHandle>(
  accumulator: CoverageAccumulator<TTextureHandle>,
): RetainedCoveragePlan<TTextureHandle> {
  return Object.freeze({
    compatibleCoverage: Object.freeze(accumulator.compatibleCoverage),
    exactCoverage: Object.freeze(accumulator.exactCoverage),
    protectedRegionIds: Object.freeze([...accumulator.protectedRegionIds]),
    rejectedCoverage: Object.freeze(accumulator.rejectedCoverage),
    uncoveredRegions: Object.freeze(accumulator.uncoveredRegions),
  });
}

function resolveTargetCoverage<TTextureHandle>({
  candidates,
  target,
}: {
  readonly candidates: readonly RetainedCoverageEntry<TTextureHandle>[];
  readonly target: RetainedRegionTarget;
}): Omit<RetainedCoveragePlan<TTextureHandle>, "rejectedCoverage"> {
  const compatibleCoverage: RetainedCoverageEntry<TTextureHandle>[] = [];
  const exactCoverage: RetainedCoverageEntry<TTextureHandle>[] = [];
  const protectedRegionIds = new Set<RetainedCommittedRegionId>();
  let uncoveredRects: readonly ContentRect[] = [target.contentRect];
  for (const candidate of candidates) {
    const applied = applyCoverageCandidate({ candidate, uncoveredRects });
    if (applied.entries.length === 0) {
      continue;
    }
    protectedRegionIds.add(candidate.region.id);
    appendAppliedCoverageEntries({
      candidate,
      compatibleCoverage,
      entries: applied.entries,
      exactCoverage,
    });
    uncoveredRects = applied.uncoveredRects;
    if (uncoveredRects.length === 0) {
      break;
    }
  }
  return Object.freeze({
    compatibleCoverage: Object.freeze(compatibleCoverage),
    exactCoverage: Object.freeze(exactCoverage),
    protectedRegionIds: Object.freeze([...protectedRegionIds]),
    uncoveredRegions: Object.freeze([...uncoveredRects]),
  });
}

function applyCoverageCandidate<TTextureHandle>({
  candidate,
  uncoveredRects,
}: {
  readonly candidate: RetainedCoverageEntry<TTextureHandle>;
  readonly uncoveredRects: readonly ContentRect[];
}): AppliedCoverageCandidate<TTextureHandle> {
  const coveredFragments: ContentRect[] = [];
  const nextUncovered: ContentRect[] = [];
  for (const uncoveredRect of uncoveredRects) {
    const coverageRect = intersectRects(uncoveredRect, candidate.coverageRect);
    if (!coverageRect) {
      nextUncovered.push(uncoveredRect);
      continue;
    }
    coveredFragments.push(coverageRect);
    nextUncovered.push(...subtractRect(uncoveredRect, coverageRect));
  }
  return {
    entries: Object.freeze(
      coveredFragments.map((coverageRect) => ({
        ...candidate,
        compatibility: {
          ...candidate.compatibility,
          coverageRect,
        },
        coverageRect,
      })),
    ),
    uncoveredRects: Object.freeze(nextUncovered),
  };
}

function appendAppliedCoverageEntries<TTextureHandle>({
  candidate,
  compatibleCoverage,
  entries,
  exactCoverage,
}: {
  readonly candidate: RetainedCoverageEntry<TTextureHandle>;
  readonly compatibleCoverage: RetainedCoverageEntry<TTextureHandle>[];
  readonly entries: readonly RetainedCoverageEntry<TTextureHandle>[];
  readonly exactCoverage: RetainedCoverageEntry<TTextureHandle>[];
}): void {
  const destination =
    candidate.compatibility.fidelity === "exact"
      ? exactCoverage
      : compatibleCoverage;
  destination.push(...entries);
}

export function evaluateRetainedRegionCompatibility({
  candidate,
  target,
}: {
  readonly candidate: Pick<
    RetainedCommittedRegion,
    "contentRect" | "clipRect" | "contentToTexture" | "fidelity" | "manifest"
  >;
  readonly target: RetainedRegionTarget;
}): RetainedRegionCompatibility {
  const manifestReason = retainedManifestIncompatibilityReason({
    candidate: candidate.manifest,
    target: target.manifest,
  });
  if (manifestReason) {
    return incompatible(manifestReason);
  }
  if (!candidate.contentToTexture.every(Number.isFinite)) {
    return incompatible("content-coordinate-mapping-mismatch");
  }
  const coverageRect = intersectRects(
    candidate.contentRect,
    target.contentRect,
  );
  if (!coverageRect) {
    return incompatible("content-coordinate-mapping-mismatch");
  }
  if (
    !retainedManifestContentMatchesForRect({
      candidate: candidate.manifest,
      target: target.manifest,
      coverageRect,
    })
  ) {
    return incompatible("row-content-version-mismatch");
  }
  if (!intersectRects(candidate.clipRect, coverageRect)) {
    return incompatible("clip-mapping-mismatch");
  }
  return {
    coverageRect,
    fidelity: resolveRetainedRegionFidelity(candidate, target),
    kind: "compatible",
    manifest: freezeRegionManifest(candidate.manifest),
  };
}

function resolveRetainedRegionFidelity(
  candidate: Pick<
    RetainedCommittedRegion,
    "contentRect" | "clipRect" | "fidelity"
  >,
  target: RetainedRegionTarget,
): Extract<
  RetainedRegionCompatibility,
  { readonly kind: "compatible" }
>["fidelity"] {
  if (
    candidate.fidelity.lodLevel !== target.fidelity.lodLevel ||
    candidate.fidelity.devicePixelRatioBucket !==
      target.fidelity.devicePixelRatioBucket
  ) {
    return "lower-lod";
  }
  if (
    candidate.fidelity.pageGridGeneration !== target.fidelity.pageGridGeneration
  ) {
    return "previous-grid";
  }
  if (
    !rectsEqual(candidate.contentRect, target.contentRect) ||
    !rectsEqual(candidate.clipRect, target.clipRect)
  ) {
    return "compatible-mapped-region";
  }
  return "exact";
}

function compareCoverageEntries(
  left: RetainedCoverageEntry,
  right: RetainedCoverageEntry,
): number {
  return (
    compatibilityRank(left.compatibility.fidelity) -
      compatibilityRank(right.compatibility.fidelity) ||
    Math.abs(left.region.fidelity.lodLevel - left.target.fidelity.lodLevel) -
      Math.abs(
        right.region.fidelity.lodLevel - right.target.fidelity.lodLevel,
      ) ||
    right.region.fidelity.lodLevel - left.region.fidelity.lodLevel ||
    rectArea(right.coverageRect) - rectArea(left.coverageRect) ||
    left.coverageRect.y - right.coverageRect.y ||
    left.coverageRect.x - right.coverageRect.x ||
    right.region.generation - left.region.generation ||
    left.region.id.localeCompare(right.region.id)
  );
}

function compareEvictableRegions(
  left: StoredRegion<unknown>,
  right: StoredRegion<unknown>,
): number {
  return (
    right.region.fidelity.lodLevel - left.region.fidelity.lodLevel ||
    left.region.generation - right.region.generation ||
    right.byteSize - left.byteSize ||
    left.region.id.localeCompare(right.region.id)
  );
}

function compatibilityRank(
  fidelity: Extract<
    RetainedRegionCompatibility,
    { readonly kind: "compatible" }
  >["fidelity"],
): number {
  return {
    exact: 0,
    "lower-lod": 1,
    "previous-grid": 2,
    "compatible-mapped-region": 3,
  }[fidelity];
}

function incompatible(
  reason: Extract<
    RetainedRegionCompatibility,
    { readonly kind: "incompatible" }
  >["reason"],
): RetainedRegionCompatibility {
  return { kind: "incompatible", reason };
}

function retainedManifestIncompatibilityReason({
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

function areRetainedRegionTargetsEquivalent(
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

function retainedRegionManifestsMatch(
  left: RetainedRegionManifest,
  right: RetainedRegionManifest,
): boolean {
  return [
    left.surfaceId === right.surfaceId,
    retainedManifestOwnerMatches(left, right),
    retainedManifestContentProofMatches(left, right),
    retainedManifestStyleGenerationMatches(left, right),
    left.renderMode === right.renderMode,
    rectsEqual(left.contentRect, right.contentRect),
    rectsEqual(left.clipRect, right.clipRect),
  ].every(Boolean);
}

function retainedManifestContentProofMatches(
  left: RetainedRegionManifest,
  right: RetainedRegionManifest,
): boolean {
  return [
    left.contentVersion === right.contentVersion,
    contentSegmentsEqual(left.contentSegments, right.contentSegments),
    textLikeSnapshotsEqual(left.textLikeSnapshots, right.textLikeSnapshots),
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

function freezeCommittedRegion<TTextureHandle>(
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

function freezeRegionTarget(
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

function freezeRegionManifest(
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
    textLikeSnapshots: Object.freeze(
      (manifest.textLikeSnapshots ?? []).map((snapshot) =>
        Object.freeze({
          ...snapshot,
          rectCss: freezeRect(snapshot.rectCss),
        }),
      ),
    ),
  });
}

function retainedManifestContentMatchesForRect({
  candidate,
  coverageRect,
  target,
}: {
  readonly candidate: RetainedRegionManifest;
  readonly coverageRect: ContentRect;
  readonly target: RetainedRegionManifest;
}): boolean {
  if (candidate.contentVersion === target.contentVersion) {
    return true;
  }
  const candidateProof = retainedContentProofKeysForRect(
    candidate,
    coverageRect,
  );
  const targetProof = retainedContentProofKeysForRect(target, coverageRect);
  if (!retainedContentProofPairHasKeys(candidateProof, targetProof)) {
    return false;
  }
  if (
    !sortedStringsEqual(candidateProof.segmentKeys, targetProof.segmentKeys)
  ) {
    return false;
  }
  return sortedStringsEqual(
    candidateProof.snapshotKeys,
    targetProof.snapshotKeys,
  );
}

function retainedContentProofKeysForRect(
  manifest: RetainedRegionManifest,
  coverageRect: ContentRect,
): RetainedContentProofKeys {
  return {
    segmentKeys: contentSegmentKeysForRect(
      manifest.contentSegments ?? [],
      coverageRect,
    ),
    snapshotKeys: textLikeSnapshotKeysForRect(
      manifest.textLikeSnapshots ?? [],
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
  return proof.segmentKeys.length > 0 || proof.snapshotKeys.length > 0;
}

function contentSegmentKeysForRect(
  segments: readonly RetainedRegionContentSegment[],
  coverageRect: ContentRect,
): readonly string[] {
  return segments
    .filter((segment) => intersectRects(segment.rectCss, coverageRect))
    .map((segment) => `${segment.id}:${segment.contentVersion}`)
    .sort();
}

function textLikeSnapshotKeysForRect(
  snapshots: readonly RetainedRegionTextLikeSnapshot[],
  coverageRect: ContentRect,
): readonly string[] {
  return snapshots
    .filter((snapshot) => intersectRects(snapshot.rectCss, coverageRect))
    .map(
      (snapshot) =>
        `${snapshot.rowId}:${snapshot.sourceId}:${snapshot.sourceKey}`,
    )
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

function textLikeSnapshotsEqual(
  left: readonly RetainedRegionTextLikeSnapshot[] | undefined,
  right: readonly RetainedRegionTextLikeSnapshot[] | undefined,
): boolean {
  const leftSnapshots = left ?? [];
  const rightSnapshots = right ?? [];
  return sortedStringsEqual(
    leftSnapshots.map(
      (snapshot) =>
        `${snapshot.rowId}:${snapshot.sourceId}:${snapshot.sourceKey}:${rectKey(
          snapshot.rectCss,
        )}`,
    ),
    rightSnapshots.map(
      (snapshot) =>
        `${snapshot.rowId}:${snapshot.sourceId}:${snapshot.sourceKey}:${rectKey(
          snapshot.rectCss,
        )}`,
    ),
  );
}
