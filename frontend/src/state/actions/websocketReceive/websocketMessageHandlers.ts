import { createNewId } from "@setta/app-subsystem-frontend-sdk";

import { receivePluginRuntimeUpdate } from "plugins/runtime";

import { addBackendLogEvent } from "state/actions/backendLogEvents";

import { setFrontendAffinityToken } from "state/actions/frontendWebsocketAffinity";

import { processLspDiagnostics } from "state/actions/lspDiagnostics";

import { processNameValidationErrors } from "state/actions/nameValidation";

import { addNotificationFromWebsocketMsg } from "state/actions/notifications";

import { createChromeReproPerfTimer } from "state/actions/chromeRepro";

import { setWebsocketConnections } from "state/actions/websocketConnectionList";

import { NULL_PROJECT_CONFIG_ID } from "state/definitions";

import {
  MessageTypeEnum,
  UISettingRevealContent,
  UISettingRevealResultMessage,
  UISettingRevealResultStatus,
  WebsocketMessageTypeEnum,
  type WebsocketMessageType,
} from "utils/generatedTypes";

import {
  receiveAgentProfilesUpdate,
  receiveAgentRunUpdate,
  receiveEngineConfigsUpdate,
  receiveExternalAgentConfigsUpdate,
  receiveLLMApiKeysSnapshotUpdate,
  receiveLLMConfigUpdate,
  receiveLLMResponseChunk,
  receivePromptTemplatesUpdate,
  receiveTranscriptionProfilesUpdate,
} from "../ai";

import {
  receiveAIFollowToolArgumentsUpdate,
  receiveAIFollowToolResultUpdate,
} from "../aiFollow";

import { updateArtifacts } from "../artifacts";

import { applyListenerCoverageSnapshot } from "../listenerCoverage";

import { handleRenameRefactorBroadcast } from "../renameRefactors";

import {
  getCurrProjectConfigId,
  receiveProjectParamUpdate,
  updateAllProjectMetadata,
} from "../sectionInfos";

import { updateSettings } from "../settings";

import {
  parseUISettingRevealContent,
  receiveUISettingReveal,
  type UISettingRevealExecutionContext,
} from "../uiSettingReveal";

import {
  AgentProfilesUpdatedContent,
  ConfigsUpdatedContent,
  ExternalAgentConfigsUpdatedContent,
  FrontendIdentityContent,
  FrontendWebsocketEnvelope,
  PendingUISettingRevealMessage,
  PromptTemplatesUpdatedContent,
  TranscriptionProfilesUpdatedContent,
  WebsocketMessageHandler,
  receiveFrontendProjectState,
  wss,
  wssReady,
} from "./websocketConnection";

import {
  buildExecutionContextMismatchStatuses,
  isRecord,
  isSocketGenerationCurrent,
  sendMessageForGeneration,
} from "./realtimeBinaryUpload";

function createWebsocketMessageHandler<T>(
  handler: (content: T, socketGeneration: number) => void,
): WebsocketMessageHandler {
  return (content, socketGeneration) => {
    handler(content as T, socketGeneration);
  };
}

