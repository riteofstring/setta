import type {
  WorkflowEdge,
  WorkflowEvent,
  WorkflowExecution,
  WorkflowGraph,
  WorkflowNode,
  WorkflowNodeExecution,
  WorkflowNodeKind,
} from "@generated/backend";

export interface AgentTaskDraft {
  freshConversation: boolean;
  model: string;
  prompt: string;
  reasoningEffort: string;
  title: string;
}

export function workflowGraphWithUpdatedAgentTask(
  graph: WorkflowGraph,
  nodeId: string,
  draft: AgentTaskDraft,
): WorkflowGraph {
  return {
    ...graph,
    nodes: graph.nodes.map((node) => {
      if (node.id !== nodeId) {
        return node;
      }
      if (node.kind !== "action" || node.action?.kind !== "agent.codex" || !node.action.codex) {
        throw new Error(`workflow node ${nodeId} is not an Agent Task`);
      }
      return {
        ...node,
        action: {
          ...node.action,
          codex: {
            ...node.action.codex,
            freshConversation: draft.freshConversation,
            model: draft.model,
            prompt: draft.prompt,
            reasoningEffort: draft.reasoningEffort,
          },
        },
        title: draft.title,
      };
    }),
  };
}

export function agentTaskDraftFromNode(node: WorkflowNode): AgentTaskDraft | null {
  if (node.kind !== "action" || node.action?.kind !== "agent.codex" || !node.action.codex) {
    return null;
  }
  return {
    freshConversation: node.action.codex.freshConversation,
    model: node.action.codex.model,
    prompt: node.action.codex.prompt,
    reasoningEffort: node.action.codex.reasoningEffort,
    title: node.title,
  };
}

export function latestWorkflowNodeExecution(
  execution: WorkflowExecution,
  nodeId: string,
): WorkflowNodeExecution | null {
  const matches = execution.nodeExecutions.filter((candidate) => candidate.nodeId === nodeId);
  if (matches.length === 0) {
    return null;
  }
  return matches.reduce((latest, candidate) =>
    workflowNodeExecutionIsLater(candidate, latest) ? candidate : latest,
  );
}

function workflowNodeExecutionIsLater(
  candidate: WorkflowNodeExecution,
  latest: WorkflowNodeExecution,
) {
  if (candidate.iteration !== latest.iteration) {
    return candidate.iteration > latest.iteration;
  }
  if (candidate.attempt !== latest.attempt) {
    return candidate.attempt > latest.attempt;
  }
  return candidate.scheduledAt > latest.scheduledAt;
}

export function workflowNodeExecutionForDetailsTarget(
  execution: WorkflowExecution,
  target: { nodeExecutionId: string; nodeId: string },
): WorkflowNodeExecution | null {
  if (target.nodeExecutionId !== "") {
    const matched =
      execution.nodeExecutions.find((candidate) => candidate.id === target.nodeExecutionId) ?? null;
    return matched?.nodeId === target.nodeId ? matched : null;
  }
  return latestWorkflowNodeExecution(execution, target.nodeId);
}

export function workflowNodeEvents(
  events: WorkflowEvent[],
  nodeId: string,
  nodeExecutionId: string,
) {
  return events.filter(
    (event) =>
      event.nodeId === nodeId ||
      (nodeExecutionId !== "" && event.nodeExecutionId === nodeExecutionId),
  );
}

export function workflowConditionText(condition: WorkflowEdge["condition"]) {
  if (condition === null) {
    return "always";
  }
  switch (condition.kind) {
    case "always":
      return "always";
    case "default":
      return "default";
    case "action_signal":
      return workflowSignalConditionText(condition);
    case "action_status":
      return workflowStatusConditionText(condition);
    case "script_exit_code":
      return workflowExitCodeConditionText(condition);
    default:
      return condition.kind;
  }
}

type WorkflowCondition = NonNullable<WorkflowEdge["condition"]>;

function workflowSignalConditionText(condition: WorkflowCondition) {
  return condition.signalValue === ""
    ? `signal ${condition.signalName}`
    : `signal ${condition.signalName}=${condition.signalValue}`;
}

function workflowStatusConditionText(condition: WorkflowCondition) {
  return condition.status === null ? "status" : `status ${condition.status}`;
}

function workflowExitCodeConditionText(condition: WorkflowCondition) {
  return condition.exitCode === null ? "exit code" : `exit ${condition.exitCode}`;
}

export function workflowIncomingEdges(graph: WorkflowGraph, nodeId: string) {
  return graph.edges.filter((edge) => edge.toNodeId === nodeId);
}

export function workflowOutgoingEdges(graph: WorkflowGraph, nodeId: string) {
  return graph.edges.filter((edge) => edge.fromNodeId === nodeId);
}

export function requiredIncomingSummary(node: WorkflowNode) {
  const required = node.gateway?.requiredIncoming ?? [];
  return required.length === 0 ? "all incoming" : required.join(", ");
}

export function workflowNodeKindLabel(kind: WorkflowNodeKind | "") {
  switch (kind) {
    case "action":
      return "Agent Task";
    case "gateway.and":
      return "Barrier Join";
    case "gateway.or":
      return "Merge";
    case "gateway.xor":
      return "Route";
    case "start":
      return "Start";
    case "end":
      return "End";
    case "loop.guard":
      return "Loop Guard";
    default:
      return kind || "Unknown";
  }
}

export function workflowJsonText(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value, null, 2);
}

export function shortIdentifier(value: string) {
  if (value.length <= 18) {
    return value;
  }
  return `${value.slice(0, 10)}...${value.slice(-6)}`;
}
