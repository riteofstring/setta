import { waitForFrontendAffinityToken } from "state/actions/frontendWebsocketAffinity";
import { addTemporaryNotification } from "state/actions/notifications";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrProjectConfigId,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import { useAIStore } from "state/definitions";
import {
  normalizeChatAppGenerationContext,
  retainChatAppGenerationDetailsForMessages,
  serializeChatAppGenerationByMessageId,
  setChatAppGenerationForMessage,
  type ChatAppGenerationContext,
} from "state/utils/chatAppGeneration";
import { getErrorDetail, res200 } from "utils/endpointUtils";
import {
  route_get_llm_response,
  route_set_chat_section_chat_id,
} from "utils/generatedEndpoints";
import {
  AgentRun,
  BaseChatMessageUnion,
  ChatFileAttachment,
  ChatPermissionMode,
  ChatPermissionModeEnum,
  ChatRoleEnum,
  SettaNotificationTypeEnum,
  createMessageTextContent,
} from "utils/generatedTypes";
import { createNewId } from "utils/idNameCreation";
import { getRunInputString, getRunLastUpdatedMs } from "./agentRunUtils";
import { loadAgentRuns, refreshAgentRunsAfterSubmit } from "./aiAgentRuns";
import { requirePendingChatSurfaceId } from "./aiChatState";
import { getExternalAgentChat, getLLMChat } from "./aiHydration";
import {
  applyOptimisticUserMessage,
  clearPendingChatDetails,
  commitPendingChatDetails,
  finalizePendingChatDetails,
  getChatAppGenerationDetailsForTarget,
  initializePendingChatDetails,
  initializePendingChatDetailsWithMessages,
  rollbackOptimisticUserMessage,
  seedPendingChatDetails,
} from "./aiPendingChatState";
import { buildEditedMessageHistory } from "./chatBranches";

type ChatExecutionSettings = {
  permissionMode: ChatPermissionMode;
  searchEnabled: boolean;
};

const DEFAULT_CHAT_EXECUTION_SETTINGS: ChatExecutionSettings = {
  permissionMode: ChatPermissionModeEnum.minimal,
  searchEnabled: true,
};

export {
  clearPendingChatDetails,
  finalizePendingChatDetails,
  initializePendingChatDetails,
  seedPendingChatDetails,
};

export async function submitMessage(
  chatId: string | null,
  message: string,
  attachments: ChatFileAttachment[],
  thinking: boolean,
  engineConfigId: string,
  isExternalEngine: boolean,
  options: {
    messageId?: string;
    agentProfileId?: string | null;
    sectionId?: string | null;
    continueFromChatId?: string | null;
    pendingSurfaceId?: string | null;
    executionSettings?: ChatExecutionSettings | null;
    appGeneration?: ChatAppGenerationContext | null;
  } = {},
): Promise<string | null> {
  const trimmed = message.trim();
  if ((!trimmed && attachments.length === 0) || !engineConfigId) {
    return null;
  }
  const resolvedPendingSurfaceId =
    chatId === null
      ? requirePendingChatSurfaceId(options.pendingSurfaceId ?? null)
      : options.pendingSurfaceId ?? null;
  const resolvedExecutionSettings =
    options.executionSettings ?? DEFAULT_CHAT_EXECUTION_SETTINGS;
  const appGeneration = normalizeChatAppGenerationContext(
    options.appGeneration ?? null,
  );
  const existingAppGenerationDetails = getChatAppGenerationDetailsForTarget(
    useAIStore.getState(),
    chatId,
    resolvedPendingSurfaceId,
  );

  const content = [];
  if (trimmed) {
    content.push(createMessageTextContent({ text: message }));
  }
  const userMessage = {
    id: options.messageId ?? createNewId(),
    role: ChatRoleEnum.user,
    content,
    attachments,
    createdAt: Date.now(),
  };
  const userMessageId = userMessage.id;
  const nextMessages =
    chatId === null
      ? [
          ...(useAIStore.getState().pendingChatDetailsBySurfaceId[
            resolvedPendingSurfaceId
          ]?.messages ?? []),
          userMessage,
        ]
      : [
          ...(useAIStore.getState().chatDetails[chatId]?.messages ?? []),
          userMessage,
        ];
  const nextAppGenerationDetails = setChatAppGenerationForMessage(
    existingAppGenerationDetails,
    nextMessages,
    userMessage.id,
    appGeneration,
  );

  applyOptimisticUserMessage(
    chatId,
    userMessage,
    resolvedPendingSurfaceId,
    appGeneration,
  );

  try {
    const projectConfigId = getCurrProjectConfigId();
    const frontendAffinityToken = await waitForFrontendAffinityToken();
    const appGenerationMode = appGeneration?.mode ?? null;
    const res = await route_get_llm_response({
      message: userMessage,
      thinking,
      chatId,
      continueFromChatId: options.continueFromChatId ?? null,
      engineConfigId,
      agentProfileId: options.agentProfileId ?? null,
      appGenerationMode,
      appGenerationByMessageId: serializeChatAppGenerationByMessageId(
        nextAppGenerationDetails,
      ),
      projectConfigId,
      sectionId: options.sectionId ?? null,
      frontendAffinityToken,
      allowUnscoped: options.sectionId == null,
      permissionMode: resolvedExecutionSettings.permissionMode,
      searchEnabled: resolvedExecutionSettings.searchEnabled,
    });
    if (res200(res)) {
      const returnedChatId = res.data.chatId;
      if (returnedChatId) {
        refreshAgentRunsAfterSubmit();
        if (isExternalEngine) {
          await getExternalAgentChat(
            returnedChatId,
            projectConfigId,
            options.sectionId ?? undefined,
          );
        } else {
          await getLLMChat(returnedChatId, options.sectionId ?? undefined);
        }
      }
      return returnedChatId;
    }
    const failureDetail =
      getErrorDetail(res.data) ??
      (typeof res.status === "number"
        ? `Chat request failed (status ${res.status}).`
        : "Chat request failed.");
    throw new Error(failureDetail);
  } catch (err) {
    const detail =
      err instanceof Error && err.message.trim()
        ? err.message
        : "AI request failed.";
    addTemporaryNotification(detail, SettaNotificationTypeEnum.warning);
    rollbackOptimisticUserMessage(
      chatId,
      userMessageId,
      resolvedPendingSurfaceId,
    );
    throw err;
  }
}

