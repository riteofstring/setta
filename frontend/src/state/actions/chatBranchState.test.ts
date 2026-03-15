import {
  ChatRoleEnum,
  createMessageTextContent,
  type ChatSectionState,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";

import { buildBranchFromEdit } from "./chatBranchEditing";
import { ensureChatBranchState } from "./chatBranchState";

function createUserMessage(id: string, text: string) {
  return {
    id,
    role: ChatRoleEnum.user,
    content: [createMessageTextContent({ text })],
    attachments: [],
  };
}

describe("chatBranchState", () => {
  it("initializes a root branch when section state has no branches", () => {
    const messages = [createUserMessage("msg-1", "Original")];

    const result = ensureChatBranchState({
      messages,
      activeBranchId: null,
      branches: {},
    });

    const branchIds = Object.keys(result.nextState.branches ?? {});
    expect(result.didInitialize).toBe(true);
    expect(branchIds).toHaveLength(1);
    expect(result.nextState.activeBranchId).toBe(branchIds[0]);
    expect(result.nextState.messages).toEqual(messages);
  });

  it("merges more complete incoming messages into the active branch", () => {
    const partialAssistant = {
      id: "msg-2",
      role: ChatRoleEnum.assistant,
      content: [createMessageTextContent({ text: "Hi" })],
      attachments: [],
      tool_calls: null,
    };
    const completedAssistant = {
      ...partialAssistant,
      content: [createMessageTextContent({ text: "Hi there" })],
    };

    const result = ensureChatBranchState({
      activeBranchId: "root",
      messages: [createUserMessage("msg-1", "Hello"), completedAssistant],
      branches: {
        root: {
          messages: [createUserMessage("msg-1", "Hello"), partialAssistant],
          createdAt: 100,
          parentBranchId: null,
          branchFromMessageId: null,
        },
      },
    });

    expect(result.didInitialize).toBe(true);
    expect(result.nextState.messages).toEqual([
      createUserMessage("msg-1", "Hello"),
      completedAssistant,
    ]);
    expect(result.nextState.branches?.root?.messages).toEqual([
      createUserMessage("msg-1", "Hello"),
      completedAssistant,
    ]);
  });

  it("activates the earliest created branch when the active branch is missing", () => {
    const firstMessages = [createUserMessage("msg-1", "First")];
    const secondMessages = [createUserMessage("msg-2", "Second")];

    const result = ensureChatBranchState({
      activeBranchId: "missing",
      messages: [],
      branches: {
        later: {
          messages: secondMessages,
          createdAt: 200,
          parentBranchId: null,
          branchFromMessageId: null,
        },
        earlier: {
          messages: firstMessages,
          createdAt: 100,
          parentBranchId: null,
          branchFromMessageId: null,
        },
      },
    });

    expect(result.didInitialize).toBe(true);
    expect(result.nextState.activeBranchId).toBe("earlier");
    expect(result.nextState.messages).toEqual(firstMessages);
  });

  it("builds a child branch from an edited message on the active branch", () => {
    const original = createUserMessage("msg-1", "Original");
    const reply = {
      id: "msg-2",
      role: ChatRoleEnum.assistant,
      content: [createMessageTextContent({ text: "Reply" })],
      attachments: [],
      tool_calls: null,
    };
    const state: ChatSectionState = {
      activeBranchId: "root",
      messages: [original, reply],
      branches: {
        root: {
          messages: [original, reply],
          createdAt: 100,
          parentBranchId: null,
          branchFromMessageId: null,
        },
      },
    };

    const result = buildBranchFromEdit({
      state,
      editedMessage: createUserMessage("msg-1", "Edited"),
      branchFromMessageId: "msg-1",
      branchId: "child",
      createdAt: 200,
    });

    expect(result).not.toBeNull();
    expect(result?.newBranchId).toBe("child");
    expect(result?.nextState.activeBranchId).toBe("child");
    expect(result?.nextState.messages).toEqual([
      createUserMessage("msg-1", "Edited"),
    ]);
    expect(result?.nextState.branches?.child).toEqual({
      messages: [createUserMessage("msg-1", "Edited")],
      createdAt: 200,
      parentBranchId: "root",
      branchFromMessageId: "msg-1",
    });
  });
});
