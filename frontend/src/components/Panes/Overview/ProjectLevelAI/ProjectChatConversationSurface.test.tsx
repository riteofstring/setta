/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectChatConversationSurface } from "./ProjectChatConversationSurface";

let latestMessageListContentClassName: string | undefined;

vi.mock("components/Chat/ChatInput", () => ({
  ChatInput: ({
    placeholderText,
    disabled,
    submitDisabled,
    onSubmit,
  }: {
    placeholderText: string;
    disabled: boolean;
    submitDisabled: boolean;
    onSubmit: (message: string, attachments: unknown[]) => void;
  }) => (
    <div data-testid="mock-chat-input">
      <span>{placeholderText}</span>
      <span>{disabled ? "disabled" : "enabled"}</span>
      <span>{submitDisabled ? "submit-disabled" : "submit-enabled"}</span>
      <button
        type="button"
        onClick={() => {
          onSubmit("Summarize the workspace", []);
        }}
      >
        Submit
      </button>
    </div>
  ),
}));

vi.mock("components/Chat/ChatMessages", () => ({
  ChatMessageList: ({
    messages,
    contentClassName,
  }: {
    messages: Array<{ id: string }>;
    contentClassName?: string;
  }) => {
    latestMessageListContentClassName = contentClassName;
    return (
      <div data-testid="mock-chat-message-list">{`messages:${messages.length}`}</div>
    );
  },
}));