export async function submitEditedMessage({
  parentChatId,
  messages,
  messageId,
  message,
  attachments,
  thinking,
  engineConfigId,
  isExternalEngine,
  agentProfileId,
  sectionId,
  pendingSurfaceId,
  executionSettings,
  appGeneration,
}: {
  parentChatId: string;
  messages: Array<BaseChatMessageUnion>;
  messageId: string;
  message: string;
  attachments: ChatFileAttachment[];
  thinking: boolean;
  engineConfigId: string | null;
  isExternalEngine: boolean;
  agentProfileId?: string | null;
  sectionId?: string | null;
  pendingSurfaceId?: string | null;
  executionSettings?: ChatExecutionSettings | null;
  appGeneration?: ChatAppGenerationContext | null;
}): Promise<string | null> {
  const trimmed = message.trim();
  if (!trimmed && attachments.length === 0) {
    return null;
  }
  const resolvedExecutionSettings =
    executionSettings ?? DEFAULT_CHAT_EXECUTION_SETTINGS;
  const resolvedAppGeneration = normalizeChatAppGenerationContext(
    appGeneration ?? null,
  );

  const content = [];
  if (trimmed) {
    content.push(createMessageTextContent({ text: message }));
  }
  const editedMessage = {
    id: messageId,
    role: ChatRoleEnum.user,
    content,
    attachments,
    createdAt: Date.now(),
  };
  const nextMessages = buildEditedMessageHistory(messages, editedMessage);
  if (!nextMessages) {
    return null;
  }
  const resolvedPendingSurfaceId = requirePendingChatSurfaceId(
    pendingSurfaceId ?? null,
  );
  const parentAppGenerationDetails = getChatAppGenerationDetailsForTarget(
    useAIStore.getState(),
    parentChatId,
    null,
  );
  const nextAppGenerationDetails = setChatAppGenerationForMessage(
    retainChatAppGenerationDetailsForMessages(
      parentAppGenerationDetails,
      nextMessages,
    ),
    nextMessages,
    messageId,
    resolvedAppGeneration,
  );
  const resolvedEngineConfigId = await resolveEngineConfigIdForChat(
    parentChatId,
    engineConfigId,
  );
  if (!resolvedEngineConfigId) {
    return null;
  }
  initializePendingChatDetailsWithMessages(
    nextMessages,
    true,
    resolvedPendingSurfaceId,
    nextAppGenerationDetails,
  );
  const projectConfigId = getCurrProjectConfigId();

  const setSectionChatId = async (nextChatId: string | null) => {
    if (!sectionId) {
      return;
    }
    dispatchOptimisticProjectStateUpdate({
      apply: (state) => {
        setCurrEffectiveSectionImplValue<"ChatSection">(state, sectionId, {
          chatId: nextChatId,
        });
      },
      send: () =>
        route_set_chat_section_chat_id({
          projectConfigId,
          sectionId,
          chatId: nextChatId,
        }),
    });
  };

  if (sectionId) {
    await setSectionChatId(null);
  }

  try {
    const frontendAffinityToken = await waitForFrontendAffinityToken();
    const res = await route_get_llm_response({
      message: editedMessage,
      thinking,
      chatId: null,
      engineConfigId: resolvedEngineConfigId,
      agentProfileId: agentProfileId ?? null,
      projectConfigId,
      sectionId: sectionId ?? null,
      frontendAffinityToken,
      allowUnscoped: sectionId == null,
      branchParentChatId: parentChatId,
      branchFromMessageId: messageId,
      appGenerationMode: resolvedAppGeneration?.mode ?? null,
      appGenerationByMessageId: serializeChatAppGenerationByMessageId(
        nextAppGenerationDetails,
      ),
      permissionMode: resolvedExecutionSettings.permissionMode,
      searchEnabled: resolvedExecutionSettings.searchEnabled,
    });
    if (!res200(res)) {
      const detail =
        getErrorDetail(res.data) ??
        (res.status
          ? `AI request failed (status ${res.status}).`
          : "AI request failed.");
      addTemporaryNotification(detail, SettaNotificationTypeEnum.warning);
      clearPendingChatDetails(resolvedPendingSurfaceId);
      if (sectionId) {
        await setSectionChatId(parentChatId);
      }
      return null;
    }
    const returnedChatId = res.data.chatId;
    if (returnedChatId) {
      refreshAgentRunsAfterSubmit();
      if (isExternalEngine) {
        await getExternalAgentChat(
          returnedChatId,
          projectConfigId,
          sectionId ?? undefined,
        );
      } else {
        await getLLMChat(returnedChatId, sectionId ?? undefined);
      }
      if (sectionId) {
        await setSectionChatId(returnedChatId);
      }
      commitPendingChatDetails(returnedChatId, resolvedPendingSurfaceId);
    } else {
      clearPendingChatDetails(resolvedPendingSurfaceId);
    }
    return returnedChatId;
  } catch (err) {
    const detail =
      err instanceof Error && err.message.trim()
        ? err.message
        : "AI request failed.";
    addTemporaryNotification(detail, SettaNotificationTypeEnum.warning);
    clearPendingChatDetails(resolvedPendingSurfaceId);
    if (sectionId) {
      await setSectionChatId(parentChatId);
    }
    throw err;
  }
}

