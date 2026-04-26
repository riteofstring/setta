import { HandlePosition, type Node } from "forks/xyflow/core/types";
import type { CSSProperties } from "react";
import { makeEdgeHandleKey } from "state/actions/edgeHandles";
import type { EdgeHandlePosition } from "state/definitions";
import {
  AgenticEdgeKindEnum,
  StateMachineUIConfig,
  type AgenticEdge,
  type Edge,
  type Position,
  type SingleConfig,
  type TopLevelSectionLayout,
} from "utils/generatedTypes";
import type { CanvasFlowDrawableEdge } from "./canvasFlowTypes";

type EdgeHandlePositions = Record<string, EdgeHandlePosition>;
type SectionVariantMap = SingleConfig["projectConfig"]["sectionVariantMap"];
type WorkflowEdge = NonNullable<
  SingleConfig["projectConfig"]["stateMachineEdges"]
>[number];
type TopLevelSections = SingleConfig["projectConfig"]["topLevelSections"];
type FallbackSectionSize = {
  w?: number | null | undefined;
  h?: number | null | undefined;
};

const sourceActivationCountOperatorLabelByValue = new Map(
  StateMachineUIConfig.sourceActivationCountOperatorOptions.map((option) => [
    option.value,
    option.label,
  ]),
);

export function getBezierControls({
  source,
  target,
  sourcePosition = HandlePosition.Bottom,
  targetPosition = HandlePosition.Top,
  curvature = 0.25,
}: {
  source: Position;
  target: Position;
  sourcePosition?: HandlePosition | undefined;
  targetPosition?: HandlePosition | undefined;
  curvature?: number | undefined;
}): { sourceControl: Position; targetControl: Position } {
  return {
    sourceControl: getControlWithCurvature({
      pos: sourcePosition,
      x1: source.x,
      y1: source.y,
      x2: target.x,
      y2: target.y,
      c: curvature,
    }),
    targetControl: getControlWithCurvature({
      pos: targetPosition,
      x1: target.x,
      y1: target.y,
      x2: source.x,
      y2: source.y,
      c: curvature,
    }),
  };
}

export function drawCanvasFlowEdges({
  ctx,
  edges,
  wireColor,
}: {
  ctx: CanvasRenderingContext2D;
  edges: CanvasFlowDrawableEdge[];
  wireColor: string;
}) {
  for (const edge of edges) {
    drawCanvasFlowEdge({ ctx, edge, wireColor });
  }
}

export function buildDataEdges({
  edges,
  positions,
  sectionVariantMap,
  showArgEdges,
}: {
  edges: Edge[];
  positions: EdgeHandlePositions;
  sectionVariantMap: SectionVariantMap;
  showArgEdges: boolean;
}): CanvasFlowDrawableEdge[] {
  if (!showArgEdges) {
    return [];
  }
  const output: CanvasFlowDrawableEdge[] = [];
  for (const edge of edges) {
    if (
      edge.hidden ||
      sectionVariantMap[edge.sourceSectionId] !== edge.sourceVariantId ||
      sectionVariantMap[edge.targetSectionId] !== edge.targetVariantId
    ) {
      continue;
    }
    const source =
      positions[
        makeEdgeHandleKey(edge.sourceSectionId, edge.sourcePortId, "source")
      ];
    const target =
      positions[
        makeEdgeHandleKey(edge.targetSectionId, edge.targetPortId, "target")
      ];
    if (!source || !target) {
      continue;
    }
    output.push({
      id: edge.id,
      kind: "data",
      pathType: edge.type === "straight" ? "straight" : "bezier",
      source: { x: source.x, y: source.y },
      target: { x: target.x, y: target.y },
      sourcePosition: source.side,
      targetPosition: target.side,
      selected: edge.selected,
      animated: edge.animated,
      style: edge.style ? (edge.style as CSSProperties) : undefined,
      label: edge.label ?? undefined,
      zIndex: edge.zIndex ?? 0,
    });
  }
  output.sort((left, right) => left.zIndex - right.zIndex);
  return output;
}

