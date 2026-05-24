import type { HtmlSurfaceSolidRoundedRectVisual } from "../htmlSurfaces/visualScene";
import type { GpuFlowNodeLayerState } from "./flowLayerState";

export function combineGpuFlowHtmlSurfaceNativeVisuals(
  baseVisuals: readonly HtmlSurfaceSolidRoundedRectVisual[] | null | undefined,
  ...visualGroups: readonly (readonly HtmlSurfaceSolidRoundedRectVisual[])[]
): readonly HtmlSurfaceSolidRoundedRectVisual[] | undefined {
  const transientVisuals = visualGroups.flat();
  if (!baseVisuals?.length && transientVisuals.length === 0) {
    return undefined;
  }
  if (!baseVisuals?.length) {
    return transientVisuals;
  }
  if (transientVisuals.length === 0) {
    return baseVisuals;
  }
  return [...baseVisuals, ...transientVisuals];
}

export function createGpuFlowRetainedContentNativeVisualSignature(
  layer: GpuFlowNodeLayerState,
): string {
  return JSON.stringify({
    rowHoverTarget: layer.retainedContentRowHoverTarget ?? null,
    scrollbarVisualState: layer.retainedContentScrollbarVisualState ?? null,
  });
}
