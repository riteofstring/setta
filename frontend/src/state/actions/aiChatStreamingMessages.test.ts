import { describe, expect, it } from "vitest";

import {
  applyFinalizedMessageToChatMessages,
  applyMessageDeltaToChatMessages,
} from "./aiChatStreamingMessages";

import {
  createAssistantChatMessage,
  createMessageTextContent,
  createToolCall,
  createToolCallFunction,
  type MessageDeltaEvent,
} from "utils/generatedTypes";

describe("ai chat streaming messages", () => {
  it("merges a finalized assistant message into the streamed placeholder", () => {
    const streamedPlaceholder = createAssistantChatMessage({
      id: "resp_placeholder_1",
      createdAt: 123,
      content: [createMessageTextContent({ text: "Streaming content" })],
      attachments: [
        { id: "file-1", name: "notes.md", mimeType: null, size: 4 },
      ],
      tool_calls: [
        createToolCall({
          id: "tool-1",
          function: createToolCallFunction({
            name: "setta__draft",
            arguments: { step: 1 },
          }),
        }),
      ],
    });
    const finalized = createAssistantChatMessage({
      id: "assistant-final-1",
      createdAt: 0,
      content: [],
      attachments: [],
      tool_calls: null,
    });

    const result = applyFinalizedMessageToChatMessages(
      [streamedPlaceholder],
      finalized,
    );

    expect(result.targetId).toBe("resp_placeholder_1");
    expect(result.messages).toEqual([
      expect.objectContaining({
        id: "assistant-final-1",
        createdAt: 123,
        content: [expect.objectContaining({ text: "Streaming content" })],
        attachments: [expect.objectContaining({ id: "file-1" })],
        tool_calls: [
          expect.objectContaining({
            id: "tool-1",
            function: expect.objectContaining({ name: "setta__draft" }),
          }),
        ],
      }),
    ]);
  });

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
});
