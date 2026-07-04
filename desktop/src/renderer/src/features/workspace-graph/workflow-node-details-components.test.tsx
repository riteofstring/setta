import type {
  RunItem,
  RunItemOutput,
  WorkflowAgentTrajectoryPage,
  WorkflowEvent,
  WorkflowExecution,
  WorkflowNodeExecution,
} from "@generated/backend";
import { renderToString } from "react-dom/server";
import { describe, expect, test } from "vitest";

import type {
  WorkflowNodeActivityFocus,
  WorkflowNodeDetailsTarget,
} from "../../stores/workflow-editor-store";
import { activityBlock, userMessageBlock } from "../../stores/chat-store-events.test.helpers";
import { testRun } from "../../stores/chat-store.test.fixtures";
import { workflowNodeTrajectoryStateFromPage } from "./workflow-node-agent-trajectory-adapter";
import {
  WorkflowRunDetailsContent,
  type WorkflowRunInspectionState,
  type WorkflowRunTrajectoryActions,
} from "./workflow-node-details-components";

describe("WorkflowRunDetailsContent activity focus", () => {
  test("renders node activity through the shared chat run-activity rows", () => {
    const html = renderToString(
      <WorkflowRunDetailsContent
        actions={trajectoryActions()}
        focus={null}
        inspection={inspection()}
        target={target()}
      />,
    );

    expect(html).toContain('data-testid="agent-trajectory-surface"');
    expect(html).toContain('data-agent-trajectory-scope="workflowNodeExecution"');
    expect(html).toContain('data-testid="activity-group-header"');
    expect(html).toContain('data-activity-group-source-run-item-ids="run_item_command"');
    expect(html).toContain("npm test");
  });

  test("renders a node-scoped stop control for a stoppable active run", () => {
    const html = renderToString(
      <WorkflowRunDetailsContent
        actions={trajectoryActions()}
        focus={null}
        inspection={inspection({
          trajectory: workflowNodeTrajectoryStateFromPage(stoppablePage()),
        })}
        target={target()}
      />,
    );

    expect(html).toContain('data-agent-trajectory-scope="workflowNodeExecution"');
    expect(html).toContain('aria-label="Stop run"');
    expect(html).toContain("Steering is not available for this workflow node.");
  });

  test("renders a node-scoped steering composer for a steerable active run", () => {
    const html = renderToString(
      <WorkflowRunDetailsContent
        actions={trajectoryActions()}
        focus={null}
        inspection={inspection({
          trajectory: workflowNodeTrajectoryStateFromPage(steerablePage()),
        })}
        target={target()}
      />,
    );

    expect(html).toContain('aria-label="Send steering message"');
    expect(html).not.toContain('aria-label="Interrupt and send pending steering"');
    expect(html).not.toContain("Steering is not available for this workflow node.");
  });

  test("highlights and deep-links the matching run item from a chat_run_item focus", () => {
    const html = renderToString(
      <WorkflowRunDetailsContent
        actions={trajectoryActions()}
        focus={focus({ detailKind: "chat_run_item", runItemId: "run_item_command" })}
        inspection={inspection()}
        target={target()}
      />,
    );

    expect(html).toContain('data-activity-focus-id="run-item:run_item_command"');
    expect(occurrences(html, 'data-activity-focused="true"')).toBe(1);
  });

  test("highlights the matching workflow event from a workflow_event focus", () => {
    const html = renderToString(
      <WorkflowRunDetailsContent
        actions={trajectoryActions()}
        focus={focus({ detailKind: "workflow_event", workflowEventId: "event_running" })}
        inspection={inspection()}
        target={target()}
      />,
    );

    expect(html).toContain('data-activity-focus-id="workflow-event:event_running"');
    expect(occurrences(html, 'data-activity-focused="true"')).toBe(1);
  });

  test("highlights the matching pending approval from an approval focus", () => {
    const html = renderToString(
      <WorkflowRunDetailsContent
        actions={trajectoryActions()}
        focus={focus({ approvalId: "approval_a", detailKind: "approval" })}
        inspection={inspection()}
        target={target()}
      />,
    );

    expect(html).toContain('data-activity-focus-id="approval:approval_a"');
    expect(occurrences(html, 'data-activity-focused="true"')).toBe(1);
  });

  test("does not highlight any row when the focus reference is missing", () => {
    const html = renderToString(
      <WorkflowRunDetailsContent
        actions={trajectoryActions()}
        focus={focus({ detailKind: "chat_run_item", runItemId: "run_item_missing" })}
        inspection={inspection()}
        target={target()}
      />,
    );

    expect(html).not.toContain('data-activity-focused="true"');
  });
});

