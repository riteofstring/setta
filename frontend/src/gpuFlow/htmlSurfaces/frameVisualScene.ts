import type { HtmlSurfaceVisualBuildResult } from "./surfaceVisuals";
import {
  createHtmlSurfaceVisualScene,
  type HtmlSurfaceFlatVisual,
  type HtmlSurfaceSolidRoundedRectVisual,
  type HtmlSurfaceTiledFlatVisual,
  type HtmlSurfaceVisualScene,
} from "./visualScene";

export function createGpuNodeVisualScene({
  htmlSurfaceLateVisuals,
  htmlSurfaceLateTiledVisuals,
  htmlSurfaceNativeVisuals,
  htmlSurfacePageVisuals,
  htmlSurfacePageTiledVisuals,
  visualSurfaces,
}: {
  readonly htmlSurfaceLateVisuals: readonly HtmlSurfaceFlatVisual[] | undefined;
  readonly htmlSurfaceLateTiledVisuals:
    | readonly HtmlSurfaceTiledFlatVisual[]
    | undefined;
  readonly htmlSurfaceNativeVisuals:
    | readonly HtmlSurfaceSolidRoundedRectVisual[]
    | undefined;
  readonly htmlSurfacePageVisuals: readonly HtmlSurfaceFlatVisual[] | undefined;
  readonly htmlSurfacePageTiledVisuals:
    | readonly HtmlSurfaceTiledFlatVisual[]
    | undefined;
  readonly visualSurfaces: HtmlSurfaceVisualBuildResult;
}): HtmlSurfaceVisualScene {
  return createHtmlSurfaceVisualScene({
    flatSurfaces: visualSurfaces.flatSurfaces,
    lateFlatSurfaces: [
      ...(htmlSurfacePageVisuals ?? []),
      ...(htmlSurfaceLateVisuals ?? []),
    ],
    lateTiledFlatSurfaces: [
      ...(htmlSurfacePageTiledVisuals ?? []),
      ...(htmlSurfaceLateTiledVisuals ?? []),
    ],
    tiledFlatSurfaces: visualSurfaces.tiledFlatSurfaces,
    solidRoundedRectSurfaces: htmlSurfaceNativeVisuals ?? [],
  });
}

export function mergeHtmlSurfaceVisuals(
  base: HtmlSurfaceVisualBuildResult,
  overlays: HtmlSurfaceVisualBuildResult,
): HtmlSurfaceVisualBuildResult {
  return {
    flatSurfaces: [...base.flatSurfaces, ...overlays.flatSurfaces],
    tiledFlatSurfaces: [
      ...base.tiledFlatSurfaces,
      ...overlays.tiledFlatSurfaces,
    ],
  };
}
