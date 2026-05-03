import type { GpuContentSurface, GpuFlowScene } from "./scene";
import type { GpuPoint, GpuRect } from "./viewportMath";

export type GpuRetainedContentScrollOffsetMap = ReadonlyMap<string, GpuPoint>;

export type GpuRetainedContentScrollResult = {
  readonly changed: boolean;
  readonly scrollOffsets: GpuRetainedContentScrollOffsetMap;
  readonly surfaceId: string | null;
};

type GpuRetainedContentWheelScrollResult = GpuRetainedContentScrollResult;

type GpuRetainedContentDragAutoScrollResult = GpuRetainedContentScrollResult;

type GpuRetainedContentSurfaceWithScene = GpuContentSurface & {
  readonly retainedScene: NonNullable<GpuContentSurface["retainedScene"]>;
};

const DEFAULT_RETAINED_CONTENT_DRAG_AUTO_SCROLL_MARGIN_PX = 36;
const DEFAULT_RETAINED_CONTENT_DRAG_AUTO_SCROLL_MAX_SPEED_PX = 18;
const GPU_RETAINED_CONTENT_WHEEL_DELTA_LINE = 1;
const GPU_RETAINED_CONTENT_WHEEL_DELTA_PAGE = 2;
const GPU_RETAINED_CONTENT_WHEEL_LINE_DELTA_PX = 20;

export function resolveGpuRetainedContentDragAutoScroll({
  marginPx = DEFAULT_RETAINED_CONTENT_DRAG_AUTO_SCROLL_MARGIN_PX,
  maxSpeedPx = DEFAULT_RETAINED_CONTENT_DRAG_AUTO_SCROLL_MAX_SPEED_PX,
  point,
  scene,
  scrollOffsets,
  surfaceId,
}: {
  readonly marginPx?: number | undefined;
  readonly maxSpeedPx?: number | undefined;
  readonly point: GpuPoint;
  readonly scene: GpuFlowScene;
  readonly scrollOffsets: GpuRetainedContentScrollOffsetMap;
  readonly surfaceId: string;
}): GpuRetainedContentDragAutoScrollResult {
  assertFiniteNonNegative("retained content drag auto-scroll margin", marginPx);
  assertFiniteNonNegative(
    "retained content drag auto-scroll max speed",
    maxSpeedPx,
  );
  assertFiniteNumber("retained content drag point x", point.x);
  assertFiniteNumber("retained content drag point y", point.y);
  const surface = getGpuRetainedContentSurfaceById(scene, surfaceId);
  if (!surface) {
    throw new Error(
      `Missing retained content drag scroll surface ${surfaceId}.`,
    );
  }
  const currentOffset =
    scrollOffsets.get(surface.id) ?? surface.retainedScene.scrollOffset;
  const nextOffset = resolveGpuRetainedContentDragAutoScrollOffset({
    currentOffset,
    localPoint: {
      x: point.x - surface.rect.x,
      y: point.y - surface.rect.y,
    },
    marginPx,
    maxSpeedPx,
    surface,
  });
  if (!nextOffset) {
    return unchangedGpuRetainedContentScroll(scrollOffsets);
  }
  const nextOffsets = new Map(scrollOffsets);
  nextOffsets.set(surface.id, nextOffset);
  return {
    changed: true,
    scrollOffsets: nextOffsets,
    surfaceId: surface.id,
  };
}

function resolveGpuRetainedContentDragAutoScrollOffset({
  currentOffset,
  localPoint,
  marginPx,
  maxSpeedPx,
  surface,
}: {
  readonly currentOffset: GpuPoint;
  readonly localPoint: GpuPoint;
  readonly marginPx: number;
  readonly maxSpeedPx: number;
  readonly surface: GpuRetainedContentSurfaceWithScene;
}): GpuPoint | null {
  const maxOffset = getGpuRetainedContentMaxScrollOffset({
    contentRect: surface.retainedScene.contentRect,
    viewportRect: surface.retainedScene.viewportRect,
  });
  if (maxOffset.x <= 0 && maxOffset.y <= 0) {
    return null;
  }
  const delta = getGpuRetainedContentDragAutoScrollDelta({
    localPoint,
    marginPx,
    maxOffset,
    maxSpeedPx,
    viewportRect: surface.retainedScene.viewportRect,
  });
  if (delta.x === 0 && delta.y === 0) {
    return null;
  }
  const nextOffset = clampGpuRetainedContentScrollOffset({
    contentRect: surface.retainedScene.contentRect,
    scrollOffset: {
      x: currentOffset.x + delta.x,
      y: currentOffset.y + delta.y,
    },
    viewportRect: surface.retainedScene.viewportRect,
  });
  if (nextOffset.x === currentOffset.x && nextOffset.y === currentOffset.y) {
    return null;
  }
  return nextOffset;
}

