import { describe, expect, test } from "vitest";

import type { WorkflowEvent, WorkflowExecution, WorkflowNodeExecution } from "@generated/backend";
import {
  latestWorkflowNodeExecution,
  workflowConditionText,
  workflowGraphWithUpdatedAgentTask,
  workflowNodeEvents,
} from "./workflow-node-details-helpers";

describe("workflow node details surface helpers", () => {
  test("updates Agent Task Codex configuration without changing other nodes", () => {
    const graph = workflowGraphWithUpdatedAgentTask(
      {
        edges: [],
        layout: { nodes: [] },
        nodes: [
          {
            action: {
              codex: {
                freshConversation: true,
                model: "",
                prompt: "old prompt",
                reasoningEffort: "",
              },
              kind: "agent.codex",
            },
            gateway: null,
            id: "agent_task",
            kind: "action",
            loopGuard: null,
            title: "Agent Task",
          },
          {
            action: null,
            gateway: null,
            id: "end",
            kind: "end",
            loopGuard: null,
            title: "End",
          },
        ],
      },
      "agent_task",
      {
        freshConversation: false,
        model: "gpt-5",
        prompt: "review the workspace",
        reasoningEffort: "medium",
        title: "Review Workspace",
      },
    );

    expect(graph.nodes[0]).toMatchObject({
      action: {
        codex: {
          freshConversation: false,
          model: "gpt-5",
          prompt: "review the workspace",
          reasoningEffort: "medium",
        },
      },
      title: "Review Workspace",
    });
    expect(graph.nodes[1]).toMatchObject({ id: "end", title: "End" });
  });

  test("selects the latest execution for a node by iteration and attempt", () => {
    const execution = testExecution([
      nodeExecution("node_execution_first", "work", 1, 1, "succeeded"),
      nodeExecution("node_execution_retry", "work", 2, 1, "failed"),
      nodeExecution("node_execution_next_iteration", "work", 1, 2, "running"),
      nodeExecution("node_execution_other", "other", 1, 1, "succeeded"),
    ]);

    expect(latestWorkflowNodeExecution(execution, "work")?.id).toBe(
      "node_execution_next_iteration",
    );
    expect(latestWorkflowNodeExecution(execution, "missing")).toBeNull();
  });

  test("filters node run events by node and node execution id", () => {
    const events = [
      workflowEvent("event_node", "work", "", 1),
      workflowEvent("event_attempt", "", "node_execution_work", 2),
      workflowEvent("event_other", "other", "node_execution_other", 3),
    ];

    expect(
      workflowNodeEvents(events, "work", "node_execution_work").map((event) => event.id),
    ).toEqual(["event_node", "event_attempt"]);
  });

  test("summarizes workflow edge conditions for details panes", () => {
    expect(workflowConditionText(null)).toBe("always");
    expect(
      workflowConditionText({
        exitCode: null,
        invert: false,
        kind: "action_signal",
        nodeId: "agent_task",
        signalName: "route",
        signalValue: "yes",
        status: null,
      }),
    ).toBe("signal route=yes");
    expect(
      workflowConditionText({
        exitCode: null,
        invert: false,
        kind: "default",
        nodeId: "",
        signalName: "",
        signalValue: "",
        status: null,
      }),
    ).toBe("default");
  });
});

function testExecution(nodeExecutions: WorkflowNodeExecution[]): WorkflowExecution {
  return {
    activeNodeExecutionIds: [],
    completedAt: "",
    createdAt: "2026-06-07T00:00:00Z",
    definitionId: "workflow_definition_test",
    definitionVersionId: "workflow_version_test",
    error: "",
    id: "workflow_execution_test",
    lastEventOrdinal: 0,
    loopIterations: [],
    nodeExecutions,
    recoveryOutcome: null,
    schemaVersion: 1,
    startedAt: "2026-06-07T00:00:00Z",
    status: "running",
    terminalReason: null,
    tokens: [],
    updatedAt: "2026-06-07T00:00:01Z",
    workspaceId: "workspace_test",
  };
}

function nodeExecution(
  id: string,
  nodeId: string,
  attempt: number,
  iteration: number,
  status: WorkflowNodeExecution["status"],
): WorkflowNodeExecution {
  return {
    actionKind: null,
    actionPolicy: null,
    activityRefs: [],
    attempt,
    completedAt: "",
    error: "",
    executionId: "workflow_execution_test",
    id,
    idempotencyKey: `${id}/idempotency`,
    input: {},
    inputHash: "",
    iteration,
    nodeId,
    recoveryMessage: "",
    recoveryOutcome: null,
    result: null,
    runnerCapabilities: null,
    runnerKind: null,
    runnerRefs: [],
    runnerState: null,
    scheduledAt: `2026-06-07T00:00:0${attempt}Z`,
    schemaVersion: 1,
    sideEffectPolicy: null,
    startedAt: "",
    status,
  };
}

function workflowEvent(
  id: string,
  nodeId: string,
  nodeExecutionId: string,
  ordinal: number,
): WorkflowEvent {
  return {
    createdAt: "2026-06-07T00:00:00Z",
    definitionId: "workflow_definition_test",
    definitionVersionId: "workflow_version_test",
    details: {},
    executionId: "workflow_execution_test",
    id,
    message: id,
    nodeExecutionId,
    nodeId,
    ordinal,
    runnerKind: null,
    schemaVersion: 1,
    tokenId: "",
    type: "workflow.node.scheduled",
    workspaceId: "workspace_test",
  };
}
