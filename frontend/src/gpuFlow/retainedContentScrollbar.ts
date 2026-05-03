import type { GpuRetainedContentHitTarget } from "./retainedContentHitTest";
import type { GpuRetainedContentHitRecord } from "./retainedContentHitTypes";
import { clampNumber } from "./retainedContentMath";
import {
  clampGpuRetainedContentScrollOffset,
  getGpuRetainedContentMaxScrollOffset,
  type GpuRetainedContentScrollOffsetMap,
  type GpuRetainedContentScrollResult,
} from "./retainedContentScroll";
import type { GpuContentSurface, GpuFlowScene } from "./scene";
import type { GpuPoint, GpuRect } from "./viewportMath";

export type GpuRetainedContentScrollbarAxis = "x" | "y";

export type GpuRetainedContentScrollbarPart = "thumb" | "track";

export type GpuRetainedContentScrollbarDrawCommand = {
  readonly axis: GpuRetainedContentScrollbarAxis;
  readonly kind: "scrollbar";
  readonly rowId: string;
  readonly thumbRect: GpuRect;
  readonly trackRect: GpuRect;
};

export type GpuRetainedContentScrollbarLayout = {
  readonly axis: GpuRetainedContentScrollbarAxis;
  readonly maxOffset: number;
  readonly thumbRect: GpuRect;
  readonly trackRect: GpuRect;
  readonly viewportLength: number;
};

export function createGpuRetainedContentScrollbarHitRecords({
  contentRect,
  sceneId,
  scrollOffset,
  viewportRect,
}: {
  readonly contentRect: GpuRect;
  readonly sceneId: string;
  readonly scrollOffset: GpuPoint;
  readonly viewportRect: GpuRect;
}): GpuRetainedContentHitRecord[] {
  const hitRecords: GpuRetainedContentHitRecord[] = [];
  for (const layout of createGpuRetainedContentScrollbarLayouts({
    contentRect,
    scrollOffset,
    viewportRect,
  })) {
    hitRecords.push({
      id: `scrollbar-track:${layout.axis}:${sceneId}`,
      kind: "scrollbar-track",
      ownerRowId: sceneId,
      rect: layout.trackRect,
      scrollbarAxis: layout.axis,
    });
    hitRecords.push({
      id: `scrollbar-thumb:${layout.axis}:${sceneId}`,
      kind: "scrollbar-thumb",
      ownerRowId: sceneId,
      rect: layout.thumbRect,
      scrollbarAxis: layout.axis,
    });
  }
  return hitRecords;
}

type GpuRetainedContentSurfaceWithScene = GpuContentSurface & {
  readonly retainedScene: NonNullable<GpuContentSurface["retainedScene"]>;
};

const GPU_RETAINED_CONTENT_SCROLLBAR_THICKNESS = 8;
const GPU_RETAINED_CONTENT_SCROLLBAR_INSET = 2;
const GPU_RETAINED_CONTENT_SCROLLBAR_MIN_THUMB_LENGTH = 18;

export function createGpuRetainedContentScrollbarLayouts({
  contentRect,
  scrollOffset,
  viewportRect,
}: {
  readonly contentRect: Pick<GpuRect, "height" | "width">;
  readonly scrollOffset: GpuPoint;
  readonly viewportRect: GpuRect;
}): readonly GpuRetainedContentScrollbarLayout[] {
  const maxOffset = getGpuRetainedContentMaxScrollOffset({
    contentRect,
    viewportRect,
  });
  const hasVertical = maxOffset.y > 0;
  const hasHorizontal = maxOffset.x > 0;
  const layouts: GpuRetainedContentScrollbarLayout[] = [];
  if (hasVertical) {
    const trackRect = createGpuRetainedContentVerticalScrollbarTrackRect({
      hasHorizontal,
      viewportRect,
    });
    const thumbRect = createGpuRetainedContentScrollbarThumbRect({
      axis: "y",
      contentLength: contentRect.height,
      maxOffset: maxOffset.y,
      scrollOffset: scrollOffset.y,
      trackRect,
      viewportLength: viewportRect.height,
    });
    if (thumbRect) {
      layouts.push({
        axis: "y",
        maxOffset: maxOffset.y,
        thumbRect,
        trackRect,
        viewportLength: viewportRect.height,
      });
    }
  }
  if (hasHorizontal) {
    const trackRect = createGpuRetainedContentHorizontalScrollbarTrackRect({
      hasVertical,
      viewportRect,
    });
    const thumbRect = createGpuRetainedContentScrollbarThumbRect({
      axis: "x",
      contentLength: contentRect.width,
      maxOffset: maxOffset.x,
      scrollOffset: scrollOffset.x,
      trackRect,
      viewportLength: viewportRect.width,
    });
    if (thumbRect) {
      layouts.push({
        axis: "x",
        maxOffset: maxOffset.x,
        thumbRect,
        trackRect,
        viewportLength: viewportRect.width,
      });
    }
  }
  return layouts;
}