export function buildAgenticEdges({
  agenticEdges,
  fallbackSectionSizes,
  missingEdges,
  nodes,
  runningChatSectionIds,
  showAgenticEdges,
  toolArgSectionIds,
  toolResultSectionIds,
}: {
  agenticEdges: AgenticEdge[];
  fallbackSectionSizes: Record<string, FallbackSectionSize>;
  missingEdges: Array<
    Pick<AgenticEdge, "kind" | "sourceSectionId" | "targetSectionId"> & {
      id: string;
    }
  >;
  nodes: Map<string, Node>;
  runningChatSectionIds: Set<string>;
  showAgenticEdges: boolean;
  toolArgSectionIds: Set<string>;
  toolResultSectionIds: Set<string>;
}): CanvasFlowDrawableEdge[] {
  if (!showAgenticEdges) {
    return [];
  }
  const output: CanvasFlowDrawableEdge[] = [];
  for (const edge of agenticEdges) {
    if (edge.hidden) {
      continue;
    }
    const resolved = resolveAgenticEndpointPair(
      edge,
      nodes,
      fallbackSectionSizes,
    );
    if (!resolved) {
      continue;
    }
    output.push({
      id: edge.id,
      kind: "agentic",
      pathType: "bezier",
      source: resolved.source,
      target: resolved.target,
      sourcePosition: HandlePosition.Right,
      targetPosition: HandlePosition.Left,
      selected: edge.selected,
      animated: runningChatSectionIds.has(edge.sourceSectionId),
      style: buildAgenticEdgeStyle(
        edge,
        toolArgSectionIds,
        toolResultSectionIds,
      ),
      zIndex: edge.zIndex ?? 0,
    });
  }
  for (const edge of missingEdges) {
    const resolved = resolveAgenticEndpointPair(
      edge,
      nodes,
      fallbackSectionSizes,
    );
    if (!resolved) {
      continue;
    }
    output.push({
      id: edge.id,
      kind: "agentic",
      pathType: "bezier",
      source: resolved.source,
      target: resolved.target,
      sourcePosition: HandlePosition.Right,
      targetPosition: HandlePosition.Left,
      missing: true,
      zIndex: Number.MAX_SAFE_INTEGER,
    });
  }
  output.sort((left, right) => left.zIndex - right.zIndex);
  return output;
}

export function buildStateMachineEdges({
  edges,
  nodes,
  topLevelSections,
}: {
  edges: WorkflowEdge[];
  nodes: Map<string, Node>;
  topLevelSections: TopLevelSections;
}): CanvasFlowDrawableEdge[] {
  const output: CanvasFlowDrawableEdge[] = [];
  for (const edge of edges) {
    if (edge.hidden) {
      continue;
    }
    const sourceFrame = getNodeFrame(
      nodes.get(edge.sourceSectionId),
      topLevelSections[edge.sourceSectionId],
    );
    const targetNode = nodes.get(edge.targetSectionId);
    const targetFrame = getNodeFrame(
      targetNode,
      topLevelSections[edge.targetSectionId],
    );
    const source = resolveNodeAnchor(sourceFrame, "right");
    const target = resolveNodeAnchor(targetFrame, "left");
    if (!source || !target) {
      continue;
    }
    output.push({
      id: edge.id,
      kind: "state-machine",
      pathType: "bezier",
      source,
      target,
      sourcePosition: HandlePosition.Right,
      targetPosition: HandlePosition.Left,
      selected: edge.selected,
      style: edge.style ? (edge.style as CSSProperties) : undefined,
      label: getSourceActivationCountLabel(edge) ?? undefined,
      zIndex: edge.zIndex ?? 0,
    });
    const promptLink = getPromptLink({
      edge,
      nodes,
      targetNode,
      topLevelSections,
    });
    if (promptLink) {
      output.push({
        id: `${edge.id}:prompt`,
        kind: "state-machine-prompt",
        pathType: "bezier",
        source: promptLink.source,
        target: promptLink.target,
        sourcePosition: promptLink.sourcePosition,
        targetPosition: promptLink.targetPosition,
        zIndex: (edge.zIndex ?? 0) - 0.5,
      });
    }
  }
  output.sort((left, right) => left.zIndex - right.zIndex);
  return output;
}

