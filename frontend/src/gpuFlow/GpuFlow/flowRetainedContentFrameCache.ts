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
  readonly viewportSize: { readonly height: number; readonly width: number };
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
  viewportSize,
  viewportZoomBucket,
}: {
  readonly allowCoveredRefinementBacklog?: boolean | undefined;
  readonly cachedFrame: GpuFlowRetainedContentFrameCache;
  readonly contentSurfaces: readonly GpuContentSurface[] | undefined;
  readonly devicePixelRatio: number;
  readonly pageDrawableRevision: number;
  readonly sceneRevision: number;
  readonly scrollRevision: number;
  readonly viewportSize?:
    | { readonly height: number; readonly width: number }
    | undefined;
  readonly viewportZoomBucket: number;
}): boolean {
  return [
    cachedFrame.contentSurfaces === contentSurfaces,
    cachedFrame.devicePixelRatio === devicePixelRatio,
    cachedFrame.pageDrawableRevision === pageDrawableRevision,
    hasReusableGpuFlowRetainedPageCoverage({
      allowCoveredRefinementBacklog,
      cachedFrame,
    }),
    cachedFrame.sceneRevision === sceneRevision,
    cachedFrame.scrollRevision === scrollRevision,
    retainedFrameViewportSizeMatches(cachedFrame, viewportSize),
    cachedFrame.viewportZoomBucket === viewportZoomBucket,
  ].every(Boolean);
}

function retainedFrameViewportSizeMatches(
  cachedFrame: GpuFlowRetainedContentFrameCache,
  viewportSize: { readonly height: number; readonly width: number } | undefined,
): boolean {
  if (viewportSize === undefined) {
    return true;
  }
  return (
    cachedFrame.viewportSize.height === viewportSize.height &&
    cachedFrame.viewportSize.width === viewportSize.width
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
  if (allowCoveredRefinementBacklog) {
    return preparedFrame.trueHoleRectCount === 0;
  }
  return (
    preparedFrame.trueHoleRectCount === 0 &&
    preparedFrame.refinementPageCount === 0
  );
}