export function isGpuRetainedContentScrollbarHit(
  hit: GpuRetainedContentHitTarget,
): boolean {
  return (
    hit.hit.kind === "scrollbar-thumb" || hit.hit.kind === "scrollbar-track"
  );
}

export function isGpuRetainedContentScrollbarThumbHit(
  hit: GpuRetainedContentHitTarget,
): boolean {
  return hit.hit.kind === "scrollbar-thumb";
}

export function resolveGpuRetainedContentScrollbarTrackClick({
  hit,
  scene,
  scrollOffsets,
}: {
  readonly hit: GpuRetainedContentHitTarget;
  readonly scene: GpuFlowScene;
  readonly scrollOffsets: GpuRetainedContentScrollOffsetMap;
}): GpuRetainedContentScrollResult {
  if (hit.hit.kind !== "scrollbar-track" || !hit.hit.scrollbarAxis) {
    return unchangedGpuRetainedContentScrollbarScroll(scrollOffsets);
  }
  const context = getGpuRetainedContentScrollbarContext({
    scene,
    surfaceId: hit.surfaceId,
  });
  if (!context) {
    return unchangedGpuRetainedContentScrollbarScroll(scrollOffsets);
  }
  const layout = getGpuRetainedContentScrollbarLayoutForAxis({
    axis: hit.hit.scrollbarAxis,
    surface: context.surface,
  });
  if (!layout) {
    return unchangedGpuRetainedContentScrollbarScroll(scrollOffsets);
  }
  const pointerValue = getGpuRetainedContentScrollbarPointValue(
    hit.localPoint,
    layout.axis,
  );
  const thumbMin = getGpuRetainedContentScrollbarRectMin(
    layout.thumbRect,
    layout.axis,
  );
  const thumbMax = getGpuRetainedContentScrollbarRectMax(
    layout.thumbRect,
    layout.axis,
  );
  const direction =
    pointerValue < thumbMin ? -1 : pointerValue > thumbMax ? 1 : 0;
  if (direction === 0) {
    return unchangedGpuRetainedContentScrollbarScroll(scrollOffsets);
  }
  const currentOffset =
    scrollOffsets.get(context.surface.id) ??
    context.surface.retainedScene.scrollOffset;
  const nextOffset = clampGpuRetainedContentScrollOffset({
    contentRect: context.surface.retainedScene.contentRect,
    scrollOffset: {
      ...currentOffset,
      [layout.axis]:
        currentOffset[layout.axis] + direction * layout.viewportLength,
    },
    viewportRect: context.surface.retainedScene.viewportRect,
  });
  return createGpuRetainedContentScrollbarScrollResult({
    currentOffset,
    nextOffset,
    scrollOffsets,
    surfaceId: context.surface.id,
  });
}

