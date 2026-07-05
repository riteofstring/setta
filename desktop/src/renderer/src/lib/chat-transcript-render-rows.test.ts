import type { ChatMessage, MessageRole, MessageStatus } from "@generated/backend";
import { describe, expect, test } from "vitest";

import {
  activityBlock,
  assistantTextBlock,
  reasoningBlock,
  userMessageBlock,
} from "../stores/chat-store-events.test.helpers";
import { queuedChatMessage } from "../App.test.fixtures";
import { transcriptRenderRows } from "./chat-transcript-render-rows";

function chatMessage(
  id: string,
  ordinal: number,
  role: MessageRole,
  runId: string,
  text = id,
): ChatMessage {
  return {
    conversationId: "conversation_api",
    createdAt: "2026-05-29T20:00:00Z",
    delivery: "normal",
    id,
    ordinal,
    parts: [
      {
        id: `${id}_part`,
        image: null,
        text: { format: "plain", text },
        type: "text",
      },
    ],
    role,
    runId,
    schemaVersion: 1,
    status: "complete",
    updatedAt: "2026-05-29T20:00:00Z",
  };
}

function pendingSteeringMessage(
  id: string,
  ordinal: number,
  runId: string,
  text = id,
  status: MessageStatus = "pending",
): ChatMessage {
  return {
    ...chatMessage(id, ordinal, "user", runId, text),
    delivery: "steering",
    status,
  };
}

