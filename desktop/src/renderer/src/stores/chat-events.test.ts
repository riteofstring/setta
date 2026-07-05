import type {
  ChatMessage,
  ChatEvent,
  ChatGoalState,
  Conversation,
  MessageDelivery,
  MessageRole,
  MessageStatus,
  Run,
  RunItem,
  RunStatus,
} from "@generated/backend";
import { beforeEach, describe, expect, test } from "vitest";

import { applyChatEvent } from "./chat-events";
import { useChatStore } from "./chat-store";
import {
  activityBlock,
  assistantTextBlock,
  backgroundTerminalCreatedEvent,
  backgroundTerminalOutput,
  backgroundTerminalOutputDeltaEvent,
  backgroundTerminalProcess,
  backgroundTerminalsReplacedEvent,
  backgroundTerminalUpdatedEvent,
  reasoningBlock,
  runUpdatedEvent,
  runItemCreatedEvent,
  runItemUpdatedEvent,
  runStatusBlock,
  transcriptBlockCreatedEvent,
  transcriptBlockUpdatedEvent,
  transcriptBlocksReplacedEvent,
  transcriptTextDeltaEvent,
  userMessageBlock,
  queueUpdatedEvent,
} from "./chat-store-events.test.helpers";

const workspaceId = "workspace_api";
const conversationId = "conversation_api";

