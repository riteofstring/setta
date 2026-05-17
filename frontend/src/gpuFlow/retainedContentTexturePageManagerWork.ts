import { rectsEqual } from "./retainedContentTexturePageManagerHelpers";
import type {
  RetainedContentTexturePageFrameSurface,
  RetainedContentTexturePageReplacementDescriptor,
} from "./retainedContentTexturePageManagerTypes";
import {
  estimatePageByteSize,
  type RetainedTexturePageDescriptor,
} from "./retainedTexturePages";
import type { RetainedTextureWorkItem } from "./retainedTextureWorkQueue";
import type { GpuRect } from "./viewportMath";

type RetainedTexturePageWorkCostSample = {
  readonly rasterMs: number;
  readonly uploadMs: number;
};

export class RetainedTexturePageWorkCostEstimator {
  private readonly samples = new Map<
    string,
    RetainedTexturePageWorkCostSample
  >();

  clear() {
    this.samples.clear();
  }

  estimate({
    descriptor,
    surface,
  }: {
    readonly descriptor: RetainedTexturePageDescriptor;
    readonly surface: RetainedContentTexturePageFrameSurface;
  }): {
    readonly rasterMs: number;
    readonly uploadMs: number;
    readonly uploadedBytes: number;
    readonly uploadCount: number;
  } {
    const uploadedBytes = estimatePageByteSize(descriptor);
    const measured = this.samples.get(
      retainedTexturePageWorkCostKey({ descriptor, surface }),
    );
    if (measured) {
      return {
        rasterMs: measured.rasterMs,
        uploadMs: measured.uploadMs,
        uploadedBytes,
        uploadCount: 1,
      };
    }
    return {
      rasterMs: estimateInitialRetainedTexturePageRasterMs({
        descriptor,
        surface,
      }),
      uploadMs: estimateInitialRetainedTexturePageUploadMs(uploadedBytes),
      uploadedBytes,
      uploadCount: 1,
    };
  }

  record({
    descriptor,
    rasterMs,
    surface,
    uploadMs,
  }: {
    readonly descriptor: RetainedTexturePageDescriptor;
    readonly rasterMs: number;
    readonly surface: RetainedContentTexturePageFrameSurface;
    readonly uploadMs: number;
  }) {
    const key = retainedTexturePageWorkCostKey({ descriptor, surface });
    const previous = this.samples.get(key);
    const next = previous
      ? {
          rasterMs: updateRetainedTexturePageCostSample(
            previous.rasterMs,
            rasterMs,
          ),
          uploadMs: updateRetainedTexturePageCostSample(
            previous.uploadMs,
            uploadMs,
          ),
        }
      : {
          rasterMs: Math.max(0.05, rasterMs),
          uploadMs: Math.max(0.05, uploadMs),
        };
    this.samples.set(key, next);
    if (this.samples.size > 96) {
      this.samples.delete(this.samples.keys().next().value as string);
    }
  }
}

export function retainedFirstVisibleSurfaceEpochKey({
  surfaceId,
  visualEpochKind,
}: Pick<RetainedTextureWorkItem, "surfaceId" | "visualEpochKind">): string {
  return `${surfaceId}:${visualEpochKind ?? "base"}`;
}

export function sortReplacementDescriptorsForRepair(
  descriptors: readonly RetainedContentTexturePageReplacementDescriptor[],
): readonly RetainedContentTexturePageReplacementDescriptor[] {
  return [...descriptors].sort(compareReplacementDescriptorsForRepair);
}

export function createRetainedTextureProjectionHorizonSignature({
  devicePixelRatio,
  surfaces,
  viewportZoomBucket,
}: {
  readonly devicePixelRatio: number;
  readonly surfaces: readonly RetainedContentTexturePageFrameSurface[];
  readonly viewportZoomBucket: number;
}): string {
  return JSON.stringify({
    devicePixelRatio,
    surfaces: surfaces.map((surface) => ({
      contentVersion: surface.contentVersion,
      sourceKey: surface.sourceKey,
      sourceVersion: surface.sourceVersion,
      sourceWindowCss: surface.sourceWindowCss,
      surfaceId: surface.surfaceId,
    })),
    viewportZoomBucket,
  });
}

export function isRetainedTextureWorkStaleForProjectionHorizon({
  currentGeneration,
  item,
  surfaces,
}: {
  readonly currentGeneration: number;
  readonly item: RetainedTextureWorkItem;
  readonly surfaces: readonly RetainedContentTexturePageFrameSurface[];
}): boolean {
  if (
    item.projectionHorizonGeneration === undefined ||
    item.projectionHorizonGeneration >= currentGeneration
  ) {
    return false;
  }
  if (item.kind !== "first-visible") {
    return true;
  }
  const surface = surfaces.find(
    (candidate) => candidate.surfaceId === item.surfaceId,
  );
  return (
    !surface ||
    surface.contentVersion !== item.contentVersion ||
    !item.sourceRect ||
    !rectsIntersect(item.sourceRect, surface.visibleSourceRectCss) ||
    Boolean(
      item.sourceWindow &&
        !rectsEqual(item.sourceWindow, surface.sourceWindowCss),
    )
  );
}

