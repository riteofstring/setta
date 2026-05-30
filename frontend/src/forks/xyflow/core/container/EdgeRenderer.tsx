import _ from "lodash";
import type { CSSProperties } from "react";
import { memo, useEffect } from "react";
import {
  makeEdgeHandleKey,
  recomputeEdgeHandlePositions,
} from "state/actions/edgeHandles";
import { reconnectEdgeFromConnection } from "state/actions/edges";
import { useEdgeHandleRegistry, useProjectState } from "state/definitions";
import type { Edge } from "utils/generatedTypes";
import { ConnectionLine } from "../components/ConnectionLine";
import BezierEdge from "../components/Edges/BezierEdge";
import StraightEdge from "../components/Edges/StraightEdge";
import wrapEdge from "../components/Edges/wrapEdge";
import { useReactFlow } from "../store";
import type { Connection } from "../types";

const WrappedBezierEdge = wrapEdge(BezierEdge);
const WrappedStraightEdge = wrapEdge(StraightEdge);
type EdgeComponent = typeof WrappedBezierEdge;
type EdgeHandlePositions = ReturnType<
  typeof useEdgeHandleRegistry.getState
>["positions"];
type SectionVariantMap = ReturnType<
  typeof useProjectState.getState
>["projectConfig"]["sectionVariantMap"];
type RenderableEdge = {
  EdgeComponent: EdgeComponent;
  data: Edge["data"] | null;
  label: Edge["label"] | undefined;
  source: EdgeHandlePositions[string];
  style: CSSProperties | undefined;
  target: EdgeHandlePositions[string];
};

const edgeTypes = {
  default: WrappedBezierEdge,
  bezier: WrappedBezierEdge,
  straight: WrappedStraightEdge,
};

function hasActiveVariants(
  edge: Edge,
  sectionVariantMap: SectionVariantMap,
): boolean {
  return (
    sectionVariantMap[edge.sourceSectionId] === edge.sourceVariantId &&
    sectionVariantMap[edge.targetSectionId] === edge.targetVariantId
  );
}

function resolveEdgeEndpoints(
  edge: Edge,
  positions: EdgeHandlePositions,
): Pick<RenderableEdge, "source" | "target"> | null {
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
  if (!source || !target) {
    return null;
  }
  return { source, target };
}

function resolveEdgeComponent(type: Edge["type"]): EdgeComponent {
  return edgeTypes[type ?? "default"] ?? WrappedBezierEdge;
}

function resolveEdgeStyle(style: Edge["style"]): CSSProperties | undefined {
  return style ? (style as CSSProperties) : undefined;
}

function buildRenderableEdge(
  edge: Edge,
  sectionVariantMap: SectionVariantMap,
  positions: EdgeHandlePositions,
): RenderableEdge | null {
  if (!hasActiveVariants(edge, sectionVariantMap) || edge.hidden) {
    return null;
  }
  const endpoints = resolveEdgeEndpoints(edge, positions);
  if (!endpoints) {
    return null;
  }
  return {
    EdgeComponent: resolveEdgeComponent(edge.type),
    data: edge.data ?? null,
    label: edge.label ?? undefined,
    source: endpoints.source,
    style: resolveEdgeStyle(edge.style),
    target: endpoints.target,
  };
}

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

  if (!width || !height) {
    return null;
  }

  const sortedEdges = [...edges].sort((a, b) => a.zIndex - b.zIndex);
  const renderEdge = (edge: Edge) => {
    const renderableEdge = buildRenderableEdge(
      edge,
      sectionVariantMap,
      positions,
    );
    if (!renderableEdge) {
      return null;
    }

    const { EdgeComponent, data, label, source, style, target } =
      renderableEdge;
    const onReconnect = (connection: Connection) => {
      reconnectEdgeFromConnection(edge.id, connection);
    };

    return (
      <EdgeComponent
        key={edge.id}
        id={edge.id}
        type={edge.type}
        data={data}
        selected={edge.selected}
        animated={edge.animated}
        hidden={edge.hidden}
        label={label}
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
  };

  return (
    <>
      <svg
        width={width}
        height={height}
        className="react-flow__edges react-flow__container"
      >
        <g>{sortedEdges.map(renderEdge)}</g>
      </svg>
      <ConnectionLine />
    </>
  );
};

EdgeRenderer.displayName = "EdgeRenderer";

export default memo(EdgeRenderer);
