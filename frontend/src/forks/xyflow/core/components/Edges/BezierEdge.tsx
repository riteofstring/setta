import { memo } from "react";

import type { BezierEdgeProps } from "../../types";
import { HandlePosition } from "../../types";
import BaseEdge from "./BaseEdge";
import { getBezierEdgeCenter } from "./utils";

interface GetBezierPathParams {
  sourceX: number;
  sourceY: number;
  sourcePosition?: HandlePosition;
  targetX: number;
  targetY: number;
  targetPosition?: HandlePosition;
  curvature?: number;
}

interface GetControlWithCurvatureParams {
  pos: HandlePosition;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  c: number;
}

function calculateControlOffset(distance: number, curvature: number): number {
  if (distance >= 0) {
    return 0.5 * distance;
  }

  return curvature * 25 * Math.sqrt(-distance);
}

function getControlWithCurvature({
  pos,
  x1,
  y1,
  x2,
  y2,
  c,
}: GetControlWithCurvatureParams): [number, number] {
  switch (pos) {
    case HandlePosition.Left:
      return [x1 - calculateControlOffset(x1 - x2, c), y1];
    case HandlePosition.Right:
      return [x1 + calculateControlOffset(x2 - x1, c), y1];
    case HandlePosition.Top:
      return [x1, y1 - calculateControlOffset(y1 - y2, c)];
    case HandlePosition.Bottom:
      return [x1, y1 + calculateControlOffset(y2 - y1, c)];
  }
}

export function getBezierPath({
  sourceX,
  sourceY,
  sourcePosition = HandlePosition.Bottom,
  targetX,
  targetY,
  targetPosition = HandlePosition.Top,
  curvature = 0.25,
}: GetBezierPathParams): [
  path: string,
  labelX: number,
  labelY: number,
  offsetX: number,
  offsetY: number,
] {
  const [sourceControlX, sourceControlY] = getControlWithCurvature({
    pos: sourcePosition,
    x1: sourceX,
    y1: sourceY,
    x2: targetX,
    y2: targetY,
    c: curvature,
  });
  const [targetControlX, targetControlY] = getControlWithCurvature({
    pos: targetPosition,
    x1: targetX,
    y1: targetY,
    x2: sourceX,
    y2: sourceY,
    c: curvature,
  });
  const [labelX, labelY, offsetX, offsetY] = getBezierEdgeCenter({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourceControlX,
    sourceControlY,
    targetControlX,
    targetControlY,
  });

  return [
    `M${sourceX},${sourceY} C${sourceControlX},${sourceControlY} ${targetControlX},${targetControlY} ${targetX},${targetY}`,
    labelX,
    labelY,
    offsetX,
    offsetY,
  ];
}

const BezierEdge = memo(
  ({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition = HandlePosition.Bottom,
    targetPosition = HandlePosition.Top,
    label,
    labelStyle,
    labelShowBg,
    labelBgStyle,
    labelBgPadding,
    labelBgBorderRadius,
    style,
    markerEnd,
    markerStart,
    pathOptions,
    interactionWidth,
  }: BezierEdgeProps) => {
    const [path, labelX, labelY] = getBezierPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
      curvature: pathOptions?.curvature,
    });

    return (
      <BaseEdge
        path={path}
        labelX={labelX}
        labelY={labelY}
        label={label}
        labelStyle={labelStyle}
        labelShowBg={labelShowBg}
        labelBgStyle={labelBgStyle}
        labelBgPadding={labelBgPadding}
        labelBgBorderRadius={labelBgBorderRadius}
        style={style}
        markerEnd={markerEnd}
        markerStart={markerStart}
        interactionWidth={interactionWidth}
      />
    );
  },
);

BezierEdge.displayName = "BezierEdge";

export default BezierEdge;