export function retainedTextureDescriptorSourceRectCoalescing(
  kind: RetainedTextureWorkItem["kind"],
): RetainedTextureWorkItem["sourceRectCoalescing"] {
  switch (kind) {
    case "first-visible":
    case "lod-refinement":
      return "exact";
    case "animation-rect":
    case "content-rect":
    case "full-content":
    case "hover-rect":
    case "source-window":
      return "union";
  }
}

export function retainedTextureWorkProjectionHorizonGeneration({
  generation,
  kind,
}: {
  readonly generation: number;
  readonly kind: RetainedTextureWorkItem["kind"];
}): number | undefined {
  switch (kind) {
    case "first-visible":
    case "lod-refinement":
    case "source-window":
      return generation;
    case "animation-rect":
    case "content-rect":
    case "full-content":
    case "hover-rect":
      return undefined;
  }
}

export function shouldResolveRetainedTextureWorkItemForSurface({
  item,
  surface,
}: {
  readonly item: RetainedTextureWorkItem;
  readonly surface: RetainedContentTexturePageFrameSurface;
}): boolean {
  if (
    item.sourceWindow &&
    !rectsEqual(item.sourceWindow, surface.sourceWindowCss)
  ) {
    return false;
  }
  if (!isRetainedTextureVisibleRepairWorkItem(item)) {
    return true;
  }
  return Boolean(
    item.sourceRect &&
      rectsIntersect(item.sourceRect, surface.visibleSourceRectCss),
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

function compareReplacementDescriptorsForRepair(
  left: RetainedContentTexturePageReplacementDescriptor,
  right: RetainedContentTexturePageReplacementDescriptor,
): number {
  return (
    replacementPriorityRank(left) - replacementPriorityRank(right) ||
    replacementDescriptorTargetDistanceSquared(left) -
      replacementDescriptorTargetDistanceSquared(right) ||
    left.descriptor.surfaceId.localeCompare(right.descriptor.surfaceId) ||
    left.descriptor.sourceRectCss.y - right.descriptor.sourceRectCss.y ||
    left.descriptor.sourceRectCss.x - right.descriptor.sourceRectCss.x
  );
}

function replacementPriorityRank({
  replacementRequest,
}: RetainedContentTexturePageReplacementDescriptor): number {
  switch (replacementRequest.priority) {
    case "interactive":
      return 0;
    case "visible-hole":
      return 1;
    case "visible-refinement":
      return 2;
    case "prefetch":
      return 3;
  }
}

function replacementDescriptorTargetDistanceSquared({
  descriptor,
  replacementRequest,
}: RetainedContentTexturePageReplacementDescriptor): number {
  const descriptorCenter = rectCenter(descriptor.sourceRectCss);
  const targetCenter = rectCenter(replacementRequest.target.contentRect);
  const dx = descriptorCenter.x - targetCenter.x;
  const dy = descriptorCenter.y - targetCenter.y;
  return dx * dx + dy * dy;
}

function rectCenter(rect: GpuRect): { readonly x: number; readonly y: number } {
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
  };
}

function retainedTexturePageWorkCostKey({
  descriptor,
  surface,
}: {
  readonly descriptor: RetainedTexturePageDescriptor;
  readonly surface: RetainedContentTexturePageFrameSurface;
}): string {
  return [
    "page",
    bucketRetainedTexturePageCostValue(descriptor.pixelWidth, 128),
    bucketRetainedTexturePageCostValue(descriptor.pixelHeight, 128),
    bucketRetainedTexturePageCostValue(descriptor.lodScale, 0.25),
    bucketRetainedTexturePageCostValue(
      surface.rasterScene.drawCommands.length,
      24,
    ),
    bucketRetainedTexturePageCostValue(
      estimatePageByteSize(descriptor),
      262144,
    ),
  ].join(":");
}

function estimateInitialRetainedTexturePageRasterMs({
  descriptor,
  surface,
}: {
  readonly descriptor: RetainedTexturePageDescriptor;
  readonly surface: RetainedContentTexturePageFrameSurface;
}): number {
  const megapixels =
    (descriptor.pixelWidth * descriptor.pixelHeight) / 1_000_000;
  const commandCount = surface.rasterScene.drawCommands.length;
  return Math.max(0.1, megapixels * 1.4 + commandCount * 0.006);
}

function estimateInitialRetainedTexturePageUploadMs(
  uploadedBytes: number,
): number {
  return Math.max(0.08, uploadedBytes / (48 * 1024 * 1024));
}

function updateRetainedTexturePageCostSample(
  previous: number,
  measured: number,
): number {
  return Math.max(0.05, previous * 0.7 + Math.max(0.05, measured) * 0.3);
}

function bucketRetainedTexturePageCostValue(
  value: number,
  bucketSize: number,
): number {
  return Math.ceil(value / bucketSize) * bucketSize;
}

function isRetainedTextureVisibleRepairWorkItem(
  item: RetainedTextureWorkItem,
): boolean {
  return item.kind === "first-visible" || item.kind === "lod-refinement";
}
