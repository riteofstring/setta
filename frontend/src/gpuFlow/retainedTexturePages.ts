import {
  RetainedCommittedCoverageMap,
  type RetainedRegionContentSegment,
  type RetainedRegionTextLikeSnapshot,
  type RetainedReplacementTxn,
} from "./retainedCommittedCoverageStore";
import {
  createRetainedCommittedPageLifecycle,
  createRetainedCommittedRegionFromDescriptor,
  createRetainedContentSnapshot,
  createRetainedRegionTargetFromDescriptor,
  isSemanticallyCompatibleRetainedPage,
  type RetainedCommittedPageLifecycle,
  type RetainedCompatibilityRejectReason,
  type RetainedCompatibilityResult,
} from "./retainedContentLifecycle";
import type { GpuRect } from "./viewportMath";

export type RetainedTexturePageDescriptor = {
  readonly contentVersion: number;
  readonly contentSegments?: readonly RetainedRegionContentSegment[];
  readonly devicePixelRatioBucket: number;
  readonly lodLevel: number;
  readonly lodScale: number;
  readonly pixelHeight: number;
  readonly pixelWidth: number;
  readonly scaleKey: string;
  readonly sourceKey: string;
  readonly sourceRectCss: GpuRect;
  readonly sourceVersion: number;
  readonly sourceWindowCss: GpuRect;
  readonly surfaceId: string;
  readonly textLikeSnapshots?: readonly RetainedRegionTextLikeSnapshot[];
  readonly tileColumn: number;
  readonly tileRow: number;
  readonly viewportZoomBucket: number;
};

export type PendingRetainedTexturePage = {
  readonly byteSize: number;
  readonly createdFrame: number;
  readonly descriptor: RetainedTexturePageDescriptor;
  readonly key: string;
  readonly replacementTxn: RetainedReplacementTxn;
};

export type CommittedRetainedTexturePage<TResource = unknown> = {
  readonly byteSize: number;
  readonly committedFrame: number;
  readonly descriptor: RetainedTexturePageDescriptor;
  readonly key: string;
  readonly lastUsedFrame: number;
  readonly resource: TResource;
} & RetainedCommittedPageLifecycle;

export type RetiredRetainedTexturePage<TResource = unknown> = {
  readonly byteSize: number;
  readonly descriptor: RetainedTexturePageDescriptor;
  readonly key: string;
  readonly resource: TResource;
  readonly retiredFrame: number;
};

export type RetainedTexturePageCacheSnapshot = {
  readonly committedBytes: number;
  readonly committedCount: number;
  readonly pendingBytes: number;
  readonly pendingCount: number;
  readonly retiredBytes: number;
  readonly retiredCount: number;
  readonly totalBytes: number;
};

export type RetainedTexturePageLookup = {
  readonly contentVersion: number;
  readonly contentSegments?: readonly RetainedRegionContentSegment[];
  readonly devicePixelRatioBucket: number;
  readonly pixelHeight?: number | undefined;
  readonly pixelWidth?: number | undefined;
  readonly sourceKey: string;
  readonly sourceRectCss: GpuRect;
  readonly sourceVersion: number;
  readonly sourceWindowCss?: GpuRect | undefined;
  readonly surfaceId: string;
  readonly targetLodScale: number;
  readonly textLikeSnapshots?: readonly RetainedRegionTextLikeSnapshot[];
  readonly tileColumn?: number | undefined;
  readonly tileRow?: number | undefined;
  readonly usedFrame?: number | undefined;
  readonly viewportZoomBucket: number;
};

export type RetainedTexturePageRejectedCoverage = {
  readonly reason: RetainedCompatibilityRejectReason;
  readonly rect: GpuRect;
};

export type RetainedTexturePageCoverageCandidate<TResource = unknown> = {
  readonly compatibility: Extract<
    RetainedCompatibilityResult,
    { readonly kind: "compatible" }
  >;
  readonly page: CommittedRetainedTexturePage<TResource>;
};

export type RetainedTexturePageEvictionOptions = {
  readonly frame?: number | undefined;
  readonly maxBytes: number;
  readonly protectedPageKeys?:
    | ReadonlySet<string>
    | readonly string[]
    | undefined;
};

