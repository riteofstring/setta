import { describe, expect, test } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";

import type {
  RunActivityPage,
  RunItem,
  RunItemOutput,
  WorkflowActivityRef,
  WorkflowEvent,
  WorkflowExecution,
  WorkflowNodeExecution,
} from "@generated/backend";
import type { WorkflowNodeDetailsTarget } from "../../stores/workflow-editor-store";
import {
  latestWorkflowNodeExecution,
  workflowConditionText,
  workflowGraphWithUpdatedAgentTask,
  workflowNodeEvents,
} from "./workflow-node-details-helpers";
import {
  WorkflowNodeDetailsContent,
  WorkflowSemanticRuntimeDetails,
} from "./workflow-node-details-surface";
import { ActivitySpritePopoverBody } from "./workflow-activity-sprite-popover";
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

  test("renders semantic runtime explanation for recent lifecycle state without active sources", () => {
    const html = renderToString(
      createElement(WorkflowSemanticRuntimeDetails, { target: recentRuntimeTarget() }),
    );

    expect(html).toContain("Semantic Runtime");
    expect(html).toContain("Sources");
    expect(html).toContain("applied");
    expect(html).toContain("Runs");
  });

  test("renders trajectory runtime provenance on selected workflow nodes", () => {
    const html = renderToString(
      createElement(WorkflowTrajectoryRuntimeDetails, { target: trajectoryTarget() }),
    );

    expect(html).toContain("Trajectory");
    expect(html).toContain("Activity");
    expect(html).toContain("Hidden groups");
    expect(html).not.toContain("Revision");
    expect(html).toContain("assistant message");
    expect(html).toContain("running");
    expect(html).toContain("Review output");
    expect(html).toContain("Run item");
    expect(html).toContain("run_item_review");
    expect(html).toContain("Chat run");
    expect(html).toContain("chat_run_review");
    expect(html).toContain("Provider");
    expect(html).toContain("provider_i...review");
    expect(html).toContain("rg &quot;foo&quot; src/");
    expect(html).toContain("failed command");
    expect(html).toContain("/workspace/setta");
    expect(html).toContain("123 ms");
    expect(html).not.toContain("command_execution");
    expect(html).toContain("read internal/httpapi/routes.go:12-18 +2 -1");
    expect(html).toContain("workflow_node");
    expect(html).toContain("reviewer");
  });

  test("renders cartographer and memory suggestion trajectory aggregates", () => {
    const html = renderToString(
      createElement(WorkflowTrajectoryRuntimeDetails, { target: aggregateTrajectoryTarget() }),
    );

    expect(html).toContain("10 cartographers queued");
    expect(html).toContain("Memory suggestion");
    expect(html).toContain("Represented");
    expect(html).toContain("10 source records");
    expect(html).toContain("Review recent source changes before the next run.");
    expect(html).toContain("Remember that toolbar overflow blocks review actions.");
    expect(html).toContain("Source ids");
    expect(html).not.toContain("Revision");
    expect(html).not.toContain("semantic patch");
    expect(html).not.toContain("pending_review");
    expect(html).not.toContain("cartographer_patch");
  });

  test("renders a version node details target without a run id as read-only", () => {
    const definition = agentTaskDefinition();
    const node = definition.graph.nodes[0];
    if (node === undefined) {
      throw new Error("agent task fixture is missing its node");
    }
    const html = renderToString(
      createElement(WorkflowNodeDetailsContent, {
        definition,
        draft: {
          freshConversation: true,
          model: "",
          prompt: "Review the workspace",
          reasoningEffort: "",
          title: "Review",
        },
        loadError: "",
        node,
        onDraftChange: () => undefined,
        onSave: () => undefined,
        runInspection: {
          activityPages: [],
          events: [],
          execution: null,
          loadError: "",
          loading: false,
        },
        saveMessage: "",
        saving: false,
        target: {
          ...runtimeTarget(),
          editable: false,
          executionId: "",
          viewMode: "version",
        },
      }),
    );

    expect(html).toContain("This pane is read-only");
    expect(html).toMatch(/data-testid="workflow-node-save-button"[^>]*disabled=""/);
  });

  test("renders workflow run activity through shared agent activity rows", () => {
    const ref = workflowActivityRef();
    const execution = testExecution([
      {
        ...nodeExecution("workflow_node_execution_review", "reviewer", 1, 1, "succeeded"),
        activityRefs: [ref],
      },
    ]);
    const html = renderToString(
      createElement(WorkflowNodeDetailsContent, {
        definition: null,
        draft: null,
        loadError: "",
        node: null,
        onDraftChange: () => undefined,
        onSave: () => undefined,
        runInspection: {
          activityPages: [{ error: "", page: runActivityPage(), ref }],
          events: [],
          execution,
          loadError: "",
          loading: false,
        },
        saveMessage: "",
        saving: false,
        target: runtimeTarget(),
      }),
    );

    expect(html).toContain('data-agent-run-activity="true"');
    expect(html).toContain('data-agent-run-activity-item="true"');
    expect(html).toContain("Assistant replied");
    expect(html).toContain("summary ready");
    expect(html).toContain("Output");
    expect(html).toContain("workflow output chunk");
    expect(html).not.toContain("TranscriptTurn");
    expect(html).not.toContain("chat-assistant-turn-row");
  });

  test("focuses a linked workflow run activity row through the shared component", () => {
    const ref = workflowActivityRef();
    const execution = testExecution([
      {
        ...nodeExecution("workflow_node_execution_review", "reviewer", 1, 1, "succeeded"),
        activityRefs: [ref],
      },
    ]);
    const html = renderToString(
      createElement(WorkflowNodeDetailsContent, {
        definition: null,
        draft: null,
        loadError: "",
        node: null,
        onDraftChange: () => undefined,
        onSave: () => undefined,
        runInspection: {
          activityPages: [{ error: "", page: runActivityPage(), ref }],
          events: [],
          execution,
          loadError: "",
          loading: false,
        },
        saveMessage: "",
        saving: false,
        target: { ...runtimeTarget(), focusedRunItemId: "run_item_review" },
      }),
    );

    expect(html).toContain('data-agent-run-activity="true"');
    expect(html).toContain('data-run-item-id="run_item_review"');
    expect(html).toContain('data-focused-run-activity-item="true"');
  });

  test("renders sprite popover activity through shared agent activity rows", () => {
    const item = runItem();
    const output = runItemOutput(item.id);
    const html = renderToString(
      createElement(ActivitySpritePopoverBody, {
        error: "",
        item,
        loading: false,
        outputIdsByRunItemId: { [item.id]: [output.id] },
        outputsById: { [output.id]: output },
      }),
    );

    expect(html).toContain('data-agent-run-activity="true"');
    expect(html).toContain('data-agent-run-activity-item="true"');
    expect(html).toContain('data-run-item-id="run_item_review"');
    expect(html).toContain("Assistant replied");
    expect(html).toContain("workflow output chunk");
  });
});