export function buildAgenticMissingEdges({
  agenticEdges,
  projectConfigId,
  scopeViolationEdgesByProjectConfigId,
}: {
  agenticEdges: AgenticEdge[];
  projectConfigId: string;
  scopeViolationEdgesByProjectConfigId: Record<
    string,
    Array<Pick<AgenticEdge, "kind" | "sourceSectionId" | "targetSectionId">>
  >;
}) {
  const violations =
    scopeViolationEdgesByProjectConfigId[projectConfigId] ?? [];
  if (violations.length === 0) {
    return [];
  }
  const existingKeys = new Set(
    agenticEdges.map((edge) =>
      buildAgenticEdgeKey(
        edge.sourceSectionId,
        edge.targetSectionId,
        edge.kind,
      ),
    ),
  );
  return violations
    .filter((edge) => {
      const key = buildAgenticEdgeKey(
        edge.sourceSectionId,
        edge.targetSectionId,
        edge.kind,
      );
      return !existingKeys.has(key);
    })
    .map((edge) => ({
      ...edge,
      id: `missing:${buildAgenticEdgeKey(
        edge.sourceSectionId,
        edge.targetSectionId,
        edge.kind,
      )}`,
    }));
}

function drawCanvasFlowEdge({
  ctx,
  edge,
  wireColor,
}: {
  ctx: CanvasRenderingContext2D;
  edge: CanvasFlowDrawableEdge;
  wireColor: string;
}) {
  ctx.save();
  applyEdgeStroke({ ctx, edge, wireColor });
  ctx.beginPath();
  ctx.moveTo(edge.source.x, edge.source.y);
  if (edge.pathType === "straight") {
    ctx.lineTo(edge.target.x, edge.target.y);
  } else {
    const controlParams: Parameters<typeof getBezierControls>[0] = {
      source: edge.source,
      target: edge.target,
    };
    if (edge.sourcePosition !== undefined) {
      controlParams.sourcePosition = edge.sourcePosition;
    }
    if (edge.targetPosition !== undefined) {
      controlParams.targetPosition = edge.targetPosition;
    }
    const { sourceControl, targetControl } = getBezierControls(controlParams);
    ctx.bezierCurveTo(
      sourceControl.x,
      sourceControl.y,
      targetControl.x,
      targetControl.y,
      edge.target.x,
      edge.target.y,
    );
  }
  ctx.stroke();
  if (edge.label) {
    drawEdgeLabel({ ctx, edge });
  }
  ctx.restore();
}

function applyEdgeStroke({
  ctx,
  edge,
  wireColor,
}: {
  ctx: CanvasRenderingContext2D;
  edge: CanvasFlowDrawableEdge;
  wireColor: string;
}) {
  const style = edge.style;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = resolveStrokeColor(edge, style, wireColor);
  ctx.lineWidth = resolveLineWidth(edge, style);
  if (edge.animated) {
    ctx.setLineDash([8, 6]);
  }
  if (edge.missing) {
    ctx.setLineDash([4, 8]);
    ctx.globalAlpha = 0.7;
  }
  if (edge.kind === "state-machine-prompt") {
    ctx.setLineDash([5, 5]);
    ctx.globalAlpha = 0.8;
  }
}

