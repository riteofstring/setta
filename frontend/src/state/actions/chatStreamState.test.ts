import {
  type AssistantChatMessage,
  ChatRoleEnum,
  type ChatSectionState,
  StreamingEventTypeEnum,
  createMessageTextContent,
  createMessageThinkingContent,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import { applyStreamDeltaToChatSectionState } from "./chatStreamState";

function createAssistantMessage(
  id: string,
  content: AssistantChatMessage["content"] = [],
): AssistantChatMessage {
  return {
    id,
    role: ChatRoleEnum.assistant,
    content,
    attachments: [],
    tool_calls: null,
  };
}

function createChatSectionState(
  overrides: Partial<ChatSectionState> = {},
): ChatSectionState {
  return {
    messages: [],
    inputText: "",
    waitingForResponse: false,
    toolCallArguments: {},
    activeBranchId: null,
    branches: {},
    ...overrides,
  };
}

describe("chatStreamState", () => {
  it("applies text and thinking deltas while syncing the active branch", () => {
    const initialState = createChatSectionState({
      activeBranchId: "branch-1",
      branches: {
        "branch-1": {
          branchFromMessageId: null,
          createdAt: 1,
          parentBranchId: null,
          messages: [],
        },
      },
    });

    const started = applyStreamDeltaToChatSectionState(initialState, {
      type: StreamingEventTypeEnum.message_start,
      message: createAssistantMessage("msg-1"),
    });
    const updated = applyStreamDeltaToChatSectionState(started, {
      type: StreamingEventTypeEnum.delta,
      message_id: "msg-1",
      content: [
        { type: "text_delta", index: 0, text: "Hello" },
        {
          type: "thinking_delta",
          index: 1,
          thinking: "Reasoning",
          summary: "Summary",
          signature: "sig-1",
        },
      ],
    });

    expect(updated.messages).toHaveLength(1);
    expect(updated.messages?.[0]).toMatchObject({
      ...createAssistantMessage("msg-1", [
        createMessageTextContent({ text: "Hello" }),
        createMessageThinkingContent({
          thinking: "Reasoning",
          summary: "Summary",
          signature: "sig-1",
        }),
      ]),
      createdAt: expect.any(Number),
    });
    expect(updated.branches["branch-1"]?.messages).toEqual(updated.messages);
    expect(updated.waitingForResponse).toBe(true);
  });

  it("finalizes assistant placeholders, clears tool-call arguments, and keeps branches aligned", () => {
    const placeholderMessage = createAssistantMessage("rs_placeholder", [
      createMessageTextContent({ text: "Streaming answer" }),
    ]);
    const initialState = createChatSectionState({
      messages: [placeholderMessage],
      waitingForResponse: true,
      toolCallArguments: {
        "tool-1": '{"partial":true',
      },
      activeBranchId: "branch-1",
      branches: {
        "branch-1": {
          branchFromMessageId: null,
          createdAt: 1,
          parentBranchId: null,
          messages: [placeholderMessage],
        },
      },
    });

    const finalized = applyStreamDeltaToChatSectionState(initialState, {
      type: StreamingEventTypeEnum.message_finalized,
      message: createAssistantMessage("msg-final"),
    });

    expect(finalized.messages).toEqual([
      createAssistantMessage("msg-final", [
        createMessageTextContent({ text: "Streaming answer" }),
      ]),
    ]);
    expect(finalized.toolCallArguments).toEqual({});
    expect(finalized.waitingForResponse).toBe(false);
    expect(finalized.branches["branch-1"]?.messages).toEqual(
      finalized.messages,
    );
  });
});
