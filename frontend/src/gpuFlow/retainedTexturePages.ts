import type { GpuRect } from "./viewportMath";

export type RetainedTexturePageDescriptor = {
  readonly contentVersion: number;
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
  readonly tileColumn: number;
  readonly tileRow: number;
  readonly viewportZoomBucket: number;
};

export type PendingRetainedTexturePage = {
  readonly byteSize: number;
  readonly createdFrame: number;
  readonly descriptor: RetainedTexturePageDescriptor;
  readonly key: string;
};

export type CommittedRetainedTexturePage<TResource = unknown> = {
  readonly byteSize: number;
  readonly committedFrame: number;
  readonly descriptor: RetainedTexturePageDescriptor;
  readonly key: string;
  readonly lastUsedFrame: number;
  readonly resource: TResource;
};

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
  readonly allowStaleContent?: boolean | undefined;
  readonly contentVersion: number;
  readonly devicePixelRatioBucket: number;
  readonly sourceKey: string;
  readonly sourceRectCss: GpuRect;
  readonly sourceVersion: number;
  readonly sourceWindowCss?: GpuRect | undefined;
  readonly surfaceId: string;
  readonly targetLodScale: number;
  readonly usedFrame?: number | undefined;
  readonly viewportZoomBucket: number;
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

const EMPTY_PAGE_KEY_SET = new Set<string>();

export class RetainedTexturePageCache<TResource = unknown> {
  private readonly committedPageKeysBySurface = new Map<string, Set<string>>();
  private readonly committedPages = new Map<
    string,
    CommittedRetainedTexturePage<TResource>
  >();
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
    this.pendingPages.clear();
    this.retiredPages = [];
  }

  commitPage({
    descriptor,
    frame = 0,
    resource,
  }: {
    readonly descriptor: RetainedTexturePageDescriptor;
    readonly frame?: number | undefined;
    readonly resource: TResource;
  }): CommittedRetainedTexturePage<TResource> {
    const normalizedDescriptor = normalizePageDescriptor(descriptor);
    const key = retainedTexturePageKey(normalizedDescriptor);
    const existing = this.committedPages.get(key);
    if (existing) {
      this.retireCommittedPage(existing, frame);
    }
    this.pendingPages.delete(key);
    const page: CommittedRetainedTexturePage<TResource> = {
      byteSize: estimatePageByteSize(normalizedDescriptor),
      committedFrame: frame,
      descriptor: normalizedDescriptor,
      key,
      lastUsedFrame: frame,
      resource,
    };
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
      resource,
    });
  }

  cancelPendingPage(key: string) {
    this.pendingPages.delete(key);
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
    let remainingBytes = this.snapshot().committedBytes;
    const evictedKeys: string[] = [];
    let evictedBytes = 0;

    for (const page of this.evictableCommittedPages(protectedKeys)) {
      if (remainingBytes <= maxBytes) {
        break;
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
    devicePixelRatioBucket,
    sourceKey,
    sourceRectCss,
    sourceVersion,
    sourceWindowCss,
    surfaceId,
    targetLodScale,
    usedFrame,
    viewportZoomBucket,
  }: RetainedTexturePageLookup): CommittedRetainedTexturePage<TResource> | null {
    const lookupRect = normalizeRect("sourceRectCss", sourceRectCss);
    void sourceWindowCss;
    const candidates = this.getCommittedPagesForCoverage({
      contentVersion,
      devicePixelRatioBucket,
      sourceKey,
      sourceRectCss: lookupRect,
      sourceVersion,
      surfaceId,
      targetLodScale,
      viewportZoomBucket,
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
    allowStaleContent = false,
    contentVersion,
    devicePixelRatioBucket,
    sourceKey,
    sourceRectCss,
    sourceVersion,
    surfaceId,
    targetLodScale,
    viewportZoomBucket,
  }: Omit<
    RetainedTexturePageLookup,
    "usedFrame"
  >): readonly CommittedRetainedTexturePage<TResource>[] {
    const lookupRect = normalizeRect("sourceRectCss", sourceRectCss);
    void viewportZoomBucket;
    return this.getCommittedPagesForLookup({ surfaceId })
      .filter(
        (page) =>
          (allowStaleContent ||
            page.descriptor.contentVersion === contentVersion) &&
          page.descriptor.devicePixelRatioBucket === devicePixelRatioBucket &&
          page.descriptor.sourceKey === sourceKey &&
          page.descriptor.sourceVersion === sourceVersion &&
          rectsIntersect(page.descriptor.sourceRectCss, lookupRect),
      )
      .sort((left, right) =>
        compareFallbackPagesForTarget({
          contentVersion,
          left,
          right,
          targetLodScale,
        }),
      );
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
    const page: PendingRetainedTexturePage = {
      byteSize: estimatePageByteSize(normalizedDescriptor),
      createdFrame: frame,
      descriptor: normalizedDescriptor,
      key,
    };
    this.pendingPages.set(key, page);
    return page;
  }

  private evictableCommittedPages(
    protectedKeys: ReadonlySet<string>,
  ): readonly CommittedRetainedTexturePage<TResource>[] {
    return [...this.committedPages.values()]
      .filter((page) => !protectedKeys.has(page.key))
      .sort(compareEvictablePages);
  }

  private getCommittedPagesForLookup({
    surfaceId,
  }: {
    readonly surfaceId: string;
  }): readonly CommittedRetainedTexturePage<TResource>[] {
    const keys =
      this.committedPageKeysBySurface.get(surfaceId) ?? EMPTY_PAGE_KEY_SET;
    return [...keys].flatMap((key) => {
      const page = this.committedPages.get(key);
      return page ? [page] : [];
    });
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
    tileColumn,
    tileRow,
    viewportZoomBucket,
  };
}

function compareFallbackPagesForTarget({
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

function rectsIntersect(left: GpuRect, right: GpuRect): boolean {
  return (
    left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y
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

function compareEvictablePages<TResource>(
  left: CommittedRetainedTexturePage<TResource>,
  right: CommittedRetainedTexturePage<TResource>,
): number {
  return (
    right.descriptor.lodLevel - left.descriptor.lodLevel ||
    left.lastUsedFrame - right.lastUsedFrame ||
    right.byteSize - left.byteSize ||
    left.key.localeCompare(right.key)
  );
}
