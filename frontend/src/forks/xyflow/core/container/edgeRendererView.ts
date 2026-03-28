import {
  EDGE_INTERACTION_WIDTH,
  EDGE_RECONNECT_RADIUS,
  buildEdgeScenePackets,
  buildRenderedEdgeView,
  type EdgeRendererPositions,
  type EdgeRendererProjectEdge,
  type RenderedEdgeView,
} from "./edgeScenePackets";

export type EdgeRendererComponentType = "bezier" | "straight";

export type EdgeRendererRenderableEdge = RenderedEdgeView & {
  componentType: EdgeRendererComponentType;
  elementsSelectable: true;
  interactionWidth: number;
  isReconnectable: true;
  reconnectRadius: number;
};

export type EdgeRendererView = {
  renderedEdges: EdgeRendererRenderableEdge[];
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

function resolveEdgeRendererComponentType(
  edgeType: string | null | undefined,
): EdgeRendererComponentType {
  return edgeType === "straight" ? "straight" : "bezier";
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
    }).map((packet) => {
      const renderedEdge = buildRenderedEdgeView(packet);

      return {
        ...renderedEdge,
        componentType: resolveEdgeRendererComponentType(renderedEdge.type),
        elementsSelectable: true,
        interactionWidth: EDGE_INTERACTION_WIDTH,
        isReconnectable: true,
        reconnectRadius: EDGE_RECONNECT_RADIUS,
      };
    }),
  };
}
