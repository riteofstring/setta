import type {
  ChatEvent,
  Run,
  RunItem,
  RunItemOutput,
  RunItemOutputPage,
  WorkflowAgentTrajectoryPage,
} from "@generated/backend";
import { describe, expect, test } from "vitest";

import {
  activityBlock,
  assistantTextBlock,
  userMessageBlock,
} from "../../stores/chat-store-events.test.helpers";
import { testRun } from "../../stores/chat-store.test.fixtures";
import {
  applyWorkflowNodeTrajectoryChatEvents,
  workflowNodeComposerActions,
  workflowNodeComposerRunPresentation,
  workflowNodeComposerViewModel,
  workflowNodeTrajectoryActions,
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

  test("maps node-scoped stop capability to trajectory and composer actions", () => {
    const state = workflowNodeTrajectoryStateFromPage(stoppableTrajectoryPage());
    const stopRun = async () => {};
    const steerMessage = async () => null;
    const viewModel = workflowNodeTrajectoryViewModel({
      focusedSourceRunItemId: null,
      operation: "cancelling",
      state,
    });

    expect(viewModel.capabilities.stopRun).toBe(true);
    expect(
      workflowNodeTrajectoryActions({
        loadOlder: async () => {},
        loadRunItemOutput: async () => {},
        retryLiveness: async () => {},
        state,
        stopRun,
        submitApproval: async () => {},
      }).stopRun,
    ).toBe(stopRun);
    expect(workflowNodeComposerViewModel({ operation: "cancelling", state })).toMatchObject({
      activeRunId: "run_a",
      operation: "cancelling",
      session: {
        id: "workflow-node:node_execution_work",
        workspaceId: "workspace_test",
      },
    });
    expect(
      workflowNodeComposerActions({
        retryLiveness: async () => {},
        state,
        steerMessage,
        stopRun,
      }).stopActiveRun,
    ).toBe(stopRun);
  });

  test("maps node-scoped steering to the composer without enabling transcript replay", () => {
    const state = workflowNodeTrajectoryStateFromPage(steerableTrajectoryPage());
    const steerMessage = async () => null;
    const stopRun = async () => {};
    const viewModel = workflowNodeTrajectoryViewModel({
      focusedSourceRunItemId: null,
      operation: null,
      state,
    });

    expect(viewModel.capabilities.sendSteering).toBe(false);
    expect(workflowNodeComposerRunPresentation(state)).toMatchObject({
      canSteer: true,
      running: true,
    });
    expect(
      workflowNodeComposerActions({
        retryLiveness: async () => {},
        state,
        steerMessage,
        stopRun,
      }).steerMessage,
    ).toBe(steerMessage);
  });

  test("maps node-scoped retry liveness to trajectory and composer controls", () => {
    const state = workflowNodeTrajectoryStateFromPage(retryableTrajectoryPage());
    const retryLiveness = async () => {};
    const stopRun = async () => {};
    const steerMessage = async () => null;
    const viewModel = workflowNodeTrajectoryViewModel({
      focusedSourceRunItemId: null,
      operation: "refreshing",
      state,
    });

    expect(viewModel.capabilities.retryLiveness).toBe(true);
    expect(workflowNodeComposerRunPresentation(state)).toMatchObject({
      canRetry: true,
      kind: "reconnecting",
      running: true,
    });
    expect(
      workflowNodeTrajectoryActions({
        loadOlder: async () => {},
        loadRunItemOutput: async () => {},
        retryLiveness,
        state,
        stopRun,
        submitApproval: async () => {},
      }).retryLiveness,
    ).toBe(retryLiveness);
    expect(
      workflowNodeComposerActions({
        retryLiveness,
        state,
        steerMessage,
        stopRun,
      }).retryActiveRunLiveness,
    ).toBe(retryLiveness);
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

  test("replays buffered chat events newer than the snapshot cursor", () => {
    const state = workflowNodeTrajectoryStateFromPage(
      trajectoryPage({
        blocks: [
          assistantTextBlock({
            conversationId: "conversation_api",
            id: "block_assistant",
            ordinal: 1,
            runId: "run_a",
            text: "Hello",
          }),
        ],
        lastChatEventSequence: 10,
      }),
    );

    const result = applyWorkflowNodeTrajectoryChatEvents(state, [
      transcriptDeltaEvent(10, state.page, "block_assistant", " duplicate"),
      transcriptDeltaEvent(11, state.page, "block_assistant", " live"),
    ]);

    expect(result.resync).toBe(false);
    expect(result.state.page.blocks[0]?.assistantText?.text).toBe("Hello live");
    expect(result.state.page.lastChatEventSequence).toBe(11);
  });

  test("ignores events for the selected main chat conversation when the workflow run uses another conversation", () => {
    const state = workflowNodeTrajectoryStateFromPage(
      trajectoryPage({
        blocks: [
          assistantTextBlock({
            conversationId: "conversation_api",
            id: "block_assistant",
            ordinal: 1,
            runId: "run_a",
            text: "workflow",
          }),
        ],
      }),
    );

    const result = applyWorkflowNodeTrajectoryChatEvents(state, [
      transcriptDeltaEvent(11, state.page, "block_assistant", " main", {
        conversationId: "conversation_selected_main",
      }),
    ]);

    expect(result.resync).toBe(false);
    expect(result.state.page.blocks[0]?.assistantText?.text).toBe("workflow");
    expect(result.state.page.lastChatEventSequence).toBe(11);
  });

  test("advances the chat cursor for unrelated interleaved stream events before applying scoped events", () => {
    const state = workflowNodeTrajectoryStateFromPage(
      trajectoryPage({
        blocks: [
          assistantTextBlock({
            conversationId: "conversation_api",
            id: "block_assistant",
            ordinal: 1,
            runId: "run_a",
            text: "workflow",
          }),
        ],
        lastChatEventSequence: 10,
      }),
    );

    const result = applyWorkflowNodeTrajectoryChatEvents(state, [
      transcriptDeltaEvent(11, state.page, "block_assistant", " unrelated", {
        conversationId: "conversation_selected_main",
      }),
      transcriptDeltaEvent(12, state.page, "block_assistant", " live"),
    ]);

    expect(result.resync).toBe(false);
    expect(result.state.page.blocks[0]?.assistantText?.text).toBe("workflow live");
    expect(result.state.page.lastChatEventSequence).toBe(12);
  });

  test("reports a snapshot resync instead of applying a chat event after a cursor gap", () => {
    const state = workflowNodeTrajectoryStateFromPage(
      trajectoryPage({
        blocks: [
          assistantTextBlock({
            conversationId: "conversation_api",
            id: "block_assistant",
            ordinal: 1,
            runId: "run_a",
            text: "Hello",
          }),
        ],
        lastChatEventSequence: 10,
      }),
    );

    const result = applyWorkflowNodeTrajectoryChatEvents(state, [
      transcriptDeltaEvent(12, state.page, "block_assistant", " skipped"),
    ]);

    expect(result.resync).toBe(true);
    expect(result.state.page.blocks[0]?.assistantText?.text).toBe("Hello");
  });

  test("updates run status and composer state from scoped run events", () => {
    const state = workflowNodeTrajectoryStateFromPage(stoppableTrajectoryPage());
    const completed = {
      ...state.page.run,
      completedAt: "2026-06-07T00:00:03Z",
      status: "completed",
    } satisfies Run;

    const result = applyWorkflowNodeTrajectoryChatEvents(state, [
      runUpdatedEvent(11, state.page, completed),
    ]);

    expect(result.resync).toBe(false);
    expect(result.state.page.activeRun).toBeNull();
    expect(result.state.page.capabilities.canStopRun).toBe(false);
    expect(
      workflowNodeComposerViewModel({ operation: null, state: result.state }).session,
    ).toBeNull();
  });

  test("applies live run item output chunks to loaded output state", () => {
    const state = workflowNodeTrajectoryStateFromPage(trajectoryPage());

    const result = applyWorkflowNodeTrajectoryChatEvents(state, [
      outputDeltaEvent(11, state.page, runOutput("output_command_2", 2, "second")),
    ]);

    expect(result.resync).toBe(false);
    expect(result.state.outputIdsByRunItemId.run_item_command).toEqual([
      "output_command_1",
      "output_command_2",
    ]);
    expect(result.state.outputPagesByRunItemId.run_item_command).toMatchObject({
      loadedThroughOrdinal: 2,
      nextOrdinal: 3,
    });
  });
});

function transcriptDeltaEvent(
  sequence: number,
  page: WorkflowAgentTrajectoryPage,
  blockId: string,
  delta: string,
  overrides: Partial<Pick<ChatEvent, "conversationId" | "runId" | "workspaceId">> = {},
): ChatEvent {
  return {
    conversationId: overrides.conversationId ?? page.conversationId,
    emittedAt: "2026-06-07T00:00:00Z",
    eventId: `${page.lastChatEventStreamId}:${sequence}`,
    payload: {
      blockId,
      delta,
      updatedAt: "2026-06-07T00:00:01Z",
    },
    runId: overrides.runId ?? page.runId,
    schemaVersion: 1,
    sequence,
    streamId: page.lastChatEventStreamId,
    type: "chat.transcript_text.delta",
    workspaceId: overrides.workspaceId ?? page.scope.workspaceId,
  };
}

function runUpdatedEvent(sequence: number, page: WorkflowAgentTrajectoryPage, run: Run): ChatEvent {
  return {
    conversationId: page.conversationId,
    emittedAt: "2026-06-07T00:00:00Z",
    eventId: `${page.lastChatEventStreamId}:${sequence}`,
    payload: { run },
    runId: page.runId,
    schemaVersion: 1,
    sequence,
    streamId: page.lastChatEventStreamId,
    type: "chat.run.updated",
    workspaceId: page.scope.workspaceId,
  };
}

function outputDeltaEvent(
  sequence: number,
  page: WorkflowAgentTrajectoryPage,
  output: RunItemOutput,
): ChatEvent {
  return {
    conversationId: page.conversationId,
    emittedAt: "2026-06-07T00:00:00Z",
    eventId: `${page.lastChatEventStreamId}:${sequence}`,
    payload: { output },
    runId: page.runId,
    schemaVersion: 1,
    sequence,
    streamId: page.lastChatEventStreamId,
    type: "chat.run_item_output.delta",
    workspaceId: page.scope.workspaceId,
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
      canLoadMoreActivity: false,
      canLoadRunItemOutput: true,
      canRetryLiveness: false,
      canSteer: false,
      canStopRun: false,
      canSubmitApproval: false,
    },
    conversationId: "conversation_api",
    hasMoreItems: false,
    hasMoreOlder: true,
    items: [runItem()],
    lastChatEventSequence: 10,
    lastChatEventStreamId: "chat_stream_test",
    lastWorkflowEventOrdinal: 5,
    nextItemId: "",
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

function stoppableTrajectoryPage() {
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
      canLoadOlderHistory: true,
      canLoadMoreActivity: false,
      canLoadRunItemOutput: true,
      canRetryLiveness: false,
      canSteer: false,
      canStopRun: true,
      canSubmitApproval: false,
    },
    run: { ...testRun("running", "run_a"), workspaceId: "workspace_test" },
  });
}

function steerableTrajectoryPage() {
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
      canLoadOlderHistory: true,
      canLoadMoreActivity: false,
      canLoadRunItemOutput: true,
      canRetryLiveness: false,
      canSteer: true,
      canStopRun: true,
      canSubmitApproval: false,
    },
    run: { ...testRun("running", "run_a"), workspaceId: "workspace_test" },
  });
}

function retryableTrajectoryPage() {
  return trajectoryPage({
    activeRun: { ...testRun("running", "run_a"), workspaceId: "workspace_test" },
    activeRunLiveness: {
      cancellable: true,
      conversationId: "conversation_api",
      error: "stream disconnected before completion",
      harness: "codex",
      lastProviderEventAt: "2026-06-07T00:00:01Z",
      lastReconciledAt: "2026-06-07T00:00:02Z",
      providerThreadId: "thread_api",
      providerTurnId: "turn_api",
      reason: "user_retry",
      retryable: true,
      runId: "run_a",
      status: "reconciling",
      workspaceId: "workspace_test",
    },
    capabilities: {
      canLoadOlderHistory: true,
      canLoadMoreActivity: false,
      canLoadRunItemOutput: true,
      canRetryLiveness: true,
      canSteer: false,
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