export function resolveGpuRetainedContentWheelScroll({
  event,
  point,
  scene,
  scrollOffsets,
}: {
  readonly event: Pick<
    WheelEvent,
    "deltaMode" | "deltaX" | "deltaY" | "shiftKey"
  >;
  readonly point: GpuPoint;
  readonly scene: GpuFlowScene;
  readonly scrollOffsets: GpuRetainedContentScrollOffsetMap;
}): GpuRetainedContentWheelScrollResult {
  assertFiniteNumber("retained content wheel point x", point.x);
  assertFiniteNumber("retained content wheel point y", point.y);
  const context = getGpuRetainedContentWheelScrollContext({ point, scene });
  if (!context) {
    return unchangedGpuRetainedContentScroll(scrollOffsets);
  }
  const currentOffset =
    scrollOffsets.get(context.surface.id) ??
    context.surface.retainedScene.scrollOffset;
  const delta = getGpuRetainedContentWheelPixelDelta(
    event,
    context.surface.retainedScene.viewportRect,
  );
  const maxOffset = getGpuRetainedContentMaxScrollOffset({
    contentRect: context.surface.retainedScene.contentRect,
    viewportRect: context.surface.retainedScene.viewportRect,
  });
  const nextOffset = clampGpuRetainedContentScrollOffset({
    contentRect: context.surface.retainedScene.contentRect,
    scrollOffset: {
      x: currentOffset.x + getGpuRetainedContentWheelDeltaX(delta, event),
      y:
        currentOffset.y +
        getGpuRetainedContentWheelDeltaY({
          delta,
          maxOffset,
          shiftKey: event.shiftKey,
        }),
    },
    viewportRect: context.surface.retainedScene.viewportRect,
  });
  if (nextOffset.x === currentOffset.x && nextOffset.y === currentOffset.y) {
    return unchangedGpuRetainedContentScroll(scrollOffsets);
  }
  const nextOffsets = new Map(scrollOffsets);
  nextOffsets.set(context.surface.id, nextOffset);
  return {
    changed: true,
    scrollOffsets: nextOffsets,
    surfaceId: context.surface.id,
  };
}

export function clampGpuRetainedContentScrollOffset({
  contentRect,
  scrollOffset,
  viewportRect,
}: {
  readonly contentRect: Pick<GpuRect, "height" | "width">;
  readonly scrollOffset: GpuPoint;
  readonly viewportRect: Pick<GpuRect, "height" | "width">;
}): GpuPoint {
  assertFiniteNumber("retained content scroll x", scrollOffset.x);
  assertFiniteNumber("retained content scroll y", scrollOffset.y);
  const maxOffset = getGpuRetainedContentMaxScrollOffset({
    contentRect,
    viewportRect,
  });
  return {
    x: clampNumber(scrollOffset.x, 0, maxOffset.x),
    y: clampNumber(scrollOffset.y, 0, maxOffset.y),
  };
}

function getGpuRetainedContentWheelScrollContext({
  point,
  scene,
}: {
  readonly point: GpuPoint;
  readonly scene: GpuFlowScene;
}): {
  readonly surface: GpuContentSurface & {
    readonly retainedScene: NonNullable<GpuContentSurface["retainedScene"]>;
  };
} | null {
  const candidates = scene.contentSurfaces
    .map((surface, index) => ({ index, surface }))
    .filter(({ surface }) =>
      isGpuRetainedContentWheelScrollCandidate({ point, surface }),
    )
    .sort(
      (left, right) =>
        right.surface.zIndex - left.surface.zIndex || right.index - left.index,
    );
  const winner = candidates[0];
  if (!winner) {
    return null;
  }
  return {
    surface: winner.surface as GpuContentSurface & {
      readonly retainedScene: NonNullable<GpuContentSurface["retainedScene"]>;
    },
  };
}

