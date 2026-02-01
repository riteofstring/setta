import { describe, expect, it } from "vitest";
import {
  AgentRun,
  AgentRunStatusEnum,
  ChatRoleEnum,
  createMessageTextContent,
} from "utils/generatedTypes";
import { buildChatBranchIndex, buildMessageBranchInfo } from "./aiBranches";

function buildRun({
  chatId,
  branchParentChatId,
  branchFromMessageId,
  branchCreatedAt,
  startedAt,
}: {
  chatId: string;
  branchParentChatId?: string;
  branchFromMessageId?: string;
  branchCreatedAt?: number;
  startedAt?: string;
}): AgentRun {
  return {
    id: `run-${chatId}`,
    profileId: null,
    status: AgentRunStatusEnum.completed,
    startedAt: startedAt ?? "2024-01-01T00:00:00Z",
    finishedAt: startedAt ?? "2024-01-01T00:00:01Z",
    inputs: {
      runType: "llm_chat",
      chatId,
      branchParentChatId,
      branchFromMessageId,
      branchCreatedAt,
    },
    outputs: null,
    toolCalls: [],
    cost: null,
    events: [],
  };
}

describe("aiBranches", () => {
  it("indexes branches and orders children by createdAt", () => {
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
    const children = index.branchChildrenByChatId.parent?.["msg-1"] ?? [];
    expect(children).toEqual(["child-1", "child-2"]);
  });

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
});
