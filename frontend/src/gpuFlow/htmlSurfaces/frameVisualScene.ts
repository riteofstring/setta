import type { HtmlSurfaceVisualBuildResult } from "./surfaceVisuals";
import {
  createHtmlSurfaceVisualScene,
  type HtmlSurfaceFlatVisual,
  type HtmlSurfaceSolidRoundedRectVisual,
  type HtmlSurfaceVisualScene,
} from "./visualScene";

export function createGpuNodeVisualScene({
  htmlSurfaceNativeVisuals,
  htmlSurfacePageVisuals,
  visualSurfaces,
}: {
  readonly htmlSurfaceNativeVisuals:
    | readonly HtmlSurfaceSolidRoundedRectVisual[]
    | undefined;
  readonly htmlSurfacePageVisuals: readonly HtmlSurfaceFlatVisual[] | undefined;
  readonly visualSurfaces: HtmlSurfaceVisualBuildResult;
}): HtmlSurfaceVisualScene {
  return createHtmlSurfaceVisualScene({
    flatSurfaces: visualSurfaces.flatSurfaces,
    lateFlatSurfaces: htmlSurfacePageVisuals ?? [],
    tiledFlatSurfaces: visualSurfaces.tiledFlatSurfaces,
    solidRoundedRectSurfaces: htmlSurfaceNativeVisuals ?? [],
  });
}
