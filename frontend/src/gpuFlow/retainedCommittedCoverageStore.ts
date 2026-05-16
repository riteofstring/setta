import {
  intersectRects,
  rectArea,
  rectsEqual,
  subtractRect,
} from "./retainedCommittedCoverageGeometry";
import {
  addIndexedRegionId,
  createRetainedCoverageOwnerGrid,
  groupTargetsByOwner,
  removeIndexedRegionId,
  retainedCoverageExactKeysForCommittedRegion,
  retainedCoverageExactKeysForTarget,
  retainedCoverageGridCellKeys,
  retainedRegionOwnerKey,
  type RetainedCoverageIndexEntry,
} from "./retainedCommittedCoverageIndex";
import {
  areRetainedRegionTargetsEquivalent,
  freezeCommittedRegion,
  freezeRegionManifest,
  freezeRegionTarget,
  retainedManifestContentMatchesForRect,
  retainedManifestIncompatibilityReason,
  retainedRegionManifestsMatch,
} from "./retainedCommittedCoverageManifest";
import type { RetainedVisualEpochKind } from "./retainedVisualEpochs";
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

const DEFAULT_RETAINED_COVERAGE_DIAGNOSTIC_SAMPLE_CAP = 20;

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
  readonly visualEpochKind?: RetainedVisualEpochKind;
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
        | "deterministic-base"
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

