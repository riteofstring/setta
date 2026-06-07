import type {
  WorkflowActionConfig,
  WorkflowCondition,
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
  sourcePortId?: string;
  targetNodeId: string;
  targetPortId?: string;
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
    normalized,
    connection,
    nextDraftEdgeId(normalized, `${connection.sourceNodeId}_${connection.targetNodeId}`),
  );
  return workflowGraphWithResolvedRouteConditionSources({
    ...normalized,
    edges: [...normalized.edges, edge],
  });
}

export function workflowGraphWithoutDraftNodes(
  graph: WorkflowGraph,
  nodeIds: readonly string[],
): WorkflowGraph {
  const normalized = normalizeDraftGraph(graph);
  const removedNodeIds = new Set(nodeIds);
  if (removedNodeIds.size === 0) {
    return normalized;
  }
  const nextGraph = {
    edges: normalized.edges.filter(
      (edge) => !removedNodeIds.has(edge.fromNodeId) && !removedNodeIds.has(edge.toNodeId),
    ),
    layout: {
      nodes: normalized.layout.nodes.filter((node) => !removedNodeIds.has(node.nodeId)),
    },
    nodes: normalized.nodes.filter((node) => !removedNodeIds.has(node.id)),
  };
  return workflowGraphWithResolvedRouteConditionSources(
    workflowGraphWithoutDeletedConditionSources(nextGraph, removedNodeIds),
  );
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

function draftEdge(
  graph: WorkflowGraph,
  connection: WorkflowDraftEdgeConnection,
  id: string,
): WorkflowEdge {
  return {
    condition: draftEdgeCondition(graph, connection),
    fromNodeId: connection.sourceNodeId,
    id,
    kind: workflowEdgeKindValues[0],
    toNodeId: connection.targetNodeId,
  };
}

function draftEdgeCondition(
  graph: WorkflowGraph,
  connection: WorkflowDraftEdgeConnection,
): WorkflowCondition | null {
  const source = workflowDraftNode(graph, connection.sourceNodeId);
  if (source.kind !== "gateway.xor") {
    return null;
  }
  switch (connection.sourcePortId) {
    case "route_yes":
      return routeSignalCondition(graph, source.id, "yes");
    case "route_no":
      return routeSignalCondition(graph, source.id, "no");
    case "route_default":
      return defaultRouteCondition();
    default:
      return null;
  }
}

function routeSignalCondition(
  graph: WorkflowGraph,
  routeNodeId: string,
  signalValue: string,
): WorkflowCondition {
  return {
    exitCode: null,
    invert: false,
    kind: "action_signal",
    nodeId: routeConditionSourceNodeId(graph, routeNodeId),
    signalName: "route",
    signalValue,
    status: null,
  };
}

function defaultRouteCondition(): WorkflowCondition {
  return {
    exitCode: null,
    invert: false,
    kind: "default",
    nodeId: "",
    signalName: "",
    signalValue: "",
    status: null,
  };
}

function workflowGraphWithResolvedRouteConditionSources(graph: WorkflowGraph): WorkflowGraph {
  return {
    ...graph,
    edges: graph.edges.map((edge) => {
      if (edge.condition?.kind !== "action_signal" || edge.condition.nodeId !== "") {
        return edge;
      }
      const source = workflowDraftNode(graph, edge.fromNodeId);
      if (source.kind !== "gateway.xor") {
        return edge;
      }
      const nodeId = routeConditionSourceNodeId(graph, source.id);
      if (nodeId === "") {
        return edge;
      }
      return {
        ...edge,
        condition: {
          ...edge.condition,
          nodeId,
        },
      };
    }),
  };
}

function workflowGraphWithoutDeletedConditionSources(
  graph: WorkflowGraph,
  removedNodeIds: ReadonlySet<string>,
): WorkflowGraph {
  return {
    ...graph,
    edges: graph.edges.map((edge) => {
      if (edge.condition === null || !removedNodeIds.has(edge.condition.nodeId)) {
        return edge;
      }
      return {
        ...edge,
        condition: {
          ...edge.condition,
          nodeId: "",
        },
      };
    }),
  };
}

function routeConditionSourceNodeId(graph: WorkflowGraph, routeNodeId: string): string {
  const sourceNodeIds = graph.edges
    .filter((edge) => edge.toNodeId === routeNodeId)
    .map((edge) => workflowDraftNode(graph, edge.fromNodeId))
    .filter((node) => node.kind === "action")
    .map((node) => node.id);
  return sourceNodeIds.length === 1 ? (sourceNodeIds[0] ?? "") : "";
}

function workflowDraftNode(graph: WorkflowGraph, nodeId: string): WorkflowNode {
  const node = graph.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) {
    throw new Error(`Workflow edge references missing node ${nodeId}`);
  }
  return node;
}

function requireDraftEdgeNode(graph: WorkflowGraph, nodeId: string) {
  workflowDraftNode(graph, nodeId);
}

function assertNever(value: never): never {
  throw new Error(`Unsupported workflow draft node type: ${String(value)}`);
}
