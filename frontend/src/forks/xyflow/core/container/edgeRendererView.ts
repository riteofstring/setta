import {
  EDGE_INTERACTION_WIDTH,
  EDGE_RECONNECT_RADIUS,
  buildEdgeScenePackets,
  buildRenderedEdgeView,
  type EdgeRendererPositions,
  type EdgeRendererProjectEdge,
  type RenderedEdgeView,
} from "./edgeScenePackets";
import type { Connection, WrapEdgeProps } from "../types";

export const EDGE_RENDERER_SVG_CLASS_NAME =
  "react-flow__edges react-flow__container";

export type EdgeRendererComponentType = "bezier" | "straight";

export type EdgeRendererReconnectEdge = (
  edgeId: string,
  connection: Connection,
) => void;

export type EdgeRendererRenderableEdge = WrapEdgeProps &
  RenderedEdgeView & {
  componentType: EdgeRendererComponentType;
  elementsSelectable: true;
  interactionWidth: number;
  isReconnectable: true;
  reconnectRadius: number;
};

export type EdgeRendererView = {
  renderedEdges: EdgeRendererRenderableEdge[];
  svgClassName: string;
  svgHeight: number;
  svgWidth: number;
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

function createEdgeReconnectHandler({
  edgeId,
  reconnectEdge,
}: {
  edgeId: string;
  reconnectEdge: EdgeRendererReconnectEdge;
}) {
  return (connection: Connection) => {
    reconnectEdge(edgeId, connection);
  };
}

export function buildEdgeRendererView({
  width,
  height,
  edges,
  positions,
  reconnectEdge,
  sectionVariantMap,
}: {
  width: number;
  height: number;
  edges: EdgeRendererProjectEdge[];
  positions: EdgeRendererPositions;
  reconnectEdge: EdgeRendererReconnectEdge;
  sectionVariantMap: Record<string, string>;
}): EdgeRendererView | null {
  if (!shouldRenderEdgeRendererContents({ width, height })) {
    return null;
  }

  return {
    svgClassName: EDGE_RENDERER_SVG_CLASS_NAME,
    svgHeight: height,
    svgWidth: width,
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
        onReconnect: createEdgeReconnectHandler({
          edgeId: renderedEdge.id,
          reconnectEdge,
        }),
        reconnectRadius: EDGE_RECONNECT_RADIUS,
      };
    }),
  };
}
