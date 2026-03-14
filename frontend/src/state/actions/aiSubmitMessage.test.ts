import { resetProjectStores } from "state/utils";
import { PLAIN_CHAT_APP_GENERATION_MESSAGE_MODE } from "state/utils/chatAppGeneration";
import {
  route_get_agent_runs,
  route_get_llm_chat,
  route_get_llm_response,
} from "utils/generatedEndpoints";
import {
  StreamingEventTypeEnum,
  createAssistantChatMessage,
  createMessageTextContent,
  createUserChatMessage,
} from "utils/generatedTypes";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock("utils/generatedEndpoints", async () => {
  const actual = await vi.importActual<
    typeof import("utils/generatedEndpoints")
  >("utils/generatedEndpoints");
  return {
    ...actual,
    route_get_agent_runs: vi.fn(),
    route_get_llm_chat: vi.fn(),
    route_get_llm_response: vi.fn(),
  };
});

vi.mock("state/actions/frontendWebsocketAffinity", () => ({
  waitForFrontendAffinityToken: vi.fn(async () => "frontend-test-id"),
}));

const mockedRouteGetAgentRuns = vi.mocked(route_get_agent_runs);
const mockedRouteGetLLMChat = vi.mocked(route_get_llm_chat);
const mockedRouteGetLLMResponse = vi.mocked(route_get_llm_response);

let useAIStore: typeof import("state/definitions").useAIStore;
let submitMessage: typeof import("state/actions/aiChatSubmission").submitMessage;
let getDefaultChatDetails: typeof import("state/actions/aiChatDetails").getDefaultChatDetails;
let receiveLLMResponseChunk: typeof import("state/actions/aiChatStreaming").receiveLLMResponseChunk;
let memoryStorage: Storage;
const DRAFT_SURFACE_ID = "submit-draft-surface";

function buildGetLLMResponseResponse(chatId: string) {
  return {
    chatId,
    runId: `${chatId}-run`,
    engineType: "setta_llm" as const,
    sectionId: null,
  };
}