describe("transcriptRenderRows", () => {
  test("collapses adjacent activity blocks to one slim group header by default", () => {
    const rows = transcriptRenderRows({
      blocks: [
        assistantTextBlock({
          id: "text_1",
          runId: "run",
          ordinal: 1,
          status: "complete",
          text: "before",
        }),
        activityBlock({ id: "cmd_a", runId: "run", ordinal: 2, sourceRunItemId: "item_a" }),
        activityBlock({ id: "cmd_b", runId: "run", ordinal: 3, sourceRunItemId: "item_b" }),
        assistantTextBlock({
          id: "text_2",
          runId: "run",
          ordinal: 4,
          status: "complete",
          text: "after",
        }),
      ],
      messages: [],
      queuedMessages: [],
    });

    expect(rows.map((row) => row.kind)).toEqual(["block", "activity-group", "block"]);
    const group = rows[1];
    if (group?.kind !== "activity-group") {
      throw new Error("expected a derived activity group header row");
    }
    expect(group.expanded).toBe(false);
    expect(group.group.memberBlockIds).toEqual(["cmd_a", "cmd_b"]);
    expect(group.members.map((member) => member.id)).toEqual(["cmd_a", "cmd_b"]);
  });

  test("emits activity member rows when the derived group is expanded", () => {
    const rows = transcriptRenderRows({
      blocks: [
        activityBlock({ id: "cmd_a", runId: "run", ordinal: 1, sourceRunItemId: "item_a" }),
        activityBlock({ id: "cmd_b", runId: "run", ordinal: 2, sourceRunItemId: "item_b" }),
      ],
      expandedActivityGroupIds: new Set(["activity_group_cmd_a"]),
      messages: [],
      queuedMessages: [],
    });

    expect(rows.map((row) => row.kind)).toEqual([
      "activity-group",
      "activity-item",
      "activity-item",
    ]);
    const group = rows[0];
    expect(group?.kind === "activity-group" && group.expanded).toBe(true);
  });

  test("keeps live member arrival collapsed under the existing header", () => {
    const firstRows = transcriptRenderRows({
      blocks: [activityBlock({ id: "cmd_a", runId: "run", ordinal: 1, sourceRunItemId: "item_a" })],
      messages: [],
      queuedMessages: [],
    });
    const nextRows = transcriptRenderRows({
      blocks: [
        activityBlock({ id: "cmd_a", runId: "run", ordinal: 1, sourceRunItemId: "item_a" }),
        activityBlock({ id: "cmd_b", runId: "run", ordinal: 2, sourceRunItemId: "item_b" }),
      ],
      messages: [],
      queuedMessages: [],
    });

    expect(firstRows.map((row) => row.kind)).toEqual(["activity-group"]);
    expect(nextRows.map((row) => row.kind)).toEqual(["activity-group"]);
    expect(firstRows[0]?.key).toBe(nextRows[0]?.key);
    const group = nextRows[0];
    expect(group?.kind === "activity-group" && group.members.map((member) => member.id)).toEqual([
      "cmd_a",
      "cmd_b",
    ]);
  });

  test("starts a fresh group after a non-activity block splits adjacent activity rows", () => {
    const rows = transcriptRenderRows({
      blocks: [
        activityBlock({ id: "cmd_a", runId: "run", ordinal: 1, sourceRunItemId: "item_a" }),
        reasoningBlock({ id: "reason", runId: "run", ordinal: 2, mode: "thinking" }),
        activityBlock({ id: "cmd_b", runId: "run", ordinal: 3, sourceRunItemId: "item_b" }),
      ],
      messages: [],
      queuedMessages: [],
    });

    // The reasoning block splits the two commands into separate collapsed groups.
    expect(rows.map((row) => row.kind)).toEqual(["activity-group", "block", "activity-group"]);
  });

  test("force-opens a group when focus targets a member block", () => {
    const rows = transcriptRenderRows({
      blocks: [
        activityBlock({ id: "cmd_a", runId: "run", ordinal: 1, sourceRunItemId: "item_a" }),
        activityBlock({ id: "cmd_b", runId: "run", ordinal: 2, sourceRunItemId: "item_b" }),
      ],
      forceExpandedActivityBlockIds: new Set(["cmd_b"]),
      messages: [],
      queuedMessages: [],
    });

    expect(rows.map((row) => row.kind)).toEqual([
      "activity-group",
      "activity-item",
      "activity-item",
    ]);
    const group = rows[0];
    expect(group?.kind === "activity-group" && group.expanded).toBe(true);
  });

  test("force-opens a group when focus targets a member source run item", () => {
    const rows = transcriptRenderRows({
      blocks: [
        activityBlock({ id: "cmd_a", runId: "run", ordinal: 1, sourceRunItemId: "item_a" }),
        activityBlock({ id: "cmd_b", runId: "run", ordinal: 2, sourceRunItemId: "item_b" }),
      ],
      forceExpandedActivitySourceRunItemIds: new Set(["item_b"]),
      messages: [],
      queuedMessages: [],
    });

    expect(rows.map((row) => row.kind)).toEqual([
      "activity-group",
      "activity-item",
      "activity-item",
    ]);
  });

  test("appends queued messages at the tail", () => {
    const rows = transcriptRenderRows({
      blocks: [userMessageBlock({ id: "user_1", runId: "run", ordinal: 1, text: "hi" })],
      messages: [],
      queuedMessages: [queuedChatMessage("queued_1", "run_queue", "later")],
    });

    expect(rows.map((row) => row.kind)).toEqual(["block", "queued"]);
    const queued = rows[1];
    if (queued?.kind !== "queued") {
      throw new Error("expected a queued tail row");
    }
    expect(queued.message.id).toBe("queued_1");
  });

  test("appends pending steering messages before queued work", () => {
    const rows = transcriptRenderRows({
      blocks: [
        userMessageBlock({ id: "user_1", runId: "run", ordinal: 1, text: "hi" }),
        assistantTextBlock({
          id: "assistant_1",
          runId: "run",
          ordinal: 2,
          status: "streaming",
          text: "working",
        }),
      ],
      messages: [pendingSteeringMessage("steer_1", 3, "run", "wait")],
      queuedMessages: [queuedChatMessage("queued_1", "run_queue", "later")],
    });

    expect(rows.map((row) => row.kind)).toEqual(["block", "block", "message", "queued"]);
    const steering = rows[2];
    expect(steering?.kind === "message" && steering.message.id).toBe("steer_1");
    const queued = rows[3];
    expect(queued?.kind === "queued" && queued.message.id).toBe("queued_1");
  });

  test("keeps uncommitted cancelled and errored steering messages outside transcript chronology", () => {
    const rows = transcriptRenderRows({
      blocks: [assistantTextBlock({ id: "assistant_1", runId: "run", ordinal: 1, text: "done" })],
      messages: [
        pendingSteeringMessage("steer_error", 2, "run", "failed steer", "error"),
        pendingSteeringMessage("steer_cancelled", 3, "run", "cancelled steer", "cancelled"),
        pendingSteeringMessage("steer_complete", 4, "run", "committed steer", "complete"),
      ],
      queuedMessages: [],
    });

    expect(rows.map((row) => row.kind)).toEqual(["block", "message", "message"]);
    expect(rows[1]?.kind === "message" && rows[1].message.id).toBe("steer_error");
    expect(rows[2]?.kind === "message" && rows[2].message.id).toBe("steer_cancelled");
  });

  test("hides goal-delivery user messages from the transcript", () => {
    const rows = transcriptRenderRows({
      blocks: [
        userMessageBlock({
          id: "goal_trigger",
          runId: "run",
          ordinal: 1,
          delivery: "goal",
          text: "finish the work",
        }),
        assistantTextBlock({
          id: "assistant_1",
          runId: "run",
          ordinal: 2,
          status: "complete",
          text: "working on it",
        }),
      ],
      messages: [],
      queuedMessages: [],
    });

    expect(rows.map((row) => row.kind)).toEqual(["block"]);
    const visible = rows[0];
    expect(visible?.kind === "block" && visible.block.id).toBe("assistant_1");
  });

  test("interleaves standalone run-less messages by conversation ordinal", () => {
    const rows = transcriptRenderRows({
      blocks: [
        userMessageBlock({
          id: "trigger",
          runId: "run_a",
          ordinal: 1,
          runAnchorOrdinal: 5,
          text: "go",
        }),
        assistantTextBlock({
          id: "answer",
          runId: "run_a",
          ordinal: 2,
          runAnchorOrdinal: 5,
          status: "complete",
          text: "done",
        }),
      ],
      messages: [chatMessage("msg_command", 3, "command", "", "Goal set: x")],
      queuedMessages: [],
    });

    expect(rows.map((row) => row.kind)).toEqual(["message", "block", "block"]);
    const standalone = rows[0];
    expect(standalone?.kind === "message" && standalone.message.id).toBe("msg_command");
  });

  test("flags a timestamp only at each speaker group boundary", () => {
    const rows = transcriptRenderRows({
      blocks: [
        userMessageBlock({ id: "user_1", runId: "run", ordinal: 1, text: "one" }),
        userMessageBlock({ id: "user_2", runId: "run", ordinal: 2, text: "two" }),
        assistantTextBlock({
          id: "assistant_1",
          runId: "run",
          ordinal: 3,
          status: "complete",
          text: "three",
        }),
        userMessageBlock({ id: "user_3", runId: "run", ordinal: 4, text: "four" }),
      ],
      messages: [],
      queuedMessages: [],
    });

    const timestamped = rows
      .filter((row) => row.kind === "block" && row.showTimestamp)
      .map((row) => (row.kind === "block" ? row.block.id : ""));
    expect(timestamped).toEqual(["user_2", "assistant_1", "user_3"]);
  });
});