async function resolveEngineConfigIdForChat(
  chatId: string,
  engineConfigId: string | null,
): Promise<string | null> {
  if (engineConfigId) {
    return engineConfigId;
  }
  const resolveFromRuns = (runs: AgentRun[]): string | null => {
    const matchingRuns = runs.filter(
      (run) => getRunInputString(run, "chatId") === chatId,
    );
    const runsWithEngine = matchingRuns.filter((run) =>
      getRunInputString(run, "engineConfigId"),
    );
    if (runsWithEngine.length === 0) {
      return null;
    }
    const [latestRun] = [...runsWithEngine].sort(
      (a, b) => getRunLastUpdatedMs(b) - getRunLastUpdatedMs(a),
    );
    return latestRun ? getRunInputString(latestRun, "engineConfigId") : null;
  };

  let { agentRuns, agentRunsInitialLoadComplete } = useAIStore.getState();
  if (!agentRunsInitialLoadComplete) {
    await loadAgentRuns();
    ({ agentRuns, agentRunsInitialLoadComplete } = useAIStore.getState());
  }
  if (!agentRunsInitialLoadComplete) {
    return null;
  }
  let resolved = resolveFromRuns(agentRuns);
  if (!resolved) {
    await loadAgentRuns();
    ({ agentRuns } = useAIStore.getState());
    resolved = resolveFromRuns(agentRuns);
  }
  if (resolved) {
    return resolved;
  }
  const { chatDetails, engineConfigs } = useAIStore.getState();
  const llmConfigId = chatDetails[chatId]?.llmConfig?.id ?? null;
  if (!llmConfigId) {
    return null;
  }
  const matchingEngine = engineConfigs.find(
    (config) => config.settaLlmConfigId === llmConfigId,
  );
  return matchingEngine?.id ?? null;
}