export type RetainedTexturePageEvictionResult = {
  readonly evictedBytes: number;
  readonly evictedKeys: readonly string[];
  readonly remainingBytes: number;
};

export type RetainedTexturePageRetirementResult = {
  readonly destroyedBytes: number;
  readonly destroyedCount: number;
};

export type RetainedTexturePageRetirementOptions = {
  readonly retiredFrameThrough?: number | undefined;
};

export type RetainedTexturePageCacheOptions<TResource> = {
  readonly destroyResource?: ((resource: TResource) => void) | undefined;
};

export class RetainedTexturePageCache<TResource = unknown> {
  private readonly committedPageKeysBySurface = new Map<string, Set<string>>();
  private readonly committedPages = new Map<
    string,
    CommittedRetainedTexturePage<TResource>
  >();
  private readonly coverageStore = new RetainedCommittedCoverageMap<string>();
  private readonly destroyResource: ((resource: TResource) => void) | undefined;
  private readonly pendingPages = new Map<string, PendingRetainedTexturePage>();
  private retiredPages: RetiredRetainedTexturePage<TResource>[] = [];

  constructor(options: RetainedTexturePageCacheOptions<TResource> = {}) {
    this.destroyResource = options.destroyResource;
  }

  clear() {
    for (const page of this.committedPages.values()) {
      this.destroyResource?.(page.resource);
    }
    for (const page of this.retiredPages) {
      this.destroyResource?.(page.resource);
    }
    this.committedPages.clear();
    this.committedPageKeysBySurface.clear();
    this.coverageStore.clear();
    this.pendingPages.clear();
    this.retiredPages = [];
  }

  commitPage({
    descriptor,
    frame = 0,
    replacementTxn,
    resource,
  }: {
    readonly descriptor: RetainedTexturePageDescriptor;
    readonly frame?: number | undefined;
    readonly replacementTxn?: RetainedReplacementTxn | undefined;
    readonly resource: TResource;
  }): CommittedRetainedTexturePage<TResource> {
    const normalizedDescriptor = normalizePageDescriptor(descriptor);
    const key = retainedTexturePageKey(normalizedDescriptor);
    const existing = this.committedPages.get(key);
    const page: CommittedRetainedTexturePage<TResource> = {
      byteSize: estimatePageByteSize(normalizedDescriptor),
      committedFrame: frame,
      descriptor: normalizedDescriptor,
      key,
      lastUsedFrame: frame,
      resource,
      ...createRetainedCommittedPageLifecycle(normalizedDescriptor),
    };
    const txn =
      replacementTxn ??
      this.coverageStore.beginReplacement(
        createRetainedRegionTargetFromDescriptor(normalizedDescriptor),
      );
    this.coverageStore.commitReplacement(txn, {
      ...createRetainedCommittedRegionFromDescriptor({
        descriptor: normalizedDescriptor,
        generation: frame,
        id: key,
        textureHandle: key,
      }),
      byteSize: page.byteSize,
    });
    if (existing) {
      this.retireCommittedPage(existing, frame);
    }
    this.pendingPages.delete(key);
    this.committedPages.set(key, page);
    this.indexCommittedPage(page);
    return page;
  }

  commitPendingPage({
    frame = 0,
    key,
    resource,
  }: {
    readonly frame?: number | undefined;
    readonly key: string;
    readonly resource: TResource;
  }): CommittedRetainedTexturePage<TResource> {
    const pendingPage = this.pendingPages.get(key);
    if (!pendingPage) {
      throw new Error(`Retained texture page "${key}" is not pending.`);
    }
    return this.commitPage({
      descriptor: pendingPage.descriptor,
      frame,
      replacementTxn: pendingPage.replacementTxn,
      resource,
    });
  }

  cancelPendingPage(key: string) {
    const pendingPage = this.pendingPages.get(key);
    if (pendingPage) {
      this.coverageStore.rejectReplacement(
        pendingPage.replacementTxn,
        "obsolete",
      );
      this.pendingPages.delete(key);
    }
  }