function getGpuRetainedContentSurfaceById(
  scene: GpuFlowScene,
  surfaceId: string,
): GpuRetainedContentSurfaceWithScene | null {
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
  return surface as GpuRetainedContentSurfaceWithScene;
}

function isGpuRetainedContentWheelScrollCandidate({
  point,
  surface,
}: {
  readonly point: GpuPoint;
  readonly surface: GpuContentSurface;
}): boolean {
  if (!surface.retainedScene) {
    return false;
  }
  const maxOffset = getGpuRetainedContentMaxScrollOffset({
    contentRect: surface.retainedScene.contentRect,
    viewportRect: surface.retainedScene.viewportRect,
  });
  if (maxOffset.x <= 0 && maxOffset.y <= 0) {
    return false;
  }
  return gpuRectContainsPoint(
    intersectGpuRects(surface.rect, surface.clipRect),
    point,
  );
}

function getGpuRetainedContentDragAutoScrollDelta({
  localPoint,
  marginPx,
  maxOffset,
  maxSpeedPx,
  viewportRect,
}: {
  readonly localPoint: GpuPoint;
  readonly marginPx: number;
  readonly maxOffset: GpuPoint;
  readonly maxSpeedPx: number;
  readonly viewportRect: GpuRect;
}): GpuPoint {
  return {
    x:
      maxOffset.x > 0 &&
      isGpuRetainedContentPointInsideAxis(localPoint, "y", viewportRect)
        ? getGpuRetainedContentDragAutoScrollAxisDelta({
            axis: "x",
            marginPx,
            maxSpeedPx,
            point: localPoint,
            viewportRect,
          })
        : 0,
    y:
      maxOffset.y > 0 &&
      isGpuRetainedContentPointInsideAxis(localPoint, "x", viewportRect)
        ? getGpuRetainedContentDragAutoScrollAxisDelta({
            axis: "y",
            marginPx,
            maxSpeedPx,
            point: localPoint,
            viewportRect,
          })
        : 0,
  };
}

function getGpuRetainedContentDragAutoScrollAxisDelta({
  axis,
  marginPx,
  maxSpeedPx,
  point,
  viewportRect,
}: {
  readonly axis: "x" | "y";
  readonly marginPx: number;
  readonly maxSpeedPx: number;
  readonly point: GpuPoint;
  readonly viewportRect: GpuRect;
}): number {
  const pointValue = getGpuRetainedContentPointValueOnAxis(point, axis);
  const min = getGpuRetainedContentRectMinOnAxis(viewportRect, axis) + marginPx;
  const max = getGpuRetainedContentRectMaxOnAxis(viewportRect, axis) - marginPx;
  if (pointValue < min) {
    return -getGpuRetainedContentDragAutoScrollVelocity({
      maxSpeedPx,
      pointValue,
      threshold: min,
    });
  }
  if (pointValue > max) {
    return getGpuRetainedContentDragAutoScrollVelocity({
      maxSpeedPx,
      pointValue,
      threshold: max,
    });
  }
  return 0;
}

function getGpuRetainedContentDragAutoScrollVelocity({
  maxSpeedPx,
  pointValue,
  threshold,
}: {
  readonly maxSpeedPx: number;
  readonly pointValue: number;
  readonly threshold: number;
}): number {
  return (
    (clampNumber(Math.abs(pointValue - threshold), 1, 50) / 50) * maxSpeedPx
  );
}

function getGpuRetainedContentWheelDeltaX(
  delta: { readonly x: number; readonly y: number },
  event: Pick<WheelEvent, "shiftKey">,
): number {
  if (delta.x !== 0) {
    return delta.x;
  }
  return event.shiftKey ? delta.y : 0;
}