describe("chat transcript block reducer", () => {
  beforeEach(() => {
    useChatStore.setState(useChatStore.getInitialState(), true);
    useChatStore.setState({
      selectedConversation: testConversation(),
      status: "ready",
      workspaceId,
    });
  });

  test("created events upsert blocks into conversation order across runs", () => {
    // Two runs arrive interleaved; ordering is (run anchor by first appearance,
    // run-local ordinal), so a late-arriving lower ordinal still sorts first.
    useChatStore
      .getState()
      .handleEvent(
        transcriptBlockCreatedEvent(
          1,
          userMessageBlock({ id: "b_a1", ordinal: 1, runId: "run_a" }),
        ),
      );
    useChatStore
      .getState()
      .handleEvent(
        transcriptBlockCreatedEvent(2, activityBlock({ id: "b_a3", ordinal: 3, runId: "run_a" })),
      );
    useChatStore
      .getState()
      .handleEvent(
        transcriptBlockCreatedEvent(
          3,
          assistantTextBlock({ id: "b_a2", ordinal: 2, runId: "run_a", text: "first" }),
        ),
      );
    useChatStore
      .getState()
      .handleEvent(
        transcriptBlockCreatedEvent(
          4,
          userMessageBlock({ id: "b_b1", ordinal: 1, runId: "run_b" }),
        ),
      );

    expect(blockIds()).toEqual(["b_a1", "b_a2", "b_a3", "b_b1"]);
    expect(useChatStore.getState().transcriptBlocksById["b_a2"]?.assistantText?.text).toBe("first");
  });

  test("updated events upsert by id without moving the block", () => {
    seedBlocks([
      assistantTextBlock({ id: "b1", ordinal: 1, runId: "run_a", text: "intro" }),
      activityBlock({ id: "b2", ordinal: 2, runId: "run_a", activityStatus: "running" }),
      assistantTextBlock({ id: "b3", ordinal: 3, runId: "run_a", text: "outro" }),
    ]);

    useChatStore.getState().handleEvent(
      transcriptBlockUpdatedEvent(
        1,
        activityBlock({
          id: "b2",
          ordinal: 2,
          runId: "run_a",
          activityStatus: "completed",
          hasOutput: true,
        }),
      ),
    );

    expect(blockIds()).toEqual(["b1", "b2", "b3"]);
    expect(useChatStore.getState().transcriptBlocksById["b2"]?.activity?.status).toBe("completed");
    expect(useChatStore.getState().transcriptBlocksById["b2"]?.activity?.hasOutput).toBe(true);
  });

  test("text delta events append to the keyed block", () => {
    seedBlocks([
      assistantTextBlock({ id: "b1", ordinal: 1, runId: "run_a", text: "Hello" }),
      assistantTextBlock({ id: "b2", ordinal: 2, runId: "run_a", text: "World" }),
    ]);

    useChatStore
      .getState()
      .handleEvent(transcriptTextDeltaEvent(1, { blockId: "b2", delta: "!", runId: "run_a" }));

    expect(useChatStore.getState().transcriptBlocksById["b1"]?.assistantText?.text).toBe("Hello");
    expect(useChatStore.getState().transcriptBlocksById["b2"]?.assistantText?.text).toBe("World!");
  });

  test("text delta for a missing block requests resync", () => {
    seedBlocks([assistantTextBlock({ id: "b1", ordinal: 1, runId: "run_a", text: "Hello" })]);

    const event = transcriptTextDeltaEvent(1, { blockId: "b_missing", delta: "x", runId: "run_a" });
    const result = applyChatEvent(useChatStore.getState(), event as never);

    expect(result.resync).toBe(true);
    expect(useChatStore.getState().transcriptBlocksById["b1"]?.assistantText?.text).toBe("Hello");
  });

  test("terminal run update clears active run and preserves typed run status", () => {
    useChatStore.setState({
      activeRun: testRun("running", "run_complete"),
      runsById: { run_complete: testRun("running", "run_complete") },
    });

    useChatStore.getState().handleEvent(runUpdatedEvent(1, testRun("completed", "run_complete")));

    expect(useChatStore.getState().activeRun).toBeNull();
    expect(useChatStore.getState().runsById.run_complete?.status).toBe("completed");
  });

  test("blocks replaced swaps a run's blocks in place and drops the working indicator", () => {
    // Genesis: trigger + live-only working indicator created before any public block.
    useChatStore
      .getState()
      .handleEvent(
        transcriptBlockCreatedEvent(
          1,
          userMessageBlock({ id: "trigger", ordinal: 1, runId: "run_a" }),
        ),
      );
    useChatStore.getState().handleEvent(transcriptBlockCreatedEvent(2, workingBlock("run_a", 2)));
    expect(blockIds()).toEqual(["trigger", "transcript_working_run_a"]);

    // First public block supersedes working via a per-run replaced snapshot.
    useChatStore.getState().handleEvent(
      transcriptBlocksReplacedEvent(3, {
        runId: "run_a",
        blocks: [
          userMessageBlock({ id: "trigger", ordinal: 1, runId: "run_a" }),
          assistantTextBlock({ id: "answer", ordinal: 2, runId: "run_a", text: "done" }),
        ],
      }),
    );

    expect(blockIds()).toEqual(["trigger", "answer"]);
    expect(
      useChatStore.getState().transcriptBlocksById["transcript_working_run_a"],
    ).toBeUndefined();
  });

  test("blocks replaced keeps a non-tail run anchored at its position", () => {
    seedBlocks([
      userMessageBlock({ id: "a1", ordinal: 1, runId: "run_a" }),
      activityBlock({ id: "a2", ordinal: 2, runId: "run_a" }),
      userMessageBlock({ id: "b1", ordinal: 1, runId: "run_b" }),
      assistantTextBlock({ id: "b2", ordinal: 2, runId: "run_b", text: "later" }),
    ]);

    // Re-project run_a (e.g. steering block removed) — it must stay before run_b.
    useChatStore.getState().handleEvent(
      transcriptBlocksReplacedEvent(1, {
        runId: "run_a",
        blocks: [userMessageBlock({ id: "a1", ordinal: 1, runId: "run_a" })],
      }),
    );

    expect(blockIds()).toEqual(["a1", "b1", "b2"]);
  });

  test("reasoning mode update keeps the same block id and kind", () => {
    seedBlocks([
      assistantTextBlock({ id: "text", ordinal: 1, runId: "run_a", text: "intro" }),
      reasoningBlock({
        id: "reason",
        ordinal: 2,
        runId: "run_a",
        mode: "thinking",
        headline: "Mapping parser modules",
      }),
    ]);

    useChatStore.getState().handleEvent(
      transcriptBlockUpdatedEvent(
        1,
        reasoningBlock({
          id: "reason",
          ordinal: 2,
          runId: "run_a",
          mode: "summary",
          headline: "Mapping parser modules",
          summary: "full public summary of the reasoning",
        }),
      ),
    );

    const block = useChatStore.getState().transcriptBlocksById["reason"];
    expect(block?.kind).toBe("reasoning");
    expect(block?.reasoning?.mode).toBe("summary");
    expect(block?.reasoning?.headline).toBe("Mapping parser modules");
    expect(block?.reasoning?.summary).toBe("full public summary of the reasoning");
    expect(blockIds()).toEqual(["text", "reason"]);
  });

  test("queue updates keep queued runs out of the transcript blocks", () => {
    seedBlocks([
      userMessageBlock({ id: "a1", ordinal: 1, runId: "run_a" }),
      assistantTextBlock({
        id: "a2",
        ordinal: 2,
        runId: "run_a",
        text: "done",
        status: "complete",
      }),
    ]);
    const queued = message(
      "message_queued",
      3,
      "user",
      "pending",
      "queued follow-up",
      "queued",
      "run_queued",
    );
    const queuedRun = {
      ...testRun("queued", "run_queued"),
      assistantMessageId: "",
      completedAt: "",
      promptSummary: "queued follow-up",
      startedAt: "",
      triggerMessageId: queued.id,
    };

    useChatStore.getState().handleEvent(queueUpdatedEvent(1, [queuedRun], [queued]));

    expect(useChatStore.getState().queuedRuns.map((run) => run.id)).toEqual(["run_queued"]);
    expect(useChatStore.getState().messages.find((item) => item.id === queued.id)?.delivery).toBe(
      "queued",
    );
    // The queued run owns no blocks until it executes.
    expect(blockIds()).toEqual(["a1", "a2"]);
  });

  test("goal updates clear pending goal submission for the selected conversation", () => {
    const goal = goalState("finish renderer tests", "active");
    useChatStore.setState({
      pendingGoalSubmission: {
        conversationId,
        objective: "finish renderer tests",
      },
    });

    useChatStore.getState().handleEvent(goalUpdatedEvent(1, goal));

    expect(useChatStore.getState().goal).toEqual(goal);
    expect(useChatStore.getState().pendingGoalSubmission).toBeNull();
  });

  test("ignores raw run item events without disturbing transcript or background terminals", () => {
    seedBlocks([
      activityBlock({ id: "a1", ordinal: 1, runId: "run_a", sourceRunItemId: "run_item_command" }),
    ]);
    const terminal = backgroundTerminalProcess("background_terminal_alpha", {
      command: "npm run dev",
      status: "running",
    });
    useChatStore.getState().handleEvent(backgroundTerminalCreatedEvent(1, terminal));

    // Raw run-item created/updated events are no-ops in the renderer (the semantic
    // graph cartographer consumes them on the backend); background terminal UI state
    // comes only from typed background-terminal events.
    useChatStore
      .getState()
      .handleEvent(runItemCreatedEvent(2, runItem("run_item_command", "run_a")));
    useChatStore
      .getState()
      .handleEvent(runItemUpdatedEvent(3, runItem("run_item_command", "run_a")));

    expect(blockIds()).toEqual(["a1"]);
    expect(useChatStore.getState().backgroundTerminalIdsByConversationId[conversationId]).toEqual([
      terminal.id,
    ]);
    expect(useChatStore.getState().backgroundTerminalsById[terminal.id]).toEqual(terminal);
  });

  test("applies background terminal process and output events to typed registry state", () => {
    const alpha = backgroundTerminalProcess("background_terminal_alpha", {
      command: "npm run dev",
      startedAt: "2026-05-29T20:00:00Z",
    });
    const beta = backgroundTerminalProcess("background_terminal_beta", {
      command: "vite --host 0.0.0.0",
      startedAt: "2026-05-29T20:00:01Z",
    });

    useChatStore.getState().handleEvent(backgroundTerminalCreatedEvent(1, beta));
    useChatStore.getState().handleEvent(backgroundTerminalCreatedEvent(2, alpha));
    useChatStore
      .getState()
      .handleEvent(
        backgroundTerminalOutputDeltaEvent(
          3,
          backgroundTerminalOutput("background_terminal_output_alpha_1", alpha.id),
        ),
      );
    useChatStore.getState().handleEvent(
      backgroundTerminalUpdatedEvent(4, {
        ...alpha,
        status: "terminating",
        updatedAt: "2026-05-29T20:00:02Z",
      }),
    );

    expect(useChatStore.getState().backgroundTerminalIdsByConversationId[conversationId]).toEqual([
      beta.id,
      alpha.id,
    ]);
    expect(useChatStore.getState().backgroundTerminalsById[alpha.id]?.status).toBe("terminating");
    expect(useChatStore.getState().backgroundTerminalOutputIdsByProcessId[alpha.id]).toEqual([
      "background_terminal_output_alpha_1",
    ]);
    expect(
      useChatStore.getState().backgroundTerminalOutputsById.background_terminal_output_alpha_1
        ?.text,
    ).toBe("dev server ready\n");

    useChatStore.getState().handleEvent(backgroundTerminalsReplacedEvent(5, [beta]));
    expect(useChatStore.getState().backgroundTerminalIdsByConversationId[conversationId]).toEqual([
      beta.id,
      alpha.id,
    ]);

    useChatStore.getState().handleEvent(
      backgroundTerminalUpdatedEvent(6, {
        ...alpha,
        completedAt: "2026-05-29T20:00:03Z",
        status: "exited",
        updatedAt: "2026-05-29T20:00:03Z",
      }),
    );
    useChatStore.getState().handleEvent(backgroundTerminalsReplacedEvent(7, [beta]));
    expect(useChatStore.getState().backgroundTerminalIdsByConversationId[conversationId]).toEqual([
      beta.id,
    ]);
  });

  test("ignores transcript block events for unrelated conversations", () => {
    seedBlocks([assistantTextBlock({ id: "a1", ordinal: 1, runId: "run_a", text: "kept" })]);

    const otherConversationBlock = {
      ...assistantTextBlock({ id: "other", ordinal: 1, runId: "run_other", text: "ignored" }),
      conversationId: "conversation_other",
    };
    useChatStore.getState().handleEvent({
      ...transcriptBlockCreatedEvent(1, otherConversationBlock),
      conversationId: "conversation_other",
    });

    expect(blockIds()).toEqual(["a1"]);
  });
});

