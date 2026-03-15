import { describe, expect, it } from "vitest";

import { applyMessageDeltaToChatMessages } from "./aiChatStreamingMessageDeltas";

import {
  createMessageTextContent,
  type MessageDeltaEvent,
} from "utils/generatedTypes";

describe("aiChatStreamingMessageDeltas", () => {
  it("creates an assistant placeholder and applies text plus thinking deltas", () => {
    const chunk: MessageDeltaEvent = {
      type: "delta",
      message_id: "assistant-1",
      content: [
        { type: "text_delta", index: 0, text: "Hello" },
        {
          type: "thinking_delta",
          index: 1,
          thinking: "Plan",
          summary: "Summarized",
          signature: "sig-1",
        },
      ],
    };

    const result = applyMessageDeltaToChatMessages([], chunk);

    expect(result).toEqual([
      expect.objectContaining({
        id: "assistant-1",
        role: "assistant",
        content: [
          expect.objectContaining({ type: "text", text: "Hello" }),
          expect.objectContaining({
            type: "thinking",
            thinking: "Plan",
            summary: "Summarized",
            signature: "sig-1",
          }),
        ],
      }),
    ]);
  });

  it("appends text deltas into the last content slot when the delta index is missing", () => {
    const chunk: MessageDeltaEvent = {
      type: "delta",
      message_id: "assistant-2",
      content: [{ type: "text_delta", index: null, text: " there" }],
    };
    const existingMessages = [
      {
        id: "assistant-2",
        role: "assistant" as const,
        content: [createMessageTextContent({ text: "Hi" })],
        tool_calls: null,
        createdAt: 123,
        attachments: [],
      },
    ];

    const result = applyMessageDeltaToChatMessages(existingMessages, chunk);

    expect(result[0]).toEqual(
      expect.objectContaining({
        content: [expect.objectContaining({ text: "Hi there" })],
      }),
    );
  });
});
