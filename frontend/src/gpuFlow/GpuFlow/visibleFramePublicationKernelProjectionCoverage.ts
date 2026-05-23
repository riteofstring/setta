import { getGpuRetainedContentTexturePageFrameSurfacesFromSourceSurfaces } from "../GpuRetainedContentPageFrameSurfaces";
import { getGpuRetainedContentSourceSurfaces } from "../GpuRetainedContentSurfaces";
import type { HtmlSurfaceFlatVisual } from "../htmlSurfaces/visualScene";
import type { GpuFlowProjectionTransaction } from "../projectionRuntime";
import type { GpuRetainedContentScrollOffsetMap } from "../retainedContentScroll";
import type { RetainedContentTexturePageFrameSurface } from "../retainedContentTexturePageManager";
import type { RetainedContentTextureResources } from "../retainedContentTextureResources";
import type { RetainedDisplayFrame } from "../retainedDisplayFrame";
import type { RetainedTexturePageDrawQuad } from "../retainedTexturePageGrid";
import { createRetainedTexturePageFlatVisuals } from "../retainedTexturePageVisuals";
import type { GpuFlowScene } from "../scene";
import type { GpuRect } from "../viewportMath";
import type { GpuFlowNodeLayerState } from "./flowLayerState";

export type GpuFlowRetainedProjectionFrame = {
  readonly flatSurfaces: readonly HtmlSurfaceFlatVisual[];
  readonly missingCoverageSurfaceIds: ReadonlySet<string>;
  readonly needsRetainedPageMaintenance: boolean;
};

type GpuFlowRetainedProjectionVisualsBySurfaceId = {
  readonly missingCoverageSurfaceIds: ReadonlySet<string>;
  readonly projectedVisualsBySurfaceId: ReadonlyMap<
    string,
    readonly HtmlSurfaceFlatVisual[]
  >;
};

export function resolveGpuFlowRetainedProjectionFrame({
  layer,
  retainedDisplayFrame,
  transaction,
}: {
  readonly layer: GpuFlowNodeLayerState;
  readonly retainedDisplayFrame: RetainedDisplayFrame;
  readonly transaction: GpuFlowProjectionTransaction;
}): GpuFlowRetainedProjectionFrame {
  if (
    !hasGpuFlowRetainedProjectionScrollSampleChanged({
      retainedDisplayFrame,
      scrollOffsets: transaction.sample.retainedScrollOffsets,
    })
  ) {
    return {
      flatSurfaces: retainedDisplayFrame.flatSurfaces,
      missingCoverageSurfaceIds: new Set(),
      needsRetainedPageMaintenance: false,
    };
  }
  return projectGpuFlowRetainedDisplayFrameFlatSurfaces({
    layer,
    retainedDisplayFrame,
    scrollOffsets: transaction.sample.retainedScrollOffsets,
  });
}

function isGpuFlowRetainedProjectionSurfaceCovered({
  pages,
  surface,
}: {
  readonly pages: ReadonlyMap<
    string,
    RetainedDisplayFrame["drawRegions"][number]["page"]
  >;
  readonly surface: RetainedContentTexturePageFrameSurface;
}): boolean {
  let missingRects: readonly GpuRect[] = [surface.visibleSourceRectCss];
  for (const page of pages.values()) {
    missingRects = missingRects.flatMap((missing) =>
      subtractGpuFlowProjectionRect(missing, page.descriptor.sourceRectCss),
    );
    if (missingRects.length === 0) {
      return true;
    }
  }
  return false;
}

function hasGpuFlowRetainedProjectionScrollSampleChanged({
  retainedDisplayFrame,
  scrollOffsets,
}: {
  readonly retainedDisplayFrame: RetainedDisplayFrame;
  readonly scrollOffsets: GpuRetainedContentScrollOffsetMap;
}): boolean {
  return (
    getGpuFlowRetainedProjectionChangedSurfaceIds({
      currentScrollOffsets: scrollOffsets,
      retainedDisplayFrame,
    }).size > 0
  );
}

