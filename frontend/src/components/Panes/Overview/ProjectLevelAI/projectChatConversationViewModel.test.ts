import { buildChatBranchIndex } from "state/actions/aiBranches";
import {
  AgentRunStatusEnum,
  createAgentRun,
  createMessageTextContent,
  createToolChatMessage,
  createUserChatMessage,
  EngineTypeEnum,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import { resolveProjectChatConversationViewModel } from "./projectChatConversationViewModel";

describe("projectChatConversationViewModel", () => {
  it("treats missing chat identity with no messages as an empty state", () => {
    const viewModel = resolveProjectChatConversationViewModel({
      chatId: undefined,
      messages: [],
      branchIndex: buildChatBranchIndex([]),
      conversationFilterText: "",
      agentRuns: [],
      projectConfigId: "project-1",
      engineType: null,
      engineConfigId: null,
    });

    expect(viewModel.showEmptyState).toBe(true);
    expect(viewModel.historyCompatibility).toBeNull();
    expect(viewModel.branchInfoByMessage).toEqual({});
    expect(viewModel.submittedMessageHistory).toEqual([]);
  });

  it("derives filtered messages, branch info, history compatibility, and submitted prompt history", () => {
    const activeMessage = createUserChatMessage({
      id: "message-1",
      content: [createMessageTextContent({ text: "Alpha feature request" })],
      attachments: [],
    });
    const filteredOutToolMessage = createToolChatMessage({
      id: "tool-1",
      tool_call_id: "tool-call-1",
      content: [createMessageTextContent({ text: "Tool output" })],
      attachments: [],
    });
    const runs = [
      createAgentRun({
        id: "run-chat-1",
        status: AgentRunStatusEnum.completed,
        startedAt: "2025-01-02T00:00:00Z",
        finishedAt: "2025-01-02T00:00:01Z",
        inputs: {
          runType: "external_agent",
          chatId: "chat-1",
          projectConfigId: "project-1",
          sectionId: null,
        },
        outputs: {
          messages: [
            createUserChatMessage({
              content: [createMessageTextContent({ text: "Earlier prompt" })],
              attachments: [],
            }),
          ],
        },
      }),
      createAgentRun({
        id: "run-chat-2",
        status: AgentRunStatusEnum.completed,
        startedAt: "2025-01-03T00:00:00Z",
        finishedAt: "2025-01-03T00:00:01Z",
        inputs: {
          runType: "external_agent",
          chatId: "chat-2",
          projectConfigId: "project-1",
          branchParentChatId: "chat-1",
          branchFromMessageId: "message-1",
          branchCreatedAt: 100,
          sectionId: null,
        },
        outputs: {
          messages: [],
        },
      }),
    ];

    const viewModel = resolveProjectChatConversationViewModel({
      chatId: "chat-1",
      messages: [activeMessage, filteredOutToolMessage],
      branchIndex: buildChatBranchIndex(runs),
      conversationFilterText: "Alpha",
      agentRuns: runs,
      projectConfigId: "project-1",
      engineType: EngineTypeEnum.external_agent,
      engineConfigId: "engine-1",
    });

    expect(viewModel.showEmptyState).toBe(false);
    expect(viewModel.normalizedConversationSearchTerms).toEqual(["alpha"]);
    expect(viewModel.filteredConversationMessages).toEqual([activeMessage]);
    expect(viewModel.hasVisibleConversationMatches).toBe(true);
    expect(viewModel.submittedMessageHistory).toEqual([
      "Alpha feature request",
      "Earlier prompt",
    ]);
    expect(viewModel.historyCompatibility).toEqual({
      runType: "external_agent",
      engineConfigId: "engine-1",
    });
    expect(viewModel.isExternalEngine).toBe(true);
    expect(Object.keys(viewModel.branchInfoByMessage)).toEqual(["message-1"]);
  });
});
