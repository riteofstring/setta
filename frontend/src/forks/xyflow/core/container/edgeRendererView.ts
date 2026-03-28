import {
  buildEdgeScenePackets,
  buildRenderedEdgeView,
  type EdgeRendererPositions,
  type EdgeRendererProjectEdge,
  type RenderedEdgeView,
} from "./edgeScenePackets";

export type EdgeRendererView = {
  renderedEdges: RenderedEdgeView[];
};

export function shouldRenderEdgeRendererContents({
  width,
  height,
}: {
  width: number;
  height: number;
}): boolean {
  return width > 0 && height > 0;
}

export function buildEdgeRendererView({
  edges,
  positions,
  sectionVariantMap,
}: {
  edges: EdgeRendererProjectEdge[];
  positions: EdgeRendererPositions;
  sectionVariantMap: Record<string, string>;
}): EdgeRendererView {
  return {
    renderedEdges: buildEdgeScenePackets({
      edges,
      positions,
      sectionVariantMap,
    }).map(buildRenderedEdgeView),
  };
}
