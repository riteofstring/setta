import { addBackendLogEvent } from "state/actions/backendLogEvents";
import { setFrontendAffinityToken } from "state/actions/frontendWebsocketAffinity";
import { processLspDiagnostics } from "state/actions/lspDiagnosticsState";
import { processNameValidationErrors } from "state/actions/nameValidation";
import { addNotificationFromWebsocketMsg } from "state/actions/notifications";
import { setWebsocketConnections } from "state/actions/websocketConnectionList";
import {
  FrontendWebsocketMsgUnion,
  WebsocketMsgTypeForFrontendEnum,
} from "utils/generatedTypes";
import { receiveAgentRunUpdate } from "./aiAgentRuns";
import { receiveLLMResponseChunk } from "./aiChatStreaming";
import {
  receiveAgentProfilesUpdate,
  receiveEngineConfigsUpdate,
  receiveExternalAgentConfigsUpdate,
  receivePromptTemplatesUpdate,
} from "./aiConfigurationCatalogLoads";
import { receiveAIFollowToolResultUpdate } from "./aiFollowHighlights";
import { receiveAIFollowToolArgumentsUpdate } from "./aiFollowToolArguments";
import { receiveLLMConfigUpdate } from "./aiLLMConfiguration";
import { receiveLLMApiKeysSnapshotUpdate } from "./aiManagedApiKeyState";
import { receiveTranscriptionProfilesUpdate } from "./aiTranscriptionProfiles";
import { updateArtifacts } from "./artifactStoreUpdates";
import { applyListenerCoverageSnapshot } from "./listenerCoverage";
import { updateAllProjectMetadata } from "./projectStateCommands";
import { handleRenameRefactorBroadcast } from "./renameRefactors";
import { updateSettings } from "./settings";
import { handleIncomingProjectStateSnapshot } from "./websocketIncomingProjectSnapshots";
import type { FrontendWebsocketMessageContext } from "./websocketIncomingTypes";
import { handleIncomingUISettingRevealMessage } from "./websocketIncomingUISettingReveal";

export type { FrontendWebsocketMessageContext } from "./websocketIncomingTypes";

export function receiveFrontendWebsocketMessage(
  message: string,
  context: FrontendWebsocketMessageContext,
): void {
  const parsedMessage = JSON.parse(message) as FrontendWebsocketMsgUnion;
  switch (parsedMessage.messageType) {
    case WebsocketMsgTypeForFrontendEnum.FrontendIdentity:
      setFrontendAffinityToken(
        parsedMessage.content.frontendAffinityToken,
        context.socketGeneration,
      );
      return;
    case WebsocketMsgTypeForFrontendEnum.AllConnections:
      setWebsocketConnections(parsedMessage.content);
      return;
    case WebsocketMsgTypeForFrontendEnum.LLMStreamingResponse:
      receiveLLMResponseChunk(parsedMessage.content);
      return;
    case WebsocketMsgTypeForFrontendEnum.LSPDiagnostics:
      processLspDiagnostics(parsedMessage.content);
      return;
    case WebsocketMsgTypeForFrontendEnum.NameValidationErrors:
      processNameValidationErrors(parsedMessage.content);
      return;
    case WebsocketMsgTypeForFrontendEnum.Notification:
      addNotificationFromWebsocketMsg(parsedMessage.content);
      return;
    case WebsocketMsgTypeForFrontendEnum.ReturnRenameRefactorResults:
      handleRenameRefactorBroadcast(parsedMessage.content);
      return;
    case WebsocketMsgTypeForFrontendEnum.TerminalMetadata:
      return;
    case WebsocketMsgTypeForFrontendEnum.UpdateFrontendProjectState:
      handleIncomingProjectStateSnapshot(parsedMessage.content);
      return;
    case WebsocketMsgTypeForFrontendEnum.UpdateSettings:
      updateSettings(parsedMessage.content);
      return;
    case WebsocketMsgTypeForFrontendEnum.AllProjectMetadata:
      updateAllProjectMetadata(parsedMessage.content);
      return;
    case WebsocketMsgTypeForFrontendEnum.UpdateArtifacts:
      updateArtifacts(parsedMessage.content);
      return;
    case WebsocketMsgTypeForFrontendEnum.ListenerCoverageSnapshot:
      applyListenerCoverageSnapshot(parsedMessage.content);
      return;
    case WebsocketMsgTypeForFrontendEnum.LLMConfigUpdated:
      receiveLLMConfigUpdate(parsedMessage.content);
      return;
    case WebsocketMsgTypeForFrontendEnum.LLMApiKeysUpdated:
      receiveLLMApiKeysSnapshotUpdate(parsedMessage.content);
      return;
    case WebsocketMsgTypeForFrontendEnum.BackendLogEvent:
      addBackendLogEvent(parsedMessage.content);
      return;
    case WebsocketMsgTypeForFrontendEnum.AIFollowToolArgumentsUpdate:
      receiveAIFollowToolArgumentsUpdate(parsedMessage.content);
      return;
    case WebsocketMsgTypeForFrontendEnum.AIFollowToolResultUpdate:
      receiveAIFollowToolResultUpdate(parsedMessage.content);
      return;
    case WebsocketMsgTypeForFrontendEnum.UISettingReveal:
      void handleIncomingUISettingRevealMessage(parsedMessage.content, context);
      return;
    case WebsocketMsgTypeForFrontendEnum.AgentProfilesUpdated:
      receiveAgentProfilesUpdate(parsedMessage.content.profiles);
      return;
    case WebsocketMsgTypeForFrontendEnum.AgentRunUpdated:
      receiveAgentRunUpdate(parsedMessage.content);
      return;
    case WebsocketMsgTypeForFrontendEnum.PromptTemplatesUpdated:
      receivePromptTemplatesUpdate(parsedMessage.content.templates);
      return;
    case WebsocketMsgTypeForFrontendEnum.ExternalAgentConfigsUpdated:
      receiveExternalAgentConfigsUpdate(parsedMessage.content.configs);
      return;
    case WebsocketMsgTypeForFrontendEnum.EngineConfigsUpdated:
      receiveEngineConfigsUpdate(parsedMessage.content.configs);
      return;
    case WebsocketMsgTypeForFrontendEnum.TranscriptionProfilesUpdated:
      receiveTranscriptionProfilesUpdate(parsedMessage.content.profiles);
      return;
    default:
      return parsedMessage satisfies never;
  }
}