export function resolveGpuRetainedContentScrollbarThumbDrag({
  activeHit,
  flowPoint,
  scene,
  scrollOffsets,
}: {
  readonly activeHit: GpuRetainedContentHitTarget;
  readonly flowPoint: GpuPoint;
  readonly scene: GpuFlowScene;
  readonly scrollOffsets: GpuRetainedContentScrollOffsetMap;
}): GpuRetainedContentScrollResult {
  if (
    activeHit.hit.kind !== "scrollbar-thumb" ||
    !activeHit.hit.scrollbarAxis
  ) {
    return unchangedGpuRetainedContentScrollbarScroll(scrollOffsets);
  }
  const context = getGpuRetainedContentScrollbarContext({
    scene,
    surfaceId: activeHit.surfaceId,
  });
  if (!context) {
    return unchangedGpuRetainedContentScrollbarScroll(scrollOffsets);
  }
  const layout = getGpuRetainedContentScrollbarLayoutForAxis({
    axis: activeHit.hit.scrollbarAxis,
    surface: context.surface,
  });
  if (!layout) {
    return unchangedGpuRetainedContentScrollbarScroll(scrollOffsets);
  }
  const trackTravel = getGpuRetainedContentScrollbarTrackTravel(layout);
  if (trackTravel <= 0) {
    return unchangedGpuRetainedContentScrollbarScroll(scrollOffsets);
  }
  const currentLocalPoint = {
    x: flowPoint.x - context.surface.rect.x,
    y: flowPoint.y - context.surface.rect.y,
  };
  const dragDelta =
    getGpuRetainedContentScrollbarPointValue(currentLocalPoint, layout.axis) -
    getGpuRetainedContentScrollbarPointValue(activeHit.localPoint, layout.axis);
  const startThumbPosition =
    getGpuRetainedContentScrollbarRectMin(activeHit.hit.rect, layout.axis) -
    getGpuRetainedContentScrollbarRectMin(layout.trackRect, layout.axis);
  const nextThumbPosition = clampNumber(
    startThumbPosition + dragDelta,
    0,
    trackTravel,
  );
  const currentOffset =
    scrollOffsets.get(context.surface.id) ??
    context.surface.retainedScene.scrollOffset;
  const nextOffset = clampGpuRetainedContentScrollOffset({
    contentRect: context.surface.retainedScene.contentRect,
    scrollOffset: {
      ...currentOffset,
      [layout.axis]: (nextThumbPosition / trackTravel) * layout.maxOffset,
    },
    viewportRect: context.surface.retainedScene.viewportRect,
  });
  return createGpuRetainedContentScrollbarScrollResult({
    currentOffset,
    nextOffset,
    scrollOffsets,
    surfaceId: context.surface.id,
  });
}

function createGpuRetainedContentVerticalScrollbarTrackRect({
  hasHorizontal,
  viewportRect,
}: {
  readonly hasHorizontal: boolean;
  readonly viewportRect: GpuRect;
}): GpuRect {
  return {
    height: Math.max(
      0,
      viewportRect.height -
        GPU_RETAINED_CONTENT_SCROLLBAR_INSET * 2 -
        (hasHorizontal
          ? GPU_RETAINED_CONTENT_SCROLLBAR_THICKNESS +
            GPU_RETAINED_CONTENT_SCROLLBAR_INSET
          : 0),
    ),
    width: GPU_RETAINED_CONTENT_SCROLLBAR_THICKNESS,
    x:
      viewportRect.x +
      viewportRect.width -
      GPU_RETAINED_CONTENT_SCROLLBAR_THICKNESS -
      GPU_RETAINED_CONTENT_SCROLLBAR_INSET,
    y: viewportRect.y + GPU_RETAINED_CONTENT_SCROLLBAR_INSET,
  };
}

function createGpuRetainedContentHorizontalScrollbarTrackRect({
  hasVertical,
  viewportRect,
}: {
  readonly hasVertical: boolean;
  readonly viewportRect: GpuRect;
}): GpuRect {
  return {
    height: GPU_RETAINED_CONTENT_SCROLLBAR_THICKNESS,
    width: Math.max(
      0,
      viewportRect.width -
        GPU_RETAINED_CONTENT_SCROLLBAR_INSET * 2 -
        (hasVertical
          ? GPU_RETAINED_CONTENT_SCROLLBAR_THICKNESS +
            GPU_RETAINED_CONTENT_SCROLLBAR_INSET
          : 0),
    ),
    x: viewportRect.x + GPU_RETAINED_CONTENT_SCROLLBAR_INSET,
    y:
      viewportRect.y +
      viewportRect.height -
      GPU_RETAINED_CONTENT_SCROLLBAR_THICKNESS -
      GPU_RETAINED_CONTENT_SCROLLBAR_INSET,
  };
}