function focus(overrides: Partial<WorkflowNodeActivityFocus>): WorkflowNodeActivityFocus {
  return {
    activityId: "activity_a",
    approvalId: "",
    detailKind: "chat_run_item",
    requestId: 1,
    runItemId: "",
    workflowEventId: "",
    ...overrides,
  };
}

function inspection(
  overrides: Partial<WorkflowRunInspectionState> = {},
): WorkflowRunInspectionState {
  return {
    events: [workflowEvent("event_running", "running activity")],
    execution: execution(),
    loadError: "",
    loading: false,
    operation: null,
    trajectory: workflowNodeTrajectoryStateFromPage(trajectoryPage()),
    trajectoryError: "",
    ...overrides,
  };
}

function trajectoryActions(): WorkflowRunTrajectoryActions {
  return {
    loadOlder: async () => {},
    loadRunItemOutput: async () => {},
    steerMessage: async () => null,
    stopRun: async () => {},
    submitApproval: async () => {},
  };
}

function target(): WorkflowNodeDetailsTarget {
  return {
    definitionId: "workflow_definition_test",
    definitionName: "Activity workflow",
    definitionVersionId: "workflow_version_test",
    definitionVersionNumber: 1,
    executionId: "workflow_execution_test",
    nodeId: "work",
    nodeKind: "action",
    nodeLabel: "Work",
    nodeStatus: "waiting_approval",
    projectionIncomingEdges: [],
    projectionOutgoingEdges: [],
    versionMismatch: false,
    viewMode: "run",
    workspaceId: "workspace_test",
  };
}

function execution(): WorkflowExecution {
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
    actionKind: null,
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
    result: {
      error: "",
      exitCode: null,
      filePaths: [],
      output: null,
      pendingApproval: {
        approval: {
          approved: false,
          body: "",
          command: "rm -rf build",
          createdAt: "2026-06-07T00:00:00Z",
          filePath: "",
          id: "approval_a",
          kind: "command",
          options: [],
          permission: "",
          providerItemId: "",
          question: "",
          questions: [],
          resolvedAt: "",
          response: "",
          runId: "run_a",
          runItemId: "run_item_command",
          status: "pending",
          structuredInput: null,
          title: "Approve command",
        },
        approvalId: "approval_a",
        executionId: "workflow_execution_test",
        nodeExecutionId: "node_execution_work",
        nodeId: "work",
        workspaceId: "workspace_test",
      },
      signals: [],
      status: "requires_approval",
    },
    runnerCapabilities: null,
    runnerKind: null,
    runnerRefs: [],
    runnerState: null,
    scheduledAt: "2026-06-07T00:00:01Z",
    schemaVersion: 1,
    sideEffectPolicy: null,
    startedAt: "",
    status: "waiting_approval",
  };
}

function trajectoryPage(
  overrides: Partial<WorkflowAgentTrajectoryPage> = {},
): WorkflowAgentTrajectoryPage {
  return {
    activeRun: null,
    activeRunLiveness: null,
    activity: [
      activityBlock({
        details: {
          command: "npm test",
          commandExecution: null,
          commandStartFailure: null,
          approval: null,
          cwd: "",
          details: null,
          diff: null,
          durationMs: 0,
          dynamicToolCall: null,
          error: "",
          exitCode: 0,
          fileChange: null,
          filePaths: [],
          mcpToolCall: null,
          namespace: "",
          noticeKind: "",
          noticeMessage: "",
          patchStatus: "",
          plan: null,
          processId: "",
          providerStreamLifecycle: null,
          progress: "",
          requestId: "",
          result: "passed",
          reviewId: "",
          serverName: "",
          summary: "",
          toolName: "",
        },
        hasDetails: true,
        hasOutput: true,
        id: "block_activity",
        ordinal: 2,
        runId: "run_a",
        sourceRunItemId: "run_item_command",
        title: "npm test",
      }).activity!,
    ],
    blocks: [
      userMessageBlock({
        id: "block_user",
        ordinal: 1,
        runId: "run_a",
        text: "run tests",
      }),
      activityBlock({
        details: {
          command: "npm test",
          commandExecution: null,
          commandStartFailure: null,
          approval: null,
          cwd: "",
          details: null,
          diff: null,
          durationMs: 0,
          dynamicToolCall: null,
          error: "",
          exitCode: 0,
          fileChange: null,
          filePaths: [],
          mcpToolCall: null,
          namespace: "",
          noticeKind: "",
          noticeMessage: "",
          patchStatus: "",
          plan: null,
          processId: "",
          providerStreamLifecycle: null,
          progress: "",
          requestId: "",
          result: "passed",
          reviewId: "",
          serverName: "",
          summary: "",
          toolName: "",
        },
        hasDetails: true,
        hasOutput: true,
        id: "block_activity",
        ordinal: 2,
        runId: "run_a",
        sourceRunItemId: "run_item_command",
        title: "npm test",
      }),
    ],
    capabilities: {
      canLoadOlderHistory: false,
      canLoadRunItemOutput: true,
      canRetryLiveness: false,
      canSteer: false,
      canStopRun: false,
      canSubmitApproval: false,
    },
    conversationId: "conversation_api",
    hasMoreOlder: false,
    items: [runItem()],
    olderBeforeBlockOrdinal: 0,
    outputPages: [
      {
        hasMore: true,
        loadedThroughOrdinal: 1,
        nextOrdinal: 2,
        outputIds: ["output_command"],
        runId: "run_a",
        runItemId: "run_item_command",
      },
    ],
    outputs: [runOutput()],
    pendingApproval: null,
    run: { ...testRun("completed", "run_a"), workspaceId: "workspace_test" },
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
    ...overrides,
  };
}

