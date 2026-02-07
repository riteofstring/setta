import {
  AgentRun,
  AgentRunStatusEnum,
  ChatRoleEnum,
  createMessageTextContent,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import { buildChatHistoryEntries } from "./chatHistory";

function buildRun({
  chatId,
  messageText,
  startedAt,
  branchParentChatId,
  branchFromMessageId,
  outputName,
  nameSource,
}: {
  chatId: string;
  messageText: string;
  startedAt?: string;
  branchParentChatId?: string;
  branchFromMessageId?: string;
  outputName?: string;
  nameSource?: string;
}): AgentRun {
  const timestamp = startedAt ?? "2024-01-01T00:00:00Z";
  return {
    id: `run-${chatId}-${messageText}`,
    profileId: null,
    status: AgentRunStatusEnum.completed,
    startedAt: timestamp,
    finishedAt: timestamp,
    inputs: {
      runType: "llm_chat",
      chatId,
      branchParentChatId,
      branchFromMessageId,
      messages: [
        {
          id: `msg-${chatId}`,
          role: ChatRoleEnum.user,
          content: [createMessageTextContent({ text: messageText })],
          attachments: [],
        },
      ],
    },
    outputs:
      outputName || nameSource ? { name: outputName, nameSource } : null,
    toolCalls: [],
    cost: null,
    events: [],
  };
}

describe("chatHistory", () => {
  it("excludes branch chats even if later runs omit branch metadata", () => {
    const runs = [
      buildRun({ chatId: "root", messageText: "Root message" }),
      buildRun({
        chatId: "branch",
        messageText: "Branch message",
        branchParentChatId: "root",
        branchFromMessageId: "msg-root",
      }),
      buildRun({
        chatId: "branch",
        messageText: "Branch follow-up",
        startedAt: "2024-01-02T00:00:00Z",
      }),
    ];

    const entries = buildChatHistoryEntries(runs);
    expect(entries.map((entry) => entry.chatId)).toEqual(["root"]);
  });

  it("propagates title nameSource when present", () => {
    const runs = [
      buildRun({
        chatId: "root",
        messageText: "Root message",
        outputName: "Example title",
        nameSource: "llm",
      }),
    ];

    const entries = buildChatHistoryEntries(runs);
    expect(entries).toHaveLength(1);
    expect(entries[0].label).toBe("Example title");
    expect(entries[0].nameSource).toBe("llm");
  });
});
