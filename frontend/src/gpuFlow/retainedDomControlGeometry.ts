import type { GpuRect } from "./viewportMath";

export const GPU_RETAINED_DOM_CONTROL_PROJECTION_HORIZON_CSS_PX = 720;

export function createGpuRetainedDomControlPreparationClipRect(
  sectionClipRectSurfaceCssPx: GpuRect,
): GpuRect {
  return {
    height:
      sectionClipRectSurfaceCssPx.height +
      GPU_RETAINED_DOM_CONTROL_PROJECTION_HORIZON_CSS_PX * 2,
    width:
      sectionClipRectSurfaceCssPx.width +
      GPU_RETAINED_DOM_CONTROL_PROJECTION_HORIZON_CSS_PX * 2,
    x:
      sectionClipRectSurfaceCssPx.x -
      GPU_RETAINED_DOM_CONTROL_PROJECTION_HORIZON_CSS_PX,
    y:
      sectionClipRectSurfaceCssPx.y -
      GPU_RETAINED_DOM_CONTROL_PROJECTION_HORIZON_CSS_PX,
  };
}

export function intersectGpuRetainedDomControlRects(
  left: GpuRect,
  right: GpuRect,
): GpuRect {
  const x = Math.max(left.x, right.x);
  const y = Math.max(left.y, right.y);
  const maxX = Math.min(left.x + left.width, right.x + right.width);
  const maxY = Math.min(left.y + left.height, right.y + right.height);
  return {
    height: Math.max(0, maxY - y),
    width: Math.max(0, maxX - x),
    x,
    y,
  };
}