  evictToBudget({
    frame = 0,
    maxBytes,
    protectedPageKeys,
  }: RetainedTexturePageEvictionOptions): RetainedTexturePageEvictionResult {
    if (!Number.isFinite(maxBytes) || maxBytes < 0) {
      throw new Error("Retained texture page cache maxBytes must be finite.");
    }
    const protectedKeys = new Set(protectedPageKeys ?? []);
    const evictionReport = this.coverageStore.evictToBudget({
      maxBytes,
      protectedRegionIds: [...protectedKeys],
    });
    let remainingBytes = this.snapshot().committedBytes;
    const evictedKeys: string[] = [];
    let evictedBytes = 0;

    for (const key of evictionReport.evictedRegionIds) {
      const page = this.committedPages.get(key);
      if (!page) {
        continue;
      }
      this.committedPages.delete(page.key);
      this.unindexCommittedPage(page);
      this.retireCommittedPage(page, frame);
      evictedBytes += page.byteSize;
      evictedKeys.push(page.key);
      remainingBytes -= page.byteSize;
    }

    return {
      evictedBytes,
      evictedKeys,
      remainingBytes,
    };
  }

  getBestCommittedPage({
    contentVersion,
    contentSegments,
    devicePixelRatioBucket,
    sourceKey,
    sourceRectCss,
    sourceVersion,
    sourceWindowCss,
    surfaceId,
    targetLodScale,
    textLikeSnapshots,
    usedFrame,
    viewportZoomBucket,
  }: RetainedTexturePageLookup): CommittedRetainedTexturePage<TResource> | null {
    const lookupRect = normalizeRect("sourceRectCss", sourceRectCss);
    const candidates = this.getCommittedPagesForCoverage({
      contentVersion,
      devicePixelRatioBucket,
      sourceKey,
      sourceRectCss: lookupRect,
      sourceVersion,
      sourceWindowCss,
      surfaceId,
      targetLodScale,
      textLikeSnapshots,
      viewportZoomBucket,
      contentSegments,
    }).filter((page) =>
      rectContains(page.descriptor.sourceRectCss, lookupRect),
    );
    const page = candidates[0];
    if (!page) {
      return null;
    }
    return usedFrame === undefined
      ? page
      : this.markCommittedPageUsed(page.key, usedFrame);
  }

  getCommittedPagesForCoverage({
    contentVersion,
    contentSegments,
    devicePixelRatioBucket,
    pixelHeight,
    pixelWidth,
    sourceKey,
    sourceRectCss,
    sourceVersion,
    sourceWindowCss,
    surfaceId,
    targetLodScale,
    textLikeSnapshots,
    tileColumn = 0,
    tileRow = 0,
    viewportZoomBucket,
  }: Omit<
    RetainedTexturePageLookup,
    "usedFrame"
  >): readonly CommittedRetainedTexturePage<TResource>[] {
    return this.getCommittedPageCoverageCandidates({
      contentVersion,
      devicePixelRatioBucket,
      sourceKey,
      sourceRectCss,
      sourceVersion,
      sourceWindowCss,
      surfaceId,
      targetLodScale,
      textLikeSnapshots,
      tileColumn,
      tileRow,
      viewportZoomBucket,
      pixelHeight,
      pixelWidth,
      contentSegments,
    }).map((candidate) => candidate.page);
  }

  getCommittedPageCoverageCandidates({
    contentVersion,
    contentSegments,
    devicePixelRatioBucket,
    pixelHeight,
    pixelWidth,
    sourceKey,
    sourceRectCss,
    sourceVersion,
    sourceWindowCss,
    surfaceId,
    targetLodScale,
    textLikeSnapshots,
    tileColumn = 0,
    tileRow = 0,
    viewportZoomBucket,
  }: Omit<
    RetainedTexturePageLookup,
    "usedFrame"
  >): readonly RetainedTexturePageCoverageCandidate<TResource>[] {
    const lookupRect = normalizeRect("sourceRectCss", sourceRectCss);
    const snapshot = createRetainedContentSnapshot({
      contentVersion,
      contentSegments,
      devicePixelRatioBucket,
      lodLevel: retainedTexturePageLodLevel(targetLodScale),
      lodScale: targetLodScale,
      pixelHeight:
        pixelHeight ??
        Math.max(1, Math.ceil(lookupRect.height * targetLodScale)),
      pixelWidth:
        pixelWidth ?? Math.max(1, Math.ceil(lookupRect.width * targetLodScale)),
      scaleKey: retainedTexturePageScaleKey(targetLodScale),
      sourceKey,
      sourceRectCss: lookupRect,
      sourceVersion,
      sourceWindowCss: sourceWindowCss ?? lookupRect,
      surfaceId,
      textLikeSnapshots,
      tileColumn,
      tileRow,
      viewportZoomBucket,
    });
    const plan = this.coverageStore.queryVisibleCoverage({
      regions: [snapshot.target],
    });
    return [...plan.exactCoverage, ...plan.compatibleCoverage]
      .flatMap((entry) => {
        const page = this.committedPages.get(entry.region.id);
        if (!page) {
          return [];
        }
        const compatibility = isSemanticallyCompatibleRetainedPage(
          page,
          snapshot,
          lookupRect,
        );
        return compatibility.kind === "compatible"
          ? [{ compatibility, page }]
          : [];
      })
      .sort((left, right) =>
        compareCompatiblePagesForTarget({
          contentVersion,
          left: left.page,
          right: right.page,
          targetLodScale,
        }),
      );
  }