function drawEdgeLabel({
  ctx,
  edge,
}: {
  ctx: CanvasRenderingContext2D;
  edge: CanvasFlowDrawableEdge;
}) {
  if (!edge.label) {
    return;
  }
  const x = (edge.source.x + edge.target.x) / 2;
  const y = (edge.source.y + edge.target.y) / 2;
  const width = Math.max(80, edge.label.length * 6 + 12);
  ctx.save();
  ctx.fillStyle = "rgba(255, 255, 255, 0.86)";
  ctx.strokeStyle = "rgba(100, 116, 139, 0.45)";
  ctx.lineWidth = 1;
  drawRoundedRect(ctx, x - width / 2, y - 10, width, 20, 10);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#334155";
  ctx.font = "11px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(edge.label, x, y);
  ctx.restore();
}

function resolveStrokeColor(
  edge: CanvasFlowDrawableEdge,
  style: CSSProperties | undefined,
  wireColor: string,
) {
  if (edge.selected) {
    return "#3b82f6";
  }
  if (typeof style?.stroke === "string") {
    return style.stroke;
  }
  if (edge.kind === "agentic") {
    if (edge.missing) {
      return "#ef4444";
    }
    return "#2563eb";
  }
  if (edge.kind === "state-machine") {
    return "#d97706";
  }
  if (edge.kind === "state-machine-prompt") {
    return "#0f766e";
  }
  return wireColor;
}

function resolveLineWidth(
  edge: CanvasFlowDrawableEdge,
  style: CSSProperties | undefined,
) {
  if (typeof style?.strokeWidth === "number") {
    return style.strokeWidth;
  }
  if (typeof style?.strokeWidth === "string") {
    const parsed = Number.parseFloat(style.strokeWidth);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  if (edge.selected) {
    return 2.5;
  }
  if (edge.kind === "agentic") {
    return 2;
  }
  if (edge.kind === "state-machine") {
    return 2;
  }
  return 1.25;
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
}: {
  pos: HandlePosition;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  c: number;
}): Position {
  switch (pos) {
    case HandlePosition.Left:
      return { x: x1 - calculateControlOffset(x1 - x2, c), y: y1 };
    case HandlePosition.Right:
      return { x: x1 + calculateControlOffset(x2 - x1, c), y: y1 };
    case HandlePosition.Top:
      return { x: x1, y: y1 - calculateControlOffset(y1 - y2, c) };
    case HandlePosition.Bottom:
      return { x: x1, y: y1 + calculateControlOffset(y2 - y1, c) };
  }
}

function resolveNodeDimension(
  primaryValue: number | undefined | null,
  fallbackValue: number | undefined | null,
): number | null {
  return primaryValue ?? fallbackValue ?? null;
}

function getNodeFrame(
  node: Node | undefined,
  fallbackLayout: FallbackSectionSize | TopLevelSectionLayout | undefined,
) {
  if (!node) {
    return null;
  }
  const width = resolveNodeDimension(node.width, fallbackLayout?.w);
  const height = resolveNodeDimension(node.height, fallbackLayout?.h);
  if (width === null || height === null) {
    return null;
  }
  return {
    x: node.position.x,
    y: node.position.y,
    width,
    height,
  };
}

function resolveNodeAnchor(
  frame: ReturnType<typeof getNodeFrame>,
  side: "left" | "right",
): Position | null {
  if (!frame) {
    return null;
  }
  return {
    x: side === "left" ? frame.x : frame.x + frame.width,
    y: frame.y + frame.height / 2,
  };
}

function resolveAgenticEndpointPair(
  edge: Pick<AgenticEdge, "sourceSectionId" | "targetSectionId">,
  nodes: Map<string, Node>,
  fallbackSectionSizes: Record<string, FallbackSectionSize>,
): { source: Position; target: Position } | null {
  const source = resolveNodeAnchor(
    getNodeFrame(
      nodes.get(edge.sourceSectionId),
      fallbackSectionSizes[edge.sourceSectionId],
    ),
    "right",
  );
  const target = resolveNodeAnchor(
    getNodeFrame(
      nodes.get(edge.targetSectionId),
      fallbackSectionSizes[edge.targetSectionId],
    ),
    "left",
  );
  if (!source || !target) {
    return null;
  }
  return { source, target };
}