describe("ProjectChatConversationSurface", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    latestMessageListContentClassName = undefined;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("renders the blocked banner and starter prompts for the empty state", () => {
    const onStarterPrompt = vi.fn();

    act(() => {
      root.render(
        <ProjectChatConversationSurface
          blockedReason="This chat is blocked."
          showEmptyState={true}
          showConversationSearchEmptyState={false}
          visibleStarterPrompts={[
            {
              id: "create-project",
              label: "Create Project",
              prompt: "Create the project",
              requiresPython: false,
            },
            {
              id: "summarize-codebase",
              label: "Summarize Codebase",
              prompt: "Summarize the codebase",
              requiresPython: false,
            },
          ]}
          isDisabled={false}
          onStarterPrompt={onStarterPrompt}
          messageListProps={{
            messages: [],
            allMessagesForToolResults: [],
            waitingForResponse: false,
            toolCallArguments: {},
            interruptedAssistantMessageIds: {},
            activeSearchMessageId: null,
            editDisabledReason: null,
            onRedoMessage: () => undefined,
            onEditMessage: () => undefined,
            onBranchSwitch: () => undefined,
            branchInfoByMessage: {},
          }}
          chatInputProps={{
            placeholderText: "Ask Project AI",
            waitingForResponse: false,
            submitDisabled: false,
            disabled: false,
            value: "",
            onChange: () => undefined,
            onSubmit: () => undefined,
            onStop: () => undefined,
            slashCommands: [],
            recognizedSlashCommands: [],
            onSlashCommand: async () => false,
            onUnknownSlashCommand: async () => false,
            executionControls: {
              thinkingEnabled: false,
              onThinkingEnabledChange: undefined,
              permissionMode: "minimal",
              searchEnabled: false,
              onPermissionModeChange: () => undefined,
              onSearchEnabledChange: () => undefined,
            },
            executionControlVisibility: {
              permissionMode: false,
              search: false,
            },
            dictationMode: "auto",
            dictationEnabledByProvider: false,
            providerDictationLikelySupported: false,
            contextWindowTokens: null,
            contextUsedTokens: null,
            contextUsageIsEstimated: false,
            contextUsageUnavailable: false,
            submittedMessageHistory: [],
            runtimeActivityCounts: {
              activeBackgroundTerminals: 0,
              activeSubagents: 0,
            },
            runtimeActivityDetails: {
              activeBackgroundTerminals: [],
              activeSubagents: [],
              unresolvedToolCalls: [],
              waitingForResponse: false,
            },
            onProviderDictationTranscribe: undefined,
          }}
        />,
      );
    });

    expect(container.textContent).toContain("This chat is blocked.");
    const starterButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Create Project",
    );
    expect(starterButton).toBeTruthy();

    act(() => {
      starterButton?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });

    expect(onStarterPrompt).toHaveBeenCalledWith("Create the project");
    expect(container.textContent).toContain("Ask Project AI");
  });

  it("renders the search-empty state instead of the message list", () => {
    act(() => {
      root.render(
        <ProjectChatConversationSurface
          blockedReason={null}
          showEmptyState={false}
          showConversationSearchEmptyState={true}
          visibleStarterPrompts={[]}
          isDisabled={false}
          onStarterPrompt={() => undefined}
          messageListProps={{
            messages: [{ id: "message-1" }],
            allMessagesForToolResults: [],
            waitingForResponse: false,
            toolCallArguments: {},
            interruptedAssistantMessageIds: {},
            activeSearchMessageId: null,
            editDisabledReason: null,
            onRedoMessage: () => undefined,
            onEditMessage: () => undefined,
            onBranchSwitch: () => undefined,
            branchInfoByMessage: {},
          }}
          chatInputProps={{
            placeholderText: "Ask Project AI",
            waitingForResponse: false,
            submitDisabled: false,
            disabled: false,
            value: "",
            onChange: () => undefined,
            onSubmit: () => undefined,
            onStop: () => undefined,
            slashCommands: [],
            recognizedSlashCommands: [],
            onSlashCommand: async () => false,
            onUnknownSlashCommand: async () => false,
            executionControls: {
              thinkingEnabled: false,
              onThinkingEnabledChange: undefined,
              permissionMode: "minimal",
              searchEnabled: false,
              onPermissionModeChange: () => undefined,
              onSearchEnabledChange: () => undefined,
            },
            executionControlVisibility: {
              permissionMode: false,
              search: false,
            },
            dictationMode: "auto",
            dictationEnabledByProvider: false,
            providerDictationLikelySupported: false,
            contextWindowTokens: null,
            contextUsedTokens: null,
            contextUsageIsEstimated: false,
            contextUsageUnavailable: false,
            submittedMessageHistory: [],
            runtimeActivityCounts: {
              activeBackgroundTerminals: 0,
              activeSubagents: 0,
            },
            runtimeActivityDetails: {
              activeBackgroundTerminals: [],
              activeSubagents: [],
              unresolvedToolCalls: [],
              waitingForResponse: false,
            },
            onProviderDictationTranscribe: undefined,
          }}
        />,
      );
    });

    expect(container.textContent).toContain("No messages match this filter.");
    expect(
      container.querySelector('[data-testid="mock-chat-message-list"]'),
    ).toBeNull();
  });

  it("renders the message list and chat input for active conversations", () => {
    const onSubmit = vi.fn();

    act(() => {
      root.render(
        <ProjectChatConversationSurface
          blockedReason={null}
          showEmptyState={false}
          showConversationSearchEmptyState={false}
          visibleStarterPrompts={[]}
          isDisabled={false}
          onStarterPrompt={() => undefined}
          messageListProps={{
            messages: [{ id: "message-1" }, { id: "message-2" }],
            allMessagesForToolResults: [],
            waitingForResponse: false,
            toolCallArguments: {},
            interruptedAssistantMessageIds: {},
            activeSearchMessageId: null,
            editDisabledReason: null,
            onRedoMessage: () => undefined,
            onEditMessage: () => undefined,
            onBranchSwitch: () => undefined,
            branchInfoByMessage: {},
          }}
          chatInputProps={{
            placeholderText: "Ask Project AI",
            waitingForResponse: false,
            submitDisabled: true,
            disabled: false,
            value: "Draft",
            onChange: () => undefined,
            onSubmit,
            onStop: () => undefined,
            slashCommands: [],
            recognizedSlashCommands: [],
            onSlashCommand: async () => false,
            onUnknownSlashCommand: async () => false,
            executionControls: {
              thinkingEnabled: false,
              onThinkingEnabledChange: undefined,
              permissionMode: "minimal",
              searchEnabled: false,
              onPermissionModeChange: () => undefined,
              onSearchEnabledChange: () => undefined,
            },
            executionControlVisibility: {
              permissionMode: false,
              search: false,
            },
            dictationMode: "auto",
            dictationEnabledByProvider: false,
            providerDictationLikelySupported: false,
            contextWindowTokens: null,
            contextUsedTokens: null,
            contextUsageIsEstimated: false,
            contextUsageUnavailable: false,
            submittedMessageHistory: [],
            runtimeActivityCounts: {
              activeBackgroundTerminals: 0,
              activeSubagents: 0,
            },
            runtimeActivityDetails: {
              activeBackgroundTerminals: [],
              activeSubagents: [],
              unresolvedToolCalls: [],
              waitingForResponse: false,
            },
            onProviderDictationTranscribe: undefined,
          }}
        />,
      );
    });

    expect(container.textContent).toContain("messages:2");
    expect(container.textContent).toContain("Ask Project AI");
    expect(container.textContent).toContain("submit-disabled");
    expect(latestMessageListContentClassName).toBe(
      "mx-auto w-full min-w-0 max-w-[72rem] px-2",
    );

    const submitButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Submit",
    );
    expect(submitButton).toBeTruthy();

    act(() => {
      submitButton?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });

    expect(onSubmit).toHaveBeenCalledWith("Summarize the workspace", []);
  });
});
