import type {
  WorkflowCondition,
  WorkflowGraphEdgeStatus,
  WorkflowGraphNodeStatus,
  WorkflowGraphProjection,
  WorkflowNodeKind,
  WorkflowValidationDiagnostic,
  WorkflowValidationResult,
  WorkflowValidationSeverity,
} from "@generated/backend";

import { workflowNodeAccentColor } from "./workspace-neon-theme";

interface WorkflowGraphNode {
  color: number;
  diagnostic: WorkflowGraphDiagnostic | null;
  executionCount: number;
  height: number;
  id: string;
  kind: WorkflowNodeKind;
  layer: "workflow";
  label: string;
  ports?: WorkflowGraphPort[];
  status: WorkflowGraphNodeStatus;
  width: number;
  x: number;
  y: number;
}

interface WorkflowGraphPort {
  id: string;
  label: string;
  role: "source" | "target";
  xOffset: number;
  yRatio: number;
}

interface WorkflowGraphEdge {
  diagnostic: WorkflowGraphDiagnostic | null;
  id: string;
  layer: "workflow";
  label: string;
  sourceNodeId: string;
  sourcePortId: string;
  status: WorkflowGraphEdgeStatus;
  targetNodeId: string;
  targetPortId: string;
}

interface WorkflowGraphGraph {
  edges: WorkflowGraphEdge[];
  nodes: WorkflowGraphNode[];
  workflow: {
    definitionId: string;
    definitionName: string;
    definitionVersionId: string;
    definitionVersionNumber: number;
    draftRevision: string;
    editable: boolean;
    executionId: string;
    executionStatus: string;
    versionMismatch: boolean;
    viewMode: WorkflowGraphProjection["viewMode"];
    workspaceId: string;
  } | null;
}

interface WorkflowGraphDiagnostic {
  codes: string[];
  count: number;
  severity: WorkflowValidationSeverity;
}

const columnGap = 270;
const rowGap = 132;
const nodeHeight = 82;
const minNodeWidth = 156;
const maxNodeWidth = 232;
const labelWidthStep = 7;

const routePorts = [
  { id: "input", label: "", role: "target", xOffset: 20, yRatio: 0.5 },
  { id: "route_yes", label: "yes", role: "source", xOffset: -20, yRatio: 0.28 },
  { id: "route_no", label: "no", role: "source", xOffset: -20, yRatio: 0.5 },
  { id: "route_default", label: "default", role: "source", xOffset: -20, yRatio: 0.72 },
] satisfies WorkflowGraphPort[];

export function rendererGraphFromWorkflowProjection(
  projection: WorkflowGraphProjection,
  validation: WorkflowValidationResult | null = workflowProjectionValidationResult(projection),
): WorkflowGraphGraph {
  const positions = workflowNodePositions(projection);
  const diagnostics = workflowDiagnosticMaps(projection, validation);
  return {
    edges: projection.edges.map((edge) => ({
      diagnostic: diagnostics.edges.get(edge.id) ?? null,
      id: edge.id,
      layer: "workflow",
      label: edge.label,
      sourceNodeId: edge.fromNodeId,
      sourcePortId: workflowEdgeSourcePortId(edge.condition),
      status: edge.status,
      targetNodeId: edge.toNodeId,
      targetPortId: "input",
    })),
    nodes: projection.nodes.map((node) => {
      const position = positions.get(node.id) ?? { x: 0, y: 0 };
      return {
        color: workflowNodeColor(node.status, node.kind),
        diagnostic: diagnostics.nodes.get(node.id) ?? null,
        executionCount: node.executionCount,
        height: nodeHeight,
        id: node.id,
        kind: node.kind,
        layer: "workflow",
        label: node.label,
        ports: workflowNodePorts(node.kind),
        status: node.status,
        width: workflowNodeWidth(node.label),
        x: position.x,
        y: position.y,
      };
    }),
    workflow: {
      definitionId: projection.definitionId,
      definitionName: projection.definitionName,
      definitionVersionId: projection.definitionVersionId,
      definitionVersionNumber: projection.definitionVersionNumber,
      draftRevision: projection.draftRevision,
      editable: projection.editable,
      executionId: projection.executionId,
      executionStatus: projection.executionStatus ?? "",
      versionMismatch: projection.versionMismatch,
      viewMode: projection.viewMode,
      workspaceId: projection.workspaceId,
    },
  };
}