function buildAgenticEdgeStyle(
  edge: AgenticEdge,
  toolArgSectionIds: Set<string>,
  toolResultSectionIds: Set<string>,
): CSSProperties | undefined {
  const baseStyle = edge.style ? (edge.style as CSSProperties) : {};
  if (
    toolArgSectionIds.has(edge.sourceSectionId) ||
    toolArgSectionIds.has(edge.targetSectionId)
  ) {
    return { ...baseStyle, stroke: "#2563eb" };
  }
  if (
    toolResultSectionIds.has(edge.sourceSectionId) ||
    toolResultSectionIds.has(edge.targetSectionId)
  ) {
    return { ...baseStyle, stroke: "#0f766e" };
  }
  return Object.keys(baseStyle).length > 0 ? baseStyle : undefined;
}

function getSourceActivationCountLabel(edge: WorkflowEdge): string | null {
  const condition = edge.sourceActivationCountCondition;
  if (!condition) {
    return null;
  }
  const operatorLabel =
    sourceActivationCountOperatorLabelByValue.get(condition.operator) ??
    condition.operator;
  return `src count ${operatorLabel} ${condition.value}`;
}

function getPromptSectionId(edge: WorkflowEdge): string | null {
  if (edge.targetAction?.type !== "send_prompt") {
    return null;
  }
  return edge.targetAction.promptSectionId ?? null;
}

function getPromptLink({
  edge,
  nodes,
  targetNode,
  topLevelSections,
}: {
  edge: WorkflowEdge;
  nodes: Map<string, Node>;
  targetNode: Node | undefined;
  topLevelSections: TopLevelSections;
}) {
  const promptSectionId = getPromptSectionId(edge);
  if (!promptSectionId) {
    return null;
  }
  const promptFrame = getNodeFrame(
    nodes.get(promptSectionId),
    topLevelSections[promptSectionId],
  );
  const targetFrame = getNodeFrame(
    targetNode,
    topLevelSections[edge.targetSectionId],
  );
  const { sourceSide, targetSide } = resolveRelativeAnchorSides(
    promptFrame,
    targetFrame,
  );
  const source = resolveNodeAnchor(promptFrame, sourceSide);
  const target = resolveNodeAnchor(targetFrame, targetSide);
  if (!source || !target) {
    return null;
  }
  return {
    source,
    target,
    sourcePosition:
      sourceSide === "right" ? HandlePosition.Right : HandlePosition.Left,
    targetPosition:
      targetSide === "left" ? HandlePosition.Left : HandlePosition.Right,
  };
}

function resolveRelativeAnchorSides(
  sourceFrame: ReturnType<typeof getNodeFrame>,
  targetFrame: ReturnType<typeof getNodeFrame>,
): { sourceSide: "left" | "right"; targetSide: "left" | "right" } {
  const sourceCenterX = sourceFrame
    ? sourceFrame.x + sourceFrame.width / 2
    : null;
  const targetCenterX = targetFrame
    ? targetFrame.x + targetFrame.width / 2
    : null;
  if (sourceCenterX === null || targetCenterX === null) {
    return { sourceSide: "right", targetSide: "left" };
  }
  if (sourceCenterX <= targetCenterX) {
    return { sourceSide: "right", targetSide: "left" };
  }
  return { sourceSide: "left", targetSide: "right" };
}

function buildAgenticEdgeKey(
  sourceSectionId: string,
  targetSectionId: string,
  kind: string,
): string {
  if (kind === AgenticEdgeKindEnum.chat_chat) {
    const [first, second] =
      sourceSectionId < targetSectionId
        ? [sourceSectionId, targetSectionId]
        : [targetSectionId, sourceSectionId];
    return `${kind}:${first}:${second}`;
  }
  return `${kind}:${sourceSectionId}:${targetSectionId}`;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
}
