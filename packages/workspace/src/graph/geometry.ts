import { getBezierPath, Position } from "@xyflow/react";
import type { WorkspaceGraphPortSide } from "./types";

export type WorkspaceGraphPoint = Readonly<{
  x: number;
  y: number;
}>;

export type WorkspaceGraphViewportTransform = readonly [number, number, number];

export type WorkspaceGraphBezier = Readonly<{
  labelX: number;
  labelY: number;
  path: string;
}>;

function toXyflowPosition(side: WorkspaceGraphPortSide): Position {
  return side === "left" ? Position.Left : Position.Right;
}

export function getWorkspaceGraphViewportPoint(
  clientPoint: WorkspaceGraphPoint,
  rootRect: Pick<DOMRect, "left" | "top">,
  transform: WorkspaceGraphViewportTransform,
): WorkspaceGraphPoint {
  return {
    x: (clientPoint.x - rootRect.left - transform[0]) / transform[2],
    y: (clientPoint.y - rootRect.top - transform[1]) / transform[2],
  };
}

export function getWorkspaceGraphClientPoint(
  viewportPoint: WorkspaceGraphPoint,
  rootRect: Pick<DOMRect, "left" | "top">,
  transform: WorkspaceGraphViewportTransform,
): WorkspaceGraphPoint {
  return {
    x: rootRect.left + transform[0] + viewportPoint.x * transform[2],
    y: rootRect.top + transform[1] + viewportPoint.y * transform[2],
  };
}

export function getWorkspaceGraphElementCenter(
  element: Pick<DOMRect, "left" | "top" | "width" | "height">,
): WorkspaceGraphPoint {
  return {
    x: element.left + element.width / 2,
    y: element.top + element.height / 2,
  };
}

export function getWorkspaceGraphBezier(
  source: WorkspaceGraphPoint,
  sourceSide: WorkspaceGraphPortSide,
  target: WorkspaceGraphPoint,
  targetSide: WorkspaceGraphPortSide,
): WorkspaceGraphBezier {
  const [path, labelX, labelY] = getBezierPath({
    sourcePosition: toXyflowPosition(sourceSide),
    sourceX: source.x,
    sourceY: source.y,
    targetPosition: toXyflowPosition(targetSide),
    targetX: target.x,
    targetY: target.y,
  });
  return Object.freeze({ labelX, labelY, path });
}
