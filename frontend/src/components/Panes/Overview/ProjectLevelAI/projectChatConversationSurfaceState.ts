import { type Dispatch, type SetStateAction } from "react";
import {
  type ProjectChatInputProps,
  type ProjectChatMessageListProps,
} from "./ProjectChatConversationSurface";

export function buildProjectChatMessageListProps({
  filteredConversationMessages,
  messages,
  waitingForResponse,
  toolCallArguments,
  interruptedAssistantMessageIds,
  activeConversationSearchMatchMessageId,
  editDisabledReason,
  handleRedoMessage,
  handleEditMessage,
  handleBranchSwitch,
  branchInfoByMessage,
}: {
  filteredConversationMessages: ProjectChatMessageListProps["messages"];
  messages: ProjectChatMessageListProps["allMessagesForToolResults"];
  waitingForResponse: ProjectChatMessageListProps["waitingForResponse"];
  toolCallArguments: ProjectChatMessageListProps["toolCallArguments"];
  interruptedAssistantMessageIds: ProjectChatMessageListProps["interruptedAssistantMessageIds"];
  activeConversationSearchMatchMessageId: ProjectChatMessageListProps["activeSearchMessageId"];
  editDisabledReason: ProjectChatMessageListProps["editDisabledReason"];
  handleRedoMessage: ProjectChatMessageListProps["onRedoMessage"];
  handleEditMessage: ProjectChatMessageListProps["onEditMessage"];
  handleBranchSwitch: ProjectChatMessageListProps["onBranchSwitch"];
  branchInfoByMessage: ProjectChatMessageListProps["branchInfoByMessage"];
}): ProjectChatMessageListProps {
  return {
    messages: filteredConversationMessages,
    allMessagesForToolResults: messages,
    waitingForResponse,
    toolCallArguments,
    interruptedAssistantMessageIds,
    activeSearchMessageId: activeConversationSearchMatchMessageId,
    editDisabledReason,
    onRedoMessage: handleRedoMessage,
    onEditMessage: handleEditMessage,
    onBranchSwitch: handleBranchSwitch,
    branchInfoByMessage,
  };
}

export function buildProjectChatInputProps({
  placeholderText,
  waitingForResponse,
  submitDisabled,
  isDisabled,
  draftMessage,
  setDraftMessage,
  handleSubmit,
  handleStop,
  slashCommands,
  recognizedSlashCommands,
  handleSlashCommand,
  handleUnknownSlashCommand,
  executionControls,
  showPermissionExecutionControl,
  showSearchExecutionControl,
  dictationMode,
  providerDictationAvailable,
  providerDictationLikelySupported,
  contextWindowTokens,
  contextUsedTokens,
  contextUsageIsEstimated,
  chatInputContextUsageUnavailable,
  submittedMessageHistory,
  runtimeActivityCounts,
  runtimeActivityDetails,
  providerDictationTranscribeEnabled,
  handleProviderDictationTranscribe,
}: {
  placeholderText: ProjectChatInputProps["placeholderText"];
  waitingForResponse: ProjectChatInputProps["waitingForResponse"];
  submitDisabled: ProjectChatInputProps["submitDisabled"];
  isDisabled: ProjectChatInputProps["disabled"];
  draftMessage: ProjectChatInputProps["value"];
  setDraftMessage: Dispatch<SetStateAction<string>>;
  handleSubmit: ProjectChatInputProps["onSubmit"];
  handleStop: ProjectChatInputProps["onStop"];
  slashCommands: ProjectChatInputProps["slashCommands"];
  recognizedSlashCommands: ProjectChatInputProps["recognizedSlashCommands"];
  handleSlashCommand: ProjectChatInputProps["onSlashCommand"];
  handleUnknownSlashCommand: ProjectChatInputProps["onUnknownSlashCommand"];
  executionControls: ProjectChatInputProps["executionControls"];
  showPermissionExecutionControl: boolean;
  showSearchExecutionControl: boolean;
  dictationMode: ProjectChatInputProps["dictationMode"];
  providerDictationAvailable: ProjectChatInputProps["dictationEnabledByProvider"];
  providerDictationLikelySupported: ProjectChatInputProps["providerDictationLikelySupported"];
  contextWindowTokens: ProjectChatInputProps["contextWindowTokens"];
  contextUsedTokens: ProjectChatInputProps["contextUsedTokens"];
  contextUsageIsEstimated: ProjectChatInputProps["contextUsageIsEstimated"];
  chatInputContextUsageUnavailable: boolean;
  submittedMessageHistory: ProjectChatInputProps["submittedMessageHistory"];
  runtimeActivityCounts: ProjectChatInputProps["runtimeActivityCounts"];
  runtimeActivityDetails: ProjectChatInputProps["runtimeActivityDetails"];
  providerDictationTranscribeEnabled: boolean;
  handleProviderDictationTranscribe:
    | ((audioBlob: Blob) => Promise<string>)
    | undefined;
}): ProjectChatInputProps {
  return {
    placeholderText,
    waitingForResponse,
    submitDisabled,
    disabled: isDisabled,
    value: draftMessage,
    onChange: setDraftMessage,
    onSubmit: handleSubmit,
    onStop: handleStop,
    slashCommands,
    recognizedSlashCommands,
    onSlashCommand: handleSlashCommand,
    onUnknownSlashCommand: handleUnknownSlashCommand,
    executionControls,
    executionControlVisibility: {
      permissionMode: showPermissionExecutionControl,
      search: showSearchExecutionControl,
    },
    dictationMode,
    dictationEnabledByProvider: providerDictationAvailable,
    providerDictationLikelySupported,
    contextWindowTokens,
    contextUsedTokens,
    contextUsageIsEstimated,
    contextUsageUnavailable: chatInputContextUsageUnavailable,
    submittedMessageHistory,
    runtimeActivityCounts,
    runtimeActivityDetails,
    onProviderDictationTranscribe: !providerDictationTranscribeEnabled
      ? undefined
      : handleProviderDictationTranscribe,
  };
}
