import type { GpuRetainedDomControlSourceDescriptor } from "../retainedDomControlScene";
import type { GpuRect } from "../viewportMath";
import type { GpuFlowRetainedScrollOffsetGetter } from "./domControlPlaneProjection";

type GpuFlowDomControlProjectionKnobs = {
  readonly directionalHorizonMaxCssPx: number;
  readonly directionalHorizonMultiplier: number;
  readonly maxCompatiblePreviousControls: number;
  readonly maxCompatiblePreviousFrames: number;
  readonly maxOverscanMountedControls: number;
  readonly maxReadableMountedControls: number;
  readonly minVisibleScreenHeightCssPx: number;
  readonly projectionHorizonCssPx: number;
  readonly reverseHorizonCssPx: number;
  readonly smallSceneMountedControlLimit: number;
};

export const DEFAULT_GPU_FLOW_DOM_CONTROL_PROJECTION_KNOBS: GpuFlowDomControlProjectionKnobs =
  Object.freeze({
    directionalHorizonMaxCssPx: 2160,
    directionalHorizonMultiplier: 2,
    maxCompatiblePreviousControls: 8,
    maxCompatiblePreviousFrames: 2,
    maxOverscanMountedControls: 8,
    maxReadableMountedControls: 24,
    minVisibleScreenHeightCssPx: 8,
    projectionHorizonCssPx: 720,
    reverseHorizonCssPx: 360,
    smallSceneMountedControlLimit: 64,
  });

export function getGpuFlowDomControlProjectionHorizonFlowRect({
  scrollVector,
  visibleFlowRect,
}: {
  readonly scrollVector: { readonly x: number; readonly y: number };
  readonly visibleFlowRect: GpuRect;
}): GpuRect {
  const margins =
    getGpuFlowDomControlProjectionDirectionalMargins(scrollVector);
  return {
    height: visibleFlowRect.height + margins.top + margins.bottom,
    width: visibleFlowRect.width + margins.left + margins.right,
    x: visibleFlowRect.x - margins.left,
    y: visibleFlowRect.y - margins.top,
  };
}

export function getGpuFlowDomControlProjectionScrollVector({
  controls,
  getRetainedScrollOffset,
}: {
  readonly controls: readonly GpuRetainedDomControlSourceDescriptor[];
  readonly getRetainedScrollOffset:
    | GpuFlowRetainedScrollOffsetGetter
    | undefined;
}): { readonly x: number; readonly y: number } {
  let strongestX = 0;
  let strongestY = 0;
  for (const control of controls) {
    const liveOffset = getRetainedScrollOffset?.(control.surfaceId);
    if (!liveOffset) {
      continue;
    }
    const deltaX = liveOffset.x - control.sectionScrollOffset.x;
    const deltaY = liveOffset.y - control.sectionScrollOffset.y;
    if (Math.abs(deltaX) > Math.abs(strongestX)) {
      strongestX = deltaX;
    }
    if (Math.abs(deltaY) > Math.abs(strongestY)) {
      strongestY = deltaY;
    }
  }
  return { x: strongestX, y: strongestY };
}

export function getGpuFlowDomControlPlaneProjectionPriorityDistance({
  geometry,
  scrollVector,
  visibleFlowRect,
}: {
  readonly geometry: {
    readonly worldRectFlowPx: GpuRect;
  };
  readonly scrollVector: { readonly x: number; readonly y: number };
  readonly visibleFlowRect: GpuRect;
}): number {
  if (
    Math.abs(scrollVector.y) >= Math.abs(scrollVector.x) &&
    scrollVector.y !== 0
  ) {
    return getDirectionalAxisDistance({
      end: geometry.worldRectFlowPx.y + geometry.worldRectFlowPx.height,
      forward: scrollVector.y > 0,
      start: geometry.worldRectFlowPx.y,
      viewportEnd: visibleFlowRect.y + visibleFlowRect.height,
      viewportStart: visibleFlowRect.y,
    });
  }
  if (scrollVector.x !== 0) {
    return getDirectionalAxisDistance({
      end: geometry.worldRectFlowPx.x + geometry.worldRectFlowPx.width,
      forward: scrollVector.x > 0,
      start: geometry.worldRectFlowPx.x,
      viewportEnd: visibleFlowRect.x + visibleFlowRect.width,
      viewportStart: visibleFlowRect.x,
    });
  }
  return getDistanceToCenter({
    geometry,
    visibleFlowRect,
  });
}

function getGpuFlowDomControlProjectionDirectionalMargins({
  x,
  y,
}: {
  readonly x: number;
  readonly y: number;
}): {
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
  readonly top: number;
} {
  const knobs = DEFAULT_GPU_FLOW_DOM_CONTROL_PROJECTION_KNOBS;
  const xAhead = getGpuFlowDomControlProjectionAheadMargin(Math.abs(x));
  const yAhead = getGpuFlowDomControlProjectionAheadMargin(Math.abs(y));
  return {
    bottom:
      y === 0
        ? knobs.projectionHorizonCssPx
        : y > 0
          ? yAhead
          : knobs.reverseHorizonCssPx,
    left:
      x === 0
        ? knobs.projectionHorizonCssPx
        : x < 0
          ? xAhead
          : knobs.reverseHorizonCssPx,
    right:
      x === 0
        ? knobs.projectionHorizonCssPx
        : x > 0
          ? xAhead
          : knobs.reverseHorizonCssPx,
    top:
      y === 0
        ? knobs.projectionHorizonCssPx
        : y < 0
          ? yAhead
          : knobs.reverseHorizonCssPx,
  };
}

function getGpuFlowDomControlProjectionAheadMargin(deltaCssPx: number): number {
  const knobs = DEFAULT_GPU_FLOW_DOM_CONTROL_PROJECTION_KNOBS;
  return Math.min(
    knobs.directionalHorizonMaxCssPx,
    knobs.projectionHorizonCssPx +
      deltaCssPx * knobs.directionalHorizonMultiplier,
  );
}

function getDistanceToCenter({
  geometry,
  visibleFlowRect,
}: {
  readonly geometry: {
    readonly worldRectFlowPx: GpuRect;
  };
  readonly visibleFlowRect: GpuRect;
}): number {
  const controlCenterX =
    geometry.worldRectFlowPx.x + geometry.worldRectFlowPx.width / 2;
  const controlCenterY =
    geometry.worldRectFlowPx.y + geometry.worldRectFlowPx.height / 2;
  const viewportCenterX = visibleFlowRect.x + visibleFlowRect.width / 2;
  const viewportCenterY = visibleFlowRect.y + visibleFlowRect.height / 2;
  return Math.hypot(
    controlCenterX - viewportCenterX,
    controlCenterY - viewportCenterY,
  );
}

function getDirectionalAxisDistance({
  end,
  forward,
  start,
  viewportEnd,
  viewportStart,
}: {
  readonly end: number;
  readonly forward: boolean;
  readonly start: number;
  readonly viewportEnd: number;
  readonly viewportStart: number;
}): number {
  const awayFromMotionPenalty = 1_000_000;
  if (start < viewportEnd && end > viewportStart) {
    return 0;
  }
  if (forward) {
    return start >= viewportEnd
      ? start - viewportEnd
      : awayFromMotionPenalty + viewportStart - end;
  }
  return end <= viewportStart
    ? viewportStart - end
    : awayFromMotionPenalty + start - viewportEnd;
}
