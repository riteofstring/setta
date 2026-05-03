import { AgenticEdgeKindEnum, type AgenticEdge } from "utils/generatedTypes";

import type { GpuPoint } from "../../viewportMath";

import { type GpuEdgeSide } from "../edgeGeometry";

import {
  GpuEdgeFamily,
  GpuEdgeNodeFrame,
  NodeAnchorSide,
  WorkflowEdge,
} from "./edgeScene";

export function resolveNodeAnchor(
  frame: GpuEdgeNodeFrame | null,
  side: NodeAnchorSide,
): GpuPoint | null {
  if (!frame || !frame.width || !frame.height) {
    return null;
  }
  return {
    x: side === "left" ? frame.x : frame.x + frame.width,
    y: frame.y + frame.height / 2,
  };
}

export function resolveRelativeAnchorSides(
  sourceFrame: GpuEdgeNodeFrame | null,
  targetFrame: GpuEdgeNodeFrame | null,
): {
  readonly sourceSide: NodeAnchorSide;
  readonly targetSide: NodeAnchorSide;
} {
  const sourceCenterX = getNodeCenterX(sourceFrame);
  const targetCenterX = getNodeCenterX(targetFrame);
  if (sourceCenterX === null || targetCenterX === null) {
    return { sourceSide: "right", targetSide: "left" };
  }
  if (sourceCenterX <= targetCenterX) {
    return { sourceSide: "right", targetSide: "left" };
  }
  return { sourceSide: "left", targetSide: "right" };
}

export function getNodeCenterX(frame: GpuEdgeNodeFrame | null): number | null {
  if (!frame || !frame.width) {
    return null;
  }
  return frame.x + frame.width / 2;
}

export function getWorkflowPromptSectionId(edge: WorkflowEdge): string | null {
  if (edge.targetAction?.type !== "send_prompt") {
    return null;
  }
  return edge.targetAction.promptSectionId ?? null;
}

export function getAgenticEdgeKey(
  edge: Pick<AgenticEdge, "kind" | "sourceSectionId" | "targetSectionId">,
): string {
  if (edge.kind === AgenticEdgeKindEnum.chat_chat) {
    const [first, second] =
      edge.sourceSectionId < edge.targetSectionId
        ? [edge.sourceSectionId, edge.targetSectionId]
        : [edge.targetSectionId, edge.sourceSectionId];
    return `${edge.kind}:${first}:${second}`;
  }
  return `${edge.kind}:${edge.sourceSectionId}:${edge.targetSectionId}`;
}

export function getGpuSceneEdgeId(
  family: GpuEdgeFamily,
  edgeId: string,
): string {
  return `${family}:${edgeId}`;
}

export function getOppositeGpuEdgeSide(side: string): GpuEdgeSide {
  switch (side) {
    case "left":
      return "right";
    case "right":
      return "left";
    case "top":
      return "bottom";
    case "bottom":
      return "top";
    default:
      throw new Error(`Unsupported GPU connection line side "${side}".`);
  }
}
