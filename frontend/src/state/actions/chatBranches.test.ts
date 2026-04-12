import { ChatRoleEnum, createMessageTextContent } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import { buildMessageBranchInfo } from "./aiBranches";
import {
  buildBranchIndexFromBranches,
  buildEditedMessageHistory,
  ensureChatBranchState,
} from "./chatBranches";

describe("chatBranches", () => {
  it("truncates history and replaces edited message", () => {
    const messages = [
      {
        id: "msg-1",
        role: ChatRoleEnum.user,
        content: [createMessageTextContent({ text: "Original" })],
        attachments: [],
      },
      {
        id: "msg-2",
        role: ChatRoleEnum.assistant,
        content: [createMessageTextContent({ text: "Reply" })],
        attachments: [],
        tool_calls: null,
      },
    ];
    const edited = {
      id: "msg-1",
      role: ChatRoleEnum.user,
      content: [createMessageTextContent({ text: "Edited" })],
      attachments: [],
    };

    const result = buildEditedMessageHistory(messages, edited);

    expect(result).not.toBeNull();
    expect(result).toHaveLength(1);
    if (!result) {
      return;
    }
    const first = result[0];
    if (first.content?.[0]?.type === "text") {
      expect(first.content[0].text).toBe("Edited");
    }
  });

  it("returns null when edited message id is missing", () => {
    const messages = [
      {
        id: "msg-1",
        role: ChatRoleEnum.user,
        content: [createMessageTextContent({ text: "Original" })],
        attachments: [],
      },
    ];
    const edited = {
      id: "missing",
      role: ChatRoleEnum.user,
      content: [createMessageTextContent({ text: "Edited" })],
      attachments: [],
    };

    const result = buildEditedMessageHistory(messages, edited);

    expect(result).toBeNull();
  });

  it("keeps ancestor branch switchers visible for nested section branches", () => {
    const msg1 = {
      id: "msg-1",
      role: ChatRoleEnum.user,
      content: [createMessageTextContent({ text: "Original 1" })],
      attachments: [],
    };
    const msg2 = {
      id: "msg-2",
      role: ChatRoleEnum.user,
      content: [createMessageTextContent({ text: "Original 2" })],
      attachments: [],
    };
    const branches = {
      root: {
        messages: [msg1],
        createdAt: 100,
        parentBranchId: null,
        branchFromMessageId: null,
      },
      child: {
        messages: [
          {
            ...msg1,
            content: [createMessageTextContent({ text: "Edited 1" })],
          },
          msg2,
        ],
        createdAt: 200,
        parentBranchId: "root",
        branchFromMessageId: "msg-1",
      },
      grand: {
        messages: [
          {
            ...msg1,
            content: [createMessageTextContent({ text: "Edited 1" })],
          },
          {
            ...msg2,
            content: [createMessageTextContent({ text: "Edited 2" })],
          },
        ],
        createdAt: 300,
        parentBranchId: "child",
        branchFromMessageId: "msg-2",
      },
    };

    const index = buildBranchIndexFromBranches(branches);
    const info = buildMessageBranchInfo({
      chatId: "grand",
      messages: branches.grand.messages,
      branchIndex: index,
    });

    expect(info["msg-1"]).toEqual({
      messageId: "msg-1",
      branchChatIds: ["root", "child"],
      activeIndex: 1,
    });
    expect(info["msg-2"]).toEqual({
      messageId: "msg-2",
      branchChatIds: ["child", "grand"],
      activeIndex: 1,
    });
  });

  it("syncs the active branch to the authoritative source messages", () => {
    const result = ensureChatBranchState({
      messages: [
        {
          id: "assistant-1",
          role: ChatRoleEnum.assistant,
          content: [createMessageTextContent({ text: "Backend canonical" })],
          attachments: [],
          tool_calls: null,
        },
      ],
      inputText: "",
      waitingForResponse: true,
      toolCallArguments: { remote: "{}" },
      activeBranchId: "branch-active",
      branches: {
        "branch-active": {
          messages: [
            {
              id: "assistant-1",
              role: ChatRoleEnum.assistant,
              createdAt: 1234,
              content: [
                createMessageTextContent({
                  text: "Local speculative branch copy with longer text",
                }),
              ],
              attachments: [],
              tool_calls: null,
            },
            {
              id: "assistant-local-only",
              role: ChatRoleEnum.assistant,
              content: [createMessageTextContent({ text: "Local only" })],
              attachments: [],
              tool_calls: null,
            },
          ],
          createdAt: 42,
          parentBranchId: null,
          branchFromMessageId: null,
        },
      },
    });

    expect(result.didInitialize).toBe(true);
    expect(result.nextState.messages).toEqual([
      {
        id: "assistant-1",
        role: ChatRoleEnum.assistant,
        createdAt: 1234,
        content: [createMessageTextContent({ text: "Backend canonical" })],
        attachments: [],
        tool_calls: null,
      },
    ]);
    expect(result.nextState.branches?.["branch-active"]?.messages).toEqual([
      {
        id: "assistant-1",
        role: ChatRoleEnum.assistant,
        createdAt: 1234,
        content: [createMessageTextContent({ text: "Backend canonical" })],
        attachments: [],
        tool_calls: null,
      },
    ]);
  });

  it("creates a root branch when the chat has no branch state yet", () => {
    const sourceMessages = [
      {
        id: "user-1",
        role: ChatRoleEnum.user,
        content: [createMessageTextContent({ text: "Seed message" })],
        attachments: [],
      },
    ];

    const result = ensureChatBranchState({
      messages: sourceMessages,
      inputText: "",
      waitingForResponse: false,
      toolCallArguments: {},
    });

    expect(result.didInitialize).toBe(true);
    const branchIds = Object.keys(result.nextState.branches ?? {});
    expect(branchIds).toHaveLength(1);
    expect(result.nextState.activeBranchId).toBe(branchIds[0]);
    expect(result.nextState.messages).toEqual(sourceMessages);
    expect(result.nextState.branches?.[branchIds[0]]).toEqual({
      messages: sourceMessages,
      createdAt: expect.any(Number),
      parentBranchId: null,
      branchFromMessageId: null,
    });
  });

  it("falls back to the oldest branch when the active branch id is missing", () => {
    const oldestBranchMessage = {
      id: "assistant-oldest",
      role: ChatRoleEnum.assistant,
      content: [createMessageTextContent({ text: "Oldest branch" })],
      attachments: [],
      tool_calls: null,
    };
    const newestBranchMessage = {
      id: "assistant-newest",
      role: ChatRoleEnum.assistant,
      content: [createMessageTextContent({ text: "Newest branch" })],
      attachments: [],
      tool_calls: null,
    };

    const result = ensureChatBranchState({
      messages: [],
      inputText: "",
      waitingForResponse: false,
      toolCallArguments: {},
      activeBranchId: "missing",
      branches: {
        newest: {
          messages: [newestBranchMessage],
          createdAt: 20,
          parentBranchId: null,
          branchFromMessageId: null,
        },
        oldest: {
          messages: [oldestBranchMessage],
          createdAt: 10,
          parentBranchId: null,
          branchFromMessageId: null,
        },
      },
    });

    expect(result.didInitialize).toBe(true);
    expect(result.nextState.activeBranchId).toBe("oldest");
    expect(result.nextState.messages).toEqual([oldestBranchMessage]);
  });
});
