import { getGpuRetainedDomControlSourcesFromSourceSurfaces } from "./GpuFlow/retainedDomControlSources";
import { getGpuRetainedContentTexturePageFrameSurfacesFromSourceSurfaces } from "./GpuRetainedContentPageFrameSurfaces";
import {
  getGpuRetainedContentSourceSurfaces,
  type GpuRetainedContentSourceSurface,
} from "./GpuRetainedContentSurfaces";
import type { GpuRetainedContentScrollOffsetMap } from "./retainedContentScroll";
import type { RetainedContentTexturePageFrameSurface } from "./retainedContentTexturePageManager";
import type { GpuRetainedDomControlSourceDescriptor } from "./retainedDomControlScene";
import type { GpuContentSurface } from "./scene";

type GpuRetainedContentFrameGeneration = {
  readonly contentPageSurfaces: readonly RetainedContentTexturePageFrameSurface[];
  readonly domControlSources: readonly GpuRetainedDomControlSourceDescriptor[];
  readonly sourceSurfaces: readonly GpuRetainedContentSourceSurface[];
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
  assertGpuRetainedContentFrameGenerationSceneOnlyAccessAllowed();
  const sourceSurfaces = getGpuRetainedContentSourceSurfaces(contentSurfaces, {
    scrollOffsets,
    viewportZoomBucket,
  });
  const domControlSources =
    getGpuRetainedDomControlSourcesFromSourceSurfaces(sourceSurfaces);
  return {
    contentPageSurfaces:
      getGpuRetainedContentTexturePageFrameSurfacesFromSourceSurfaces(
        sourceSurfaces,
        { domControlSources },
      ),
    domControlSources,
    sourceSurfaces,
    viewportZoomBucket,
  };
}

function assertGpuRetainedContentFrameGenerationSceneOnlyAccessAllowed() {
  if (typeof process !== "undefined" && process.env.NODE_ENV === "test") {
    return;
  }
  throw new Error(
    "Retained content frame generation must be read from a sampled retained runtime frame.",
  );
}