export type RetainedCoverageEntry<TTextureHandle = RetainedTextureHandle> = {
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

export type RetainedCoveragePlanDiagnostics = {
  readonly allocatedDiagnosticRectCount: number;
  readonly candidateCount: number;
  readonly compatibilityCheckCount: number;
  readonly rejectedCoverageCountByReason: Readonly<Record<string, number>>;
  readonly spatialQueryCount: number;
  readonly visibleRegionCount: number;
  readonly visibleRegionGroupCount: number;
};

type RetainedCoveragePlan<TTextureHandle = RetainedTextureHandle> = {
  readonly compatibleCoverage: readonly RetainedCoverageEntry<TTextureHandle>[];
  readonly diagnostics: RetainedCoveragePlanDiagnostics;
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
  readonly diagnostics: MutableRetainedCoveragePlanDiagnostics;
  readonly exactCoverage: RetainedCoverageEntry<TTextureHandle>[];
  readonly protectedRegionIds: Set<RetainedCommittedRegionId>;
  readonly rejectedCoverage: RetainedRejectedCoverage[];
  readonly uncoveredRegions: ContentRect[];
};

type CollectedCoverageCandidates<TTextureHandle> = {
  readonly candidates: readonly RetainedCoverageEntry<TTextureHandle>[];
  readonly diagnostics: MutableRetainedCoveragePlanDiagnostics;
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

type MutableRetainedCoveragePlanDiagnostics = {
  allocatedDiagnosticRectCount: number;
  candidateCount: number;
  compatibilityCheckCount: number;
  rejectedCoverageCountByReason: Record<string, number>;
  spatialQueryCount: number;
  visibleRegionCount: number;
  visibleRegionGroupCount: number;
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
  private readonly exactRegionIdsByKey = new Map<
    string,
    Set<RetainedCommittedRegionId>
  >();
  private readonly committedRegions = new Map<
    RetainedCommittedRegionId,
    StoredRegion<TTextureHandle>
  >();
  private readonly gridRegionIdsByOwner = new Map<
    string,
    Map<string, Set<RetainedCommittedRegionId>>
  >();
  private readonly indexEntryByRegionId = new Map<
    RetainedCommittedRegionId,
    RetainedCoverageIndexEntry
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
    this.exactRegionIdsByKey.clear();
    this.committedRegions.clear();
    this.gridRegionIdsByOwner.clear();
    this.indexEntryByRegionId.clear();
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
    const stored = {
      byteSize: uploaded.byteSize,
      region: freezeCommittedRegion({
        ...uploaded,
        generation: this.generation,
      }),
    };
    this.unindexCommittedRegion(uploaded.id);
    this.committedRegions.set(uploaded.id, stored);
    this.indexCommittedRegion(stored.region);
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
      this.removeCommittedRegion(stored.region.id);
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
    const targetsByOwner = groupTargetsByOwner(regions);
    coverage.diagnostics.visibleRegionCount = regions.length;
    coverage.diagnostics.visibleRegionGroupCount = targetsByOwner.size;
    for (const ownerTargets of targetsByOwner.values()) {
      for (const target of ownerTargets) {
        mergeCoverageAccumulator(coverage, this.queryTargetCoverage(target));
      }
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
      diagnostics: collected.diagnostics,
      rejectedCoverage: Object.freeze([...collected.rejectedCoverage]),
    });
  }

  private collectCoverageCandidates(
    target: RetainedRegionTarget,
  ): CollectedCoverageCandidates<TTextureHandle> {
    const candidates: RetainedCoverageEntry<TTextureHandle>[] = [];
    const diagnostics = createMutableCoveragePlanDiagnostics();
    const rejectedCoverage: RetainedRejectedCoverage[] = [];
    const localRegionIds = this.queryLocalRegionIds(target);
    diagnostics.spatialQueryCount += 1;
    diagnostics.candidateCount += localRegionIds.length;
    for (const regionId of localRegionIds) {
      const stored = this.committedRegions.get(regionId);
      if (!stored) {
        continue;
      }
      diagnostics.compatibilityCheckCount += 1;
      const result = this.resolveStoredCoverageCandidate({ stored, target });
      if (result.candidate) {
        candidates.push(result.candidate);
      }
      if (result.rejectedCoverage) {
        diagnostics.rejectedCoverageCountByReason[
          result.rejectedCoverage.reason
        ] =
          (diagnostics.rejectedCoverageCountByReason[
            result.rejectedCoverage.reason
          ] ?? 0) + 1;
        if (
          rejectedCoverage.length <
          DEFAULT_RETAINED_COVERAGE_DIAGNOSTIC_SAMPLE_CAP
        ) {
          rejectedCoverage.push(result.rejectedCoverage);
          diagnostics.allocatedDiagnosticRectCount += 1;
        }
      }
    }
    return {
      candidates: Object.freeze(candidates.sort(compareCoverageEntries)),
      diagnostics,
      rejectedCoverage: Object.freeze(rejectedCoverage),
    };
  }

  private queryLocalRegionIds(
    target: RetainedRegionTarget,
  ): readonly RetainedCommittedRegionId[] {
    const ownerKey = retainedRegionOwnerKey(target.manifest);
    const ids = new Set<RetainedCommittedRegionId>();
    for (const exactKey of retainedCoverageExactKeysForTarget(target)) {
      for (const regionId of this.exactRegionIdsByKey.get(exactKey) ?? []) {
        ids.add(regionId);
      }
    }
    const grid = this.gridRegionIdsByOwner.get(ownerKey);
    if (!grid) {
      return [...ids];
    }
    for (const cellKey of retainedCoverageGridCellKeys(target.contentRect)) {
      for (const regionId of grid.get(cellKey) ?? []) {
        ids.add(regionId);
      }
    }
    return [...ids];
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

  private indexCommittedRegion(
    region: RetainedCommittedRegion<TTextureHandle>,
  ) {
    const ownerKey = retainedRegionOwnerKey(region.manifest);
    const exactKeys = retainedCoverageExactKeysForCommittedRegion(region);
    const gridCellKeys = retainedCoverageGridCellKeys(region.contentRect);
    for (const exactKey of exactKeys) {
      addIndexedRegionId(this.exactRegionIdsByKey, exactKey, region.id);
    }
    const ownerGrid =
      this.gridRegionIdsByOwner.get(ownerKey) ??
      createRetainedCoverageOwnerGrid(this.gridRegionIdsByOwner, ownerKey);
    for (const cellKey of gridCellKeys) {
      addIndexedRegionId(ownerGrid, cellKey, region.id);
    }
    this.indexEntryByRegionId.set(region.id, {
      exactKeys,
      gridCellKeys,
      ownerKey,
      regionId: region.id,
    });
  }

  private removeCommittedRegion(regionId: RetainedCommittedRegionId): void {
    this.unindexCommittedRegion(regionId);
    this.committedRegions.delete(regionId);
  }

  private unindexCommittedRegion(regionId: RetainedCommittedRegionId): void {
    const indexEntry = this.indexEntryByRegionId.get(regionId);
    if (!indexEntry) {
      return;
    }
    for (const exactKey of indexEntry.exactKeys) {
      removeIndexedRegionId(this.exactRegionIdsByKey, exactKey, regionId);
    }
    const ownerGrid = this.gridRegionIdsByOwner.get(indexEntry.ownerKey);
    if (ownerGrid) {
      for (const cellKey of indexEntry.gridCellKeys) {
        removeIndexedRegionId(ownerGrid, cellKey, regionId);
      }
      if (ownerGrid.size === 0) {
        this.gridRegionIdsByOwner.delete(indexEntry.ownerKey);
      }
    }
    this.indexEntryByRegionId.delete(regionId);
  }
}

function createCoverageAccumulator<
  TTextureHandle,
>(): CoverageAccumulator<TTextureHandle> {
  return {
    compatibleCoverage: [],
    diagnostics: createMutableCoveragePlanDiagnostics(),
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
  mergeMutableCoveragePlanDiagnostics(
    accumulator.diagnostics,
    plan.diagnostics,
  );
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
    diagnostics: freezeCoveragePlanDiagnostics(accumulator.diagnostics),
    exactCoverage: Object.freeze(accumulator.exactCoverage),
    protectedRegionIds: Object.freeze([...accumulator.protectedRegionIds]),
    rejectedCoverage: Object.freeze(accumulator.rejectedCoverage),
    uncoveredRegions: Object.freeze(accumulator.uncoveredRegions),
  });
}

