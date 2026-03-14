import { buildMessageBranchInfo } from "state/actions/aiBranches";
import { type ChatHistoryCompatibility } from "state/actions/chatHistory";
import { tokenizeConversationSearchQuery } from "utils/conversationSearch";
import {
  type AgentRun,
  type BaseChatMessageUnion,
  ChatRoleEnum,
  EngineTypeEnum,
} from "utils/generatedTypes";
import {
  buildProjectChatSubmittedMessageHistory,
  filterProjectConversationMessagesBySearch,
} from "./projectChatHistoryUtils";
import { resolveProjectChatRunTypeForEngine } from "./projectChatHydrationAuthority";

type ProjectChatBranchIndex = Parameters<
  typeof buildMessageBranchInfo
>[0]["branchIndex"];

export type ProjectChatConversationViewModel = ReturnType<
  typeof resolveProjectChatConversationViewModel
>;

export function resolveProjectChatConversationViewModel({
  chatId,
  messages,
  branchIndex,
  conversationFilterText,
  agentRuns,
  projectConfigId,
  engineType,
  engineConfigId,
}: {
  chatId: string | null | undefined;
  messages: Array<BaseChatMessageUnion>;
  branchIndex: ProjectChatBranchIndex;
  conversationFilterText: string;
  agentRuns: Array<AgentRun>;
  projectConfigId: string;
  engineType: EngineTypeEnum | null;
  engineConfigId: string | null;
}) {
  const showEmptyState =
    typeof chatId === "undefined" || (chatId === null && messages.length === 0);
  const normalizedConversationSearchTerms = tokenizeConversationSearchQuery(
    conversationFilterText,
  );
  const filteredConversationMessages =
    filterProjectConversationMessagesBySearch({
      messages,
      normalizedSearchTerms: normalizedConversationSearchTerms,
    });
  const hasVisibleConversationMatches = filteredConversationMessages.some(
    (message) => message.role !== ChatRoleEnum.tool,
  );
  const branchInfoByMessage =
    typeof chatId === "string"
      ? buildMessageBranchInfo({
          chatId,
          messages,
          branchIndex,
        })
      : {};
  const submittedMessageHistory = buildProjectChatSubmittedMessageHistory({
    runs: agentRuns,
    projectConfigId,
    activeMessages: messages,
  });
  const runType = resolveProjectChatRunTypeForEngine(engineType);
  const historyCompatibility: ChatHistoryCompatibility | null = runType
    ? {
        runType,
        engineConfigId: engineConfigId ?? null,
      }
    : null;

  return {
    showEmptyState,
    normalizedConversationSearchTerms,
    filteredConversationMessages,
    hasVisibleConversationMatches,
    branchInfoByMessage,
    submittedMessageHistory,
    historyCompatibility,
    isExternalEngine: engineType === EngineTypeEnum.external_agent,
  };
}