function createGpuRetainedContentScrollbarThumbRect({
  axis,
  contentLength,
  maxOffset,
  scrollOffset,
  trackRect,
  viewportLength,
}: {
  readonly axis: GpuRetainedContentScrollbarAxis;
  readonly contentLength: number;
  readonly maxOffset: number;
  readonly scrollOffset: number;
  readonly trackRect: GpuRect;
  readonly viewportLength: number;
}): GpuRect | null {
  const trackLength = getGpuRetainedContentScrollbarRectLength(trackRect, axis);
  if (trackLength <= 0 || contentLength <= 0 || viewportLength <= 0) {
    return null;
  }
  const thumbLength = Math.min(
    trackLength,
    Math.max(
      GPU_RETAINED_CONTENT_SCROLLBAR_MIN_THUMB_LENGTH,
      (viewportLength / contentLength) * trackLength,
    ),
  );
  const trackTravel = Math.max(0, trackLength - thumbLength);
  const thumbOffset =
    maxOffset <= 0
      ? 0
      : (clampNumber(scrollOffset, 0, maxOffset) / maxOffset) * trackTravel;
  if (axis === "y") {
    return {
      height: thumbLength,
      width: trackRect.width,
      x: trackRect.x,
      y: trackRect.y + thumbOffset,
    };
  }
  return {
    height: trackRect.height,
    width: thumbLength,
    x: trackRect.x + thumbOffset,
    y: trackRect.y,
  };
}

function getGpuRetainedContentScrollbarContext({
  scene,
  surfaceId,
}: {
  readonly scene: GpuFlowScene;
  readonly surfaceId: string;
}): { readonly surface: GpuRetainedContentSurfaceWithScene } | null {
  const surface = scene.contentSurfaces.find(
    (candidate) => candidate.id === surfaceId,
  );
  if (
    !surface ||
    surface.renderer.kind !== "canvas-content" ||
    !surface.retainedScene
  ) {
    return null;
  }
  return { surface: surface as GpuRetainedContentSurfaceWithScene };
}

function getGpuRetainedContentScrollbarLayoutForAxis({
  axis,
  surface,
}: {
  readonly axis: GpuRetainedContentScrollbarAxis;
  readonly surface: GpuRetainedContentSurfaceWithScene;
}): GpuRetainedContentScrollbarLayout | null {
  return (
    createGpuRetainedContentScrollbarLayouts({
      contentRect: surface.retainedScene.contentRect,
      scrollOffset: surface.retainedScene.scrollOffset,
      viewportRect: surface.retainedScene.viewportRect,
    }).find((layout) => layout.axis === axis) ?? null
  );
}

function createGpuRetainedContentScrollbarScrollResult({
  currentOffset,
  nextOffset,
  scrollOffsets,
  surfaceId,
}: {
  readonly currentOffset: GpuPoint;
  readonly nextOffset: GpuPoint;
  readonly scrollOffsets: GpuRetainedContentScrollOffsetMap;
  readonly surfaceId: string;
}): GpuRetainedContentScrollResult {
  if (nextOffset.x === currentOffset.x && nextOffset.y === currentOffset.y) {
    return unchangedGpuRetainedContentScrollbarScroll(scrollOffsets);
  }
  const nextOffsets = new Map(scrollOffsets);
  nextOffsets.set(surfaceId, nextOffset);
  return {
    changed: true,
    scrollOffsets: nextOffsets,
    surfaceId,
  };
}

function unchangedGpuRetainedContentScrollbarScroll(
  scrollOffsets: GpuRetainedContentScrollOffsetMap,
): GpuRetainedContentScrollResult {
  return {
    changed: false,
    scrollOffsets,
    surfaceId: null,
  };
}

function getGpuRetainedContentScrollbarTrackTravel(
  layout: GpuRetainedContentScrollbarLayout,
): number {
  return Math.max(
    0,
    getGpuRetainedContentScrollbarRectLength(layout.trackRect, layout.axis) -
      getGpuRetainedContentScrollbarRectLength(layout.thumbRect, layout.axis),
  );
}

function getGpuRetainedContentScrollbarRectLength(
  rect: GpuRect,
  axis: GpuRetainedContentScrollbarAxis,
): number {
  return axis === "y" ? rect.height : rect.width;
}

function getGpuRetainedContentScrollbarRectMin(
  rect: GpuRect,
  axis: GpuRetainedContentScrollbarAxis,
): number {
  return axis === "y" ? rect.y : rect.x;
}

function getGpuRetainedContentScrollbarRectMax(
  rect: GpuRect,
  axis: GpuRetainedContentScrollbarAxis,
): number {
  return (
    getGpuRetainedContentScrollbarRectMin(rect, axis) +
    getGpuRetainedContentScrollbarRectLength(rect, axis)
  );
}

function getGpuRetainedContentScrollbarPointValue(
  point: GpuPoint,
  axis: GpuRetainedContentScrollbarAxis,
): number {
  return axis === "y" ? point.y : point.x;
}
