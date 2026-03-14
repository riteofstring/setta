import {
  createMessageTextContent,
  createUserChatMessage,
} from "utils/generatedTypes";
import { describe, expect, it, vi } from "vitest";
import {
  buildProjectChatInputProps,
  buildProjectChatMessageListProps,
} from "./projectChatConversationSurfaceState";

describe("projectChatConversationSurfaceState", () => {
  it("builds message-list props without reshaping the runtime handlers", () => {
    const message = createUserChatMessage({
      id: "message-1",
      content: [createMessageTextContent({ text: "Hello" })],
      attachments: [],
    });
    const onRedoMessage = vi.fn();
    const onEditMessage = vi.fn();
    const onBranchSwitch = vi.fn();

    const props = buildProjectChatMessageListProps({
      filteredConversationMessages: [message],
      messages: [message],
      waitingForResponse: true,
      toolCallArguments: {
        "tool-1": "argument payload",
      },
      interruptedAssistantMessageIds: {
        "message-1": true,
      },
      activeConversationSearchMatchMessageId: "message-1",
      editDisabledReason: "Disabled",
      handleRedoMessage: onRedoMessage,
      handleEditMessage: onEditMessage,
      handleBranchSwitch: onBranchSwitch,
      branchInfoByMessage: {
        "message-1": {
          messageId: "message-1",
          branchChatIds: ["chat-1"],
          activeIndex: 0,
        },
      },
    });

    expect(props).toMatchObject({
      messages: [message],
      allMessagesForToolResults: [message],
      waitingForResponse: true,
      toolCallArguments: {
        "tool-1": "argument payload",
      },
      interruptedAssistantMessageIds: {
        "message-1": true,
      },
      activeSearchMessageId: "message-1",
      editDisabledReason: "Disabled",
    });
    expect(props.onRedoMessage).toBe(onRedoMessage);
    expect(props.onEditMessage).toBe(onEditMessage);
    expect(props.onBranchSwitch).toBe(onBranchSwitch);
  });

  it("builds chat-input props and gates provider dictation wiring", () => {
    const setDraftMessage = vi.fn();
    const onSubmit = vi.fn();
    const onStop = vi.fn();
    const onSlashCommand = vi.fn();
    const onUnknownSlashCommand = vi.fn();
    const onProviderDictationTranscribe = vi.fn();

    const props = buildProjectChatInputProps({
      placeholderText: "Ask Project AI",
      waitingForResponse: false,
      submitDisabled: false,
      isDisabled: false,
      draftMessage: "Current draft",
      setDraftMessage,
      handleSubmit: onSubmit,
      handleStop: onStop,
      slashCommands: [],
      recognizedSlashCommands: [],
      handleSlashCommand: onSlashCommand,
      handleUnknownSlashCommand: onUnknownSlashCommand,
      executionControls: {
        thinkingEnabled: false,
        onThinkingEnabledChange: undefined,
        permissionMode: "minimal",
        searchEnabled: false,
        onPermissionModeChange: vi.fn(),
        onSearchEnabledChange: vi.fn(),
      },
      showPermissionExecutionControl: true,
      showSearchExecutionControl: false,
      dictationMode: "provider",
      providerDictationAvailable: true,
      providerDictationLikelySupported: true,
      contextWindowTokens: 100,
      contextUsedTokens: 25,
      contextUsageIsEstimated: false,
      chatInputContextUsageUnavailable: false,
      submittedMessageHistory: ["Draft prompt"],
      runtimeActivityCounts: {
        activeBackgroundTerminals: 1,
        activeSubagents: 2,
      },
      runtimeActivityDetails: {
        activeBackgroundTerminals: [],
        activeSubagents: [],
        unresolvedToolCalls: [],
        waitingForResponse: false,
      },
      providerDictationTranscribeEnabled: false,
      handleProviderDictationTranscribe: onProviderDictationTranscribe,
    });

    expect(props).toMatchObject({
      placeholderText: "Ask Project AI",
      waitingForResponse: false,
      submitDisabled: false,
      disabled: false,
      value: "Current draft",
      dictationMode: "provider",
      dictationEnabledByProvider: true,
      providerDictationLikelySupported: true,
      contextWindowTokens: 100,
      contextUsedTokens: 25,
      contextUsageIsEstimated: false,
      contextUsageUnavailable: false,
      submittedMessageHistory: ["Draft prompt"],
      executionControlVisibility: {
        permissionMode: true,
        search: false,
      },
    });
    expect(props.onChange).toBe(setDraftMessage);
    expect(props.onSubmit).toBe(onSubmit);
    expect(props.onStop).toBe(onStop);
    expect(props.onSlashCommand).toBe(onSlashCommand);
    expect(props.onUnknownSlashCommand).toBe(onUnknownSlashCommand);
    expect(props.onProviderDictationTranscribe).toBeUndefined();
  });
});