  getRejectedCommittedPagesForCoverage({
    contentVersion,
    contentSegments,
    devicePixelRatioBucket,
    pixelHeight,
    pixelWidth,
    sourceKey,
    sourceRectCss,
    sourceVersion,
    sourceWindowCss,
    surfaceId,
    targetLodScale,
    textLikeSnapshots,
    tileColumn = 0,
    tileRow = 0,
    viewportZoomBucket,
  }: Omit<
    RetainedTexturePageLookup,
    "usedFrame"
  >): readonly RetainedTexturePageRejectedCoverage[] {
    const lookupRect = normalizeRect("sourceRectCss", sourceRectCss);
    const snapshot = createRetainedContentSnapshot({
      contentVersion,
      contentSegments,
      devicePixelRatioBucket,
      lodLevel: retainedTexturePageLodLevel(targetLodScale),
      lodScale: targetLodScale,
      pixelHeight:
        pixelHeight ??
        Math.max(1, Math.ceil(lookupRect.height * targetLodScale)),
      pixelWidth:
        pixelWidth ?? Math.max(1, Math.ceil(lookupRect.width * targetLodScale)),
      scaleKey: retainedTexturePageScaleKey(targetLodScale),
      sourceKey,
      sourceRectCss: lookupRect,
      sourceVersion,
      sourceWindowCss: sourceWindowCss ?? lookupRect,
      surfaceId,
      textLikeSnapshots,
      tileColumn,
      tileRow,
      viewportZoomBucket,
    });
    return this.coverageStore
      .queryVisibleCoverage({ regions: [snapshot.target] })
      .rejectedCoverage.map((entry) => ({
        reason: entry.reason,
        rect: entry.rect,
      }));
  }

  markCommittedPageUsed(
    key: string,
    usedFrame: number,
  ): CommittedRetainedTexturePage<TResource> | null {
    const page = this.committedPages.get(key);
    if (!page) {
      return null;
    }
    const updatedPage = { ...page, lastUsedFrame: usedFrame };
    this.committedPages.set(key, updatedPage);
    return updatedPage;
  }

  getCommittedPage(
    key: string,
  ): CommittedRetainedTexturePage<TResource> | undefined {
    return this.committedPages.get(key);
  }

  getPendingPage(key: string): PendingRetainedTexturePage | undefined {
    return this.pendingPages.get(key);
  }

  destroyRetiredPages({
    retiredFrameThrough = Number.POSITIVE_INFINITY,
  }: RetainedTexturePageRetirementOptions = {}): RetainedTexturePageRetirementResult {
    const normalizedRetiredFrameThrough =
      normalizeRetiredFrameThrough(retiredFrameThrough);
    const retainedPages: RetiredRetainedTexturePage<TResource>[] = [];
    let destroyedBytes = 0;
    let destroyedCount = 0;
    for (const page of this.retiredPages) {
      if (page.retiredFrame > normalizedRetiredFrameThrough) {
        retainedPages.push(page);
        continue;
      }
      this.destroyResource?.(page.resource);
      destroyedBytes += page.byteSize;
      destroyedCount += 1;
    }
    this.retiredPages = retainedPages;
    return { destroyedBytes, destroyedCount };
  }

