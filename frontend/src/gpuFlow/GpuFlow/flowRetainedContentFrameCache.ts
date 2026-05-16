import type { RetainedContentTexturePagePreparedFrame } from "../retainedContentTexturePageManager";
import type { GpuRetainedRuntimeFrame } from "../retainedRuntimeFrame";
import type { GpuContentSurface } from "../scene";

export type GpuFlowRetainedContentFrameCache = {
  readonly contentSurfaces: readonly GpuContentSurface[] | undefined;
  readonly devicePixelRatio: number;
  readonly pageDrawableRevision: number;
  readonly preparedFrame: RetainedContentTexturePagePreparedFrame;
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame;
  readonly sceneRevision: number;
  readonly scrollRevision: number;
  readonly nativeVisualSignature: string;
  readonly viewportZoomBucket: number;
};

export function shouldReuseGpuFlowRetainedContentFrameCache({
  allowCoveredRefinementBacklog = false,
  cachedFrame,
  contentSurfaces,
  devicePixelRatio,
  pageDrawableRevision,
  sceneRevision,
  scrollRevision,
  viewportZoomBucket,
}: {
  readonly allowCoveredRefinementBacklog?: boolean | undefined;
  readonly cachedFrame: GpuFlowRetainedContentFrameCache;
  readonly contentSurfaces: readonly GpuContentSurface[] | undefined;
  readonly devicePixelRatio: number;
  readonly pageDrawableRevision: number;
  readonly sceneRevision: number;
  readonly scrollRevision: number;
  readonly viewportZoomBucket: number;
}): boolean {
  return (
    cachedFrame.contentSurfaces === contentSurfaces &&
    cachedFrame.devicePixelRatio === devicePixelRatio &&
    cachedFrame.pageDrawableRevision === pageDrawableRevision &&
    hasReusableGpuFlowRetainedPageCoverage({
      allowCoveredRefinementBacklog,
      cachedFrame,
    }) &&
    cachedFrame.sceneRevision === sceneRevision &&
    cachedFrame.scrollRevision === scrollRevision &&
    cachedFrame.viewportZoomBucket === viewportZoomBucket
  );
}

function hasReusableGpuFlowRetainedPageCoverage({
  allowCoveredRefinementBacklog,
  cachedFrame,
}: {
  readonly allowCoveredRefinementBacklog: boolean;
  readonly cachedFrame: GpuFlowRetainedContentFrameCache;
}): boolean {
  const preparedFrame = cachedFrame.preparedFrame;
  return (
    preparedFrame.uncoveredRectCount === 0 &&
    (allowCoveredRefinementBacklog || preparedFrame.missingPageCount === 0)
  );
}
