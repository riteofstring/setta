import { getGpuRetainedTextLikePreviewPageFrameSurfacesFromSourceSurfaces } from "./GpuFlow/retainedTextLikePreviewSources";
import {
  getGpuRetainedContentTexturePageFrameSurfacesFromSourceSurfaces,
  type RetainedContentTexturePageFrameSurface,
} from "./GpuRetainedContentPageFrameSurfaces";
import {
  getGpuRetainedContentSourceSurfaces,
  type GpuRetainedContentSourceSurface,
} from "./GpuRetainedContentSurfaces";
import type { RetainedTextLikePreviewPageFrameSurface } from "./retainedTextLikePreviewPageManager";
import type { GpuContentSurface } from "./scene";

export type GpuRetainedContentFrameGeneration = {
  readonly contentPageSurfaces: readonly RetainedContentTexturePageFrameSurface[];
  readonly sourceSurfaces: readonly GpuRetainedContentSourceSurface[];
  readonly textLikePreviewPageSurfaces: readonly RetainedTextLikePreviewPageFrameSurface[];
  readonly viewportZoomBucket: number;
};

export function createGpuRetainedContentFrameGeneration({
  contentSurfaces,
  viewportZoomBucket,
}: {
  readonly contentSurfaces: readonly GpuContentSurface[] | undefined;
  readonly viewportZoomBucket: number;
}): GpuRetainedContentFrameGeneration {
  const sourceSurfaces = getGpuRetainedContentSourceSurfaces(contentSurfaces, {
    viewportZoomBucket,
  });
  return {
    contentPageSurfaces:
      getGpuRetainedContentTexturePageFrameSurfacesFromSourceSurfaces(
        sourceSurfaces,
      ),
    sourceSurfaces,
    textLikePreviewPageSurfaces:
      getGpuRetainedTextLikePreviewPageFrameSurfacesFromSourceSurfaces(
        sourceSurfaces,
      ),
    viewportZoomBucket,
  };
}