  snapshot(): RetainedTexturePageCacheSnapshot {
    const committedBytes = sumBytes(this.committedPages.values());
    const pendingBytes = sumBytes(this.pendingPages.values());
    const retiredBytes = sumBytes(this.retiredPages);
    return {
      committedBytes,
      committedCount: this.committedPages.size,
      pendingBytes,
      pendingCount: this.pendingPages.size,
      retiredBytes,
      retiredCount: this.retiredPages.length,
      totalBytes: committedBytes + pendingBytes + retiredBytes,
    };
  }

  stagePendingPage({
    descriptor,
    frame = 0,
  }: {
    readonly descriptor: RetainedTexturePageDescriptor;
    readonly frame?: number | undefined;
  }): PendingRetainedTexturePage {
    const normalizedDescriptor = normalizePageDescriptor(descriptor);
    const key = retainedTexturePageKey(normalizedDescriptor);
    this.cancelPendingPage(key);
    const page: PendingRetainedTexturePage = {
      byteSize: estimatePageByteSize(normalizedDescriptor),
      createdFrame: frame,
      descriptor: normalizedDescriptor,
      key,
      replacementTxn: this.coverageStore.beginReplacement(
        createRetainedRegionTargetFromDescriptor(normalizedDescriptor),
      ),
    };
    this.pendingPages.set(key, page);
    return page;
  }

  private indexCommittedPage(page: CommittedRetainedTexturePage<TResource>) {
    addCommittedPageIndexKey({
      indexes: this.committedPageKeysBySurface,
      key: page.descriptor.surfaceId,
      pageKey: page.key,
    });
  }

  private unindexCommittedPage(page: CommittedRetainedTexturePage<TResource>) {
    removeCommittedPageIndexKey({
      indexes: this.committedPageKeysBySurface,
      key: page.descriptor.surfaceId,
      pageKey: page.key,
    });
  }

  private retireCommittedPage(
    page: CommittedRetainedTexturePage<TResource>,
    retiredFrame: number,
  ) {
    this.retiredPages.push({
      byteSize: page.byteSize,
      descriptor: page.descriptor,
      key: page.key,
      resource: page.resource,
      retiredFrame,
    });
  }
}

export function retainedTexturePageKey(
  descriptor: RetainedTexturePageDescriptor,
): string {
  const normalized = normalizePageDescriptor(descriptor);
  return [
    normalized.surfaceId,
    normalized.contentVersion,
    normalized.sourceVersion,
    normalized.sourceKey,
    normalized.sourceRectCss.x,
    normalized.sourceRectCss.y,
    normalized.sourceRectCss.width,
    normalized.sourceRectCss.height,
    normalized.scaleKey,
    normalized.lodLevel,
    normalized.pixelWidth,
    normalized.pixelHeight,
    normalized.tileColumn,
    normalized.tileRow,
    normalized.devicePixelRatioBucket,
    normalized.viewportZoomBucket,
  ].join(":");
}

function addCommittedPageIndexKey({
  indexes,
  key,
  pageKey,
}: {
  readonly indexes: Map<string, Set<string>>;
  readonly key: string;
  readonly pageKey: string;
}) {
  const pageKeys = indexes.get(key) ?? createCommittedPageIndex(indexes, key);
  pageKeys.add(pageKey);
}

function removeCommittedPageIndexKey({
  indexes,
  key,
  pageKey,
}: {
  readonly indexes: Map<string, Set<string>>;
  readonly key: string;
  readonly pageKey: string;
}) {
  const pageKeys = indexes.get(key);
  if (!pageKeys) {
    return;
  }
  pageKeys.delete(pageKey);
  if (pageKeys.size === 0) {
    indexes.delete(key);
  }
}

function createCommittedPageIndex(
  indexes: Map<string, Set<string>>,
  key: string,
): Set<string> {
  const pageKeys = new Set<string>();
  indexes.set(key, pageKeys);
  return pageKeys;
}

export function estimatePageByteSize({
  pixelHeight,
  pixelWidth,
}: Pick<RetainedTexturePageDescriptor, "pixelHeight" | "pixelWidth">): number {
  return pixelHeight * pixelWidth * 4;
}

export function retainedTexturePageLodLevel(lodScale: number): number {
  return Math.round(
    Math.log2(normalizeFinitePositiveNumber("lodScale", lodScale)) * 1024,
  );
}

