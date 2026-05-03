import type { GpuContentSurface, GpuFlowScene } from "./scene";
import type { GpuPoint, GpuRect } from "./viewportMath";

export type GpuRetainedContentScrollOffsetMap = ReadonlyMap<string, GpuPoint>;

export type GpuRetainedContentScrollResult = {
  readonly changed: boolean;
  readonly scrollOffsets: GpuRetainedContentScrollOffsetMap;
  readonly surfaceId: string | null;
};

export type GpuRetainedContentWheelScrollResult =
  GpuRetainedContentScrollResult;

const GPU_RETAINED_CONTENT_WHEEL_DELTA_LINE = 1;
const GPU_RETAINED_CONTENT_WHEEL_DELTA_PAGE = 2;
const GPU_RETAINED_CONTENT_WHEEL_LINE_DELTA_PX = 20;

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
  assertFiniteNonNegative("retained content scroll x", scrollOffset.x);
  assertFiniteNonNegative("retained content scroll y", scrollOffset.y);
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
