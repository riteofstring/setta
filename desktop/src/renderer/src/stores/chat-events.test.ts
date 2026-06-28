import type {
  ChatMessage,
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
  reasoningBlock,
  runItemCreatedEvent,
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

  test("ignores raw run item events without disturbing the transcript", () => {
    seedBlocks([
      activityBlock({ id: "a1", ordinal: 1, runId: "run_a", sourceRunItemId: "run_item_command" }),
    ]);

    // Raw run-item created/updated events are no-ops in the renderer (the semantic
    // graph cartographer consumes them on the backend); the transcript is unchanged.
    useChatStore
      .getState()
      .handleEvent(runItemCreatedEvent(1, runItem("run_item_command", "run_a")));

    expect(blockIds()).toEqual(["a1"]);
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
    workspaceId,
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
      { format: role === "assistant" ? "markdown" : "plain", id: `${id}_part`, text, type: "text" },
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
