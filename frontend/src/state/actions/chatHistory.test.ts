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
  sectionId,
  runType,
  engineConfigId,
  status,
}: {
  chatId: string;
  messageText: string;
  startedAt?: string;
  branchParentChatId?: string;
  branchFromMessageId?: string;
  outputName?: string;
  nameSource?: string;
  sectionId?: string;
  runType?: "llm_chat" | "external_agent" | "scriptable_chat";
  engineConfigId?: string | null;
  status?: AgentRunStatusEnum;
}): AgentRun {
  const timestamp = startedAt ?? "2024-01-01T00:00:00Z";
  return {
    id: `run-${chatId}-${messageText}`,
    profileId: null,
    status: status ?? AgentRunStatusEnum.completed,
    startedAt: timestamp,
    finishedAt: timestamp,
    inputs: {
      runType: runType ?? "llm_chat",
      chatId,
      branchParentChatId,
      branchFromMessageId,
      sectionId,
      engineConfigId,
      messages: [
        {
          id: `msg-${chatId}`,
          role: ChatRoleEnum.user,
          content: [createMessageTextContent({ text: messageText })],
          attachments: [],
        },
      ],
    },
    outputs: outputName || nameSource ? { name: outputName, nameSource } : null,
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

  it("accepts external title nameSource when present", () => {
    const runs = [
      buildRun({
        chatId: "root",
        messageText: "Root message",
        outputName: "External title",
        nameSource: "external",
      }),
    ];

    const entries = buildChatHistoryEntries(runs);
    expect(entries).toHaveLength(1);
    expect(entries[0].label).toBe("External title");
    expect(entries[0].nameSource).toBe("external");
  });

  it("strips a leading user prefix from output-provided thread titles", () => {
    const runs = [
      buildRun({
        chatId: "root",
        messageText: "Root message",
        outputName: "User: summarize this codebase",
        nameSource: "llm",
      }),
    ];

    const entries = buildChatHistoryEntries(runs);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.label).toBe("summarize this codebase");
    expect(entries[0]?.nameSource).toBe("llm");
  });

  it("strips a leading user prefix from fallback thread labels", () => {
    const runs = [
      buildRun({
        chatId: "root",
        messageText: "User: explain fastapi's use of it in detail",
      }),
    ];

    const entries = buildChatHistoryEntries(runs);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.label).toBe("explain fastapi's use of it in");
  });

  it("filters history entries by section id when requested", () => {
    const runs = [
      buildRun({
        chatId: "chat-a",
        messageText: "A",
        sectionId: "section-a",
      }),
      buildRun({
        chatId: "chat-b",
        messageText: "B",
        sectionId: "section-b",
      }),
    ];

    const sectionEntries = buildChatHistoryEntries(runs, {
      sectionId: "section-a",
    });

    expect(sectionEntries).toHaveLength(1);
    expect(sectionEntries[0]?.chatId).toBe("chat-a");
  });

  it("filters history entries to unscoped runs when requested", () => {
    const runs = [
      buildRun({
        chatId: "project-chat",
        messageText: "Project prompt",
      }),
      buildRun({
        chatId: "section-chat",
        messageText: "Section prompt",
        sectionId: "section-a",
      }),
    ];

    const unscopedEntries = buildChatHistoryEntries(runs, {
      unscopedOnly: true,
    });

    expect(unscopedEntries).toHaveLength(1);
    expect(unscopedEntries[0]?.chatId).toBe("project-chat");
  });

  it("exposes run metadata for each history entry", () => {
    const runs = [
      buildRun({
        chatId: "chat-a",
        messageText: "A",
        runType: "external_agent",
        engineConfigId: "engine-external",
      }),
    ];

    const entries = buildChatHistoryEntries(runs);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.runType).toBe("external_agent");
    expect(entries[0]?.engineConfigId).toBe("engine-external");
  });

  it("filters history entries to the selected run type and engine config", () => {
    const runs = [
      buildRun({
        chatId: "chat-match",
        messageText: "Match",
        runType: "llm_chat",
        engineConfigId: "engine-a",
      }),
      buildRun({
        chatId: "chat-wrong-engine",
        messageText: "Wrong engine",
        runType: "llm_chat",
        engineConfigId: "engine-b",
        startedAt: "2024-01-02T00:00:00Z",
      }),
      buildRun({
        chatId: "chat-wrong-type",
        messageText: "Wrong type",
        runType: "external_agent",
        engineConfigId: "engine-a",
        startedAt: "2024-01-03T00:00:00Z",
      }),
    ];

    const entries = buildChatHistoryEntries(runs, {
      compatibility: {
        runType: "llm_chat",
        engineConfigId: "engine-a",
      },
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]?.chatId).toBe("chat-match");
  });
});
