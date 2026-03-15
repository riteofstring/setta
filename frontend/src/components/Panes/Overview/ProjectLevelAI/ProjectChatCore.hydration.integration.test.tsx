/* @vitest-environment jsdom */

import "testUtils/reactRefreshPreamble";

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useLocalStorage } from "state/stores/uiPreferenceStores";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("components/Chat/ChatInput", () => ({
  ChatInput: () => <div data-testid="mock-chat-input" />,
  resolveSlashCommandRequest: vi.fn(),
}));

vi.mock("components/Chat/ChatMessages", () => ({
  ChatMessageList: () => <div data-testid="mock-chat-message-list" />,
}));

vi.mock("state/actions/aiHydration", async () => {
  const actual = await vi.importActual<
    typeof import("state/actions/aiHydration")
  >("state/actions/aiHydration");
  return {
    ...actual,
    getLLMChatHydrationOutcome: vi.fn(),
  };
});

import { getLLMChatHydrationOutcome } from "state/actions/aiHydration";
import { useAIStore, useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  EngineTypeEnum,
  createAssistantChatMessage,
  createMessageTextContent,
  createProjectConfig,
} from "utils/generatedTypes";
import { ProjectChatCore } from "./ProjectChatCore";

describe("ProjectChatCore hydration while waiting", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    resetProjectStores();
    vi.clearAllMocks();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    useProjectState.setState((state) => {
      state.projectConfig = createProjectConfig({ id: "project-1" });
    });
    useLocalStorage.setState({
      appGenerationMode: "json_render",
      customProjectChatSlashCommandsByProjectConfigId: {},
      projectChatDraftMessageByProjectConfigId: {},
    });
    useAIStore.setState({
      chatDetails: {
        "chat-a": {
          messages: [
            createAssistantChatMessage({
              id: "assistant-streaming",
              content: [
                createMessageTextContent({
                  text: "Newest incoming chunk only",
                }),
              ],
              attachments: [],
            }),
          ],
          toolCallArguments: {},
          waitingForResponse: true,
          llmConfig: null,
          contextUsage: null,
        },
      },
      pendingChatDetailsBySurfaceId: {},
      interruptedAssistantMessageIdsByChatId: {},
      agentRuns: [],
      agentRunsInitialLoadComplete: true,
      agentRunsAuthorityState: "ready",
      pendingProjectChatPrompt: null,
    });
  });

  afterEach(async () => {
    vi.useRealTimers();
    await act(async () => {
      root.unmount();
    });
    host.remove();
    resetProjectStores();
  });

  it("hydrates a selected managed thread even while the current chat is still waiting for more chunks", async () => {
    vi.mocked(getLLMChatHydrationOutcome).mockResolvedValue({
      outcome: "success",
      status: 200,
      errorCode: null,
    });

    await act(async () => {
      root.render(
        <ProjectChatCore
          surfaceId="surface-a"
          chatId="chat-a"
          draftMessage=""
          setDraftMessage={vi.fn()}
          placeholderText="Type a message..."
          conversationFilterText=""
          hydrationAuthority={{
            status: "ready",
            hydrationRunType: "llm_chat",
            blockedErrorCode: null,
          }}
          hydrationMetadataRevision="revision-1"
          thinking={true}
          engineConfigId="engine-a"
          engineType={EngineTypeEnum.setta_llm}
          hasLLMConfig={true}
          externalEngineAvailable={false}
          noLLMConfigsAvailable={false}
          transcriptionProfileId={null}
          dictationMode="auto"
          providerDictationAvailable={false}
          providerDictationLikelySupported={false}
          setChatId={vi.fn()}
        />,
      );
    });

    await vi.waitFor(() => {
      expect(getLLMChatHydrationOutcome).toHaveBeenCalledWith("chat-a");
    });
  });

  it("does not hydrate while waiting when authoritative metadata reports missing provenance", async () => {
    await act(async () => {
      root.render(
        <ProjectChatCore
          surfaceId="surface-a"
          chatId="chat-a"
          draftMessage=""
          setDraftMessage={vi.fn()}
          placeholderText="Type a message..."
          conversationFilterText=""
          hydrationAuthority={{
            status: "ready",
            hydrationRunType: null,
            blockedErrorCode: "chat_provenance_missing",
          }}
          hydrationMetadataRevision="revision-2"
          thinking={true}
          engineConfigId="engine-a"
          engineType={EngineTypeEnum.setta_llm}
          hasLLMConfig={true}
          externalEngineAvailable={false}
          noLLMConfigsAvailable={false}
          transcriptionProfileId={null}
          dictationMode="auto"
          providerDictationAvailable={false}
          providerDictationLikelySupported={false}
          setChatId={vi.fn()}
        />,
      );
    });

    await act(async () => {});
    expect(getLLMChatHydrationOutcome).not.toHaveBeenCalled();
  });

  it("cancels transient hydration retries when the selected chat changes", async () => {
    vi.useFakeTimers();
    useAIStore.setState({
      chatDetails: {
        "chat-a": {
          messages: [],
          toolCallArguments: {},
          waitingForResponse: false,
          llmConfig: null,
          contextUsage: null,
        },
        "chat-b": {
          messages: [],
          toolCallArguments: {},
          waitingForResponse: false,
          llmConfig: null,
          contextUsage: null,
        },
      },
    });
    vi.mocked(getLLMChatHydrationOutcome).mockImplementation(async (chatId) => {
      if (chatId === "chat-a") {
        return {
          outcome: "transient_failure",
          status: 500,
          errorCode: null,
        };
      }
      return {
        outcome: "success",
        status: 200,
        errorCode: null,
      };
    });

    await act(async () => {
      root.render(
        <ProjectChatCore
          surfaceId="surface-a"
          chatId="chat-a"
          draftMessage=""
          setDraftMessage={vi.fn()}
          placeholderText="Type a message..."
          conversationFilterText=""
          hydrationAuthority={{
            status: "ready",
            hydrationRunType: "llm_chat",
            blockedErrorCode: null,
          }}
          hydrationMetadataRevision="revision-retry-a"
          thinking={false}
          engineConfigId="engine-a"
          engineType={EngineTypeEnum.setta_llm}
          hasLLMConfig={true}
          externalEngineAvailable={false}
          noLLMConfigsAvailable={false}
          transcriptionProfileId={null}
          dictationMode="auto"
          providerDictationAvailable={false}
          providerDictationLikelySupported={false}
          setChatId={vi.fn()}
        />,
      );
    });

    await vi.waitFor(() => {
      expect(getLLMChatHydrationOutcome).toHaveBeenCalledWith("chat-a");
    });
    expect(
      vi
        .mocked(getLLMChatHydrationOutcome)
        .mock.calls.filter(([chatId]) => chatId === "chat-a"),
    ).toHaveLength(1);

    await act(async () => {
      root.render(
        <ProjectChatCore
          surfaceId="surface-a"
          chatId="chat-b"
          draftMessage=""
          setDraftMessage={vi.fn()}
          placeholderText="Type a message..."
          conversationFilterText=""
          hydrationAuthority={{
            status: "ready",
            hydrationRunType: "llm_chat",
            blockedErrorCode: null,
          }}
          hydrationMetadataRevision="revision-retry-b"
          thinking={false}
          engineConfigId="engine-a"
          engineType={EngineTypeEnum.setta_llm}
          hasLLMConfig={true}
          externalEngineAvailable={false}
          noLLMConfigsAvailable={false}
          transcriptionProfileId={null}
          dictationMode="auto"
          providerDictationAvailable={false}
          providerDictationLikelySupported={false}
          setChatId={vi.fn()}
        />,
      );
    });

    await vi.waitFor(() => {
      expect(getLLMChatHydrationOutcome).toHaveBeenCalledWith("chat-b");
    });

    await act(async () => {
      vi.advanceTimersByTime(1500);
    });

    expect(
      vi
        .mocked(getLLMChatHydrationOutcome)
        .mock.calls.filter(([chatId]) => chatId === "chat-a"),
    ).toHaveLength(1);
    vi.useRealTimers();
  });

  it("reports zero conversation matches when the filter empty state replaces the message list", async () => {
    const onConversationSearchMatchCountChange = vi.fn();
    useAIStore.setState({
      chatDetails: {
        "chat-a": {
          messages: [
            createAssistantChatMessage({
              id: "assistant-visible",
              content: [
                createMessageTextContent({
                  text: "Only visible content",
                }),
              ],
              attachments: [],
            }),
          ],
          toolCallArguments: {},
          waitingForResponse: false,
          llmConfig: null,
          contextUsage: null,
        },
      },
    });

    await act(async () => {
      root.render(
        <ProjectChatCore
          surfaceId="surface-a"
          chatId="chat-a"
          draftMessage=""
          setDraftMessage={vi.fn()}
          placeholderText="Type a message..."
          conversationFilterText="secret"
          hydrationAuthority={{
            status: "ready",
            hydrationRunType: "llm_chat",
            blockedErrorCode: null,
          }}
          hydrationMetadataRevision="revision-3"
          thinking={false}
          engineConfigId="engine-a"
          engineType={EngineTypeEnum.setta_llm}
          hasLLMConfig={true}
          externalEngineAvailable={false}
          noLLMConfigsAvailable={false}
          transcriptionProfileId={null}
          dictationMode="auto"
          providerDictationAvailable={false}
          providerDictationLikelySupported={false}
          setChatId={vi.fn()}
          onConversationSearchMatchCountChange={
            onConversationSearchMatchCountChange
          }
        />,
      );
    });

    expect(host.textContent).toContain("No messages match this filter.");
    expect(onConversationSearchMatchCountChange).toHaveBeenCalledWith(0);
  });
});
