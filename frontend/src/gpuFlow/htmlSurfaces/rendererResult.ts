import type { GpuEdgeLineListBufferData } from "../edges/edgeGpuBuffers";
import type { RenderHtmlSurfaceSceneResult } from "../gpuPipelines/pipelineTypes";
import type {
  HtmlSurfaceFlatVisual,
  HtmlSurfaceVisualScene,
} from "./visualScene";

export function createHtmlSurfaceRenderResult({
  edgeBufferData,
  effectSurfaces,
  flatSurfaces,
  meshSurfaces,
  scene,
  solidRoundedRectSurfaces,
  vertexCount,
}: {
  readonly edgeBufferData: GpuEdgeLineListBufferData;
  readonly effectSurfaces: HtmlSurfaceVisualScene["effectSurfaces"];
  readonly flatSurfaces: readonly HtmlSurfaceFlatVisual[];
  readonly meshSurfaces: HtmlSurfaceVisualScene["meshSurfaces"];
  readonly scene: HtmlSurfaceVisualScene;
  readonly solidRoundedRectSurfaces: HtmlSurfaceVisualScene["solidRoundedRectSurfaces"];
  readonly vertexCount: number;
}): RenderHtmlSurfaceSceneResult {
  return {
    drawnEdgeIds: edgeBufferData.ranges.map((range) => range.edgeId),
    drawnSurfaceIds: [
      ...flatSurfaces.map((surface) => surface.surfaceId),
      ...scene.tiledFlatSurfaces.map((surface) => surface.surfaceId),
      ...meshSurfaces.map((surface) => surface.surfaceId),
      ...effectSurfaces.map((surface) => surface.surfaceId),
      ...solidRoundedRectSurfaces.map((surface) => surface.surfaceId),
    ],
    edgeVertexCount: edgeBufferData.vertexCount,
    vertexCount,
  };
}