const websocketMessageHandlers = {
  [WebsocketMessageTypeEnum.FrontendIdentity]:
    createWebsocketMessageHandler<FrontendIdentityContent>(
      (content, socketGeneration) => {
        setFrontendAffinityToken(
          content.frontendAffinityToken,
          socketGeneration,
        );
      },
    ),
  [WebsocketMessageTypeEnum.AllConnections]: createWebsocketMessageHandler<
    Parameters<typeof setWebsocketConnections>[0]
  >((content) => {
    setWebsocketConnections(content);
  }),
  [WebsocketMessageTypeEnum.LLMStreamingResponse]:
    createWebsocketMessageHandler<
      Parameters<typeof receiveLLMResponseChunk>[0]
    >((content) => {
      receiveLLMResponseChunk(content);
    }),
  [WebsocketMessageTypeEnum.LSPDiagnostics]: createWebsocketMessageHandler<
    Parameters<typeof processLspDiagnostics>[0]
  >((content) => {
    processLspDiagnostics(content);
  }),
  [WebsocketMessageTypeEnum.NameValidationErrors]:
    createWebsocketMessageHandler<
      Parameters<typeof processNameValidationErrors>[0]
    >((content) => {
      processNameValidationErrors(content);
    }),
  [WebsocketMessageTypeEnum.Notification]: createWebsocketMessageHandler<
    Parameters<typeof addNotificationFromWebsocketMsg>[0]
  >((content) => {
    addNotificationFromWebsocketMsg(content);
  }),
  [WebsocketMessageTypeEnum.ReturnRenameRefactorResults]:
    createWebsocketMessageHandler<
      Parameters<typeof handleRenameRefactorBroadcast>[0]
    >((content) => {
      handleRenameRefactorBroadcast(content);
    }),
  [WebsocketMessageTypeEnum.UpdateFrontendProjectState]:
    createWebsocketMessageHandler((content) => {
      receiveFrontendProjectState(content);
    }),
  [WebsocketMessageTypeEnum.UpdateFrontendProjectParam]:
    createWebsocketMessageHandler<
      Parameters<typeof receiveProjectParamUpdate>[0]
    >((content) => {
      receiveProjectParamUpdate(content);
    }),
  [WebsocketMessageTypeEnum.UpdateSettings]: createWebsocketMessageHandler<
    Parameters<typeof updateSettings>[0]
  >((content) => {
    updateSettings(content);
  }),
  [WebsocketMessageTypeEnum.UpdatePluginRuntime]: createWebsocketMessageHandler<
    Parameters<typeof receivePluginRuntimeUpdate>[0]
  >((content) => {
    void receivePluginRuntimeUpdate(content);
  }),
  [WebsocketMessageTypeEnum.AllProjectMetadata]: createWebsocketMessageHandler<
    Parameters<typeof updateAllProjectMetadata>[0]
  >((content) => {
    updateAllProjectMetadata(content);
  }),
  [WebsocketMessageTypeEnum.UpdateArtifacts]: createWebsocketMessageHandler<
    Parameters<typeof updateArtifacts>[0]
  >((content) => {
    updateArtifacts(content);
  }),
  [WebsocketMessageTypeEnum.ListenerCoverageSnapshot]:
    createWebsocketMessageHandler<
      Parameters<typeof applyListenerCoverageSnapshot>[0]
    >((content) => {
      applyListenerCoverageSnapshot(content);
    }),
  [WebsocketMessageTypeEnum.LLMConfigUpdated]: createWebsocketMessageHandler<
    Parameters<typeof receiveLLMConfigUpdate>[0]
  >((content) => {
    receiveLLMConfigUpdate(content);
  }),
  [WebsocketMessageTypeEnum.LLMApiKeysUpdated]: createWebsocketMessageHandler<
    Parameters<typeof receiveLLMApiKeysSnapshotUpdate>[0]
  >((content) => {
    receiveLLMApiKeysSnapshotUpdate(content);
  }),
  [WebsocketMessageTypeEnum.BackendLogEvent]: createWebsocketMessageHandler<
    Parameters<typeof addBackendLogEvent>[0]
  >((content) => {
    addBackendLogEvent(content);
  }),
  [WebsocketMessageTypeEnum.AIFollowToolArgumentsUpdate]:
    createWebsocketMessageHandler<
      Parameters<typeof receiveAIFollowToolArgumentsUpdate>[0]
    >((content) => {
      receiveAIFollowToolArgumentsUpdate(content);
    }),
  [WebsocketMessageTypeEnum.AIFollowToolResultUpdate]:
    createWebsocketMessageHandler<
      Parameters<typeof receiveAIFollowToolResultUpdate>[0]
    >((content) => {
      receiveAIFollowToolResultUpdate(content);
    }),
  [WebsocketMessageTypeEnum.UISettingReveal]: createWebsocketMessageHandler(
    (content, socketGeneration) => {
      enqueueUISettingRevealMessage({
        content,
        socketGeneration,
      });
    },
  ),
  [WebsocketMessageTypeEnum.AgentProfilesUpdated]:
    createWebsocketMessageHandler<AgentProfilesUpdatedContent>((content) => {
      receiveAgentProfilesUpdate(content.profiles);
    }),
  [WebsocketMessageTypeEnum.AgentRunUpdated]: createWebsocketMessageHandler<
    Parameters<typeof receiveAgentRunUpdate>[0]
  >((content) => {
    receiveAgentRunUpdate(content);
  }),
  [WebsocketMessageTypeEnum.PromptTemplatesUpdated]:
    createWebsocketMessageHandler<PromptTemplatesUpdatedContent>((content) => {
      receivePromptTemplatesUpdate(content.templates);
    }),
  [WebsocketMessageTypeEnum.ExternalAgentConfigsUpdated]:
    createWebsocketMessageHandler<ExternalAgentConfigsUpdatedContent>(
      (content) => {
        receiveExternalAgentConfigsUpdate(content.configs);
      },
    ),
  [WebsocketMessageTypeEnum.EngineConfigsUpdated]:
    createWebsocketMessageHandler<ConfigsUpdatedContent>((content) => {
      receiveEngineConfigsUpdate(content.configs);
    }),
  [WebsocketMessageTypeEnum.TranscriptionProfilesUpdated]:
    createWebsocketMessageHandler<TranscriptionProfilesUpdatedContent>(
      (content) => {
        receiveTranscriptionProfilesUpdate(content.profiles);
      },
    ),
} satisfies Record<WebsocketMessageType, WebsocketMessageHandler>;

