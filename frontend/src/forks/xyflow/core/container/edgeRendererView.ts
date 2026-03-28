import type { CSSProperties } from "react";
import { makeEdgeHandleKey } from "state/actions/edgeHandles";
import type { HandlePosition, WrapEdgeProps } from "../types";

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
  const renderedEdges: RenderedEdgeView[] = [];

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

    renderedEdges.push({
      animated: edge.animated,
      data: edge.data ?? null,
      hidden: false,
      id: edge.id,
      label: edge.label ?? undefined,
      selected: edge.selected,
      source: edge.sourceSectionId,
      sourceHandleId: edge.sourcePortId,
      sourcePosition: source.side,
      sourceX: source.x,
      sourceY: source.y,
      style: normalizeEdgeStyle(edge.style),
      target: edge.targetSectionId,
      targetHandleId: edge.targetPortId,
      targetPosition: target.side,
      targetX: target.x,
      targetY: target.y,
      type: edge.type ?? undefined,
    });
  }

  return { renderedEdges };
}

function normalizeEdgeStyle(
  style: EdgeRendererProjectEdge["style"],
): CSSProperties | undefined {
  return style ? (style as CSSProperties) : undefined;
}
