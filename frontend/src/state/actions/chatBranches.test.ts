import { ChatRoleEnum, createMessageTextContent } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import { buildMessageBranchInfo } from "./aiBranches";
import { buildEditedMessageHistory } from "./chatBranchEditing";
import { buildBranchIndexFromBranches } from "./chatBranchIndexState";

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
});
