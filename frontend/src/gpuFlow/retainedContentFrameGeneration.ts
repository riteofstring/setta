import {
  getGpuRetainedTextLikePreviewPageFrameSurfacesFromSources,
  getGpuRetainedTextLikePreviewSourcesFromSourceSurfaces,
  type GpuRetainedTextLikePreviewSource,
} from "./GpuFlow/retainedTextLikePreviewSources";
import { getGpuRetainedContentTexturePageFrameSurfacesFromSourceSurfaces } from "./GpuRetainedContentPageFrameSurfaces";
import {
  getGpuRetainedContentSourceSurfaces,
  type GpuRetainedContentSourceSurface,
} from "./GpuRetainedContentSurfaces";
import type { RetainedContentTexturePageFrameSurface } from "./retainedContentTexturePageManager";
import type { RetainedTextLikePreviewPageFrameSurface } from "./retainedTextLikePreviewPageManager";
import type { GpuContentSurface } from "./scene";

export type GpuRetainedContentFrameGeneration = {
  readonly contentPageSurfaces: readonly RetainedContentTexturePageFrameSurface[];
  readonly sourceSurfaces: readonly GpuRetainedContentSourceSurface[];
  readonly textLikePreviewPageSurfaces: readonly RetainedTextLikePreviewPageFrameSurface[];
  readonly textLikePreviewSources: readonly GpuRetainedTextLikePreviewSource[];
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
  const textLikePreviewSources =
    getGpuRetainedTextLikePreviewSourcesFromSourceSurfaces(sourceSurfaces);
  return {
    contentPageSurfaces:
      getGpuRetainedContentTexturePageFrameSurfacesFromSourceSurfaces(
        sourceSurfaces,
      ),
    sourceSurfaces,
    textLikePreviewPageSurfaces:
      getGpuRetainedTextLikePreviewPageFrameSurfacesFromSources(
        textLikePreviewSources,
      ),
    textLikePreviewSources,
    viewportZoomBucket,
  };
}
