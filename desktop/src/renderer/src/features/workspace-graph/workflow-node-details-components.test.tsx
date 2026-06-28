import type {
  RunActivityPage,
  RunItem,
  RunItemOutput,
  WorkflowActivityRef,
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
import {
  WorkflowRunDetailsContent,
  type WorkflowNodeActivityPage,
  type WorkflowRunInspectionState,
} from "./workflow-node-details-components";

describe("WorkflowRunDetailsContent activity focus", () => {
  test("renders node activity through the shared chat run-activity rows", () => {
    const html = renderToString(
      <WorkflowRunDetailsContent focus={null} inspection={inspection()} target={target()} />,
    );

    expect(html).toContain('data-testid="run-activity-row"');
    expect(html).toContain('data-run-item-id="run_item_command"');
    expect(html).toContain("npm test");
    // The shared run-activity path is reused, not the full chat transcript surface.
    expect(html).not.toContain("data-chat-message");
  });

  test("highlights and deep-links the matching run item from a chat_run_item focus", () => {
    const html = renderToString(
      <WorkflowRunDetailsContent
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

function inspection(): WorkflowRunInspectionState {
  return {
    activityPages: [activityPage()],
    events: [workflowEvent("event_running", "running activity")],
    execution: execution(),
    loadError: "",
    loading: false,
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

function activityPage(): WorkflowNodeActivityPage {
  return {
    error: "",
    page: runActivityPage(),
    ref: activityRef(),
  };
}

function activityRef(): WorkflowActivityRef {
  return {
    createdAt: "2026-06-07T00:00:00Z",
    endCursor: "",
    executionId: "workflow_execution_test",
    id: "activity_ref_work",
    kind: "chat.run",
    metadata: null,
    nodeExecutionId: "node_execution_work",
    ref: "run_a",
    schemaVersion: 1,
    startCursor: "",
    updatedAt: "2026-06-07T00:00:00Z",
    workspaceId: "workspace_test",
  };
}

function runActivityPage(): RunActivityPage {
  return {
    activity: [
      {
        details: {
          command: "npm test",
          cwd: "",
          details: null,
          diffSummary: "",
          durationMs: 0,
          error: "",
          exitCode: 0,
          filePaths: [],
          namespace: "",
          noticeKind: "",
          noticeMessage: "",
          patchStatus: "",
          processId: "",
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
        sourceRunItemId: "run_item_command",
        status: "completed",
        title: "npm test",
        type: "command_execution",
      },
    ],
    items: [runItem()],
    output: [runOutput()],
    runId: "run_a",
  };
}

function runItem(): RunItem {
  return {
    command: "npm test",
    completedAt: "2026-06-07T00:00:02Z",
    conversationId: "conversation_a",
    createdAt: "2026-06-07T00:00:00Z",
    cwd: "",
    details: null,
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
