import type {
  WorkflowAgentTrajectoryPage,
  WorkflowEvent,
  WorkflowExecution,
  WorkflowNodeExecution,
} from "@generated/backend";
import { describe, expect, test } from "vitest";

import type { WorkflowNodeDetailsTarget } from "../../stores/workflow-editor-store";
import { testRun } from "../../stores/chat-store.test.fixtures";
import type { WorkflowRunInspectionState } from "./workflow-node-details-components";
import type { WorkflowNodeTrajectoryState } from "./workflow-node-agent-trajectory-adapter";
import {
  workflowRunInspectionWithRefreshedExecution,
  workflowRunInspectionWithWorkflowEvent,
} from "./workflow-node-run-inspection";

describe("workflow run inspection workflow event cursor", () => {
  test("does not advance the local workflow-event cursor from refreshed execution snapshots", () => {
    const refreshed = workflowRunInspectionWithRefreshedExecution(
      inspectionState({ cursor: 5 }),
      target(),
      execution({ lastEventOrdinal: 9 }),
    );

    expect(refreshed.execution?.lastEventOrdinal).toBe(9);
    expect(refreshed.lastWorkflowEventOrdinal).toBe(5);
    expect(refreshed.trajectory?.page.lastWorkflowEventOrdinal).toBe(5);
  });

  test("advances the workflow-event cursor only when a matching execution event is applied", () => {
    const result = workflowRunInspectionWithWorkflowEvent(
      inspectionState({ cursor: 5 }),
      target(),
      workflowEvent({ ordinal: 6, type: "workflow.action.completed" }),
    );

    expect(result.resync).toBe(false);
    expect(result.refreshExecution).toBe(true);
    expect(result.state.lastWorkflowEventOrdinal).toBe(6);
    expect(result.state.execution?.lastEventOrdinal).toBe(6);
    expect(result.state.trajectory?.page.lastWorkflowEventOrdinal).toBe(6);
  });
});

function target(): WorkflowNodeDetailsTarget {
  return {
    definitionId: "workflow_definition_test",
    definitionName: "Activity workflow",
    definitionVersionId: "workflow_version_test",
    definitionVersionNumber: 1,
    executionId: "workflow_execution_test",
    nodeId: "work",
    nodeExecutionId: "node_execution_work",
    nodeKind: "action",
    nodeLabel: "Work",
    nodeStatus: "running",
    projectionIncomingEdges: [],
    projectionOutgoingEdges: [],
    versionMismatch: false,
    viewMode: "run",
    workspaceId: "workspace_test",
  };
}

function inspectionState({ cursor }: { cursor: number }): WorkflowRunInspectionState {
  return {
    events: [],
    execution: execution({ lastEventOrdinal: cursor }),
    lastWorkflowEventOrdinal: cursor,
    loadError: "",
    loading: false,
    operation: null,
    trajectory: trajectory(cursor),
    trajectoryError: "",
  };
}

function execution({ lastEventOrdinal }: { lastEventOrdinal: number }): WorkflowExecution {
  return {
    activeNodeExecutionIds: [],
    completedAt: "",
    createdAt: "2026-06-07T00:00:00Z",
    definitionId: "workflow_definition_test",
    definitionVersionId: "workflow_version_test",
    error: "",
    id: "workflow_execution_test",
    lastEventOrdinal,
    loopIterations: [],
    nodeExecutions: [nodeExecution()],
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

function nodeExecution(): WorkflowNodeExecution {
  return {
    actionKind: "agent.codex",
    actionPolicy: null,
    activityRefs: [],
    attempt: 1,
    completedAt: "",
    error: "",
    executionId: "workflow_execution_test",
    id: "node_execution_work",
    idempotencyKey: "node_execution_work/idempotency",
    input: {},
    inputHash: "",
    iteration: 1,
    nodeId: "work",
    recoveryMessage: "",
    recoveryOutcome: null,
    result: null,
    runnerCapabilities: null,
    runnerKind: "agent.codex",
    runnerRefs: [],
    runnerState: null,
    scheduledAt: "2026-06-07T00:00:01Z",
    schemaVersion: 1,
    sideEffectPolicy: null,
    startedAt: "2026-06-07T00:00:02Z",
    status: "running",
  };
}

function trajectory(cursor: number): WorkflowNodeTrajectoryState {
  const page = {
    activeRun: null,
    activeRunLiveness: null,
    activity: [],
    blocks: [],
    capabilities: {
      canLoadOlderHistory: false,
      canLoadMoreActivity: false,
      canLoadRunItemOutput: false,
      canRetryLiveness: false,
      canSteer: false,
      canStopRun: false,
      canSubmitApproval: false,
    },
    conversationId: "conversation_api",
    hasMoreItems: false,
    hasMoreOlder: false,
    items: [],
    lastChatEventSequence: 0,
    lastChatEventStreamId: "chat_stream_test",
    lastWorkflowEventOrdinal: cursor,
    nextItemId: "",
    olderBeforeBlockOrdinal: 0,
    outputPages: [],
    outputs: [],
    pendingApproval: null,
    run: { ...testRun("running", "run_a"), workspaceId: "workspace_test" },
    runId: "run_a",
    schemaVersion: 1,
    scope: {
      attempt: 1,
      definitionId: "workflow_definition_test",
      definitionVersionId: "workflow_version_test",
      executionId: "workflow_execution_test",
      iteration: 1,
      nodeExecutionId: "node_execution_work",
      nodeId: "work",
      workspaceId: "workspace_test",
    },
  } satisfies WorkflowAgentTrajectoryPage;
  return {
    outputIdsByRunItemId: {},
    outputPagesByRunItemId: {},
    outputs: [],
    outputsById: {},
    page,
  };
}

function workflowEvent(overrides: Partial<WorkflowEvent> = {}): WorkflowEvent {
  return {
    createdAt: "2026-06-07T00:00:03Z",
    definitionId: "workflow_definition_test",
    definitionVersionId: "workflow_version_test",
    details: {},
    executionId: "workflow_execution_test",
    id: `event_${overrides.ordinal ?? 6}`,
    message: "action completed",
    nodeExecutionId: "node_execution_work",
    nodeId: "work",
    ordinal: 6,
    runnerKind: "agent.codex",
    schemaVersion: 1,
    tokenId: "",
    type: "workflow.action.completed",
    workspaceId: "workspace_test",
    ...overrides,
  };
}
