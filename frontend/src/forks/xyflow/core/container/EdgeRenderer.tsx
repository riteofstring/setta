import _ from "lodash";
import { memo, useEffect } from "react";
import { recomputeEdgeHandlePositions } from "state/actions/edgeHandles";
import { reconnectEdgeFromConnection } from "state/actions/edges";
import { useEdgeHandleRegistry, useProjectState } from "state/definitions";
import { ConnectionLine } from "../components/ConnectionLine";
import BezierEdge from "../components/Edges/BezierEdge";
import StraightEdge from "../components/Edges/StraightEdge";
import wrapEdge from "../components/Edges/wrapEdge";
import { useReactFlow } from "../store";
import { buildEdgeRendererView } from "./edgeRendererView";

const WrappedBezierEdge = wrapEdge(BezierEdge);
const WrappedStraightEdge = wrapEdge(StraightEdge);

const edgeComponentsByType = {
  bezier: WrappedBezierEdge,
  straight: WrappedStraightEdge,
};

const EdgeRenderer = () => {
  const { edges, sectionVariantMap, topLevelSections } = useProjectState(
    (state) => ({
      edges: state.projectConfig.edges,
      sectionVariantMap: state.projectConfig.sectionVariantMap,
      topLevelSections: state.projectConfig.topLevelSections,
    }),
    _.isEqual,
  );
  const positions = useEdgeHandleRegistry((state) => state.positions);
  const { width, height } = useReactFlow(
    (state) => ({
      width: state.width,
      height: state.height,
    }),
    _.isEqual,
  );
  useEffect(() => {
    recomputeEdgeHandlePositions();
  }, [edges, width, height, topLevelSections]);

  const edgeView = buildEdgeRendererView({
    width,
    height,
    edges,
    positions,
    reconnectEdge: reconnectEdgeFromConnection,
    sectionVariantMap,
  });

  if (!edgeView) {
    return null;
  }

  return (
    <>
      <svg
        width={edgeView.svgWidth}
        height={edgeView.svgHeight}
        className={edgeView.svgClassName}
      >
        <g>
          {edgeView.renderedEdges.map((edge) => {
            const { componentType, ...edgeProps } = edge;
            const EdgeComponent = edgeComponentsByType[componentType];

            return <EdgeComponent key={edge.id} {...edgeProps} />;
          })}
        </g>
      </svg>
      <ConnectionLine />
    </>
  );
};

EdgeRenderer.displayName = "EdgeRenderer";

export default memo(EdgeRenderer);
