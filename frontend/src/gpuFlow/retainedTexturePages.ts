import type { GpuRect } from "./viewportMath";

export type RetainedTexturePageDescriptor = {
  readonly contentVersion: number;
  readonly lodScale: number;
  readonly pixelHeight: number;
  readonly pixelWidth: number;
  readonly sourceRectCss: GpuRect;
  readonly surfaceId: string;
  readonly tileColumn: number;
  readonly tileRow: number;
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

export type RetainedTexturePageCacheSnapshot = {
  readonly committedBytes: number;
  readonly committedCount: number;
  readonly pendingBytes: number;
  readonly pendingCount: number;
  readonly totalBytes: number;
};

export type RetainedTexturePageLookup = {
  readonly contentVersion: number;
  readonly sourceRectCss: GpuRect;
  readonly surfaceId: string;
  readonly targetLodScale: number;
  readonly usedFrame?: number | undefined;
};

export type RetainedTexturePageEvictionOptions = {
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

export type RetainedTexturePageCacheOptions<TResource> = {
  readonly destroyResource?: ((resource: TResource) => void) | undefined;
};

export class RetainedTexturePageCache<TResource = unknown> {
  private readonly committedPages = new Map<
    string,
    CommittedRetainedTexturePage<TResource>
  >();
  private readonly destroyResource: ((resource: TResource) => void) | undefined;
  private readonly pendingPages = new Map<string, PendingRetainedTexturePage>();

  constructor(options: RetainedTexturePageCacheOptions<TResource> = {}) {
    this.destroyResource = options.destroyResource;
  }

  clear() {
    for (const page of this.committedPages.values()) {
      this.destroyResource?.(page.resource);
    }
    this.committedPages.clear();
    this.pendingPages.clear();
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
      this.destroyResource?.(existing.resource);
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

  evictToBudget({
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
      this.destroyResource?.(page.resource);
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
    sourceRectCss,
    surfaceId,
    targetLodScale,
    usedFrame,
  }: RetainedTexturePageLookup): CommittedRetainedTexturePage<TResource> | null {
    const lookupRect = normalizeRect("sourceRectCss", sourceRectCss);
    const candidates = [...this.committedPages.values()]
      .filter(
        (page) =>
          page.descriptor.surfaceId === surfaceId &&
          page.descriptor.contentVersion === contentVersion &&
          page.descriptor.lodScale <= targetLodScale &&
          rectContains(page.descriptor.sourceRectCss, lookupRect),
      )
      .sort(compareFallbackPages);
    const page = candidates[0];
    if (!page) {
      return null;
    }
    if (usedFrame !== undefined) {
      const updatedPage = { ...page, lastUsedFrame: usedFrame };
      this.committedPages.set(page.key, updatedPage);
      return updatedPage;
    }
    return page;
  }

  getCommittedPage(
    key: string,
  ): CommittedRetainedTexturePage<TResource> | undefined {
    return this.committedPages.get(key);
  }

  getPendingPage(key: string): PendingRetainedTexturePage | undefined {
    return this.pendingPages.get(key);
  }

  snapshot(): RetainedTexturePageCacheSnapshot {
    const committedBytes = sumBytes(this.committedPages.values());
    const pendingBytes = sumBytes(this.pendingPages.values());
    return {
      committedBytes,
      committedCount: this.committedPages.size,
      pendingBytes,
      pendingCount: this.pendingPages.size,
      totalBytes: committedBytes + pendingBytes,
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
}

export function retainedTexturePageKey(
  descriptor: RetainedTexturePageDescriptor,
): string {
  const normalized = normalizePageDescriptor(descriptor);
  return [
    normalized.surfaceId,
    normalized.contentVersion,
    normalized.sourceRectCss.x,
    normalized.sourceRectCss.y,
    normalized.sourceRectCss.width,
    normalized.sourceRectCss.height,
    normalized.lodScale,
    normalized.pixelWidth,
    normalized.pixelHeight,
    normalized.tileColumn,
    normalized.tileRow,
  ].join(":");
}

export function estimatePageByteSize({
  pixelHeight,
  pixelWidth,
}: Pick<RetainedTexturePageDescriptor, "pixelHeight" | "pixelWidth">): number {
  return pixelHeight * pixelWidth * 4;
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
    lodScale,
    pixelHeight,
    pixelWidth,
    sourceRectCss: normalizeRect("sourceRectCss", descriptor.sourceRectCss),
    surfaceId,
    tileColumn,
    tileRow,
  };
}

function compareFallbackPages(
  left: CommittedRetainedTexturePage,
  right: CommittedRetainedTexturePage,
): number {
  return (
    right.descriptor.lodScale - left.descriptor.lodScale ||
    rectArea(left.descriptor.sourceRectCss) -
      rectArea(right.descriptor.sourceRectCss) ||
    right.lastUsedFrame - left.lastUsedFrame
  );
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

function compareEvictablePages<TResource>(
  left: CommittedRetainedTexturePage<TResource>,
  right: CommittedRetainedTexturePage<TResource>,
): number {
  return (
    right.descriptor.lodScale - left.descriptor.lodScale ||
    left.lastUsedFrame - right.lastUsedFrame ||
    right.byteSize - left.byteSize ||
    left.key.localeCompare(right.key)
  );
}