function projectGpuFlowRetainedDisplayFrameFlatSurfaces({
  layer,
  retainedDisplayFrame,
  scrollOffsets,
}: {
  readonly layer: GpuFlowNodeLayerState;
  readonly retainedDisplayFrame: RetainedDisplayFrame;
  readonly scrollOffsets: GpuRetainedContentScrollOffsetMap;
}): GpuFlowRetainedProjectionFrame {
  if (!layer.scene) {
    return {
      flatSurfaces: retainedDisplayFrame.flatSurfaces,
      missingCoverageSurfaceIds: new Set(),
      needsRetainedPageMaintenance: false,
    };
  }
  const changedSurfaceIds = getGpuFlowRetainedProjectionChangedSurfaceIds({
    currentScrollOffsets: scrollOffsets,
    retainedDisplayFrame,
  });
  if (changedSurfaceIds.size === 0) {
    return {
      flatSurfaces: retainedDisplayFrame.flatSurfaces,
      missingCoverageSurfaceIds: new Set(),
      needsRetainedPageMaintenance: false,
    };
  }
  const { missingCoverageSurfaceIds, projectedVisualsBySurfaceId } =
    createGpuFlowRetainedProjectionVisualsBySurfaceId({
      changedSurfaceIds,
      layerScene: layer.scene,
      retainedDisplayFrame,
      scrollOffsets,
    });
  if (projectedVisualsBySurfaceId.size === 0) {
    return {
      flatSurfaces: retainedDisplayFrame.flatSurfaces,
      missingCoverageSurfaceIds,
      needsRetainedPageMaintenance: missingCoverageSurfaceIds.size > 0,
    };
  }
  return {
    flatSurfaces: mergeGpuFlowRetainedProjectionFlatSurfaces({
      changedSurfaceIds,
      projectedVisualsBySurfaceId,
      retainedDisplayFrame,
    }),
    missingCoverageSurfaceIds,
    needsRetainedPageMaintenance: missingCoverageSurfaceIds.size > 0,
  };
}

function createGpuFlowRetainedProjectionVisualsBySurfaceId({
  changedSurfaceIds,
  layerScene,
  retainedDisplayFrame,
  scrollOffsets,
}: {
  readonly changedSurfaceIds: ReadonlySet<string>;
  readonly layerScene: GpuFlowScene;
  readonly retainedDisplayFrame: RetainedDisplayFrame;
  readonly scrollOffsets: GpuRetainedContentScrollOffsetMap;
}): GpuFlowRetainedProjectionVisualsBySurfaceId {
  const viewportZoomBucket =
    retainedDisplayFrame.retainedRuntimeFrame.input.viewportZoomBucket;
  const sourceSurfaces = getGpuRetainedContentSourceSurfaces(
    layerScene.contentSurfaces.filter((surface) =>
      changedSurfaceIds.has(surface.id),
    ),
    {
      scrollOffsets,
      viewportZoomBucket,
    },
  );
  const currentSurfaces =
    getGpuRetainedContentTexturePageFrameSurfacesFromSourceSurfaces(
      sourceSurfaces,
      {
        viewportZoomBucket,
      },
    );
  const pagesBySurfaceId = collectGpuFlowRetainedProjectionPagesBySurfaceId({
    changedSurfaceIds,
    retainedDisplayFrame,
  });
  const projectedVisualsBySurfaceId = new Map<
    string,
    readonly HtmlSurfaceFlatVisual[]
  >();
  const missingCoverageSurfaceIds = new Set<string>();
  for (const surface of currentSurfaces) {
    const pages = pagesBySurfaceId.get(surface.surfaceId);
    if (!pages) {
      missingCoverageSurfaceIds.add(surface.surfaceId);
      continue;
    }
    if (
      !isGpuFlowRetainedProjectionSurfaceCovered({
        pages,
        surface,
      })
    ) {
      missingCoverageSurfaceIds.add(surface.surfaceId);
      continue;
    }
    projectedVisualsBySurfaceId.set(
      surface.surfaceId,
      createGpuFlowRetainedProjectionFlatVisuals({
        pages,
        surface,
      }),
    );
  }
  return {
    missingCoverageSurfaceIds,
    projectedVisualsBySurfaceId,
  };
}

function collectGpuFlowRetainedProjectionPagesBySurfaceId({
  changedSurfaceIds,
  retainedDisplayFrame,
}: {
  readonly changedSurfaceIds: ReadonlySet<string>;
  readonly retainedDisplayFrame: RetainedDisplayFrame;
}): ReadonlyMap<
  string,
  ReadonlyMap<string, RetainedDisplayFrame["drawRegions"][number]["page"]>
> {
  const pagesBySurfaceId = new Map<
    string,
    Map<string, RetainedDisplayFrame["drawRegions"][number]["page"]>
  >();
  for (const region of retainedDisplayFrame.drawRegions) {
    if (!changedSurfaceIds.has(region.page.descriptor.surfaceId)) {
      continue;
    }
    const surfacePages =
      pagesBySurfaceId.get(region.page.descriptor.surfaceId) ?? new Map();
    surfacePages.set(region.page.key, region.page);
    pagesBySurfaceId.set(region.page.descriptor.surfaceId, surfacePages);
  }
  return pagesBySurfaceId;
}

function createGpuFlowRetainedProjectionFlatVisuals({
  pages,
  surface,
}: {
  readonly pages: ReadonlyMap<
    string,
    RetainedDisplayFrame["drawRegions"][number]["page"]
  >;
  readonly surface: RetainedContentTexturePageFrameSurface;
}): readonly HtmlSurfaceFlatVisual[] {
  const drawQuads: RetainedTexturePageDrawQuad<RetainedContentTextureResources>[] =
    [];
  for (const page of pages.values()) {
    const sampleRectCss = intersectGpuFlowProjectionRects(
      page.descriptor.sourceRectCss,
      surface.visibleSourceRectCss,
    );
    if (!sampleRectCss) {
      continue;
    }
    drawQuads.push({
      coverageKind: "compatible",
      desiredDescriptor: page.descriptor,
      fidelityState: "compatible-mapped-region",
      page,
      sampleRectCss,
      staleContent: false,
    });
  }
  return createRetainedTexturePageFlatVisuals({
    drawQuads,
    layout: surface.layout,
  });
}