export function receiveMessage(message: string, socketGeneration: number) {
  const timer = createChromeReproPerfTimer("websocket-message", {
    rawTextLength: message.length,
    socketGeneration,
  });
  const m = JSON.parse(message) as FrontendWebsocketEnvelope;
  timer.mark("json-parse");
  websocketMessageHandlers[m.messageType](m.content, socketGeneration);
  timer.mark("handler");
  timer.finish({
    messageType: m.messageType,
    ...summarizeWebsocketPerfContent(m.messageType, m.content),
  });
}

function summarizeWebsocketPerfContent(
  messageType: WebsocketMessageType,
  content: unknown,
): Record<string, unknown> {
  if (messageType === WebsocketMessageTypeEnum.UpdateFrontendProjectState) {
    return summarizeFrontendProjectStateUpdate(content);
  }
  if (messageType === WebsocketMessageTypeEnum.UpdateFrontendProjectParam) {
    return summarizeFrontendProjectParamUpdate(content);
  }
  if (messageType === WebsocketMessageTypeEnum.UpdateSettings) {
    return summarizeSettingsUpdate(content);
  }
  return {};
}

function summarizeFrontendProjectStateUpdate(
  content: unknown,
): Record<string, unknown> {
  if (!isRecord(content)) {
    return { contentKind: typeof content };
  }
  const projectState = getRecordField(content, "projectState");
  if (projectState === null) {
    return { contentKind: "missing-project-state" };
  }
  const projectConfig = getRecordField(projectState, "projectConfig");
  const projectChatWindowing = getRecordField(
    projectState,
    "projectChatWindowing",
  );
  const chatWindowInstances = getRecordField(
    projectChatWindowing,
    "instancesById",
  );
  return {
    activeViewModeId: getStringField(projectConfig, "activeViewModeId"),
    activeSectionCount: countArrayField(projectConfig, "activeIds"),
    codeObjCount: countRecordKeys(projectState.codeObjs),
    codeObjImplCount: countRecordKeys(projectState.codeObjImpls),
    codeObjVariantCount: countRecordKeys(projectState.codeObjVariants),
    completedOpCount: countArrayItems(content.completedOpIds),
    pendingOpCount: countArrayItems(content.pendingOpIds),
    projectChatWindowCount: countRecordKeys(chatWindowInstances),
    sectionCount: countRecordKeys(projectState.sections),
    sectionImplCount: countRecordKeys(projectState.sectionImpls),
    sectionVariantCount: countRecordKeys(projectState.sectionVariants),
    shownParamVariantCount: countRecordKeys(projectState.shownParamIds),
    topLevelSectionCount: countRecordKeys(
      getRecordField(projectConfig, "topLevelSections"),
    ),
    viewModeCount: countRecordKeys(getRecordField(projectConfig, "viewModes")),
    windowSpaceCount: countRecordKeys(
      getRecordField(projectConfig, "windowSpaces"),
    ),
  };
}

