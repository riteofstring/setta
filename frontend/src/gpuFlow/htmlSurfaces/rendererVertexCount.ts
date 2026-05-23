import type {
  HtmlSurfaceFlatVisual,
  HtmlSurfaceVisualScene,
} from "./visualScene";
import type { HtmlSurfaceEffectPass } from "./rendererEffect";
import type { HtmlSurfaceFlatLayerPasses } from "./rendererFlatLayers";
import type { HtmlSurfaceMeshPass } from "./rendererMesh";
import type { HtmlSurfaceSolidRoundedRectPass } from "./rendererSolidRoundedRect";
import type {
  HtmlSurfaceTiledFlatPass,
  TiledFlatSurfaceDrawTile,
} from "./rendererTiledFlat";

type PreparedMeshSurfaceDraw = {
  readonly pass: HtmlSurfaceMeshPass;
} | null;
type PreparedEffectSurfaceDraw = {
  readonly pass: HtmlSurfaceEffectPass;
} | null;

export function getHtmlSurfaceRenderVertexCount({
  effectSurfaceDraw,
  effectSurfaces,
  flatLayerPasses,
  flatSurfaces,
  lateFlatSurfaces,
  meshSurfaceDraw,
  meshSurfaces,
  solidRoundedRectSurfacePass,
  solidRoundedRectSurfaces,
  tiledFlatSurfacePass,
  tiledFlatSurfaceTiles,
}: {
  readonly effectSurfaceDraw: PreparedEffectSurfaceDraw;
  readonly effectSurfaces: HtmlSurfaceVisualScene["effectSurfaces"];
  readonly flatLayerPasses: HtmlSurfaceFlatLayerPasses;
  readonly flatSurfaces: readonly HtmlSurfaceFlatVisual[];
  readonly lateFlatSurfaces: readonly HtmlSurfaceFlatVisual[];
  readonly meshSurfaceDraw: PreparedMeshSurfaceDraw;
  readonly meshSurfaces: HtmlSurfaceVisualScene["meshSurfaces"];
  readonly solidRoundedRectSurfacePass: HtmlSurfaceSolidRoundedRectPass | null;
  readonly solidRoundedRectSurfaces: HtmlSurfaceVisualScene["solidRoundedRectSurfaces"];
  readonly tiledFlatSurfacePass: HtmlSurfaceTiledFlatPass | null;
  readonly tiledFlatSurfaceTiles: readonly TiledFlatSurfaceDrawTile[];
}): number {
  return (
    flatLayerPasses.getFlatVertexCount(flatSurfaces) +
    flatLayerPasses.getLateFlatVertexCount(lateFlatSurfaces) +
    (tiledFlatSurfacePass?.getVertexCount(tiledFlatSurfaceTiles) ?? 0) +
    (meshSurfaceDraw?.pass.getVertexCount(meshSurfaces) ?? 0) +
    (effectSurfaceDraw?.pass.getVertexCount(effectSurfaces) ?? 0) +
    (solidRoundedRectSurfacePass?.getVertexCount(solidRoundedRectSurfaces) ?? 0)
  );
}
