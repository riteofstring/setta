import _ from "lodash";
import type { CSSProperties } from "react";
import { memo, useEffect } from "react";
import {
  makeEdgeHandleKey,
  recomputeEdgeHandlePositions,
} from "state/actions/edgeHandles";
import { reconnectEdgeFromConnection } from "state/actions/edges";
import { useEdgeHandleRegistry, useProjectState } from "state/definitions";
import { ConnectionLine } from "../components/ConnectionLine";
import BezierEdge from "../components/Edges/BezierEdge";
import StraightEdge from "../components/Edges/StraightEdge";
import wrapEdge from "../components/Edges/wrapEdge";
import { useReactFlow } from "../store";
import type { Connection } from "../types";

const WrappedBezierEdge = wrapEdge(BezierEdge);
const WrappedStraightEdge = wrapEdge(StraightEdge);

const edgeTypes = {
  default: WrappedBezierEdge,
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
  const { width, height } = useReactFlow((state) => ({
      width: state.width,
      height: state.height,
    }),
    _.isEqual,
  );
  useEffect(() => {
    recomputeEdgeHandlePositions();
  }, [edges, width, height, topLevelSections]);

  if (!width || !height) {
    return null;
  }

  const sortedEdges = [...edges].sort((a, b) => a.zIndex - b.zIndex);

  return (
    <>
      <svg
        width={width}
        height={height}
        className="react-flow__edges react-flow__container"
      >
        <g>
          {sortedEdges.map((edge) => {
            if (
              sectionVariantMap[edge.sourceSectionId] !==
                edge.sourceVariantId ||
              sectionVariantMap[edge.targetSectionId] !== edge.targetVariantId
            ) {
              return null;
            }

            const sourceKey = makeEdgeHandleKey(
              edge.sourceSectionId,
              edge.sourcePortId,
              "source",
            );
            const targetKey = makeEdgeHandleKey(
              edge.targetSectionId,
              edge.targetPortId,
              "target",
            );
            const source = positions[sourceKey];
            const target = positions[targetKey];
            if (!source || !target || edge.hidden) {
              return null;
            }

            const EdgeComponent =
              edgeTypes[edge.type ?? "default"] ?? WrappedBezierEdge;
            const onReconnect = (connection: Connection) => {
              reconnectEdgeFromConnection(edge.id, connection);
            };

            const style = edge.style
              ? (edge.style as CSSProperties)
              : undefined;

            return (
              <EdgeComponent
                key={edge.id}
                id={edge.id}
                type={edge.type}
                data={edge.data ?? null}
                selected={edge.selected}
                animated={edge.animated}
                hidden={edge.hidden}
                label={edge.label ?? undefined}
                style={style}
                source={edge.sourceSectionId}
                target={edge.targetSectionId}
                sourceHandleId={edge.sourcePortId}
                targetHandleId={edge.targetPortId}
                sourceX={source.x}
                sourceY={source.y}
                targetX={target.x}
                targetY={target.y}
                sourcePosition={source.side}
                targetPosition={target.side}
                elementsSelectable={true}
                onReconnect={onReconnect}
                reconnectRadius={12}
                isReconnectable={true}
                interactionWidth={16}
              />
            );
          })}
        </g>
      </svg>
      <ConnectionLine />
    </>
  );
};

EdgeRenderer.displayName = "EdgeRenderer";

export default memo(EdgeRenderer);
