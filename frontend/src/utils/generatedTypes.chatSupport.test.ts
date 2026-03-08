import {
  ChatRoleEnum,
  type ChatSectionState,
  createAssistantChatMessage,
  createToolCall,
  createToolChatMessage,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";

describe("generated chat support", () => {
  it("creates canonical assistant and tool chat message defaults", () => {
    const assistant = createAssistantChatMessage({
      id: "assistant-1",
      tool_calls: [createToolCall({ id: "call-1" })],
    });
    const toolResult = createToolChatMessage({
      id: "tool-1",
      tool_call_id: "call-1",
    });

    expect(assistant.role).toBe(ChatRoleEnum.assistant);
    expect(assistant.attachments).toEqual([]);
    expect(assistant.tool_calls?.[0]?.type).toBe("function");
    expect(toolResult.role).toBe(ChatRoleEnum.tool);
    expect(toolResult.is_error).toBe(false);
    expect(toolResult.result).toBeNull();
  });

  it("exports chat section state with typed branch/message unions", () => {
    const state: ChatSectionState = {
      messages: [createAssistantChatMessage({ id: "assistant-1" })],
      inputText: "",
      waitingForResponse: true,
      toolCallArguments: { "call-1": "{}" },
      activeBranchId: "branch-1",
      branches: {
        "branch-1": {
          messages: [createAssistantChatMessage({ id: "assistant-1" })],
          createdAt: 1,
          parentBranchId: null,
          branchFromMessageId: null,
        },
      },
    };

    expect(state.branches["branch-1"]?.messages[0]?.role).toBe(
      ChatRoleEnum.assistant,
    );
    expect(state.waitingForResponse).toBe(true);
  });
});