export function retainedTexturePageScaleKey(lodScale: number): string {
  return `scale=${normalizeFinitePositiveNumber("lodScale", lodScale)}`;
}

function normalizePageDescriptor(
  descriptor: RetainedTexturePageDescriptor,
): RetainedTexturePageDescriptor {
  const surfaceId = normalizeSurfaceId(descriptor.surfaceId);
  const contentVersion = normalizeFiniteNumber(
    "contentVersion",
    descriptor.contentVersion,
  );
  const lodScale = normalizeFinitePositiveNumber(
    "lodScale",
    descriptor.lodScale,
  );
  const devicePixelRatioBucket = normalizeFinitePositiveNumber(
    "devicePixelRatioBucket",
    descriptor.devicePixelRatioBucket,
  );
  const lodLevel = normalizeFiniteInteger("lodLevel", descriptor.lodLevel);
  const expectedLodLevel = retainedTexturePageLodLevel(lodScale);
  if (lodLevel !== expectedLodLevel) {
    throw new Error(
      `Retained texture page lodLevel ${lodLevel} does not match lodScale ${lodScale}.`,
    );
  }
  const scaleKey = normalizeScaleKey(descriptor.scaleKey);
  const expectedScaleKey = retainedTexturePageScaleKey(lodScale);
  if (scaleKey !== expectedScaleKey) {
    throw new Error(
      `Retained texture page scaleKey "${scaleKey}" does not match lodScale ${lodScale}.`,
    );
  }
  const sourceKey = normalizeSourceKey(descriptor.sourceKey);
  const sourceVersion = normalizeFiniteNumber(
    "sourceVersion",
    descriptor.sourceVersion,
  );
  const viewportZoomBucket = normalizeFiniteNumber(
    "viewportZoomBucket",
    descriptor.viewportZoomBucket,
  );
  const pixelWidth = normalizeFinitePositiveInteger(
    "pixelWidth",
    descriptor.pixelWidth,
  );
  const pixelHeight = normalizeFinitePositiveInteger(
    "pixelHeight",
    descriptor.pixelHeight,
  );
  const tileColumn = normalizeFiniteNonNegativeInteger(
    "tileColumn",
    descriptor.tileColumn,
  );
  const tileRow = normalizeFiniteNonNegativeInteger(
    "tileRow",
    descriptor.tileRow,
  );
  return {
    contentVersion,
    contentSegments:
      descriptor.contentSegments === undefined
        ? undefined
        : normalizeContentSegments(descriptor.contentSegments),
    devicePixelRatioBucket,
    lodLevel,
    lodScale,
    pixelHeight,
    pixelWidth,
    scaleKey,
    sourceKey,
    sourceRectCss: normalizeRect("sourceRectCss", descriptor.sourceRectCss),
    sourceVersion,
    sourceWindowCss: normalizeRect(
      "sourceWindowCss",
      descriptor.sourceWindowCss,
    ),
    surfaceId,
    textLikeSnapshots:
      descriptor.textLikeSnapshots === undefined
        ? undefined
        : normalizeTextLikeSnapshots(descriptor.textLikeSnapshots),
    tileColumn,
    tileRow,
    viewportZoomBucket,
  };
}

