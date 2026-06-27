import type {
  ChatEvent,
  ChatMessage,
  Conversation,
  MessageDelivery,
  MessageRole,
  MessageStatus,
  Run,
  RunActivityGroupProjection,
  RunActivityRowProjection,
  RunStatus,
  TranscriptTurn,
} from "@generated/backend";
import { beforeEach, describe, expect, test } from "vitest";

import { useChatStore } from "./chat-store";

const workspaceId = "workspace_api";
const conversationId = "conversation_api";
const streamId = "event_stream_test";

describe("chat event reducer", () => {
  beforeEach(() => {
    useChatStore.setState({
      activeRun: null,
      conversations: [],
      diagnostics: [],
      error: null,
      goal: null,
      hasMoreOlder: false,
      lastEventSequence: 0,
      lastEventStreamId: "",
      messageIds: [],
      messages: [],
      messagesById: {},
      olderBeforeOrdinal: 0,
      operation: null,
      queuedRuns: [],
      runItemIdsByRunId: {},
      runItemOutputIdsByRunItemId: {},
      runItemOutputPagesByRunItemId: {},
      runItemOutputs: [],
      runItemOutputsById: {},
      runItems: [],
      runItemsById: {},
      selectedConversation: null,
      status: "idle",
      transcript: [],
      workspaceId: null,
    });
  });

  test("queue update events keep queued turns in the transcript", () => {
    const conversation = testConversation();
    const queued = message(
      "message_queued",
      3,
      "user",
      "pending",
      "queued follow-up",
      "queued",
      "run_queued",
    );
    const removedQueued = message(
      "message_removed_queued",
      4,
      "user",
      "pending",
      "removed queued follow-up",
      "queued",
      "run_removed_queued",
    );
    const queuedRun = {
      ...testRun("queued", "run_queued"),
      assistantMessageId: "",
      completedAt: "",
      promptSummary: "queued follow-up",
      startedAt: "",
      triggerMessageId: queued.id,
    };
    useChatStore.setState({
      messages: [removedQueued],
      selectedConversation: conversation,
      status: "ready",
      transcript: [
        transcriptTurn(
          testRun("cancelled", "run_cancelled"),
          message(
            "message_cancelled_assistant",
            2,
            "assistant",
            "cancelled",
            "",
            "normal",
            "run_cancelled",
          ),
        ),
      ],
      workspaceId,
    });

    useChatStore.getState().handleEvent(queueUpdatedEvent(1, [queuedRun], [queued]));

    const state = useChatStore.getState();
    expect(state.messages.find((item) => item.id === queued.id)?.delivery).toBe("queued");
    expect(state.messages.find((item) => item.id === removedQueued.id)).toBeUndefined();
    expect(state.queuedRuns.map((run) => run.id)).toEqual(["run_queued"]);
    expect(state.transcript.map((turn) => turn.run.id)).toEqual(["run_cancelled", "run_queued"]);
    expect(state.transcript[1]?.triggerMessage.parts[0]?.text).toBe("queued follow-up");
    expect(state.transcript[1]?.assistantMessage).toBeNull();
  });

  test("run activity projection events replace turn activity", () => {
    const conversation = testConversation();
    const run = testRun("running", "run_activity");
    useChatStore.setState({
      selectedConversation: conversation,
      status: "ready",
      transcript: [
        transcriptTurn(
          run,
          message("message_assistant", 2, "assistant", "streaming", "working", "normal", run.id),
        ),
      ],
      workspaceId,
    });

    const activity = runActivityProjection(run.id, "running");
    useChatStore.getState().handleEvent(runActivityUpdatedEvent(1, run, activity));
    expect(useChatStore.getState().transcript[0]?.activity).toEqual(activity);

    useChatStore.getState().handleEvent(runActivityUpdatedEvent(2, run, null));
    expect(useChatStore.getState().transcript[0]?.activity).toBeNull();
  });
});

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

function transcriptTurn(run: Run, assistantMessage: ChatMessage): TranscriptTurn {
  const triggerMessage = message("message_user", 1, "user", "complete", "hello", "normal", run.id);
  return {
    activity: null,
    assistantMessage,
    run: { ...run, assistantMessageId: assistantMessage.id, triggerMessageId: triggerMessage.id },
    steeringMessages: [],
    triggerMessage,
  };
}

function queueUpdatedEvent(sequence: number, runs: Run[], messages: ChatMessage[]): ChatEvent {
  return {
    conversationId,
    emittedAt: "2026-05-29T20:00:00Z",
    eventId: `${streamId}:${sequence}`,
    payload: { queue: { messages, runs } },
    runId: "",
    schemaVersion: 1,
    sequence,
    streamId,
    type: "chat.queue.updated",
    workspaceId,
  };
}

function runActivityUpdatedEvent(
  sequence: number,
  run: Run,
  activity: RunActivityGroupProjection | null,
): ChatEvent {
  return {
    conversationId,
    emittedAt: "2026-05-29T20:00:00Z",
    eventId: `${streamId}:${sequence}`,
    payload: { activity, runId: run.id },
    runId: run.id,
    schemaVersion: 1,
    sequence,
    streamId,
    type: "chat.run_activity.updated",
    workspaceId,
  };
}

function runActivityProjection(
  runId: string,
  status: RunActivityRowProjection["status"],
): RunActivityGroupProjection {
  const groupStatus: RunActivityGroupProjection["status"] =
    status === "pending" ? "running" : status;
  return {
    rows: [
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
          result: "",
          reviewId: "",
          serverName: "",
          summary: "",
          toolName: "",
        },
        hasDetails: true,
        hasOutput: false,
        id: "activity_run_item_command",
        sourceRunItemId: "run_item_command",
        status,
        title: "command execution",
        type: "command_execution",
      },
    ],
    runId,
    status: groupStatus,
  };
}
