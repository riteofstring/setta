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
import type {
  CanvasFlowConnectionState,
  CanvasFlowDrawableEdge,
  CanvasFlowViewport,
} from "./canvasFlowTypes";
import { screenToWorldPoint } from "./canvasFlowViewport";

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
type CanvasFlowEdgeEndpoint = "source" | "target";
export type CanvasFlowEdgeHit = {
  edge: CanvasFlowDrawableEdge;
  endpoint: CanvasFlowEdgeEndpoint | null;
  distance: number;
};
export type CanvasFlowEdgeStroke = {
  alpha: number;
  color: string;
  dashPattern?: readonly number[] | undefined;
  lineWidth: number;
};
export type CanvasFlowEdgeLabelLayout = {
  height: number;
  width: number;
  x: number;
  y: number;
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

export function drawCanvasFlowConnectionPreview({
  connectionState,
  ctx,
  positions,
  viewport,
}: {
  connectionState: CanvasFlowConnectionState;
  ctx: CanvasRenderingContext2D;
  positions: EdgeHandlePositions;
  viewport: CanvasFlowViewport;
}) {
  const previewEdge = getCanvasFlowConnectionPreviewEdge({
    connectionState,
    positions,
    viewport,
  });
  if (!previewEdge) {
    return;
  }

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  applyEdgeStroke({
    ctx,
    edge: previewEdge,
    wireColor: "#3b82f6",
  });
  ctx.beginPath();
  ctx.moveTo(previewEdge.source.x, previewEdge.source.y);
  const { sourceControl, targetControl } =
    getCanvasFlowEdgeBezierControls(previewEdge);
  ctx.bezierCurveTo(
    sourceControl.x,
    sourceControl.y,
    targetControl.x,
    targetControl.y,
    previewEdge.target.x,
    previewEdge.target.y,
  );
  ctx.stroke();
  ctx.restore();
}

export function getCanvasFlowConnectionPreviewEdge({
  connectionState,
  positions,
  viewport,
}: {
  connectionState: CanvasFlowConnectionState;
  positions: EdgeHandlePositions;
  viewport: CanvasFlowViewport;
}): CanvasFlowDrawableEdge | null {
  const startHandle = connectionState.connectionStartHandle;
  if (!startHandle?.handleId) {
    return null;
  }
  const start =
    positions[
      makeEdgeHandleKey(
        startHandle.sectionId,
        startHandle.handleId,
        startHandle.type,
      )
    ];
  if (!start) {
    return null;
  }
  const sourcePosition = start.side;
  return {
    id: "connection-preview",
    kind: "data",
    pathType: "bezier",
    source: { x: start.x, y: start.y },
    target: screenToWorldPoint(connectionState.connectionPosition, viewport),
    animated: true,
    sourcePosition,
    targetPosition: getOppositeHandlePosition(sourcePosition),
    selected: connectionState.connectionStatus !== "invalid",
    style: {
      stroke:
        connectionState.connectionStatus === "invalid" ? "#ef4444" : "#3b82f6",
      strokeWidth: 2,
    },
    zIndex: Number.MAX_SAFE_INTEGER,
  };
}

export function getCanvasFlowEdgePolyline(
  edge: CanvasFlowDrawableEdge,
  segmentCount = 24,
): Position[] {
  if (edge.pathType === "straight") {
    return [edge.source, edge.target];
  }
  const { sourceControl, targetControl } =
    getCanvasFlowEdgeBezierControls(edge);
  const points: Position[] = [edge.source];
  for (let step = 1; step <= segmentCount; step += 1) {
    points.push(
      cubicBezierPoint({
        t: step / segmentCount,
        source: edge.source,
        sourceControl,
        targetControl,
        target: edge.target,
      }),
    );
  }
  return points;
}

export function getCanvasFlowEdgeStroke({
  edge,
  wireColor,
}: {
  edge: CanvasFlowDrawableEdge;
  wireColor: string;
}): CanvasFlowEdgeStroke {
  let alpha = 1;
  let dashPattern: readonly number[] | undefined;
  if (edge.animated) {
    dashPattern = [8, 6];
  }
  if (edge.missing) {
    alpha = 0.7;
    dashPattern = [4, 8];
  }
  if (edge.kind === "state-machine-prompt") {
    alpha = 0.8;
    dashPattern = [5, 5];
  }
  return {
    alpha,
    color: resolveStrokeColor(edge, edge.style, wireColor),
    dashPattern,
    lineWidth: resolveLineWidth(edge, edge.style),
  };
}

export function getCanvasFlowEdgeHit({
  edges,
  point,
  viewport,
  endpointScreenRadius = 12,
  pathScreenRadius = 10,
}: {
  edges: CanvasFlowDrawableEdge[];
  point: Position;
  viewport: CanvasFlowViewport;
  endpointScreenRadius?: number;
  pathScreenRadius?: number;
}): CanvasFlowEdgeHit | null {
  const endpointTolerance = endpointScreenRadius / viewport.zoom;
  const pathTolerance = pathScreenRadius / viewport.zoom;
  let bestHit: CanvasFlowEdgeHit | null = null;

  for (let index = edges.length - 1; index >= 0; index -= 1) {
    const edge = edges[index];
    const hit = edge
      ? getCanvasFlowSingleEdgeHit({
          edge,
          endpointTolerance,
          pathTolerance,
          point,
        })
      : null;
    if (!hit) {
      continue;
    }
    if (hit.endpoint) {
      return hit;
    }
    bestHit = pickCloserEdgeHit(bestHit, hit);
  }

  return bestHit;
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
    const drawableEdge = buildDataEdge({
      edge,
      positions,
      sectionVariantMap,
    });
    if (drawableEdge) {
      output.push(drawableEdge);
    }
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
      sourceSectionId: edge.sourceSectionId,
      targetSectionId: edge.targetSectionId,
      sourcePosition: HandlePosition.Right,
      targetPosition: HandlePosition.Left,
      selected: edge.selected,
      animated: runningChatSectionIds.has(edge.sourceSectionId),
      selectable: true,
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
      sourceSectionId: edge.sourceSectionId,
      targetSectionId: edge.targetSectionId,
      sourcePosition: HandlePosition.Right,
      targetPosition: HandlePosition.Left,
      missing: true,
      selectable: false,
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
    const mainEdge = buildStateMachineMainEdge({
      edge,
      nodes,
      topLevelSections,
    });
    if (!mainEdge) {
      continue;
    }
    output.push(mainEdge);
    const promptLink = buildStateMachinePromptEdge({
      edge,
      nodes,
      topLevelSections,
    });
    if (promptLink) {
      output.push(promptLink);
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

function buildDataEdge({
  edge,
  positions,
  sectionVariantMap,
}: {
  edge: Edge;
  positions: EdgeHandlePositions;
  sectionVariantMap: SectionVariantMap;
}): CanvasFlowDrawableEdge | null {
  if (!shouldDrawDataEdge(edge, sectionVariantMap)) {
    return null;
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
    return null;
  }
  return {
    id: edge.id,
    kind: "data",
    pathType: edge.type === "straight" ? "straight" : "bezier",
    source: { x: source.x, y: source.y },
    target: { x: target.x, y: target.y },
    sourceSectionId: edge.sourceSectionId,
    sourceHandleId: edge.sourcePortId,
    targetSectionId: edge.targetSectionId,
    targetHandleId: edge.targetPortId,
    sourcePosition: source.side,
    targetPosition: target.side,
    selected: edge.selected,
    animated: edge.animated,
    reconnectable: true,
    selectable: true,
    style: edge.style ? (edge.style as CSSProperties) : undefined,
    label: edge.label ?? undefined,
    zIndex: edge.zIndex ?? 0,
  };
}

function shouldDrawDataEdge(edge: Edge, sectionVariantMap: SectionVariantMap) {
  return (
    !edge.hidden &&
    sectionVariantMap[edge.sourceSectionId] === edge.sourceVariantId &&
    sectionVariantMap[edge.targetSectionId] === edge.targetVariantId
  );
}

function buildStateMachineMainEdge({
  edge,
  nodes,
  topLevelSections,
}: {
  edge: WorkflowEdge;
  nodes: Map<string, Node>;
  topLevelSections: TopLevelSections;
}): CanvasFlowDrawableEdge | null {
  if (edge.hidden) {
    return null;
  }
  const sourceFrame = getNodeFrame(
    nodes.get(edge.sourceSectionId),
    topLevelSections[edge.sourceSectionId],
  );
  const targetFrame = getNodeFrame(
    nodes.get(edge.targetSectionId),
    topLevelSections[edge.targetSectionId],
  );
  const source = resolveNodeAnchor(sourceFrame, "right");
  const target = resolveNodeAnchor(targetFrame, "left");
  if (!source || !target) {
    return null;
  }
  return {
    id: edge.id,
    kind: "state-machine",
    pathType: "bezier",
    source,
    target,
    sourceSectionId: edge.sourceSectionId,
    targetSectionId: edge.targetSectionId,
    sourcePosition: HandlePosition.Right,
    targetPosition: HandlePosition.Left,
    selected: edge.selected,
    selectable: true,
    style: edge.style ? (edge.style as CSSProperties) : undefined,
    label: getSourceActivationCountLabel(edge) ?? undefined,
    zIndex: edge.zIndex ?? 0,
  };
}

function buildStateMachinePromptEdge({
  edge,
  nodes,
  topLevelSections,
}: {
  edge: WorkflowEdge;
  nodes: Map<string, Node>;
  topLevelSections: TopLevelSections;
}): CanvasFlowDrawableEdge | null {
  const promptLink = getPromptLink({
    edge,
    nodes,
    targetNode: nodes.get(edge.targetSectionId),
    topLevelSections,
  });
  if (!promptLink) {
    return null;
  }
  return {
    id: `${edge.id}:prompt`,
    kind: "state-machine-prompt",
    pathType: "bezier",
    source: promptLink.source,
    target: promptLink.target,
    sourcePosition: promptLink.sourcePosition,
    targetPosition: promptLink.targetPosition,
    selectable: false,
    zIndex: (edge.zIndex ?? 0) - 0.5,
  };
}

function getCanvasFlowSingleEdgeHit({
  edge,
  endpointTolerance,
  pathTolerance,
  point,
}: {
  edge: CanvasFlowDrawableEdge;
  endpointTolerance: number;
  pathTolerance: number;
  point: Position;
}): CanvasFlowEdgeHit | null {
  if (!isCanvasFlowEdgeInteractive(edge)) {
    return null;
  }
  const endpoint = getCanvasFlowEdgeEndpointHit({
    edge,
    point,
    tolerance: endpointTolerance,
  });
  if (endpoint) {
    return endpoint;
  }
  const distance = getCanvasFlowEdgeDistance(edge, point);
  if (distance > pathTolerance) {
    return null;
  }
  return { edge, endpoint: null, distance };
}

function pickCloserEdgeHit(
  current: CanvasFlowEdgeHit | null,
  next: CanvasFlowEdgeHit,
): CanvasFlowEdgeHit {
  return !current || next.distance < current.distance ? next : current;
}

function isCanvasFlowEdgeInteractive(edge: CanvasFlowDrawableEdge): boolean {
  return edge.selectable !== false && !edge.missing;
}

function getCanvasFlowEdgeEndpointHit({
  edge,
  point,
  tolerance,
}: {
  edge: CanvasFlowDrawableEdge;
  point: Position;
  tolerance: number;
}): CanvasFlowEdgeHit | null {
  if (!edge.reconnectable) {
    return null;
  }
  const sourceDistance = distanceBetweenPoints(point, edge.source);
  const targetDistance = distanceBetweenPoints(point, edge.target);
  if (sourceDistance <= tolerance && sourceDistance <= targetDistance) {
    return { edge, endpoint: "source", distance: sourceDistance };
  }
  if (targetDistance <= tolerance) {
    return { edge, endpoint: "target", distance: targetDistance };
  }
  return null;
}

function getCanvasFlowEdgeDistance(
  edge: CanvasFlowDrawableEdge,
  point: Position,
): number {
  if (edge.pathType === "straight") {
    return distanceToSegment(point, edge.source, edge.target);
  }
  const controls = getBezierControls({
    source: edge.source,
    target: edge.target,
    sourcePosition: edge.sourcePosition ?? HandlePosition.Bottom,
    targetPosition: edge.targetPosition ?? HandlePosition.Top,
  });
  let distance = Infinity;
  let previous = edge.source;
  for (let step = 1; step <= 24; step += 1) {
    const t = step / 24;
    const current = cubicBezierPoint({
      t,
      source: edge.source,
      sourceControl: controls.sourceControl,
      targetControl: controls.targetControl,
      target: edge.target,
    });
    distance = Math.min(distance, distanceToSegment(point, previous, current));
    previous = current;
  }
  return distance;
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

export function getOppositeHandlePosition(
  position: HandlePosition,
): HandlePosition {
  switch (position) {
    case HandlePosition.Left:
      return HandlePosition.Right;
    case HandlePosition.Right:
      return HandlePosition.Left;
    case HandlePosition.Top:
      return HandlePosition.Bottom;
    case HandlePosition.Bottom:
      return HandlePosition.Top;
  }
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
  const stroke = getCanvasFlowEdgeStroke({ edge, wireColor });
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = stroke.lineWidth;
  ctx.globalAlpha = stroke.alpha;
  if (stroke.dashPattern) {
    ctx.setLineDash([...stroke.dashPattern]);
  }
}

function getCanvasFlowEdgeBezierControls(edge: CanvasFlowDrawableEdge) {
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
  return getBezierControls(controlParams);
}

function drawEdgeLabel({
  ctx,
  edge,
}: {
  ctx: CanvasRenderingContext2D;
  edge: CanvasFlowDrawableEdge;
}) {
  const labelLayout = getCanvasFlowEdgeLabelLayout(edge);
  if (!labelLayout || !edge.label) {
    return;
  }
  ctx.save();
  ctx.fillStyle = "rgba(255, 255, 255, 0.86)";
  ctx.strokeStyle = "rgba(100, 116, 139, 0.45)";
  ctx.lineWidth = 1;
  drawRoundedRect({
    ctx,
    x: labelLayout.x,
    y: labelLayout.y,
    width: labelLayout.width,
    height: labelLayout.height,
    radius: 10,
  });
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#334155";
  ctx.font = "11px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(
    edge.label,
    labelLayout.x + labelLayout.width / 2,
    labelLayout.y + labelLayout.height / 2,
  );
  ctx.restore();
}

export function getCanvasFlowEdgeLabelLayout(
  edge: CanvasFlowDrawableEdge,
): CanvasFlowEdgeLabelLayout | null {
  if (!edge.label) {
    return null;
  }
  const { height, width } = getCanvasFlowEdgeLabelSize(edge.label);
  return {
    height,
    width,
    x: (edge.source.x + edge.target.x) / 2 - width / 2,
    y: (edge.source.y + edge.target.y) / 2 - height / 2,
  };
}

export function getCanvasFlowEdgeLabelSize(label: string): {
  height: number;
  width: number;
} {
  return {
    height: 20,
    width: Math.max(80, label.length * 6 + 12),
  };
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

function distanceBetweenPoints(left: Position, right: Position): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function distanceToSegment(
  point: Position,
  start: Position,
  end: Position,
): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) {
    return distanceBetweenPoints(point, start);
  }
  const t = Math.max(
    0,
    Math.min(
      1,
      ((point.x - start.x) * dx + (point.y - start.y) * dy) /
        (dx * dx + dy * dy),
    ),
  );
  return distanceBetweenPoints(point, {
    x: start.x + t * dx,
    y: start.y + t * dy,
  });
}

function cubicBezierPoint({
  t,
  source,
  sourceControl,
  targetControl,
  target,
}: {
  t: number;
  source: Position;
  sourceControl: Position;
  targetControl: Position;
  target: Position;
}): Position {
  const oneMinusT = 1 - t;
  const sourceWeight = oneMinusT * oneMinusT * oneMinusT;
  const sourceControlWeight = 3 * oneMinusT * oneMinusT * t;
  const targetControlWeight = 3 * oneMinusT * t * t;
  const targetWeight = t * t * t;
  return {
    x:
      sourceWeight * source.x +
      sourceControlWeight * sourceControl.x +
      targetControlWeight * targetControl.x +
      targetWeight * target.x,
    y:
      sourceWeight * source.y +
      sourceControlWeight * sourceControl.y +
      targetControlWeight * targetControl.y +
      targetWeight * target.y,
  };
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

function drawRoundedRect({
  ctx,
  height,
  radius,
  width,
  x,
  y,
}: {
  ctx: CanvasRenderingContext2D;
  height: number;
  radius: number;
  width: number;
  x: number;
  y: number;
}) {
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