function normalizeContentSegments(
  segments: readonly RetainedRegionContentSegment[],
): readonly RetainedRegionContentSegment[] {
  return segments
    .map((segment) => ({
      contentVersion: normalizeFiniteNumber(
        "contentSegments.contentVersion",
        segment.contentVersion,
      ),
      id: normalizeSourceKey(segment.id),
      rectCss: normalizeRect("contentSegments.rectCss", segment.rectCss),
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function normalizeTextLikeSnapshots(
  snapshots: readonly RetainedRegionTextLikeSnapshot[],
): readonly RetainedRegionTextLikeSnapshot[] {
  return snapshots
    .map((snapshot) => ({
      rectCss: normalizeRect("textLikeSnapshots.rectCss", snapshot.rectCss),
      rowId: normalizeSourceKey(snapshot.rowId),
      sourceId: normalizeSourceKey(snapshot.sourceId),
      sourceKey: normalizeSourceKey(snapshot.sourceKey),
    }))
    .sort(
      (left, right) =>
        left.rowId.localeCompare(right.rowId) ||
        left.sourceId.localeCompare(right.sourceId) ||
        left.sourceKey.localeCompare(right.sourceKey),
    );
}

function compareCompatiblePagesForTarget({
  contentVersion,
  left,
  right,
  targetLodScale,
}: {
  readonly contentVersion: number;
  readonly left: CommittedRetainedTexturePage;
  readonly right: CommittedRetainedTexturePage;
  readonly targetLodScale: number;
}): number {
  const targetLodLevel = retainedTexturePageLodLevel(targetLodScale);
  return (
    staleContentRank(left, contentVersion) -
      staleContentRank(right, contentVersion) ||
    Math.abs(left.descriptor.lodLevel - targetLodLevel) -
      Math.abs(right.descriptor.lodLevel - targetLodLevel) ||
    right.descriptor.lodLevel - left.descriptor.lodLevel ||
    rectArea(left.descriptor.sourceRectCss) -
      rectArea(right.descriptor.sourceRectCss) ||
    right.lastUsedFrame - left.lastUsedFrame
  );
}

function staleContentRank(
  page: CommittedRetainedTexturePage,
  contentVersion: number,
): number {
  return page.descriptor.contentVersion === contentVersion ? 0 : 1;
}

function rectContains(container: GpuRect, rect: GpuRect): boolean {
  return (
    container.x <= rect.x &&
    container.y <= rect.y &&
    container.x + container.width >= rect.x + rect.width &&
    container.y + container.height >= rect.y + rect.height
  );
}

function rectArea(rect: GpuRect): number {
  return rect.width * rect.height;
}

function normalizeRect(name: string, rect: GpuRect): GpuRect {
  const x = normalizeFiniteNumber(`${name}.x`, rect.x);
  const y = normalizeFiniteNumber(`${name}.y`, rect.y);
  const width = normalizeFinitePositiveNumber(`${name}.width`, rect.width);
  const height = normalizeFinitePositiveNumber(`${name}.height`, rect.height);
  return { height, width, x, y };
}

function sumBytes(pages: Iterable<{ readonly byteSize: number }>): number {
  let total = 0;
  for (const page of pages) {
    total += page.byteSize;
  }
  return total;
}

function normalizeSurfaceId(surfaceId: string): string {
  if (!surfaceId) {
    throw new Error("Retained texture page requires surfaceId.");
  }
  return surfaceId;
}

function normalizeScaleKey(scaleKey: string): string {
  if (!scaleKey) {
    throw new Error("Retained texture page requires scaleKey.");
  }
  return scaleKey;
}

function normalizeSourceKey(sourceKey: string): string {
  if (!sourceKey) {
    throw new Error("Retained texture page requires sourceKey.");
  }
  return sourceKey;
}

function normalizeFiniteNumber(name: string, value: number): number {
  if (!Number.isFinite(value)) {
    throw new Error(`Retained texture page ${name} must be finite.`);
  }
  return value;
}

function normalizeFinitePositiveNumber(name: string, value: number): number {
  const normalized = normalizeFiniteNumber(name, value);
  if (normalized <= 0) {
    throw new Error(`Retained texture page ${name} must be greater than zero.`);
  }
  return normalized;
}

function normalizeFinitePositiveInteger(name: string, value: number): number {
  const normalized = normalizeFinitePositiveNumber(name, value);
  if (!Number.isInteger(normalized)) {
    throw new Error(`Retained texture page ${name} must be an integer.`);
  }
  return normalized;
}

function normalizeFiniteInteger(name: string, value: number): number {
  const normalized = normalizeFiniteNumber(name, value);
  if (!Number.isInteger(normalized)) {
    throw new Error(`Retained texture page ${name} must be an integer.`);
  }
  return normalized;
}

function normalizeFiniteNonNegativeInteger(
  name: string,
  value: number,
): number {
  const normalized = normalizeFiniteNumber(name, value);
  if (!Number.isInteger(normalized) || normalized < 0) {
    throw new Error(
      `Retained texture page ${name} must be a non-negative integer.`,
    );
  }
  return normalized;
}

function normalizeRetiredFrameThrough(value: number): number {
  if (value === Number.POSITIVE_INFINITY) {
    return value;
  }
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(
      "Retained texture page retiredFrameThrough must be finite, non-negative, or positive infinity.",
    );
  }
  return value;
}
