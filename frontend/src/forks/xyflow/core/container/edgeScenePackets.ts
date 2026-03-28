import type { CSSProperties } from "react";
import { makeEdgeHandleKey } from "state/actions/edgeHandles";
import { getBezierPath } from "../components/Edges/BezierEdge";
import { getStraightPath } from "../components/Edges/StraightEdge";
import type { HandlePosition, HandleType, WrapEdgeProps } from "../types";

export const EDGE_RECONNECT_RADIUS = 12;
export const EDGE_INTERACTION_WIDTH = 16;

export type EdgeRendererProjectEdge = {
  animated: boolean;
  data: WrapEdgeProps["data"];
  hidden: boolean;
  id: string;
  label: WrapEdgeProps["label"] | null | undefined;
  selected: boolean;
  sourcePortId: string;
  sourceSectionId: string;
  sourceVariantId: string;
  style: Record<string, string | number> | CSSProperties | null | undefined;
  targetPortId: string;
  targetSectionId: string;
  targetVariantId: string;
  type: string | null | undefined;
  zIndex: number;
};

type EdgeHandlePosition = {
  side: HandlePosition;
  x: number;
  y: number;
};

export type EdgeRendererPositions = Record<string, EdgeHandlePosition>;

export type RenderedEdgeView = Pick<
  WrapEdgeProps,
  | "animated"
  | "data"
  | "hidden"
  | "id"
  | "label"
  | "selected"
  | "source"
  | "sourceHandleId"
  | "sourcePosition"
  | "sourceX"
  | "sourceY"
  | "style"
  | "target"
  | "targetHandleId"
  | "targetPosition"
  | "targetX"
  | "targetY"
  | "type"
>;

export type EdgeSceneGeometryKind = "bezier" | "straight";

export type EdgeSceneReconnectHandlePacket = {
  centerX: number;
  centerY: number;
  handleId: string;
  position: HandlePosition;
  radius: number;
  sectionId: string;
  type: HandleType;
};

export type EdgeScenePacket = {
  animated: boolean;
  data: Exclude<WrapEdgeProps["data"], undefined>;
  geometry: {
    kind: EdgeSceneGeometryKind;
    labelCenter: {
      x: number;
      y: number;
    };
    svgPath: string;
  };
  hitRegion: {
    interactionWidth: number;
    reconnectHandles: [
      EdgeSceneReconnectHandlePacket,
      EdgeSceneReconnectHandlePacket,
    ];
  };
  id: string;
  label: WrapEdgeProps["label"] | undefined;
  selected: boolean;
  sourceHandleId: string;
  sourcePosition: HandlePosition;
  sourceSectionId: string;
  sourceX: number;
  sourceY: number;
  style: CSSProperties | undefined;
  targetHandleId: string;
  targetPosition: HandlePosition;
  targetSectionId: string;
  targetX: number;
  targetY: number;
  type: string | undefined;
};

export function buildEdgeScenePackets({
  edges,
  positions,
  sectionVariantMap,
}: {
  edges: EdgeRendererProjectEdge[];
  positions: EdgeRendererPositions;
  sectionVariantMap: Record<string, string>;
}): EdgeScenePacket[] {
  const packets: EdgeScenePacket[] = [];

  for (const edge of [...edges].sort((a, b) => a.zIndex - b.zIndex)) {
    if (
      edge.hidden ||
      sectionVariantMap[edge.sourceSectionId] !== edge.sourceVariantId ||
      sectionVariantMap[edge.targetSectionId] !== edge.targetVariantId
    ) {
      continue;
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

    if (!source || !target) {
      continue;
    }

    const type = edge.type ?? undefined;
    const geometry = buildEdgeSceneGeometry({
      sourcePosition: source.side,
      sourceX: source.x,
      sourceY: source.y,
      targetPosition: target.side,
      targetX: target.x,
      targetY: target.y,
      type,
    });

    packets.push({
      animated: edge.animated,
      data: edge.data ?? null,
      geometry,
      hitRegion: {
        interactionWidth: EDGE_INTERACTION_WIDTH,
        reconnectHandles: [
          {
            centerX: source.x,
            centerY: source.y,
            handleId: edge.sourcePortId,
            position: source.side,
            radius: EDGE_RECONNECT_RADIUS,
            sectionId: edge.sourceSectionId,
            type: "source",
          },
          {
            centerX: target.x,
            centerY: target.y,
            handleId: edge.targetPortId,
            position: target.side,
            radius: EDGE_RECONNECT_RADIUS,
            sectionId: edge.targetSectionId,
            type: "target",
          },
        ],
      },
      id: edge.id,
      label: edge.label ?? undefined,
      selected: edge.selected,
      sourceHandleId: edge.sourcePortId,
      sourcePosition: source.side,
      sourceSectionId: edge.sourceSectionId,
      sourceX: source.x,
      sourceY: source.y,
      style: normalizeEdgeStyle(edge.style),
      targetHandleId: edge.targetPortId,
      targetPosition: target.side,
      targetSectionId: edge.targetSectionId,
      targetX: target.x,
      targetY: target.y,
      type,
    });
  }

  return packets;
}

export function buildRenderedEdgeView(
  packet: EdgeScenePacket,
): RenderedEdgeView {
  return {
    animated: packet.animated,
    data: packet.data,
    hidden: false,
    id: packet.id,
    label: packet.label,
    selected: packet.selected,
    source: packet.sourceSectionId,
    sourceHandleId: packet.sourceHandleId,
    sourcePosition: packet.sourcePosition,
    sourceX: packet.sourceX,
    sourceY: packet.sourceY,
    style: packet.style,
    target: packet.targetSectionId,
    targetHandleId: packet.targetHandleId,
    targetPosition: packet.targetPosition,
    targetX: packet.targetX,
    targetY: packet.targetY,
    type: packet.type,
  };
}

function buildEdgeSceneGeometry({
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
  type,
}: {
  sourceX: number;
  sourceY: number;
  sourcePosition: HandlePosition;
  targetX: number;
  targetY: number;
  targetPosition: HandlePosition;
  type: string | undefined;
}): EdgeScenePacket["geometry"] {
  const kind = resolveEdgeSceneGeometryKind(type);

  if (kind === "straight") {
    const [svgPath, labelX, labelY] = getStraightPath({
      sourceX,
      sourceY,
      targetX,
      targetY,
    });

    return {
      kind,
      labelCenter: {
        x: labelX,
        y: labelY,
      },
      svgPath,
    };
  }

  const [svgPath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return {
    kind,
    labelCenter: {
      x: labelX,
      y: labelY,
    },
    svgPath,
  };
}

function normalizeEdgeStyle(
  style: EdgeRendererProjectEdge["style"],
): CSSProperties | undefined {
  return style ? (style as CSSProperties) : undefined;
}

function resolveEdgeSceneGeometryKind(
  type: string | undefined,
): EdgeSceneGeometryKind {
  return type === "straight" ? "straight" : "bezier";
}
