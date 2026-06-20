import type { ChatMessage, Run, TranscriptTurn } from "@generated/backend";
import { describe, expect, test } from "vitest";

import { timelineRowForMessage, transcriptTimelineRows } from "./chat-transcript-timeline";

describe("transcriptTimelineRows", () => {
  test("keeps virtual row indexes dense when turn message ordinals are sparse", () => {
    const firstUser = message("message_user_1", 1, "user", "run_1", "first prompt");
    const firstAssistant = message(
      "message_assistant_1",
      2,
      "assistant",
      "run_1",
      "first response",
    );
    const secondUser = message("message_user_2", 3, "user", "run_2", "second prompt");
    const secondAssistant = message(
      "message_assistant_2",
      4,
      "assistant",
      "run_2",
      "second response",
    );

    const rows = transcriptTimelineRows({
      messageIds: [firstUser.id, firstAssistant.id, secondUser.id, secondAssistant.id],
      messagesById: messagesById([firstUser, firstAssistant, secondUser, secondAssistant]),
      turns: [
        turn(run("run_1", firstUser.id, firstAssistant.id), firstUser, firstAssistant),
        turn(run("run_2", secondUser.id, secondAssistant.id), secondUser, secondAssistant),
      ],
    });

    expect(rows.map((row) => row.sortOrdinal)).toEqual([1, 3]);
    expect(rows.map((row) => row.index)).toEqual([0, 1]);
    expect(timelineRowForMessage(rows, secondUser.id)?.index).toBe(1);
    expect(timelineRowForMessage(rows, secondAssistant.id)?.index).toBe(1);
  });

  test("uses stable row keys for turn and standalone message anchors", () => {
    const user = message("message_user", 1, "user", "run_api", "prompt");
    const assistant = message("message_assistant", 2, "assistant", "run_api", "response");
    const command = message("message_command", 3, "command", "", "command result");

    const rows = transcriptTimelineRows({
      messageIds: [user.id, assistant.id, command.id],
      messagesById: messagesById([user, assistant, command]),
      turns: [turn(run("run_api", user.id, assistant.id), user, assistant)],
    });

    expect(rows.map((row) => row.key)).toEqual(["turn:run_api", "message:message_command"]);
  });
});

function messagesById(messages: ChatMessage[]) {
  return Object.fromEntries(messages.map((item) => [item.id, item]));
}

function turn(
  run: Run,
  triggerMessage: ChatMessage,
  assistantMessage: ChatMessage,
): TranscriptTurn {
  return {
    assistantMessage,
    run,
    steeringMessages: [],
    triggerMessage,
  };
}

function run(id: string, triggerMessageId: string, assistantMessageId: string): Run {
  return {
    assistantMessageId,
    completedAt: "2026-05-29T20:01:00Z",
    conversationId: "conversation_api",
    error: "",
    harness: "codex",
    id,
    pendingApproval: null,
    promptSummary: "prompt",
    schemaVersion: 1,
    startedAt: "2026-05-29T20:00:00Z",
    status: "completed",
    triggerMessageId,
    workspaceId: "workspace_api",
  };
}

function message(
  id: string,
  ordinal: number,
  role: ChatMessage["role"],
  runId: string,
  text: string,
): ChatMessage {
  return {
    conversationId: "conversation_api",
    createdAt: "2026-05-29T20:00:00Z",
    delivery: "normal",
    id,
    ordinal,
    parts: [{ format: "plain", id: `${id}_part`, text, type: "text" }],
    role,
    runId,
    schemaVersion: 1,
    status: "complete",
    updatedAt: "2026-05-29T20:00:00Z",
  };
}
