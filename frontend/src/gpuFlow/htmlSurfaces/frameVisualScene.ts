import {
  createHtmlSurfaceVisualScene,
  type HtmlSurfaceFlatVisual,
  type HtmlSurfaceSolidRoundedRectVisual,
  type HtmlSurfaceVisualScene,
} from "./visualScene";
import type { HtmlSurfaceVisualBuildResult } from "./surfaceVisuals";

export function createGpuNodeVisualScene({
  htmlSurfaceNativeVisuals,
  htmlSurfacePageVisuals,
  visualSurfaces,
}: {
  readonly htmlSurfaceNativeVisuals:
    | readonly HtmlSurfaceSolidRoundedRectVisual[]
    | undefined;
  readonly htmlSurfacePageVisuals:
    | readonly HtmlSurfaceFlatVisual[]
    | undefined;
  readonly visualSurfaces: HtmlSurfaceVisualBuildResult;
}): HtmlSurfaceVisualScene {
  return createHtmlSurfaceVisualScene({
    flatSurfaces: [
      ...visualSurfaces.flatSurfaces,
      ...(htmlSurfacePageVisuals ?? []),
    ],
    tiledFlatSurfaces: visualSurfaces.tiledFlatSurfaces,
    solidRoundedRectSurfaces: htmlSurfaceNativeVisuals ?? [],
  });
}