function mergeGpuFlowRetainedProjectionFlatSurfaces({
  changedSurfaceIds,
  projectedVisualsBySurfaceId,
  retainedDisplayFrame,
}: {
  readonly changedSurfaceIds: ReadonlySet<string>;
  readonly projectedVisualsBySurfaceId: ReadonlyMap<
    string,
    readonly HtmlSurfaceFlatVisual[]
  >;
  readonly retainedDisplayFrame: RetainedDisplayFrame;
}): readonly HtmlSurfaceFlatVisual[] {
  const projectedSurfaceIds = new Set<string>();
  const visuals: HtmlSurfaceFlatVisual[] = [];
  for (const visual of retainedDisplayFrame.flatSurfaces) {
    if (!changedSurfaceIds.has(visual.surfaceId)) {
      visuals.push(visual);
      continue;
    }
    const projectedVisuals = projectedVisualsBySurfaceId.get(visual.surfaceId);
    if (!projectedVisuals) {
      visuals.push(visual);
      continue;
    }
    if (projectedSurfaceIds.has(visual.surfaceId)) {
      continue;
    }
    projectedSurfaceIds.add(visual.surfaceId);
    visuals.push(...projectedVisuals);
  }
  return visuals.length > 0 ? visuals : retainedDisplayFrame.flatSurfaces;
}

function subtractGpuFlowProjectionRect(
  target: GpuRect,
  covered: GpuRect,
): readonly GpuRect[] {
  const overlap = intersectGpuFlowProjectionRects(target, covered);
  if (!overlap) {
    return [target];
  }
  const rects: GpuRect[] = [];
  const targetRight = target.x + target.width;
  const targetBottom = target.y + target.height;
  const overlapRight = overlap.x + overlap.width;
  const overlapBottom = overlap.y + overlap.height;
  if (overlap.y > target.y) {
    rects.push({
      height: overlap.y - target.y,
      width: target.width,
      x: target.x,
      y: target.y,
    });
  }
  if (overlapBottom < targetBottom) {
    rects.push({
      height: targetBottom - overlapBottom,
      width: target.width,
      x: target.x,
      y: overlapBottom,
    });
  }
  if (overlap.x > target.x) {
    rects.push({
      height: overlap.height,
      width: overlap.x - target.x,
      x: target.x,
      y: overlap.y,
    });
  }
  if (overlapRight < targetRight) {
    rects.push({
      height: overlap.height,
      width: targetRight - overlapRight,
      x: overlapRight,
      y: overlap.y,
    });
  }
  return rects.filter((rect) => rect.width > 0 && rect.height > 0);
}

function getGpuFlowRetainedProjectionChangedSurfaceIds({
  currentScrollOffsets,
  retainedDisplayFrame,
}: {
  readonly currentScrollOffsets: GpuRetainedContentScrollOffsetMap;
  readonly retainedDisplayFrame: RetainedDisplayFrame;
}): ReadonlySet<string> {
  const previousScrollOffsets =
    retainedDisplayFrame.retainedRuntimeFrame.input.scrollOffsets;
  const changedSurfaceIds = new Set<string>();
  for (const [surfaceId, currentOffset] of currentScrollOffsets) {
    const previousOffset = previousScrollOffsets.get(surfaceId);
    if (
      !previousOffset ||
      previousOffset.x !== currentOffset.x ||
      previousOffset.y !== currentOffset.y
    ) {
      changedSurfaceIds.add(surfaceId);
    }
  }
  for (const [surfaceId, previousOffset] of previousScrollOffsets) {
    const currentOffset = currentScrollOffsets.get(surfaceId);
    if (
      !currentOffset ||
      currentOffset.x !== previousOffset.x ||
      currentOffset.y !== previousOffset.y
    ) {
      changedSurfaceIds.add(surfaceId);
    }
  }
  return changedSurfaceIds;
}

function intersectGpuFlowProjectionRects(
  left: GpuRect,
  right: GpuRect,
): GpuRect | null {
  const x = Math.max(left.x, right.x);
  const y = Math.max(left.y, right.y);
  const rightEdge = Math.min(left.x + left.width, right.x + right.width);
  const bottomEdge = Math.min(left.y + left.height, right.y + right.height);
  const width = Math.max(0, rightEdge - x);
  const height = Math.max(0, bottomEdge - y);
  return width > 0 && height > 0 ? { height, width, x, y } : null;
}
