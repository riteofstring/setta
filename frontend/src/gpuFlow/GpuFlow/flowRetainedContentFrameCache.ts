import type { RetainedContentTexturePagePreparedFrame } from "../retainedContentTexturePageManager";
import type { GpuRetainedRuntimeFrame } from "../retainedRuntimeFrame";
import type { GpuContentSurface } from "../scene";
import { normalizeGpuViewport, type GpuViewportInput } from "../viewportMath";

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

export function shouldReuseGpuFlowRetainedRuntimeFrameForSample({
  allowActiveMotionViewportDrift = false,
  cachedFrame,
  nativeVisualSignature,
  viewport,
}: {
  readonly allowActiveMotionViewportDrift?: boolean | undefined;
  readonly cachedFrame: GpuFlowRetainedContentFrameCache;
  readonly nativeVisualSignature: string;
  readonly viewport: GpuViewportInput;
}): boolean {
  return (
    cachedFrame.nativeVisualSignature === nativeVisualSignature &&
    (allowActiveMotionViewportDrift ||
      areGpuFlowProjectionViewportsEqual(
        cachedFrame.retainedRuntimeFrame.input.viewport,
        viewport,
      ))
  );
}

export function shouldReuseGpuFlowDeferredRetainedContentPublicationFrame({
  cachedFrame,
  sceneRevision,
  targetViewport,
  targetZoomBucket,
}: {
  readonly cachedFrame: GpuFlowRetainedContentFrameCache;
  readonly sceneRevision: number;
  readonly targetViewport: GpuViewportInput;
  readonly targetZoomBucket: number;
}): boolean {
  return (
    cachedFrame.sceneRevision === sceneRevision &&
    cachedFrame.viewportZoomBucket === targetZoomBucket &&
    shouldReuseGpuFlowRetainedRuntimeFrameForSample({
      cachedFrame,
      nativeVisualSignature: cachedFrame.nativeVisualSignature,
      viewport: targetViewport,
    })
  );
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

function areGpuFlowProjectionViewportsEqual(
  left: GpuViewportInput,
  right: GpuViewportInput,
): boolean {
  const normalizedLeft = normalizeGpuViewport(left);
  const normalizedRight = normalizeGpuViewport(right);
  return (
    normalizedLeft.x === normalizedRight.x &&
    normalizedLeft.y === normalizedRight.y &&
    normalizedLeft.zoom === normalizedRight.zoom
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