function workflowProjectionValidationResult(
  projection: WorkflowGraphProjection,
): WorkflowValidationResult | null {
  if (projection.validation.status !== "current") {
    return null;
  }
  return projection.validation.snapshot?.result ?? null;
}

function workflowDiagnosticMaps(
  projection: WorkflowGraphProjection,
  validation: WorkflowValidationResult | null,
) {
  const nodes = new Map<string, WorkflowGraphDiagnostic>();
  const edges = new Map<string, WorkflowGraphDiagnostic>();
  if (validation === null || projection.executionId !== "") {
    return { edges, nodes };
  }
  for (const diagnostic of validation.diagnostics) {
    if (diagnostic.nodeId !== "") {
      upsertDiagnosticSummary(nodes, diagnostic.nodeId, diagnostic);
    }
    if (diagnostic.edgeId !== "") {
      upsertDiagnosticSummary(edges, diagnostic.edgeId, diagnostic);
    }
  }
  return { edges, nodes };
}

function upsertDiagnosticSummary(
  summaries: Map<string, WorkflowGraphDiagnostic>,
  id: string,
  diagnostic: WorkflowValidationDiagnostic,
) {
  const existing = summaries.get(id);
  if (!existing) {
    summaries.set(id, {
      codes: [diagnostic.code],
      count: 1,
      severity: diagnostic.severity,
    });
    return;
  }
  summaries.set(id, {
    codes: existing.codes.includes(diagnostic.code)
      ? existing.codes
      : [...existing.codes, diagnostic.code],
    count: existing.count + 1,
    severity: higherSeverity(existing.severity, diagnostic.severity),
  });
}

function higherSeverity(
  left: WorkflowValidationSeverity,
  right: WorkflowValidationSeverity,
): WorkflowValidationSeverity {
  return severityRank(right) > severityRank(left) ? right : left;
}

function severityRank(severity: WorkflowValidationSeverity) {
  switch (severity) {
    case "error":
      return 2;
    case "warning":
      return 1;
    default:
      return assertNever(severity);
  }
}

function workflowNodePorts(kind: WorkflowNodeKind): WorkflowGraphPort[] | undefined {
  if (kind === "gateway.xor") {
    return routePorts;
  }
  return undefined;
}

function workflowEdgeSourcePortId(condition: WorkflowCondition | null): string {
  if (condition?.kind === "default") {
    return "route_default";
  }
  if (condition?.kind === "action_signal" && condition.signalName === "route") {
    if (condition.signalValue === "yes") {
      return "route_yes";
    }
    if (condition.signalValue === "no") {
      return "route_no";
    }
  }
  return "output";
}

function workflowNodeColor(status: WorkflowGraphNodeStatus, kind: WorkflowNodeKind) {
  return workflowNodeAccentColor(status, kind);
}

function assertNever(value: never): never {
  throw new Error(`Unsupported workflow validation severity: ${String(value)}`);
}

function workflowNodeWidth(label: string) {
  return Math.min(maxNodeWidth, Math.max(minNodeWidth, 40 + label.length * labelWidthStep));
}

function workflowNodePositions(projection: WorkflowGraphProjection) {
  const rankedPositions = workflowRankedNodePositions(projection);
  const layoutPositions = workflowLayoutNodePositions(projection.layout);
  if (layoutPositions.size === 0) {
    return rankedPositions;
  }
  const positions = new Map(rankedPositions);
  for (const node of projection.nodes) {
    const layout = layoutPositions.get(node.id);
    if (layout) {
      positions.set(node.id, layout);
    }
  }
  return positions;
}

function workflowLayoutNodePositions(layout: WorkflowGraphProjection["layout"]) {
  const positions = new Map<string, { x: number; y: number }>();
  for (const node of layout.nodes) {
    positions.set(node.nodeId, { x: node.x, y: node.y });
  }
  return positions;
}

