import type { ChatMessage } from "@generated/backend";
import { describe, expect, test } from "vitest";

import { transcriptSearchMatches } from "./chat-transcript-search";

describe("transcript search", () => {
  test("matches visible message text case-insensitively", () => {
    const matches = transcriptSearchMatches(
      [
        message("message_user", "normal", "Find this"),
        undefined,
        message("message_goal", "goal", "Find hidden goal"),
        message("message_assistant", "normal", "also find this"),
      ],
      " FIND ",
    );

    expect(matches.map((match) => match.messageId)).toEqual(["message_user", "message_assistant"]);
  });
});

function message(id: string, delivery: ChatMessage["delivery"], text: string): ChatMessage {
  return {
    conversationId: "conversation_api",
    createdAt: "2026-05-29T20:00:00Z",
    delivery,
    id,
    ordinal: 1,
    parts: [{ format: "plain", id: `${id}_part`, text, type: "text" }],
    role: "user",
    runId: "",
    schemaVersion: 1,
    status: "complete",
    updatedAt: "2026-05-29T20:00:00Z",
  };
}
