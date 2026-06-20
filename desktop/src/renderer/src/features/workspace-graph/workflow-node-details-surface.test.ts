import { describe, expect, test } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";

import type { WorkflowEvent, WorkflowExecution, WorkflowNodeExecution } from "@generated/backend";
import type { WorkflowNodeDetailsTarget } from "../../stores/workflow-editor-store";
import {
  latestWorkflowNodeExecution,
  workflowConditionText,
  workflowGraphWithUpdatedAgentTask,
  workflowNodeEvents,
} from "./workflow-node-details-helpers";
import { WorkflowSemanticRuntimeDetails } from "./workflow-node-details-surface";
import { WorkflowTrajectoryRuntimeDetails } from "./workflow-trajectory-runtime-details";

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

  test("renders semantic runtime model audit on selected workflow nodes", () => {
    const html = renderToString(
      createElement(WorkflowSemanticRuntimeDetails, { target: runtimeTarget() }),
    );

    expect(html).toContain("Semantic Runtime");
    expect(html).toContain("failed");
    expect(html).toContain("Model Audit");
    expect(html).toContain("provider default / low");
    expect(html).toContain("gpt-runtime-live / high");
    expect(html).toContain("340 ms");
    expect(html).toContain("provider timeout");
  });

  test("renders trajectory runtime provenance on selected workflow nodes", () => {
    const html = renderToString(
      createElement(WorkflowTrajectoryRuntimeDetails, { target: trajectoryTarget() }),
    );

    expect(html).toContain("Trajectory");
    expect(html).toContain("assistant message");
    expect(html).toContain("running");
    expect(html).toContain("Review output");
    expect(html).toContain("Run item");
    expect(html).toContain("run_item_review");
    expect(html).toContain("Chat run");
    expect(html).toContain("chat_run_review");
    expect(html).toContain("Provider");
    expect(html).toContain("provider_i...review");
    expect(html).toContain("read internal/httpapi/routes.go:12-18 +2 -1");
    expect(html).toContain("workflow_node");
    expect(html).toContain("reviewer");
  });
});

function runtimeTarget(): WorkflowNodeDetailsTarget {
  return {
    definitionId: "workflow_definition_test",
    definitionName: "Workflow",
    definitionVersionId: "workflow_version_test",
    definitionVersionNumber: 1,
    executionId: "workflow_execution_test",
    nodeId: "reviewer",
    nodeKind: "action",
    nodeLabel: "Reviewer",
    nodeStatus: "running",
    projectionIncomingEdges: [],
    projectionOutgoingEdges: [],
    runtime: {
      hiddenSourceCount: 0,
      modelAudits: [
        {
          effectiveModel: "gpt-runtime-live",
          effectiveReasoningEffort: "high",
          error: "provider timeout",
          harnessDurationMs: 340,
          queueWaitMs: 120,
          reasoningEffortReported: false,
          reportedModel: "",
          reportedReasoningEffort: "",
          requestedModel: "",
          requestedModelSelection: "provider_default",
          requestedReasoningEffort: "low",
          taskProfile: "live_window",
          totalDurationMs: 520,
        },
      ],
      patchIds: [],
      pulseCount: 0,
      recentPulses: [],
      runIds: ["cartographer_run_failed"],
      sourceCount: 1,
      sourceRefs: [],
      status: "failed",
      statusCounts: [{ count: 1, status: "failed" }],
      windowIds: ["cartographer_window_failed"],
    },
    versionMismatch: false,
    viewMode: "run",
    workspaceId: "workspace_test",
  };
}

function trajectoryTarget(): WorkflowNodeDetailsTarget {
  return {
    ...runtimeTarget(),
    trajectory: {
      hiddenCount: 1,
      revision: 7,
      sprites: [
        {
          anchorNodeId: "reviewer",
          lane: "workflow_node",
          sprite: {
            cartographerPatchId: "",
            cartographerRunId: "",
            cartographerWindowId: "",
            chatConversationId: "conversation_review",
            chatMessageId: "message_review",
            chatRunId: "chat_run_review",
            command: {
              command: "",
              cwd: "",
              durationMs: 0,
              exitCode: 0,
            },
            createdAt: "2026-06-07T00:00:00Z",
            diffStats: {
              additions: 0,
              changedFiles: 0,
              deletions: 0,
              structured: false,
              summary: "",
            },
            errorSummary: "",
            expiresAt: "",
            fileRefs: [
              {
                additions: 2,
                changedFiles: 1,
                contentHash: "",
                deletions: 1,
                displayPath: "internal/httpapi/routes.go",
                operation: "read",
                path: "internal/httpapi/routes.go",
                rangeEnd: 18,
                rangeStart: 12,
              },
            ],
            id: "sprite_review",
            kind: "assistant_message",
            providerItemId: "provider_item_review",
            resultSummary: "",
            runItemId: "run_item_review",
            schemaVersion: 1,
            severity: "info",
            sourceRefs: [
              { id: "reviewer", kind: "workflow_node" },
              { id: "workflow_node_execution_review", kind: "workflow_node_execution" },
            ],
            status: "running",
            subtitle: "Streaming assistant response",
            title: "Review output",
            tool: {
              namespace: "",
              requestId: "",
              serverName: "",
              toolName: "",
            },
            ttlMs: 0,
            updatedAt: "2026-06-07T00:00:01Z",
            workflowExecutionId: "workflow_execution_test",
            workflowNodeExecutionId: "workflow_node_execution_review",
            workflowNodeId: "reviewer",
            workspaceId: "workspace_test",
          },
        },
      ],
      timeline: [],
      totalCount: 2,
      workflowNodeId: "reviewer",
    },
  };
}

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