function blockIds() {
  return useChatStore.getState().transcriptBlocks.map((block) => block.id);
}

function seedBlocks(blocks: ReturnType<typeof assistantTextBlock>[]) {
  const transcriptBlocksById: Record<string, (typeof blocks)[number]> = {};
  for (const block of blocks) {
    transcriptBlocksById[block.id] = block;
  }
  useChatStore.setState({ transcriptBlocks: blocks, transcriptBlocksById });
}

function workingBlock(runId: string, ordinal: number) {
  return runStatusBlock({ id: `transcript_working_${runId}`, mode: "working", ordinal, runId });
}

function testConversation(): Conversation {
  return {
    archivedAt: "",
    codexEffectiveSettings: null,
    codexSettings: null,
    createdAt: "2026-05-29T20:00:00Z",
    harnessRefs: [],
    id: conversationId,
    internal: false,
    schemaVersion: 1,
    title: "API chat",
    updatedAt: "2026-05-29T20:00:00Z",
    workflow: null,
    easyRun: null,
    workspaceId,
  };
}

function goalUpdatedEvent(sequence: number, goal: ChatGoalState | null): ChatEvent {
  return {
    conversationId,
    emittedAt: "2026-05-29T20:00:00Z",
    eventId: `event_goal_${sequence}`,
    payload: { goal },
    runId: "",
    schemaVersion: 1,
    sequence,
    streamId: "stream_api",
    type: "chat.goal.updated",
    workspaceId,
  };
}