describe("submitMessage", () => {
  beforeAll(async () => {
    const storage = new Map<string, string>();
    memoryStorage = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
      clear: () => {
        storage.clear();
      },
      key: (index: number) => Array.from(storage.keys())[index] ?? null,
      get length() {
        return storage.size;
      },
    };
    (globalThis as { localStorage?: Storage }).localStorage = memoryStorage;

    const definitions = await import("state/definitions");
    useAIStore = definitions.useAIStore;
    const aiChatDetails = await import("state/actions/aiChatDetails");
    const aiChatStreaming = await import("state/actions/aiChatStreaming");
    const aiChatSubmission = await import("state/actions/aiChatSubmission");
    submitMessage = aiChatSubmission.submitMessage;
    getDefaultChatDetails = aiChatDetails.getDefaultChatDetails;
    receiveLLMResponseChunk = aiChatStreaming.receiveLLMResponseChunk;
  });

  beforeEach(() => {
    resetProjectStores();
    useAIStore.persist.setOptions({
      storage: {
        getItem: memoryStorage.getItem.bind(memoryStorage),
        setItem: memoryStorage.setItem.bind(memoryStorage),
        removeItem: memoryStorage.removeItem.bind(memoryStorage),
      },
    });
    vi.clearAllMocks();
    mockedRouteGetAgentRuns.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: [],
    });
    mockedRouteGetLLMChat.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: {
        messages: [],
        waitingForResponse: false,
        llmConfig: {
          id: "primary",
          model: "gpt-4o-mini",
          provider: "openai",
          base_url: null,
          api_key_env: null,
          other_params: null,
          mcpServerIds: [],
          temporary: false,
        },
        contextUsage: null,
        appGenerationByMessageId: {},
      },
    });
  });

  afterEach(() => {
    resetProjectStores();
    memoryStorage.clear();
  });

  afterAll(() => {
    delete (globalThis as { localStorage?: Storage }).localStorage;
  });

  it("throws backend error detail and rolls back optimistic user messages", async () => {
    const chatId = "chat-submit-detail";
    useAIStore.setState({
      chatDetails: {
        [chatId]: {
          ...getDefaultChatDetails(),
          messages: [],
          waitingForResponse: false,
        },
      },
      pendingChatDetailsBySurfaceId: {},
    });

    mockedRouteGetLLMResponse.mockResolvedValue({
      status: 400,
      hasResponse: true,
      data: {
        detail: "Reference image notes exceed 5000 characters.",
      },
    });

    await expect(
      submitMessage(
        chatId,
        "Generate a compact dashboard.",
        [],
        true,
        "engine-primary",
        false,
      ),
    ).rejects.toThrow("Reference image notes exceed 5000 characters.");

    const details = useAIStore.getState().chatDetails[chatId];
    expect(details?.messages).toHaveLength(0);
    expect(details?.waitingForResponse).toBe(false);
  });

  it("falls back to status-derived errors when backend detail is absent", async () => {
    const chatId = "chat-submit-status-fallback";
    useAIStore.setState({
      chatDetails: {
        [chatId]: {
          ...getDefaultChatDetails(),
          messages: [],
          waitingForResponse: false,
        },
      },
    });

    mockedRouteGetLLMResponse.mockResolvedValue({
      status: 503,
      hasResponse: true,
      data: null,
    });

    await expect(
      submitMessage(
        chatId,
        "Generate a compact dashboard.",
        [],
        true,
        "engine-primary",
        false,
      ),
    ).rejects.toThrow("Chat request failed (status 503).");
  });

  it("passes app-generation mode context through to the backend request", async () => {
    const returnedChatId = "chat-app-generation-mode";
    mockedRouteGetLLMResponse.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: buildGetLLMResponseResponse(returnedChatId),
    });

    await expect(
      submitMessage(
        null,
        "Generate from MCP context.",
        [],
        true,
        "engine-primary",
        false,
        {
          pendingSurfaceId: DRAFT_SURFACE_ID,
          appGeneration: {
            mode: "mcp_server",
          },
        },
      ),
    ).resolves.toBe(returnedChatId);

    expect(mockedRouteGetLLMResponse).toHaveBeenCalledTimes(1);
    const [payload] = mockedRouteGetLLMResponse.mock.calls[0] as [
      {
        appGenerationMode: string | null;
        appGenerationByMessageId: Record<string, string>;
        message: { id: string };
      },
    ];
    expect(payload.appGenerationMode).toBe("mcp_server");
    expect(payload.appGenerationByMessageId).toEqual({
      [payload.message.id]: "mcp_server",
    });
  });

  it("preserves retained image-mode provenance for text-only follow-up submits", async () => {
    const chatId = "chat-image-follow-up";
    mockedRouteGetLLMResponse.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: buildGetLLMResponseResponse(chatId),
    });
    useAIStore.setState({
      chatDetails: {
        [chatId]: {
          ...getDefaultChatDetails(),
          messages: [
            createUserChatMessage({
              id: "msg-image-initial",
              content: [
                createMessageTextContent({
                  text: "Match this reference image.",
                }),
              ],
              attachments: [
                {
                  id: "image-1",
                  name: "reference.png",
                  mimeType: "image/png",
                  size: 128,
                },
              ],
            }),
          ],
          waitingForResponse: false,
        },
      },
      chatAppGenerationDetailsByChatId: {
        [chatId]: {
          activeAppGeneration: {
            mode: "json_render_with_image",
          },
          appGenerationByMessageId: {
            "msg-image-initial": {
              mode: "json_render_with_image",
            },
          },
        },
      },
    });

    await expect(
      submitMessage(
        chatId,
        "Tighten the spacing.",
        [],
        true,
        "engine-primary",
        false,
        {
          appGeneration: {
            mode: "json_render_with_image",
          },
        },
      ),
    ).resolves.toBe(chatId);

    const [payload] = mockedRouteGetLLMResponse.mock.calls[0] as [
      {
        appGenerationMode: string | null;
        appGenerationByMessageId: Record<string, string>;
        message: { id: string; attachments: unknown[] };
      },
    ];
    expect(payload.appGenerationMode).toBe("json_render_with_image");
    expect(payload.message.attachments).toEqual([]);
    expect(payload.appGenerationByMessageId).toEqual({
      "msg-image-initial": "json_render_with_image",
      [payload.message.id]: "json_render_with_image",
    });
  });

  it("persists explicit plain-chat provenance for plain chat submits", async () => {
    const returnedChatId = "chat-standard-submit";
    mockedRouteGetLLMResponse.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: buildGetLLMResponseResponse(returnedChatId),
    });
    useAIStore.setState({
      pendingChatDetailsBySurfaceId: {},
      pendingChatAppGenerationDetailsBySurfaceId: {},
    });

    await expect(
      submitMessage(
        null,
        "Just answer this question.",
        [],
        true,
        "engine-primary",
        false,
        {
          pendingSurfaceId: DRAFT_SURFACE_ID,
        },
      ),
    ).resolves.toBe(returnedChatId);

    expect(mockedRouteGetLLMResponse).toHaveBeenCalledTimes(1);
    const [payload] = mockedRouteGetLLMResponse.mock.calls[0] as [
      {
        appGenerationMode: string | null;
        appGenerationByMessageId: Record<string, string>;
        message: { id: string };
      },
    ];
    expect(payload.appGenerationMode).toBeNull();
    expect(payload.appGenerationByMessageId).toEqual({
      [payload.message.id]: PLAIN_CHAT_APP_GENERATION_MESSAGE_MODE,
    });
  });

  it("uses explicit execution settings and keeps app-generation submits deterministic", async () => {
    const returnedChatId = "chat-explicit-execution-settings";
    mockedRouteGetLLMResponse.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: buildGetLLMResponseResponse(returnedChatId),
    });

    await expect(
      submitMessage(
        null,
        "Generate from MCP context.",
        [],
        true,
        "engine-primary",
        false,
        {
          pendingSurfaceId: DRAFT_SURFACE_ID,
          executionSettings: {
            permissionMode: "yolo",
            searchEnabled: false,
          },
          appGeneration: {
            mode: "mcp_server",
          },
        },
      ),
    ).resolves.toBe(returnedChatId);

    expect(mockedRouteGetLLMResponse).toHaveBeenCalledTimes(1);
    const [payload] = mockedRouteGetLLMResponse.mock.calls[0] as [
      {
        permissionMode: string;
        searchEnabled: boolean;
      },
    ];
    expect(payload.permissionMode).toBe("yolo");
    expect(payload.searchEnabled).toBe(false);
  });

  it("refreshes agent runs after successful submit hydration", async () => {
    const returnedChatId = "chat-submit-provenance-sync";
    mockedRouteGetLLMResponse.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: buildGetLLMResponseResponse(returnedChatId),
    });
    mockedRouteGetLLMChat.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: {
        messages: [],
        waitingForResponse: false,
        llmConfig: {
          id: "primary",
          model: "gpt-4o-mini",
          provider: "openai",
          base_url: null,
          api_key_env: null,
          other_params: null,
          mcpServerIds: [],
          temporary: false,
        },
        contextUsage: null,
        appGenerationByMessageId: {},
      },
    });
    mockedRouteGetAgentRuns.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: [
        {
          id: "run-provenance-sync",
          profileId: null,
          status: "completed",
          startedAt: "2026-06-10T00:00:00Z",
          finishedAt: "2026-06-10T00:00:01Z",
          events: [],
          inputs: {
            runType: "llm_chat",
            chatId: returnedChatId,
            engineConfigId: "engine-primary",
            projectConfigId: "project-config-id",
            messages: [],
          },
          outputs: {
            name: "Synced",
            nameSource: "llm",
          },
          toolCalls: [],
          cost: null,
        },
      ],
    });

    await expect(
      submitMessage(
        null,
        "Sync provenance after submit.",
        [],
        true,
        "engine-primary",
        false,
        {
          pendingSurfaceId: DRAFT_SURFACE_ID,
        },
      ),
    ).resolves.toBe(returnedChatId);

    await expect.poll(() => mockedRouteGetAgentRuns.mock.calls.length).toBe(1);
    await expect
      .poll(() =>
        useAIStore
          .getState()
          .agentRuns.some((run) => run.inputs?.chatId === returnedChatId),
      )
      .toBe(true);
  });

  it("hydrates app-generation provenance from the chat response immediately after submit", async () => {
    const returnedChatId = "chat-submit-hydrated-app-generation";
    mockedRouteGetLLMResponse.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: buildGetLLMResponseResponse(returnedChatId),
    });
    mockedRouteGetLLMChat.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: {
        messages: [
          createUserChatMessage({
            id: "msg-app",
            content: [createMessageTextContent({ text: "Use MCP context." })],
            attachments: [],
          }),
        ],
        waitingForResponse: false,
        llmConfig: null,
        contextUsage: null,
        appGenerationByMessageId: {
          "msg-app": "mcp_server",
        },
      },
    });

    await expect(
      submitMessage(
        null,
        "Use MCP context.",
        [],
        true,
        "engine-primary",
        false,
        {
          pendingSurfaceId: DRAFT_SURFACE_ID,
          appGeneration: {
            mode: "mcp_server",
          },
        },
      ),
    ).resolves.toBe(returnedChatId);

    expect(
      useAIStore.getState().chatAppGenerationDetailsByChatId[returnedChatId],
    ).toEqual({
      activeAppGeneration: {
        mode: "mcp_server",
      },
      appGenerationByMessageId: {
        "msg-app": {
          mode: "mcp_server",
        },
      },
    });
  });

  it("includes frontend websocket affinity id in llm requests", async () => {
    const returnedChatId = "chat-affinity-id";
    mockedRouteGetLLMResponse.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: buildGetLLMResponseResponse(returnedChatId),
    });

    await expect(
      submitMessage(
        null,
        "Check websocket affinity propagation.",
        [],
        false,
        "engine-primary",
        false,
        {
          pendingSurfaceId: DRAFT_SURFACE_ID,
        },
      ),
    ).resolves.toBe(returnedChatId);

    const [payload] = mockedRouteGetLLMResponse.mock.calls[0] as [
      { frontendAffinityToken: string },
    ];
    expect(payload.frontendAffinityToken).toBe("frontend-test-id");
  });

  it("routes optimistic user messages to the selected chat when chatId is provided", async () => {
    const chatId = "chat-route-selected";
    const untouchedSurfaceId = "untouched-surface";
    const releaseSubmit: { resolve: (() => void) | null } = { resolve: null };
    const submitGate = new Promise<void>((resolve) => {
      releaseSubmit.resolve = resolve;
    });
    mockedRouteGetLLMResponse.mockImplementation(async () => {
      await submitGate;
      return {
        status: 200,
        hasResponse: true,
        data: buildGetLLMResponseResponse(chatId),
      };
    });
    mockedRouteGetLLMChat.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: {
        messages: [],
        waitingForResponse: false,
        llmConfig: {
          id: "primary",
          model: "gpt-4o-mini",
          provider: "openai",
          base_url: null,
          api_key_env: null,
          other_params: null,
          mcpServerIds: [],
          temporary: false,
        },
        contextUsage: null,
      },
    });
    useAIStore.setState({
      chatDetails: {
        [chatId]: {
          ...getDefaultChatDetails(),
          messages: [],
          waitingForResponse: false,
        },
      },
      pendingChatDetailsBySurfaceId: {
        [untouchedSurfaceId]: {
          ...getDefaultChatDetails(),
          messages: [
            createUserChatMessage({
              id: "untouched-user-msg",
              content: [
                createMessageTextContent({
                  text: "Do not touch this pending draft.",
                }),
              ],
              attachments: [],
            }),
          ],
          waitingForResponse: true,
        },
      },
    });

    const submitPromise = submitMessage(
      chatId,
      "Route this to the selected chat.",
      [],
      true,
      "engine-primary",
      false,
    );

    // Wait until submit has enqueued its optimistic state before releasing the backend response.
    await expect
      .poll(() =>
        useAIStore
          .getState()
          .chatDetails[
            chatId
          ]?.messages.some((message) => message.role === "user"),
      )
      .toBe(true);
    const optimisticState = useAIStore.getState();
    expect(
      optimisticState.pendingChatDetailsBySurfaceId[untouchedSurfaceId]
        ?.messages[0]?.id,
    ).toBe("untouched-user-msg");
    releaseSubmit.resolve?.();

    await expect(submitPromise).resolves.toBe(chatId);
  });

  it("keeps pending draft routing isolated when late chunks arrive for another chat", async () => {
    const existingChatId = "chat-existing-stream";
    const returnedChatId = "chat-new-draft";
    const releaseSubmit: { resolve: (() => void) | null } = { resolve: null };
    const submitGate = new Promise<void>((resolve) => {
      releaseSubmit.resolve = resolve;
    });
    mockedRouteGetLLMResponse.mockImplementation(async () => {
      await submitGate;
      return {
        status: 200,
        hasResponse: true,
        data: buildGetLLMResponseResponse(returnedChatId),
      };
    });
    mockedRouteGetLLMChat.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: {
        messages: [],
        waitingForResponse: false,
        llmConfig: {
          id: "primary",
          model: "gpt-4o-mini",
          provider: "openai",
          base_url: null,
          api_key_env: null,
          other_params: null,
          mcpServerIds: [],
          temporary: false,
        },
        contextUsage: null,
      },
    });
    useAIStore.setState({
      activeChatId: undefined,
      pendingChatDetailsBySurfaceId: {},
      chatDetails: {
        [existingChatId]: {
          ...getDefaultChatDetails(),
          messages: [
            createUserChatMessage({
              id: "existing-user-msg",
              content: [
                createMessageTextContent({
                  text: "Write a long poem",
                }),
              ],
              attachments: [],
            }),
          ],
          waitingForResponse: true,
        },
      },
    });

    const submitPromise = submitMessage(
      null,
      "Can you run a bunch of read only bash commands?",
      [],
      true,
      "engine-primary",
      false,
      {
        pendingSurfaceId: DRAFT_SURFACE_ID,
      },
    );

    // Wait for optimistic pending draft state to be applied.
    await expect
      .poll(() => {
        return (
          useAIStore
            .getState()
            .pendingChatDetailsBySurfaceId[
              DRAFT_SURFACE_ID
            ]?.messages.some((message) => message.role === "user") ?? false
        );
      })
      .toBe(true);

    // Simulate an in-flight chunk for the old chat while the new draft request is still pending.
    receiveLLMResponseChunk({
      chatId: existingChatId,
      sectionId: null,
      chunk: {
        type: StreamingEventTypeEnum.MESSAGE_START,
        message: createAssistantChatMessage({
          id: "existing-assistant-msg",
          content: [createMessageTextContent({ text: "Continuing poem..." })],
        }),
      },
    });

    const stateDuringRace = useAIStore.getState();
    const pendingUserMessage = stateDuringRace.pendingChatDetailsBySurfaceId[
      DRAFT_SURFACE_ID
    ]?.messages.find((message) => message.role === "user");
    const pendingUserText =
      pendingUserMessage?.content
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join(" ")
        .trim() ?? "";
    const existingChatUserTexts =
      stateDuringRace.chatDetails[existingChatId]?.messages
        .filter((message) => message.role === "user")
        .map((message) =>
          message.content
            .filter((part) => part.type === "text")
            .map((part) => part.text)
            .join(" ")
            .trim(),
        ) ?? [];
    expect(stateDuringRace.activeChatId).toBeUndefined();
    expect(pendingUserText).toBe(
      "Can you run a bunch of read only bash commands?",
    );
    expect(existingChatUserTexts).not.toContain(pendingUserText);

    releaseSubmit.resolve?.();
    await expect(submitPromise).resolves.toBe(returnedChatId);
  });
});
