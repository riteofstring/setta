import type { RetainedContentTexturePagePreparedFrame } from "./retainedContentTexturePageManager";
import type { RetainedTextureWorkItem } from "./retainedTextureWorkQueue";
import type { GpuRect } from "./viewportMath";

export function shouldRefreshCommittedPage(
  item: RetainedTextureWorkItem,
): boolean {
  return (
    item.kind === "animation-rect" ||
    item.kind === "content-rect" ||
    item.kind === "full-content" ||
    item.kind === "hover-rect"
  );
}

export function shouldUploadRetainedTexturePage({
  committedPagePresent,
  item,
}: {
  readonly committedPagePresent: boolean;
  readonly item: RetainedTextureWorkItem;
}): boolean {
  return shouldRefreshCommittedPage(item) || !committedPagePresent;
}

export function shouldEnqueueRemainingRefreshDescriptors({
  descriptorCount,
  item,
  pageUploadComplete,
}: {
  readonly descriptorCount: number;
  readonly item: RetainedTextureWorkItem;
  readonly pageUploadComplete: boolean;
}): boolean {
  return (
    pageUploadComplete &&
    shouldRefreshCommittedPage(item) &&
    descriptorCount > 1
  );
}

export function isRetainedTextureWorkItemCompleteAfterPageUpload({
  descriptorCount,
  item,
  pageUploadComplete,
}: {
  readonly descriptorCount: number;
  readonly item: RetainedTextureWorkItem;
  readonly pageUploadComplete: boolean;
}): boolean {
  return (
    pageUploadComplete &&
    (shouldRefreshCommittedPage(item) || descriptorCount <= 1)
  );
}

export function didRetainedPageVisualCoverageChange({
  after,
  before,
}: {
  readonly after: Pick<
    RetainedContentTexturePagePreparedFrame,
    | "drawQuadCount"
    | "compatibleDrawQuadCount"
    | "refinementPageCount"
    | "trueHoleRectCount"
  >;
  readonly before: Pick<
    RetainedContentTexturePagePreparedFrame,
    | "drawQuadCount"
    | "compatibleDrawQuadCount"
    | "refinementPageCount"
    | "trueHoleRectCount"
  >;
}): boolean {
  return (
    after.drawQuadCount !== before.drawQuadCount ||
    after.compatibleDrawQuadCount !== before.compatibleDrawQuadCount ||
    after.refinementPageCount !== before.refinementPageCount ||
    after.trueHoleRectCount !== before.trueHoleRectCount
  );
}

export function combineRetainedContentTexturePageFidelityState(
  current: RetainedContentTexturePagePreparedFrame["fidelityState"],
  next: RetainedContentTexturePagePreparedFrame["fidelityState"],
): RetainedContentTexturePagePreparedFrame["fidelityState"] {
  const rank = {
    target: 0,
    "compatible-previous-dpr-bucket": 1,
    "compatible-previous-grid": 2,
    "compatible-lower-lod": 3,
    refining: 4,
  } satisfies Record<
    RetainedContentTexturePagePreparedFrame["fidelityState"],
    number
  >;
  return rank[next] > rank[current] ? next : current;
}

export function rectsEqual(left: GpuRect, right: GpuRect): boolean {
  return (
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height
  );
}

export function rectsIntersect(left: GpuRect, right: GpuRect): boolean {
  return (
    left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y
  );
}

export function resolveRetainedPageEvictionProtectedKeys({
  postMaintenancePageVisualResult,
  preparedFrame,
  publishedProtectedPageKeys = [],
}: {
  readonly postMaintenancePageVisualResult: {
    readonly protectedPageKeys: readonly string[];
  };
  readonly preparedFrame: Pick<
    RetainedContentTexturePagePreparedFrame,
    "protectedPageKeys"
  >;
  readonly publishedProtectedPageKeys?: readonly string[] | undefined;
}): readonly string[] {
  return [
    ...publishedProtectedPageKeys,
    ...preparedFrame.protectedPageKeys,
    ...postMaintenancePageVisualResult.protectedPageKeys,
  ];
}
