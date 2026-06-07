import type {
  WorkflowGraphEdgeStatus,
  WorkflowGraphNodeStatus,
  WorkflowGraphProjection,
  WorkflowNodeKind,
} from "@generated/backend";

interface PixiWorkspaceNode {
  color: number;
  executionCount: number;
  height: number;
  id: string;
  kind: WorkflowNodeKind;
  label: string;
  status: WorkflowGraphNodeStatus;
  width: number;
  x: number;
  y: number;
}

interface PixiWorkspaceEdge {
  id: string;
  sourceNodeId: string;
  sourcePortId: string;
  status: WorkflowGraphEdgeStatus;
  targetNodeId: string;
  targetPortId: string;
}

interface PixiWorkspaceGraph {
  edges: PixiWorkspaceEdge[];
  nodes: PixiWorkspaceNode[];
  workflow: {
    definitionId: string;
    definitionName: string;
    executionId: string;
    executionStatus: string;
    workspaceId: string;
  } | null;
}

const columnGap = 270;
const rowGap = 132;
const nodeHeight = 82;
const minNodeWidth = 156;
const maxNodeWidth = 232;
const labelWidthStep = 7;

const nodeStatusColors = {
  not_started: 0x52525b,
  pending: 0xa78bfa,
  ready: 0x38bdf8,
  running: 0x14b8a6,
  succeeded: 0x22c55e,
  failed: 0xef4444,
  cancelled: 0x71717a,
  waiting_approval: 0xf59e0b,
} satisfies Record<WorkflowGraphNodeStatus, number>;

const idleKindColors = {
  action: 0x64748b,
  end: 0x475569,
  "gateway.and": 0x8b5cf6,
  "gateway.or": 0x8b5cf6,
  "gateway.xor": 0x8b5cf6,
  "loop.guard": 0xf97316,
  start: 0x0f766e,
} satisfies Record<WorkflowNodeKind, number>;

export function pixiGraphFromWorkflowProjection(
  projection: WorkflowGraphProjection,
): PixiWorkspaceGraph {
  const positions = workflowNodePositions(projection);
  return {
    edges: projection.edges.map((edge) => ({
      id: edge.id,
      sourceNodeId: edge.fromNodeId,
      sourcePortId: "output",
      status: edge.status,
      targetNodeId: edge.toNodeId,
      targetPortId: "input",
    })),
    nodes: projection.nodes.map((node) => {
      const position = positions.get(node.id) ?? { x: 0, y: 0 };
      return {
        color: workflowNodeColor(node.status, node.kind),
        executionCount: node.executionCount,
        height: nodeHeight,
        id: node.id,
        kind: node.kind,
        label: node.label,
        status: node.status,
        width: workflowNodeWidth(node.label),
        x: position.x,
        y: position.y,
      };
    }),
    workflow: {
      definitionId: projection.definitionId,
      definitionName: projection.definitionName,
      executionId: projection.executionId,
      executionStatus: projection.executionStatus ?? "",
      workspaceId: projection.workspaceId,
    },
  };
}

function workflowNodeColor(status: WorkflowGraphNodeStatus, kind: WorkflowNodeKind) {
  if (status === "not_started") {
    return idleKindColors[kind];
  }
  return nodeStatusColors[status];
}

function workflowNodeWidth(label: string) {
  return Math.min(maxNodeWidth, Math.max(minNodeWidth, 40 + label.length * labelWidthStep));
}

function workflowNodePositions(projection: WorkflowGraphProjection) {
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