function stoppablePage(): WorkflowAgentTrajectoryPage {
  return trajectoryPage({
    activeRun: { ...testRun("running", "run_a"), workspaceId: "workspace_test" },
    activeRunLiveness: {
      cancellable: true,
      conversationId: "conversation_api",
      error: "",
      harness: "codex",
      lastProviderEventAt: "2026-06-07T00:00:01Z",
      lastReconciledAt: "",
      providerThreadId: "thread_api",
      providerTurnId: "turn_api",
      reason: "provider_turn_linked",
      retryable: false,
      runId: "run_a",
      status: "attached",
      workspaceId: "workspace_test",
    },
    capabilities: {
      canLoadOlderHistory: false,
      canLoadRunItemOutput: true,
      canRetryLiveness: false,
      canSteer: false,
      canStopRun: true,
      canSubmitApproval: false,
    },
    run: { ...testRun("running", "run_a"), workspaceId: "workspace_test" },
  });
}

function steerablePage(): WorkflowAgentTrajectoryPage {
  return trajectoryPage({
    activeRun: { ...testRun("running", "run_a"), workspaceId: "workspace_test" },
    activeRunLiveness: {
      cancellable: true,
      conversationId: "conversation_api",
      error: "",
      harness: "codex",
      lastProviderEventAt: "2026-06-07T00:00:01Z",
      lastReconciledAt: "",
      providerThreadId: "thread_api",
      providerTurnId: "turn_api",
      reason: "provider_turn_linked",
      retryable: false,
      runId: "run_a",
      status: "attached",
      workspaceId: "workspace_test",
    },
    capabilities: {
      canLoadOlderHistory: false,
      canLoadRunItemOutput: true,
      canRetryLiveness: false,
      canSteer: true,
      canStopRun: true,
      canSubmitApproval: false,
    },
    run: { ...testRun("running", "run_a"), workspaceId: "workspace_test" },
  });
}

function runItem(): RunItem {
  return {
    command: "npm test",
    completedAt: "2026-06-07T00:00:02Z",
    conversationId: "conversation_a",
    createdAt: "2026-06-07T00:00:00Z",
    cwd: "",
    details: null,
    rawDetails: null,
    diffSummary: "",
    durationMs: 0,
    error: "",
    exitCode: 0,
    filePaths: [],
    hiddenText: "",
    id: "run_item_command",
    namespace: "",
    noticeKind: "",
    noticeMessage: "",
    patchStatus: "",
    processId: "",
    progress: "",
    providerItemId: "",
    requestId: "",
    result: "passed",
    reviewId: "",
    runId: "run_a",
    schemaVersion: 1,
    serverName: "",
    source: null,
    startedAt: "2026-06-07T00:00:01Z",
    status: "completed",
    summary: "",
    title: "",
    toolName: "",
    type: "command_execution",
    workspaceId: "workspace_test",
  };
}

function runOutput(): RunItemOutput {
  return {
    createdAt: "2026-06-07T00:00:02Z",
    id: "output_command",
    ordinal: 1,
    runItemId: "run_item_command",
    schemaVersion: 1,
    stream: "stdout",
    text: "ok",
  };
}

function workflowEvent(id: string, message: string): WorkflowEvent {
  return {
    createdAt: "2026-06-07T00:00:00Z",
    definitionId: "workflow_definition_test",
    definitionVersionId: "workflow_version_test",
    details: {},
    executionId: "workflow_execution_test",
    id,
    message,
    nodeExecutionId: "node_execution_work",
    nodeId: "work",
    ordinal: 1,
    runnerKind: null,
    schemaVersion: 1,
    tokenId: "",
    type: "workflow.node.scheduled",
    workspaceId: "workspace_test",
  };
}

function occurrences(haystack: string, needle: string) {
  return haystack.split(needle).length - 1;
}
