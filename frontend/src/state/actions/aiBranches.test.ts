import {
  AgentRun,
  ChatRoleEnum,
  createMessageTextContent,
  RunStatusEnum,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import { buildChatBranchIndex, buildMessageBranchInfo } from "./aiBranches";

function buildRun({
  chatId,
  branchParentChatId,
  branchFromMessageId,
  branchRootChatId,
  branchCreatedAt,
  startedAt,
}: {
  chatId: string;
  branchParentChatId?: string;
  branchFromMessageId?: string;
  branchRootChatId?: string;
  branchCreatedAt?: number;
  startedAt?: string;
}): AgentRun {
  return {
    id: `run-${chatId}`,
    profileId: null,
    status: RunStatusEnum.completed,
    startedAt: startedAt ?? "2024-01-01T00:00:00Z",
    finishedAt: startedAt ?? "2024-01-01T00:00:01Z",
    inputs: {
      runType: "llm_chat",
      chatId,
      branchParentChatId,
      branchFromMessageId,
      branchRootChatId,
      branchCreatedAt,
    },
    outputs: null,
    toolCalls: [],
    cost: null,
    events: [],
  };
}

describe("aiBranches", () => {
  it("builds branch switcher info for parent and child chats", () => {
    const runs = [
      buildRun({ chatId: "parent" }),
      buildRun({
        chatId: "child-1",
        branchParentChatId: "parent",
        branchFromMessageId: "msg-1",
        branchCreatedAt: 100,
      }),
      buildRun({
        chatId: "child-2",
        branchParentChatId: "parent",
        branchFromMessageId: "msg-1",
        branchCreatedAt: 200,
      }),
    ];
    const index = buildChatBranchIndex(runs);
    const message = {
      id: "msg-1",
      role: ChatRoleEnum.user,
      content: [createMessageTextContent({ text: "Hello" })],
      attachments: [],
    };

    const parentInfo = buildMessageBranchInfo({
      chatId: "parent",
      messages: [message],
      branchIndex: index,
    });
    expect(parentInfo["msg-1"]).toEqual({
      messageId: "msg-1",
      branchChatIds: ["parent", "child-1", "child-2"],
      activeIndex: 0,
    });

    const childInfo = buildMessageBranchInfo({
      chatId: "child-1",
      messages: [message],
      branchIndex: index,
    });
    expect(childInfo["msg-1"]?.branchChatIds).toEqual([
      "parent",
      "child-1",
      "child-2",
    ]);
    expect(childInfo["msg-1"]?.activeIndex).toBe(1);
  });

  it("includes nested branches that share a branch root", () => {
    const runs = [
      buildRun({ chatId: "root" }),
      buildRun({
        chatId: "branch-1",
        branchParentChatId: "root",
        branchFromMessageId: "msg-1",
        branchRootChatId: "root",
        branchCreatedAt: 100,
      }),
      buildRun({
        chatId: "branch-2",
        branchParentChatId: "branch-1",
        branchFromMessageId: "msg-1",
        branchRootChatId: "root",
        branchCreatedAt: 200,
      }),
    ];
    const index = buildChatBranchIndex(runs);
    const message = {
      id: "msg-1",
      role: ChatRoleEnum.user,
      content: [createMessageTextContent({ text: "Hello" })],
      attachments: [],
    };

    const rootInfo = buildMessageBranchInfo({
      chatId: "root",
      messages: [message],
      branchIndex: index,
    });
    expect(rootInfo["msg-1"]).toEqual({
      messageId: "msg-1",
      branchChatIds: ["root", "branch-1", "branch-2"],
      activeIndex: 0,
    });

    const branchInfo = buildMessageBranchInfo({
      chatId: "branch-2",
      messages: [message],
      branchIndex: index,
    });
    expect(branchInfo["msg-1"]).toEqual({
      messageId: "msg-1",
      branchChatIds: ["root", "branch-1", "branch-2"],
      activeIndex: 2,
    });
  });

  it("keeps ancestor branch switchers visible in nested branches", () => {
    const runs = [
      buildRun({ chatId: "root" }),
      buildRun({
        chatId: "branch-1",
        branchParentChatId: "root",
        branchFromMessageId: "msg-1",
        branchRootChatId: "root",
        branchCreatedAt: 100,
      }),
      buildRun({
        chatId: "branch-2",
        branchParentChatId: "root",
        branchFromMessageId: "msg-1",
        branchRootChatId: "root",
        branchCreatedAt: 200,
      }),
      buildRun({
        chatId: "branch-3",
        branchParentChatId: "branch-1",
        branchFromMessageId: "msg-2",
        branchRootChatId: "branch-1",
        branchCreatedAt: 300,
      }),
    ];
    const index = buildChatBranchIndex(runs);
    const messages = [
      {
        id: "msg-1",
        role: ChatRoleEnum.user,
        content: [createMessageTextContent({ text: "First" })],
        attachments: [],
      },
      {
        id: "msg-2",
        role: ChatRoleEnum.user,
        content: [createMessageTextContent({ text: "Second" })],
        attachments: [],
      },
    ];

    const branchInfo = buildMessageBranchInfo({
      chatId: "branch-3",
      messages,
      branchIndex: index,
    });

    expect(branchInfo["msg-1"]).toEqual({
      messageId: "msg-1",
      branchChatIds: ["root", "branch-1", "branch-2"],
      activeIndex: 1,
    });
    expect(branchInfo["msg-2"]).toEqual({
      messageId: "msg-2",
      branchChatIds: ["branch-1", "branch-3"],
      activeIndex: 1,
    });
  });
});
