import { describe, expect, it } from "vitest";

import {
  applyFinalizedMessageToChatMessages,
  upsertMessage,
} from "./aiChatStreamingMessageUpserts";

import {
  createAssistantChatMessage,
  createMessageTextContent,
  createToolCall,
  createToolCallFunction,
  createUserChatMessage,
} from "utils/generatedTypes";

describe("aiChatStreamingMessageUpserts", () => {
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

  it("stamps a createdAt timestamp when a new non-tool message is inserted", () => {
    const userMessage = createUserChatMessage({
      id: "user-1",
      createdAt: 0,
      content: [createMessageTextContent({ text: "Hello" })],
      attachments: [],
    });

    const result = upsertMessage([], userMessage);

    expect(result[0]).toEqual(
      expect.objectContaining({
        id: "user-1",
        createdAt: expect.any(Number),
      }),
    );
    expect(result[0].createdAt).toBeGreaterThan(0);
  });
});