function summarizeFrontendProjectParamUpdate(
  content: unknown,
): Record<string, unknown> {
  if (!isRecord(content)) {
    return { contentKind: typeof content };
  }
  const codeObjImpl = content.codeObjImpl;
  return {
    codeObjImplJsonLength:
      codeObjImpl === undefined ? 0 : JSON.stringify(codeObjImpl).length,
    completedOpCount: countArrayItems(content.completedOpIds),
    paramInfoId: content.paramInfoId,
    pendingOpCount: countArrayItems(content.pendingOpIds),
    projectConfigId: content.projectConfigId,
    sectionId: content.sectionId,
  };
}

function summarizeSettingsUpdate(content: unknown): Record<string, unknown> {
  if (!isRecord(content)) {
    return { contentKind: typeof content };
  }
  return {
    settingsGroupCount: Object.keys(content).length,
  };
}

function countRecordKeys(value: unknown): number | null {
  return isRecord(value) ? Object.keys(value).length : null;
}

function getRecordField(
  source: Record<string, unknown> | null,
  key: string,
): Record<string, unknown> | null {
  if (source === null) {
    return null;
  }
  const value = source[key];
  return isRecord(value) ? value : null;
}

function getStringField(
  source: Record<string, unknown> | null,
  key: string,
): string | null {
  if (source === null) {
    return null;
  }
  const value = source[key];
  return typeof value === "string" ? value : null;
}

function countArrayField(
  source: Record<string, unknown> | null,
  key: string,
): number | null {
  if (source === null) {
    return null;
  }
  return countArrayItems(source[key]);
}

function countArrayItems(value: unknown): number | null {
  return Array.isArray(value) ? value.length : null;
}

function enqueueUISettingRevealMessage(
  message: PendingUISettingRevealMessage,
): void {
  void handleUISettingRevealMessage(message.content, message.socketGeneration);
}

async function handleUISettingRevealMessage(
  content: unknown,
  socketGeneration: number,
): Promise<void> {
  const fallbackProjectConfigId = getCurrProjectConfigId();
  const projectConfigId = resolveRevealProjectConfigId(
    content,
    fallbackProjectConfigId,
  );
  const requestId = resolveRevealRequestId(content);
  let statuses: UISettingRevealResultStatusPayload[] = [];
  const revealContent = parseUISettingRevealContent(content);
  if (revealContent === null) {
    statuses = buildMalformedRevealStatuses(
      content,
      "Invalid UISettingReveal payload.",
    );
    sendUISettingRevealResult({
      projectConfigId,
      requestId,
      statuses,
      socketGeneration,
    });
    return;
  }
  const revealExecutionContext: UISettingRevealExecutionContext = {
    requestId: revealContent.requestId,
    requestedProjectConfigId: revealContent.projectConfigId.trim(),
    socketGeneration,
    isSocketGenerationActive: () =>
      isSocketGenerationCurrent(socketGeneration) && wssReady(wss),
  };
  try {
    const revealStatuses = await receiveUISettingReveal(
      revealContent,
      revealExecutionContext,
    );
    statuses = Array.isArray(revealStatuses) ? revealStatuses : [];
  } catch (error) {
    const rawMessage =
      error instanceof Error && error.message.trim() !== ""
        ? error.message
        : String(error);
    const normalizedMessage = `Failed to process UI setting reveal: ${rawMessage}`;
    statuses = revealContent.reveals.map((target) => ({
      settingId: target.settingId,
      status: "failed",
      errorCode: "mutation_failed",
      errorMessage: normalizedMessage,
    }));
  }
  const ackContextMismatchStatuses = resolveAckContextMismatchStatuses({
    content: revealContent,
    executionContext: revealExecutionContext,
  });
  if (ackContextMismatchStatuses !== null) {
    statuses = ackContextMismatchStatuses;
  }
  sendUISettingRevealResult({
    projectConfigId: revealContent.projectConfigId,
    requestId: revealContent.requestId,
    statuses,
    socketGeneration,
  });
}

