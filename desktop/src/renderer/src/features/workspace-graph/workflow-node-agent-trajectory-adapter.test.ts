import type {
  RunItem,
  RunItemOutput,
  RunItemOutputPage,
  WorkflowAgentTrajectoryPage,
} from "@generated/backend";
import { describe, expect, test } from "vitest";

import { activityBlock, userMessageBlock } from "../../stores/chat-store-events.test.helpers";
import { testRun } from "../../stores/chat-store.test.fixtures";
import {
  workflowNodeTrajectoryStateFromPage,
  workflowNodeTrajectoryViewModel,
  workflowNodeTrajectoryWithLoadedOutput,
  workflowNodeTrajectoryWithOlderPage,
} from "./workflow-node-agent-trajectory-adapter";

describe("workflow node agent trajectory adapter", () => {
  test("preserves workflow trajectory output pagination metadata", () => {
    const state = workflowNodeTrajectoryStateFromPage(trajectoryPage());

    expect(state.outputIdsByRunItemId.run_item_command).toEqual(["output_command_1"]);
    expect(state.outputPagesByRunItemId.run_item_command).toEqual({
      error: null,
      hasMore: true,
      loadedThroughOrdinal: 1,
      loading: false,
      nextOrdinal: 2,
    });

    const loaded = workflowNodeTrajectoryWithLoadedOutput(
      state,
      runItemOutputPage([runOutput("output_command_2", 2, "second")], false, 2),
      1,
    );

    expect(loaded.outputIdsByRunItemId.run_item_command).toEqual([
      "output_command_1",
      "output_command_2",
    ]);
    expect(loaded.outputPagesByRunItemId.run_item_command).toMatchObject({
      hasMore: false,
      loadedThroughOrdinal: 2,
      nextOrdinal: 2,
    });
    expect(loaded.outputsById.output_command_2?.text).toBe("second");
  });

  test("maps workflow node scope and disables unsupported selected-chat controls", () => {
    const state = workflowNodeTrajectoryStateFromPage(trajectoryPage());
    const viewModel = workflowNodeTrajectoryViewModel({
      focusedSourceRunItemId: "run_item_command",
      operation: null,
      state,
    });

    expect(viewModel.scope).toMatchObject({
      kind: "workflowNodeExecution",
      executionId: "workflow_execution_test",
      nodeExecutionId: "node_execution_work",
      runId: "run_a",
    });
    expect(viewModel.capabilities).toMatchObject({
      loadRunItemOutput: true,
      queuedMessageActions: false,
      sendSteering: false,
      stopRun: false,
    });
    expect(viewModel.focusedSourceRunItemId).toBe("run_item_command");
  });

  test("prepends older workflow-node blocks without replacing loaded output state", () => {
    const current = workflowNodeTrajectoryWithLoadedOutput(
      workflowNodeTrajectoryStateFromPage(trajectoryPage()),
      runItemOutputPage([runOutput("output_command_2", 2, "second")], false, 2),
      1,
    );
    const older = trajectoryPage({
      blocks: [
        userMessageBlock({
          id: "block_older_user",
          ordinal: 0,
          runId: "run_a",
          text: "older prompt",
        }),
      ],
      hasMoreOlder: false,
      olderBeforeBlockOrdinal: 0,
      outputPages: [
        {
          hasMore: false,
          loadedThroughOrdinal: 1,
          nextOrdinal: 1,
          outputIds: ["output_older_1"],
          runId: "run_a",
          runItemId: "run_item_older",
        },
      ],
      outputs: [runOutputForItem("output_older_1", "run_item_older", 1, "older output")],
    });

    const merged = workflowNodeTrajectoryWithOlderPage(current, older);

    expect(merged.page.blocks.map((block) => block.id)).toEqual([
      "block_older_user",
      "block_user",
      "block_activity",
    ]);
    expect(merged.outputIdsByRunItemId.run_item_command).toEqual([
      "output_command_1",
      "output_command_2",
    ]);
    expect(merged.outputIdsByRunItemId.run_item_older).toEqual(["output_older_1"]);
    expect(merged.outputPagesByRunItemId.run_item_command).toMatchObject({
      hasMore: false,
      loadedThroughOrdinal: 2,
    });
    expect(merged.outputsById.output_older_1?.text).toBe("older output");
  });
});

function trajectoryPage(
  overrides: Partial<WorkflowAgentTrajectoryPage> = {},
): WorkflowAgentTrajectoryPage {
  return {
    activeRun: null,
    activeRunLiveness: null,
    activity: [
      activityBlock({
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
      canLoadOlderHistory: true,
      canLoadRunItemOutput: true,
      canRetryLiveness: false,
      canSteer: false,
      canStopRun: false,
      canSubmitApproval: false,
    },
    conversationId: "conversation_api",
    hasMoreOlder: true,
    items: [runItem()],
    olderBeforeBlockOrdinal: 1,
    outputPages: [
      {
        hasMore: true,
        loadedThroughOrdinal: 1,
        nextOrdinal: 2,
        outputIds: ["output_command_1"],
        runId: "run_a",
        runItemId: "run_item_command",
      },
    ],
    outputs: [runOutput("output_command_1", 1, "first")],
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

function runItem(): RunItem {
  return {
    command: "npm test",
    completedAt: "2026-06-07T00:00:02Z",
    conversationId: "conversation_api",
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

function runOutput(id: string, ordinal: number, text: string): RunItemOutput {
  return runOutputForItem(id, "run_item_command", ordinal, text);
}

function runOutputForItem(
  id: string,
  runItemId: string,
  ordinal: number,
  text: string,
): RunItemOutput {
  return {
    createdAt: "2026-06-07T00:00:02Z",
    id,
    ordinal,
    runItemId,
    schemaVersion: 1,
    stream: "stdout",
    text,
  };
}

function runItemOutputPage(
  output: RunItemOutput[],
  hasMore: boolean,
  nextOrdinal: number,
): RunItemOutputPage {
  return {
    hasMore,
    nextOrdinal,
    output,
    runId: "run_a",
    runItemId: "run_item_command",
  };
}
