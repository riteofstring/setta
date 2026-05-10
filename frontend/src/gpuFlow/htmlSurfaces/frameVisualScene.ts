import type { HtmlSurfaceVisualBuildResult } from "./surfaceVisuals";
import {
  createHtmlSurfaceVisualScene,
  type HtmlSurfaceFlatVisual,
  type HtmlSurfaceSolidRoundedRectVisual,
  type HtmlSurfaceVisualScene,
} from "./visualScene";

export function createGpuNodeVisualScene({
  htmlSurfaceLateVisuals,
  htmlSurfaceNativeVisuals,
  htmlSurfacePageVisuals,
  visualSurfaces,
}: {
  readonly htmlSurfaceLateVisuals: readonly HtmlSurfaceFlatVisual[] | undefined;
  readonly htmlSurfaceNativeVisuals:
    | readonly HtmlSurfaceSolidRoundedRectVisual[]
    | undefined;
  readonly htmlSurfacePageVisuals: readonly HtmlSurfaceFlatVisual[] | undefined;
  readonly visualSurfaces: HtmlSurfaceVisualBuildResult;
}): HtmlSurfaceVisualScene {
  return createHtmlSurfaceVisualScene({
    flatSurfaces: visualSurfaces.flatSurfaces,
    lateFlatSurfaces: [
      ...(htmlSurfacePageVisuals ?? []),
      ...(htmlSurfaceLateVisuals ?? []),
    ],
    tiledFlatSurfaces: visualSurfaces.tiledFlatSurfaces,
    solidRoundedRectSurfaces: htmlSurfaceNativeVisuals ?? [],
  });
}
