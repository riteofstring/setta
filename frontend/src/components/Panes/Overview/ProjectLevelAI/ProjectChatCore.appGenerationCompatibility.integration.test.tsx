/* @vitest-environment jsdom */

import "testUtils/reactRefreshPreamble";

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockUseAppSubsystemSlashCommands = vi.fn();
const mockUseAppSubsystemFrontendStatus = vi.fn();
const capturedChatMessageListProps: {
  current: {
    onEditMessage?: (
      messageId: string,
      text: string,
      attachments: Array<{ id: string; mimeType?: string; name?: string }>,
    ) => Promise<boolean>;
    onRedoMessage?: (assistantMessageId: string) => Promise<boolean>;
  } | null;
} = { current: null };

vi.mock("components/Chat/ChatInput", () => ({
  ChatInput: () => <div data-testid="mock-chat-input" />,
}));

vi.mock("components/Chat/ChatMessages", () => ({
  ChatMessageList: (props: unknown) => {
    capturedChatMessageListProps.current =
      props as typeof capturedChatMessageListProps.current;
    return <div data-testid="mock-chat-message-list" />;
  },
}));

vi.mock("plugins/appSubsystemRuntime", async () => {
  const actual = await vi.importActual<
    typeof import("plugins/appSubsystemRuntime")
  >("plugins/appSubsystemRuntime");
  return {
    ...actual,
    useAppSubsystemSlashCommands: () => mockUseAppSubsystemSlashCommands(),
    useAppSubsystemFrontendStatus: () => mockUseAppSubsystemFrontendStatus(),
  };
});

vi.mock("state/actions/ai", async () => {
  const actual =
    await vi.importActual<typeof import("state/actions/ai")>(
      "state/actions/ai",
    );
  return {
    ...actual,
    getLLMChatHydrationOutcome: vi.fn(),
    submitEditedMessage: vi.fn(),
  };
});

import {
  getLLMChatHydrationOutcome,
  submitEditedMessage,
} from "state/actions/ai";
import {
  useAIStore,
  useLocalStorage,
  useNotifications,
  useProjectState,
} from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  createAssistantChatMessage,
  createEngineConfig,
  createMessageTextContent,
  createProjectConfig,
  createUserChatMessage,
  EngineTypeEnum,
} from "utils/generatedTypes";
import { ProjectChatCore } from "./ProjectChatCore";
import { HISTORICAL_APP_GENERATION_PLUGIN_REQUIRED_MESSAGE } from "./projectChatCoreUtils";

describe("ProjectChatCore historical app-generation compatibility", () => {
  let host: HTMLDivElement | null;
  let root: Root | null;

  beforeEach(() => {
    resetProjectStores();
    vi.clearAllMocks();
    capturedChatMessageListProps.current = null;
    mockUseAppSubsystemSlashCommands.mockReturnValue([]);
    mockUseAppSubsystemFrontendStatus.mockReturnValue("unavailable");
    vi.mocked(getLLMChatHydrationOutcome).mockResolvedValue({
      outcome: "success",
      status: 200,
      errorCode: null,
    });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    useProjectState.setState((state) => {
      state.projectConfig = createProjectConfig({ id: "project-1" });
    });
    useLocalStorage.setState({
      appGenerationMode: null,
      customProjectChatSlashCommandsByProjectConfigId: {},
      projectChatDraftMessageByProjectConfigId: {},
    });
    useNotifications.setState({
      notifications: [],
    });
    useAIStore.setState({
      chatDetails: {
        "chat-a": {
          messages: [
            createUserChatMessage({
              id: "user-1",
              content: [
                createMessageTextContent({
                  text: "Make a support dashboard.",
                }),
              ],
              attachments: [],
            }),
            createAssistantChatMessage({
              id: "assistant-1",
              content: [
                createMessageTextContent({
                  text: "Here is the first draft.",
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
      chatAppGenerationDetailsByChatId: {
        "chat-a": {
          activeAppGeneration: { mode: "json_render" },
          appGenerationByMessageId: {
            "user-1": { mode: "json_render" },
          },
        },
      },
      pendingChatDetailsBySurfaceId: {},
      pendingChatAppGenerationDetailsBySurfaceId: {},
      interruptedAssistantMessageIdsByChatId: {},
      agentRuns: [],
      agentRunsInitialLoadComplete: true,
      agentRunsAuthorityState: "ready",
      pendingProjectChatPrompt: null,
    });
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    host?.remove();
    resetProjectStores();
  });

  function renderProjectChatCore(setChatId = vi.fn()): void {
    if (!root) {
      throw new Error("Expected React root.");
    }
    act(() => {
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
          engineConfig={createEngineConfig({
            id: "engine-a",
            type: EngineTypeEnum.setta_llm,
          })}
          engineType={EngineTypeEnum.setta_llm}
          hasLLMConfig={true}
          externalEngineAvailable={false}
          noLLMConfigsAvailable={false}
          transcriptionProfileId={null}
          dictationMode="auto"
          providerDictationAvailable={false}
          providerDictationLikelySupported={false}
          setChatId={setChatId}
        />,
      );
    });
  }

  it("hydrates a historical app-generation thread without crashing and blocks edited resubmits when the plugin is unavailable", async () => {
    vi.mocked(submitEditedMessage).mockResolvedValue("chat-next");
    renderProjectChatCore();

    expect(
      host?.querySelector('[data-testid="mock-chat-message-list"]'),
    ).not.toBeNull();

    let result: boolean | undefined;
    await act(async () => {
      result = await capturedChatMessageListProps.current?.onEditMessage?.(
        "user-1",
        "Rewrite the app thread.",
        [],
      );
    });

    expect(result).toBe(false);
    expect(submitEditedMessage).not.toHaveBeenCalled();
    expect(useNotifications.getState().notifications[0]?.message).toBe(
      HISTORICAL_APP_GENERATION_PLUGIN_REQUIRED_MESSAGE,
    );
  });

  it("blocks redo for assistant replies whose source turn used app generation when the plugin is unavailable", async () => {
    vi.mocked(submitEditedMessage).mockResolvedValue("chat-next");
    renderProjectChatCore();

    let result: boolean | undefined;
    await act(async () => {
      result =
        await capturedChatMessageListProps.current?.onRedoMessage?.(
          "assistant-1",
        );
    });

    expect(result).toBe(false);
    expect(submitEditedMessage).not.toHaveBeenCalled();
    expect(useNotifications.getState().notifications[0]?.message).toBe(
      HISTORICAL_APP_GENERATION_PLUGIN_REQUIRED_MESSAGE,
    );
  });

  it("still allows edits for historical plain-chat turns while the plugin is unavailable", async () => {
    vi.mocked(submitEditedMessage).mockResolvedValue("chat-next");
    useAIStore.setState({
      chatAppGenerationDetailsByChatId: {
        "chat-a": {
          activeAppGeneration: null,
          appGenerationByMessageId: {
            "user-1": { mode: null },
          },
        },
      },
    });
    const setChatId = vi.fn();
    renderProjectChatCore(setChatId);

    let result: boolean | undefined;
    await act(async () => {
      result = await capturedChatMessageListProps.current?.onEditMessage?.(
        "user-1",
        "Keep this plain-chat edit.",
        [],
      );
    });

    expect(result).toBe(true);
    expect(submitEditedMessage).toHaveBeenCalledTimes(1);
    expect(setChatId).toHaveBeenCalledWith("chat-next");
    expect(useNotifications.getState().notifications).toEqual([]);
  });
});