function workflowRankedNodePositions(projection: WorkflowGraphProjection) {
  const ranks = workflowNodeRanks(projection);
  const rankedNodes = new Map<number, string[]>();
  const nodeOrder = new Map(projection.nodes.map((node, index) => [node.id, index]));
  for (const node of projection.nodes) {
    const rank = ranks.get(node.id) ?? 0;
    rankedNodes.set(rank, [...(rankedNodes.get(rank) ?? []), node.id]);
  }
  const orderedRanks = [...rankedNodes.keys()].sort((left, right) => left - right);
  const positions = new Map<string, { x: number; y: number }>();
  const graphWidth = Math.max(0, (orderedRanks.length - 1) * columnGap);
  for (const [columnIndex, rank] of orderedRanks.entries()) {
    const nodeIds = [...(rankedNodes.get(rank) ?? [])].sort(
      (left, right) => (nodeOrder.get(left) ?? 0) - (nodeOrder.get(right) ?? 0),
    );
    const columnHeight = Math.max(0, (nodeIds.length - 1) * rowGap);
    for (const [rowIndex, nodeId] of nodeIds.entries()) {
      positions.set(nodeId, {
        x: columnIndex * columnGap - graphWidth / 2,
        y: rowIndex * rowGap - columnHeight / 2,
      });
    }
  }
  return positions;
}

function workflowNodeRanks(projection: WorkflowGraphProjection) {
  const { incoming, outgoing } = workflowGraphAdjacency(projection);
  const queue = initialRankQueue(projection, incoming);
  const ranks = seedRanks(queue);
  propagateRanks(queue, ranks, outgoing, projection.nodes.length);
  rankUnvisitedNodes(projection, ranks);
  return ranks;
}

function workflowGraphAdjacency(projection: WorkflowGraphProjection) {
  const nodeIDs = new Set(projection.nodes.map((node) => node.id));
  const incoming = new Map<string, number>();
  const outgoing = new Map<string, string[]>();
  for (const edge of projection.edges) {
    if (!nodeIDs.has(edge.fromNodeId) || !nodeIDs.has(edge.toNodeId)) {
      continue;
    }
    incoming.set(edge.toNodeId, (incoming.get(edge.toNodeId) ?? 0) + 1);
    outgoing.set(edge.fromNodeId, [...(outgoing.get(edge.fromNodeId) ?? []), edge.toNodeId]);
  }
  return { incoming, outgoing };
}

function initialRankQueue(projection: WorkflowGraphProjection, incoming: Map<string, number>) {
  const starts = projection.nodes
    .filter((node) => node.kind === "start" || (incoming.get(node.id) ?? 0) === 0)
    .map((node) => node.id);
  return starts.length > 0 ? [...starts] : projection.nodes.map((node) => node.id);
}

function seedRanks(queue: string[]) {
  const ranks = new Map<string, number>();
  for (const nodeId of queue) {
    ranks.set(nodeId, 0);
  }
  return ranks;
}

function propagateRanks(
  queue: string[],
  ranks: Map<string, number>,
  outgoing: Map<string, string[]>,
  nodeCount: number,
) {
  const maxRank = Math.max(0, nodeCount - 1);
  for (let index = 0; index < queue.length; index += 1) {
    const nodeId = queue[index];
    if (nodeId === undefined) {
      continue;
    }
    const rank = ranks.get(nodeId) ?? 0;
    for (const nextNodeId of outgoing.get(nodeId) ?? []) {
      const nextRank = Math.min(maxRank, rank + 1);
      if ((ranks.get(nextNodeId) ?? -1) >= nextRank) {
        continue;
      }
      ranks.set(nextNodeId, nextRank);
      queue.push(nextNodeId);
    }
  }
}

function rankUnvisitedNodes(projection: WorkflowGraphProjection, ranks: Map<string, number>) {
  for (const node of projection.nodes) {
    if (!ranks.has(node.id)) {
      ranks.set(node.id, 0);
    }
  }
}
