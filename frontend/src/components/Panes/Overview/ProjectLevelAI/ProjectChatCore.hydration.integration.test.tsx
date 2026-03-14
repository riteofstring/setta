/* @vitest-environment jsdom */

import "testUtils/reactRefreshPreamble";

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("components/Chat/ChatInput", () => ({
  ChatInput: () => <div data-testid="mock-chat-input" />,
  resolveSlashCommandRequest: vi.fn(),
}));

vi.mock("components/Chat/ChatMessages", () => ({
  ChatMessageList: () => <div data-testid="mock-chat-message-list" />,
}));

vi.mock("state/actions/ai", async () => {
  const actual =
    await vi.importActual<typeof import("state/actions/ai")>(
      "state/actions/ai",
    );
  return {
    ...actual,
    getLLMChatHydrationOutcome: vi.fn(),
    getProjectChatHydrationOutcomeWithFallback: vi.fn(),
  };
});

import {
  getLLMChatHydrationOutcome,
  getProjectChatHydrationOutcomeWithFallback,
} from "state/actions/ai";
import {
  useAIStore,
  useLocalStorage,
  useProjectState,
} from "state/definitions";
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

  it("probes fallback hydration while waiting when authoritative metadata reports missing provenance", async () => {
    vi.mocked(getProjectChatHydrationOutcomeWithFallback).mockResolvedValue({
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

    await vi.waitFor(() => {
      expect(getProjectChatHydrationOutcomeWithFallback).toHaveBeenCalledWith(
        "chat-a",
        "project-1",
        "llm_chat",
      );
    });
  });
});