function sendUISettingRevealResult({
  projectConfigId,
  requestId,
  statuses,
  socketGeneration,
}: {
  projectConfigId: string;
  requestId: string;
  statuses: UISettingRevealResultStatus[];
  socketGeneration: number;
}): void {
  const revealResultMessage: UISettingRevealResultMessage = {
    id: null,
    messageType: MessageTypeEnum.UISettingRevealResult,
    content: {
      projectConfigId,
      requestId,
      statuses,
    },
  };
  sendMessageForGeneration(revealResultMessage, socketGeneration);
}

function resolveRevealProjectConfigId(
  content: unknown,
  fallbackProjectConfigId: string,
): string {
  const fallbackNormalizedId =
    typeof fallbackProjectConfigId === "string" &&
    fallbackProjectConfigId.trim() !== ""
      ? fallbackProjectConfigId
      : NULL_PROJECT_CONFIG_ID;
  if (!isRecord(content)) {
    return fallbackNormalizedId;
  }
  const candidateProjectConfigId = content.projectConfigId;
  if (
    typeof candidateProjectConfigId === "string" &&
    candidateProjectConfigId.trim() !== ""
  ) {
    return candidateProjectConfigId;
  }
  return fallbackNormalizedId;
}

function resolveRevealRequestId(content: unknown): string {
  if (isRecord(content)) {
    const candidateRequestId = content.requestId;
    if (
      typeof candidateRequestId === "string" &&
      candidateRequestId.trim() !== ""
    ) {
      return candidateRequestId;
    }
  }
  return createNewId();
}

function buildMalformedRevealStatuses(
  content: unknown,
  errorMessage: string,
): UISettingRevealResultStatus[] {
  const settingIds = extractRevealSettingIds(content);
  return settingIds.map((settingId) => ({
    settingId,
    status: "failed",
    errorCode: "mutation_failed",
    errorMessage,
  }));
}

function extractRevealSettingIds(content: unknown): string[] {
  if (!isRecord(content)) {
    return [];
  }
  if (!Array.isArray(content.reveals)) {
    return [];
  }
  const ids: string[] = [];
  for (const reveal of content.reveals) {
    if (!isRecord(reveal)) {
      continue;
    }
    if (
      typeof reveal.settingId !== "string" ||
      reveal.settingId.trim() === ""
    ) {
      continue;
    }
    ids.push(reveal.settingId);
  }
  return ids;
}

function resolveAckContextMismatchStatuses({
  content,
  executionContext,
}: {
  content: UISettingRevealContent;
  executionContext: UISettingRevealExecutionContext;
}): UISettingRevealResultStatus[] | null {
  if (!executionContext.isSocketGenerationActive()) {
    return buildExecutionContextMismatchStatuses(
      content.reveals,
      "UI setting reveal execution context mismatch: websocket generation changed " +
        `before request ${executionContext.requestId} completed.`,
    );
  }
  const activeProjectConfigId = getCurrProjectConfigId().trim();
  const requestedProjectConfigId = executionContext.requestedProjectConfigId;
  if (activeProjectConfigId === requestedProjectConfigId) {
    return null;
  }
  return buildExecutionContextMismatchStatuses(
    content.reveals,
    "UI setting reveal execution context mismatch: requested project " +
      `${requestedProjectConfigId} but active project is ${activeProjectConfigId}.`,
  );
}
