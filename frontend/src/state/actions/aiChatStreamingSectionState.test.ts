import { describe, expect, it } from "vitest";

import { applyStreamDeltaToChatSectionState } from "./aiChatStreamingSectionState";

import {
  ChatRoleEnum,
  StreamingEventTypeEnum,
  createAssistantChatMessage,
  createMessageTextContent,
  createToolCall,
  createToolCallFunction,
  type ChatSectionState,
  type MessageFinalizedEvent,
} from "utils/generatedTypes";

describe("ai chat streaming section state", () => {
  it("syncs finalized assistant messages into the active branch and clears tool arguments", () => {
    const initialAssistant = createAssistantChatMessage({
      id: "resp_placeholder_1",
      createdAt: 50,
      content: [createMessageTextContent({ text: "Draft output" })],
      attachments: [],
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
    const state: ChatSectionState = {
      messages: [initialAssistant],
      inputText: "",
      waitingForResponse: true,
      toolCallArguments: { "tool-1": '{"step":1}' },
      activeBranchId: "branch-1",
      branches: {
        "branch-1": {
          createdAt: 10,
          parentBranchId: null,
          branchFromMessageId: null,
          messages: [initialAssistant],
        },
      },
    };
    const finalizedChunk: MessageFinalizedEvent = {
      type: StreamingEventTypeEnum.MESSAGE_FINALIZED,
      message: {
        id: "assistant-final-1",
        role: ChatRoleEnum.assistant,
        createdAt: 0,
        content: [],
        attachments: [],
        tool_calls: null,
      },
    };

    const result = applyStreamDeltaToChatSectionState(state, finalizedChunk);

    expect(result.waitingForResponse).toBe(false);
    expect(result.toolCallArguments).toEqual({});
    expect(result.messages).toEqual([
      expect.objectContaining({
        id: "assistant-final-1",
        createdAt: 50,
        content: [expect.objectContaining({ text: "Draft output" })],
        tool_calls: [
          expect.objectContaining({
            id: "tool-1",
            function: expect.objectContaining({ name: "setta__draft" }),
          }),
        ],
      }),
    ]);
    expect(result.branches["branch-1"]?.messages).toEqual(result.messages);
  });
});