function createMutableCoveragePlanDiagnostics(): MutableRetainedCoveragePlanDiagnostics {
  return {
    allocatedDiagnosticRectCount: 0,
    candidateCount: 0,
    compatibilityCheckCount: 0,
    rejectedCoverageCountByReason: {},
    spatialQueryCount: 0,
    visibleRegionCount: 0,
    visibleRegionGroupCount: 0,
  };
}

function mergeMutableCoveragePlanDiagnostics(
  accumulator: MutableRetainedCoveragePlanDiagnostics,
  next: RetainedCoveragePlanDiagnostics,
): void {
  accumulator.allocatedDiagnosticRectCount += next.allocatedDiagnosticRectCount;
  accumulator.candidateCount += next.candidateCount;
  accumulator.compatibilityCheckCount += next.compatibilityCheckCount;
  accumulator.spatialQueryCount += next.spatialQueryCount;
  accumulator.visibleRegionCount += next.visibleRegionCount;
  accumulator.visibleRegionGroupCount += next.visibleRegionGroupCount;
  for (const [reason, count] of Object.entries(
    next.rejectedCoverageCountByReason,
  )) {
    accumulator.rejectedCoverageCountByReason[reason] =
      (accumulator.rejectedCoverageCountByReason[reason] ?? 0) + count;
  }
}

function freezeCoveragePlanDiagnostics(
  diagnostics: MutableRetainedCoveragePlanDiagnostics,
): RetainedCoveragePlanDiagnostics {
  return Object.freeze({
    allocatedDiagnosticRectCount: diagnostics.allocatedDiagnosticRectCount,
    candidateCount: diagnostics.candidateCount,
    compatibilityCheckCount: diagnostics.compatibilityCheckCount,
    rejectedCoverageCountByReason: Object.freeze({
      ...diagnostics.rejectedCoverageCountByReason,
    }),
    spatialQueryCount: diagnostics.spatialQueryCount,
    visibleRegionCount: diagnostics.visibleRegionCount,
    visibleRegionGroupCount: diagnostics.visibleRegionGroupCount,
  });
}

function resolveTargetCoverage<TTextureHandle>({
  candidates,
  target,
}: {
  readonly candidates: readonly RetainedCoverageEntry<TTextureHandle>[];
  readonly target: RetainedRegionTarget;
}): Omit<
  RetainedCoveragePlan<TTextureHandle>,
  "diagnostics" | "rejectedCoverage"
> {
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
  const contentCompatibility = retainedManifestContentMatchesForRect({
    candidate: candidate.manifest,
    target: target.manifest,
    coverageRect,
  });
  if (contentCompatibility === "mismatch") {
    return incompatible("row-content-version-mismatch");
  }
  if (!intersectRects(candidate.clipRect, coverageRect)) {
    return incompatible("clip-mapping-mismatch");
  }
  return {
    coverageRect,
    fidelity: resolveRetainedRegionFidelity({
      candidate,
      contentCompatibility,
      target,
    }),
    kind: "compatible",
    manifest: freezeRegionManifest(candidate.manifest),
  };
}

function resolveRetainedRegionFidelity({
  candidate,
  contentCompatibility,
  target,
}: {
  readonly candidate: Pick<
    RetainedCommittedRegion,
    "contentRect" | "clipRect" | "fidelity"
  >;
  readonly contentCompatibility: Exclude<
    ReturnType<typeof retainedManifestContentMatchesForRect>,
    "mismatch"
  >;
  readonly target: RetainedRegionTarget;
}): Extract<
  RetainedRegionCompatibility,
  { readonly kind: "compatible" }
>["fidelity"] {
  if (contentCompatibility === "deterministic-base") {
    return "deterministic-base";
  }
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
    "deterministic-base": 4,
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