function goalState(objective: string, status: string): ChatGoalState {
  return {
    createdAt: 0,
    objective,
    status,
    threadId: "thread_fake",
    timeUsedSeconds: 0,
    tokenBudget: null,
    tokensUsed: 0,
    updatedAt: 0,
  };
}

function message(
  id: string,
  ordinal: number,
  role: MessageRole,
  status: MessageStatus,
  text: string,
  delivery: MessageDelivery = "normal",
  runId = "run_api",
): ChatMessage {
  return {
    conversationId,
    createdAt: "2026-05-29T20:00:00Z",
    delivery,
    id,
    ordinal,
    parts: [
      {
        id: `${id}_part`,
        image: null,
        text: { format: role === "assistant" ? "markdown" : "plain", text },
        type: "text",
      },
    ],
    role,
    runId,
    schemaVersion: 1,
    status,
    updatedAt: "2026-05-29T20:00:00Z",
  };
}

function testRun<T extends RunStatus>(status: T, runId = "run_api"): Run & { status: T } {
  const run = {
    assistantMessageId: "message_assistant",
    completedAt: status === "running" ? "" : "2026-05-29T20:01:00Z",
    conversationId,
    error: "",
    harness: "codex",
    id: runId,
    pendingApproval: null,
    promptSummary: "hello",
    schemaVersion: 1,
    startedAt: "2026-05-29T20:00:00Z",
    status,
    triggerMessageId: "message_user",
    workspaceId,
  } satisfies Run;
  return run as Run & { status: T };
}

function runItem(id: string, runId: string): RunItem {
  return {
    command: "npm test",
    completedAt: "",
    conversationId,
    createdAt: "2026-05-29T20:00:00Z",
    cwd: "",
    details: null,
    rawDetails: null,
    diffSummary: "",
    durationMs: 0,
    error: "",
    exitCode: 0,
    filePaths: [],
    hiddenText: "",
    id,
    namespace: "",
    noticeKind: "",
    noticeMessage: "",
    patchStatus: "",
    processId: "",
    progress: "",
    providerItemId: `${id}_provider`,
    requestId: "",
    result: "",
    reviewId: "",
    runId,
    schemaVersion: 1,
    serverName: "",
    source: null,
    startedAt: "2026-05-29T20:00:00Z",
    status: "running",
    summary: "",
    title: "command execution",
    toolName: "",
    type: "command_execution",
    workspaceId,
  };
}
