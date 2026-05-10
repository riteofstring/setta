import type { GpuEdgeLineListBufferData } from "../edges/edgeGpuBuffers";
import type { RenderHtmlSurfaceSceneResult } from "../gpuPipelines/pipelineTypes";
import type { HtmlSurfaceVisualScene } from "./visualScene";

export function createHtmlSurfaceRenderResult({
  edgeBufferData,
  renderBatchCount,
  renderCommandCount,
  scene,
  vertexCount,
}: {
  readonly edgeBufferData: GpuEdgeLineListBufferData;
  readonly renderBatchCount: number;
  readonly renderCommandCount: number;
  readonly scene: HtmlSurfaceVisualScene;
  readonly vertexCount: number;
}): RenderHtmlSurfaceSceneResult {
  return {
    drawnEdgeIds: edgeBufferData.ranges.map((range) => range.edgeId),
    drawnSurfaceIds: uniqueSurfaceIds(
      scene.displayList.commands.map((command) => command.ownerSurfaceId),
    ),
    edgeVertexCount: edgeBufferData.vertexCount,
    renderBatchCount,
    renderCommandCount,
    vertexCount,
  };
}

function uniqueSurfaceIds(surfaceIds: readonly string[]): readonly string[] {
  return [...new Set(surfaceIds)];
}
