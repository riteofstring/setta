import {
  getGpuRetainedTextLikeRowSnapshotSourcesFromSourceSurfaces,
  type GpuRetainedTextLikeRowSnapshotSource,
} from "./GpuFlow/retainedTextLikeRowSnapshotSources";
import { getGpuRetainedContentTexturePageFrameSurfacesFromSourceSurfaces } from "./GpuRetainedContentPageFrameSurfaces";
import {
  getGpuRetainedContentSourceSurfaces,
  type GpuRetainedContentSourceSurface,
} from "./GpuRetainedContentSurfaces";
import type { GpuRetainedContentScrollOffsetMap } from "./retainedContentScroll";
import type { RetainedContentTexturePageFrameSurface } from "./retainedContentTexturePageManager";
import type { GpuContentSurface } from "./scene";

export type GpuRetainedContentFrameGeneration = {
  readonly contentPageSurfaces: readonly RetainedContentTexturePageFrameSurface[];
  readonly sourceSurfaces: readonly GpuRetainedContentSourceSurface[];
  readonly textLikeRowSnapshotSources: readonly GpuRetainedTextLikeRowSnapshotSource[];
  readonly viewportZoomBucket: number;
};

export function createGpuRetainedContentFrameGeneration({
  contentSurfaces,
  scrollOffsets,
  viewportZoomBucket,
}: {
  readonly contentSurfaces: readonly GpuContentSurface[] | undefined;
  readonly scrollOffsets?: GpuRetainedContentScrollOffsetMap | undefined;
  readonly viewportZoomBucket: number;
}): GpuRetainedContentFrameGeneration {
  const sourceSurfaces = getGpuRetainedContentSourceSurfaces(contentSurfaces, {
    scrollOffsets,
    viewportZoomBucket,
  });
  const textLikeRowSnapshotSources =
    getGpuRetainedTextLikeRowSnapshotSourcesFromSourceSurfaces(sourceSurfaces);
  return {
    contentPageSurfaces:
      getGpuRetainedContentTexturePageFrameSurfacesFromSourceSurfaces(
        sourceSurfaces,
        { textLikeRowSnapshotSources },
      ),
    sourceSurfaces,
    textLikeRowSnapshotSources,
    viewportZoomBucket,
  };
}
