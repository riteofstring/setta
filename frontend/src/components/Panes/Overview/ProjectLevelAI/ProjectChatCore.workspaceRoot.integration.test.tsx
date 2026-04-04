/* @vitest-environment jsdom */

import "testUtils/reactRefreshPreamble";

import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("components/Chat/ChatInput", () => ({
  ChatInput: () => <div data-testid="mock-chat-input" />,
  resolveSlashCommandRequest: vi.fn(),
}));

vi.mock("components/Chat/ChatMessages", () => ({
  ChatMessageList: () => <div data-testid="mock-chat-message-list" />,
}));

vi.mock("utils/generatedEndpoints", async () => {
  const actual = await vi.importActual<
    typeof import("utils/generatedEndpoints")
  >("utils/generatedEndpoints");
  return {
    ...actual,
    route_get_file_browser_root: vi.fn(),
    route_get_folder_contents: vi.fn(),
  };
});

import {
  useAIStore,
  useLocalStorage,
  useProjectState,
} from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  route_get_file_browser_root,
  route_get_folder_contents,
} from "utils/generatedEndpoints";
import { EngineTypeEnum, createProjectConfig } from "utils/generatedTypes";
import { ProjectChatCore } from "./ProjectChatCore";

function buildFolderContentsResponse(
  folderPath: string,
  items: Array<{ name: string; type: string; fullPath: string }>,
) {
  return {
    data: {
      folderPath,
      items,
    },
    status: 200,
    hasResponse: true,
  };
}

describe("ProjectChatCore workspace root scans", () => {
  let host: HTMLDivElement;
  let root: Root;

  async function renderProjectChatCore({
    strictMode = false,
  }: {
    strictMode?: boolean;
  } = {}) {
    const content = (
      <ProjectChatCore
        surfaceId="surface-a"
        chatId={null}
        draftMessage=""
        setDraftMessage={vi.fn()}
        placeholderText="Type a message..."
        conversationFilterText=""
        hydrationAuthority={{
          status: "ready",
          hydrationRunType: null,
          blockedErrorCode: null,
        }}
        hydrationMetadataRevision="revision-root-scan"
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
      />
    );

    await act(async () => {
      root.render(strictMode ? <StrictMode>{content}</StrictMode> : content);
    });
  }

  beforeEach(() => {
    resetProjectStores();
    vi.clearAllMocks();
    vi.useFakeTimers();

    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });

    useProjectState.setState((state) => {
      state.projectConfig = createProjectConfig({ id: "project-1" });
    });
    useLocalStorage.setState({
      appGenerationMode: "json_render",
      customProjectChatSlashCommandsByProjectConfigId: {},
      projectChatDraftMessageByProjectConfigId: {},
    });
    useAIStore.setState({
      chatDetails: {},
      pendingChatDetailsBySurfaceId: {},
      interruptedAssistantMessageIdsByChatId: {},
      agentRuns: [],
      agentRunsInitialLoadComplete: true,
      agentRunsAuthorityState: "ready",
      pendingProjectChatPrompt: null,
    });

    vi.mocked(route_get_file_browser_root).mockResolvedValue({
      data: {
        rootPath: "/workspace",
        pathSeparator: "/",
        ignorePatterns: [],
      },
      status: 200,
      hasResponse: true,
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

  it("does not start a second workspace root scan while the first scan is still in flight", async () => {
    let resolveFolderScan:
      | ((value: {
          data: {
            folderPath: string;
            items: Array<{ name: string; type: string; fullPath: string }>;
          };
          status: number;
          hasResponse: boolean;
        }) => void)
      | null = null;

    vi.mocked(route_get_folder_contents).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFolderScan = resolve;
        }),
    );

    await renderProjectChatCore();

    await vi.waitFor(() => {
      expect(route_get_folder_contents).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(6200);
    });

    expect(route_get_folder_contents).toHaveBeenCalledTimes(1);

    if (!resolveFolderScan) {
      throw new Error(
        "Expected the initial workspace root scan to be pending.",
      );
    }
    resolveFolderScan({
      ...buildFolderContentsResponse("/workspace", []),
    });
  });

  it("does not schedule repeated workspace root fetches after the initial resolution", async () => {
    vi.mocked(route_get_folder_contents).mockResolvedValue(
      buildFolderContentsResponse("/workspace", []),
    );

    await renderProjectChatCore({ strictMode: true });

    await vi.waitFor(() => {
      expect(route_get_file_browser_root).toHaveBeenCalled();
    });
    const initialRootFetchCount = vi.mocked(route_get_file_browser_root).mock
      .calls.length;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20000);
    });

    expect(vi.mocked(route_get_file_browser_root).mock.calls.length).toBe(
      initialRootFetchCount,
    );
  });
});
