import type {
  WorkflowActionConfig,
  WorkflowEdge,
  WorkflowGraph,
  WorkflowNode,
  WorkflowNodeKind,
} from "@generated/backend";
import { workflowActionKindValues, workflowEdgeKindValues } from "@generated/backend";

export type WorkflowDraftNodeType =
  | "agent_task"
  | "barrier_join"
  | "end"
  | "merge"
  | "route"
  | "start";

export interface WorkflowDraftNodePosition {
  x: number;
  y: number;
}

export interface WorkflowDraftEdgeConnection {
  sourceNodeId: string;
  targetNodeId: string;
}

const draftNodeCenterOffset = {
  x: 80,
  y: 41,
};

const draftNodeSpecs = {
  agent_task: {
    idBase: "agent_task",
    kind: "action",
    title: "Agent Task",
  },
  barrier_join: {
    idBase: "barrier_join",
    kind: "gateway.and",
    title: "Barrier Join",
  },
  end: {
    idBase: "end",
    kind: "end",
    title: "End",
  },
  merge: {
    idBase: "merge",
    kind: "gateway.or",
    title: "Merge",
  },
  route: {
    idBase: "route",
    kind: "gateway.xor",
    title: "Route",
  },
  start: {
    idBase: "start",
    kind: "start",
    title: "Start",
  },
} satisfies Record<
  WorkflowDraftNodeType,
  { idBase: string; kind: WorkflowNodeKind; title: string }
>;

export function emptyWorkflowGraph(): WorkflowGraph {
  return {
    edges: [],
    layout: { nodes: [] },
    nodes: [],
  };
}

export function workflowGraphWithAddedDraftNode(
  graph: WorkflowGraph,
  nodeType: WorkflowDraftNodeType,
  position: WorkflowDraftNodePosition,
): WorkflowGraph {
  const normalized = normalizeDraftGraph(graph);
  const node = draftNode(nodeType, nextDraftNodeId(normalized, draftNodeSpecs[nodeType].idBase));
  return {
    edges: normalized.edges,
    layout: {
      nodes: [
        ...normalized.layout.nodes,
        {
          nodeId: node.id,
          x: Math.round(position.x - draftNodeCenterOffset.x),
          y: Math.round(position.y - draftNodeCenterOffset.y),
        },
      ],
    },
    nodes: [...normalized.nodes, node],
  };
}

export function workflowGraphWithAddedDraftEdge(
  graph: WorkflowGraph,
  connection: WorkflowDraftEdgeConnection,
): WorkflowGraph {
  const normalized = normalizeDraftGraph(graph);
  requireDraftEdgeNode(normalized, connection.sourceNodeId);
  requireDraftEdgeNode(normalized, connection.targetNodeId);
  const edge = draftEdge(
    connection,
    nextDraftEdgeId(normalized, `${connection.sourceNodeId}_${connection.targetNodeId}`),
  );
  return {
    ...normalized,
    edges: [...normalized.edges, edge],
  };
}

function normalizeDraftGraph(graph: WorkflowGraph): WorkflowGraph {
  return {
    edges: graph.edges ?? [],
    layout: {
      nodes: graph.layout?.nodes ?? [],
    },
    nodes: graph.nodes ?? [],
  };
}

function nextDraftNodeId(graph: WorkflowGraph, base: string) {
  const existingIds = new Set(graph.nodes.map((node) => node.id));
  if (!existingIds.has(base)) {
    return base;
  }
  for (let index = 2; ; index += 1) {
    const candidate = `${base}_${index}`;
    if (!existingIds.has(candidate)) {
      return candidate;
    }
  }
}

function nextDraftEdgeId(graph: WorkflowGraph, base: string) {
  const existingIds = new Set(graph.edges.map((edge) => edge.id));
  if (!existingIds.has(base)) {
    return base;
  }
  for (let index = 2; ; index += 1) {
    const candidate = `${base}_${index}`;
    if (!existingIds.has(candidate)) {
      return candidate;
    }
  }
}

function draftNode(nodeType: WorkflowDraftNodeType, id: string): WorkflowNode {
  const spec = draftNodeSpecs[nodeType];
  switch (nodeType) {
    case "agent_task":
      return {
        action: draftAgentAction(),
        gateway: null,
        id,
        kind: spec.kind,
        loopGuard: null,
        title: spec.title,
      };
    case "barrier_join":
    case "merge":
    case "route":
      return {
        action: null,
        gateway: { requiredIncoming: [] },
        id,
        kind: spec.kind,
        loopGuard: null,
        title: spec.title,
      };
    case "end":
    case "start":
      return {
        action: null,
        gateway: null,
        id,
        kind: spec.kind,
        loopGuard: null,
        title: spec.title,
      };
    default:
      return assertNever(nodeType);
  }
}

function draftAgentAction(): WorkflowActionConfig {
  return {
    codex: {
      freshConversation: true,
      model: "",
      prompt: "Describe this agent task.",
      reasoningEffort: "",
    },
    kind: workflowActionKindValues[0],
  };
}

function draftEdge(connection: WorkflowDraftEdgeConnection, id: string): WorkflowEdge {
  return {
    condition: null,
    fromNodeId: connection.sourceNodeId,
    id,
    kind: workflowEdgeKindValues[0],
    toNodeId: connection.targetNodeId,
  };
}

function requireDraftEdgeNode(graph: WorkflowGraph, nodeId: string) {
  if (graph.nodes.some((node) => node.id === nodeId)) {
    return;
  }
  throw new Error(`Workflow edge references missing node ${nodeId}`);
}

function assertNever(value: never): never {
  throw new Error(`Unsupported workflow draft node type: ${String(value)}`);
}