function getGpuRetainedContentWheelDeltaY({
  delta,
  maxOffset,
  shiftKey,
}: {
  readonly delta: { readonly x: number; readonly y: number };
  readonly maxOffset: GpuPoint;
  readonly shiftKey: boolean;
}): number {
  if (shiftKey && maxOffset.x > 0) {
    return 0;
  }
  return delta.y;
}

function getGpuRetainedContentWheelPixelDelta(
  event: Pick<WheelEvent, "deltaMode" | "deltaX" | "deltaY">,
  viewportRect: Pick<GpuRect, "height" | "width">,
): { readonly x: number; readonly y: number } {
  if (event.deltaMode === GPU_RETAINED_CONTENT_WHEEL_DELTA_LINE) {
    return {
      x: event.deltaX * GPU_RETAINED_CONTENT_WHEEL_LINE_DELTA_PX,
      y: event.deltaY * GPU_RETAINED_CONTENT_WHEEL_LINE_DELTA_PX,
    };
  }
  if (event.deltaMode === GPU_RETAINED_CONTENT_WHEEL_DELTA_PAGE) {
    return {
      x: event.deltaX * viewportRect.width,
      y: event.deltaY * viewportRect.height,
    };
  }
  return {
    x: event.deltaX,
    y: event.deltaY,
  };
}

function getGpuRetainedContentMaxScrollOffset({
  contentRect,
  viewportRect,
}: {
  readonly contentRect: Pick<GpuRect, "height" | "width">;
  readonly viewportRect: Pick<GpuRect, "height" | "width">;
}): GpuPoint {
  assertFiniteNonNegative("retained content width", contentRect.width);
  assertFiniteNonNegative("retained content height", contentRect.height);
  assertFiniteNonNegative(
    "retained content viewport width",
    viewportRect.width,
  );
  assertFiniteNonNegative(
    "retained content viewport height",
    viewportRect.height,
  );
  return {
    x: Math.max(0, contentRect.width - viewportRect.width),
    y: Math.max(0, contentRect.height - viewportRect.height),
  };
}

function unchangedGpuRetainedContentScroll(
  scrollOffsets: GpuRetainedContentScrollOffsetMap,
): GpuRetainedContentScrollResult {
  return {
    changed: false,
    scrollOffsets,
    surfaceId: null,
  };
}

function gpuRectContainsPoint(rect: GpuRect, point: GpuPoint): boolean {
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

function intersectGpuRects(left: GpuRect, right: GpuRect): GpuRect {
  const x = Math.max(left.x, right.x);
  const y = Math.max(left.y, right.y);
  const maxX = Math.min(left.x + left.width, right.x + right.width);
  const maxY = Math.min(left.y + left.height, right.y + right.height);
  return {
    height: Math.max(maxY - y, 0),
    width: Math.max(maxX - x, 0),
    x,
    y,
  };
}

function isGpuRetainedContentPointInsideAxis(
  point: GpuPoint,
  axis: "x" | "y",
  rect: GpuRect,
): boolean {
  const pointValue = getGpuRetainedContentPointValueOnAxis(point, axis);
  return (
    pointValue >= getGpuRetainedContentRectMinOnAxis(rect, axis) &&
    pointValue <= getGpuRetainedContentRectMaxOnAxis(rect, axis)
  );
}

function getGpuRetainedContentPointValueOnAxis(
  point: GpuPoint,
  axis: "x" | "y",
): number {
  return axis === "x" ? point.x : point.y;
}

function getGpuRetainedContentRectMinOnAxis(
  rect: GpuRect,
  axis: "x" | "y",
): number {
  return axis === "x" ? rect.x : rect.y;
}

function getGpuRetainedContentRectMaxOnAxis(
  rect: GpuRect,
  axis: "x" | "y",
): number {
  return (
    getGpuRetainedContentRectMinOnAxis(rect, axis) +
    (axis === "x" ? rect.width : rect.height)
  );
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function assertFiniteNumber(name: string, value: number) {
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be a finite number.`);
  }
}

function assertFiniteNonNegative(name: string, value: number) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a finite non-negative number.`);
  }
}