function runtimeTarget(): WorkflowNodeDetailsTarget {
  return {
    definitionId: "workflow_definition_test",
    definitionName: "Workflow",
    definitionVersionId: "workflow_version_test",
    definitionVersionNumber: 1,
    editable: false,
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

function agentTaskDefinition() {
  return {
    createdAt: "",
    description: "",
    draftRevision: "sha256:draft",
    draftUpdatedAt: "",
    graph: {
      edges: [],
      layout: { nodes: [] },
      nodes: [
        {
          action: {
            codex: {
              freshConversation: true,
              model: "",
              prompt: "Review the workspace",
              reasoningEffort: "",
            },
            kind: "agent.codex" as const,
          },
          gateway: null,
          id: "reviewer",
          kind: "action" as const,
          loopGuard: null,
          title: "Review",
        },
      ],
    },
    id: "workflow_definition_test",
    name: "Workflow",
    schemaVersion: 1,
    updatedAt: "",
    workspaceId: "workspace_test",
  };
}

function recentRuntimeTarget(): WorkflowNodeDetailsTarget {
  return {
    ...runtimeTarget(),
    runtime: {
      hiddenSourceCount: 0,
      modelAudits: [],
      patchIds: [],
      pulseCount: 0,
      recentPulses: [],
      runIds: ["cartographer_run_applied"],
      sourceCount: 0,
      sourceRefs: [],
      status: "applied",
      statusCounts: [{ count: 1, status: "applied" }],
      windowIds: ["cartographer_window_applied"],
    },
  };
}

function trajectoryTarget(): WorkflowNodeDetailsTarget {
  return {
    ...runtimeTarget(),
    trajectory: {
      hiddenCount: 1,
      items: [
        {
          anchorNodeId: "reviewer",
          id: "sprite_review",
          lane: "workflow_node",
          type: "sprite",
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
        {
          anchorNodeId: "reviewer",
          id: "sprite_command",
          lane: "workflow_node",
          type: "sprite",
          sprite: {
            cartographerPatchId: "",
            cartographerRunId: "",
            cartographerWindowId: "",
            chatConversationId: "conversation_review",
            chatMessageId: "message_review",
            chatRunId: "chat_run_review",
            command: {
              command: 'rg "foo" src/',
              cwd: "/workspace/setta",
              durationMs: 123,
              exitCode: 1,
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
            fileRefs: [],
            id: "sprite_command",
            kind: "command",
            providerItemId: "provider_item_command",
            resultSummary: "",
            runItemId: "run_item_command",
            schemaVersion: 1,
            severity: "error",
            sourceRefs: [
              { id: "reviewer", kind: "workflow_node" },
              { id: "workflow_node_execution_review", kind: "workflow_node_execution" },
            ],
            status: "failed",
            subtitle: "command_execution",
            title: "Command",
            tool: {
              namespace: "",
              requestId: "",
              serverName: "",
              toolName: "",
            },
            ttlMs: 0,
            updatedAt: "2026-06-07T00:00:02Z",
            workflowExecutionId: "workflow_execution_test",
            workflowNodeExecutionId: "workflow_node_execution_review",
            workflowNodeId: "reviewer",
            workspaceId: "workspace_test",
          },
        },
      ],
      revision: 7,
      timeline: [],
      totalCount: 3,
      workflowNodeId: "reviewer",
    },
  };
}

function aggregateTrajectoryTarget(): WorkflowNodeDetailsTarget {
  return {
    ...runtimeTarget(),
    trajectory: {
      hiddenCount: 0,
      items: [
        {
          aggregate: {
            anchorNodeId: "reviewer",
            count: 10,
            hiddenSourcePreviewCount: 6,
            id: "trajectory-aggregate:workflow_node:reviewer:cartographer_status:pending",
            kind: "cartographer_status",
            label: "10 cartographers queued",
            lane: "workflow_node",
            severity: "info",
            sourcePreviews: [
              {
                id: "cartographer-run:cartographer_run_10",
                label: "Cartographer run",
                status: "pending",
                summary: "Review recent source changes before the next run.",
                updatedAt: "2026-06-07T00:00:10Z",
              },
              {
                id: "cartographer-run:cartographer_run_9",
                label: "Cartographer run",
                status: "pending",
                summary: "Summarize queued workspace evidence.",
                updatedAt: "2026-06-07T00:00:09Z",
              },
              {
                id: "cartographer-run:cartographer_run_8",
                label: "Cartographer run",
                status: "pending",
                summary: "Inspect recent assistant output.",
                updatedAt: "2026-06-07T00:00:08Z",
              },
              {
                id: "cartographer-run:cartographer_run_7",
                label: "Cartographer run",
                status: "pending",
                summary: "Prepare memory candidates.",
                updatedAt: "2026-06-07T00:00:07Z",
              },
            ],
            sourceSpriteIds: [
              "cartographer-run:cartographer_run_10",
              "cartographer-run:cartographer_run_9",
              "cartographer-run:cartographer_run_8",
              "cartographer-run:cartographer_run_7",
              "cartographer-run:cartographer_run_6",
              "cartographer-run:cartographer_run_5",
              "cartographer-run:cartographer_run_4",
              "cartographer-run:cartographer_run_3",
              "cartographer-run:cartographer_run_2",
              "cartographer-run:cartographer_run_1",
            ],
            status: "pending",
            updatedAt: "2026-06-07T00:00:01Z",
          },
          anchorNodeId: "reviewer",
          id: "trajectory-aggregate:workflow_node:reviewer:cartographer_status:pending",
          lane: "workflow_node",
          type: "aggregate",
        },
        {
          aggregate: {
            anchorNodeId: "reviewer",
            count: 1,
            hiddenSourcePreviewCount: 0,
            id: "trajectory-aggregate:workflow_node:reviewer:memory_suggestion:approval_required",
            kind: "memory_suggestion",
            label: "Memory suggestion",
            lane: "workflow_node",
            severity: "blocking",
            sourcePreviews: [
              {
                id: "cartographer-patch:cartographer_patch_memory",
                label: "Memory suggestion",
                status: "approval_required",
                summary: "Remember that toolbar overflow blocks review actions.",
                updatedAt: "2026-06-07T00:00:02Z",
              },
            ],
            sourceSpriteIds: ["cartographer-patch:cartographer_patch_memory"],
            status: "approval_required",
            updatedAt: "2026-06-07T00:00:02Z",
          },
          anchorNodeId: "reviewer",
          id: "trajectory-aggregate:workflow_node:reviewer:memory_suggestion:approval_required",
          lane: "workflow_node",
          type: "aggregate",
        },
      ],
      revision: 8,
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

function workflowActivityRef(): WorkflowActivityRef {
  return {
    createdAt: "2026-06-07T00:00:00Z",
    endCursor: "12",
    executionId: "workflow_execution_test",
    id: "workflow_activity_ref_review",
    kind: "chat.run",
    metadata: {},
    nodeExecutionId: "workflow_node_execution_review",
    ref: "chat_run_review",
    schemaVersion: 1,
    startCursor: "1",
    updatedAt: "2026-06-07T00:00:01Z",
    workspaceId: "workspace_test",
  };
}

function runActivityPage(): RunActivityPage {
  const item = runItem();
  return {
    items: [item],
    output: [runItemOutput(item.id)],
    runId: item.runId,
  };
}

function runItem(): RunItem {
  return {
    command: "",
    completedAt: "2026-06-07T00:00:02Z",
    conversationId: "conversation_review",
    createdAt: "2026-06-07T00:00:00Z",
    cwd: "",
    details: { source: "workflow" },
    diffStats: {
      additions: 0,
      changedFiles: 0,
      deletions: 0,
      structured: false,
      summary: "",
    },
    diffSummary: "",
    durationMs: 0,
    error: "",
    exitCode: 0,
    fileOperations: [],
    filePaths: [],
    hiddenText: "",
    id: "run_item_review",
    namespace: "agent",
    noticeKind: "",
    noticeMessage: "",
    patchStatus: "",
    processId: "",
    progress: "",
    providerItemId: "provider_item_review",
    requestId: "request_review",
    result: "summary ready",
    reviewId: "",
    runId: "chat_run_review",
    schemaVersion: 1,
    serverName: "",
    startedAt: "2026-06-07T00:00:01Z",
    status: "completed",
    summary: "",
    title: "Assistant replied",
    toolName: "",
    type: "agent_message",
    workspaceId: "workspace_test",
  };
}

function runItemOutput(runItemId: string): RunItemOutput {
  return {
    createdAt: "2026-06-07T00:00:02Z",
    id: "run_item_output_review_1",
    ordinal: 1,
    runItemId,
    schemaVersion: 1,
    stream: "stdout",
    text: "workflow output chunk",
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
