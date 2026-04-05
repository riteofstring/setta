import {
  getExternalAgentChat as apiGetExternalAgentChat,
  getLlmChat as apiGetLlmChat,
} from "openapi/http";
import { getCurrEffectiveSectionImplOfType } from "state/actions/sectionInfos";
import { markChatStreamActive } from "state/aiStreamingTracker";
import { resetProjectStores } from "state/utils";
import { route_set_chat_section_state } from "utils/generatedEndpoints";
import {
  ChatRoleEnum,
  LLMConfig,
  SectionTypeEnum,
  createChatSectionImpl,
  createCore,
  createMessageTextContent,
  createMessageThinkingContent,
  createProjectConfig,
  createVariant,
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

let getExternalAgentChat: typeof import("./ai").getExternalAgentChat;
let getLLMChat: typeof import("./ai").getLLMChat;
let useAIStore: typeof import("state/definitions").useAIStore;
let useProjectState: typeof import("state/definitions").useProjectState;

vi.mock("openapi/http", async () => {
  const actual =
    await vi.importActual<typeof import("openapi/http")>("openapi/http");
  return {
    ...actual,
    getLlmChat: vi.fn(),
    getExternalAgentChat: vi.fn(),
  };
});

vi.mock("openapi/http/result", () => ({
  callOpenAPI: function <T>(promise: Promise<T>) {
    return promise;
  },
}));

vi.mock("utils/generatedEndpoints", async () => {
  const actual = await vi.importActual<
    typeof import("utils/generatedEndpoints")
  >("utils/generatedEndpoints");
  return {
    ...actual,
    route_set_chat_section_state: vi.fn(),
  };
});

const mockedRouteGetLLMChat = vi.mocked(apiGetLlmChat);
const mockedRouteGetExternalAgentChat = vi.mocked(apiGetExternalAgentChat);
const mockedRouteSetChatSectionState = vi.mocked(route_set_chat_section_state);

const projectConfigId = "project-1";
const sectionId = "section-1";
const variantId = "variant-1";
const implId = "impl-1";
const chatId = "chat-1";

function seedChatSection() {
  const sectionCore = createCore({
    id: sectionId,
    name: "Chat",
    variants: [variantId],
    defaultVariant: variantId,
  });
  const sectionVariant = createVariant({
    id: variantId,
    name: "Chat Variant",
    impl: implId,
    nonPresetImpls: [],
  });
  const sectionImpl = createChatSectionImpl({
    ...{ chatId },
    ...{
      id: implId,
      chatId,
      managed: true,
      engineConfigId: "engine-1",
      thinking: true,
    },
  });
  useProjectState.setState((state) => {
    state.projectConfig = createProjectConfig({ id: projectConfigId });
    state.sections = { [sectionId]: sectionCore };
    state.sectionVariants = { [variantId]: sectionVariant };
    state.sectionImpls = { [implId]: sectionImpl };
    state.projectConfig.sectionVariantMap = { [sectionId]: variantId };
    state.previewSectionVariantMap = {};
  });
}

describe("chat history sync to section state", () => {
  let memoryStorage: Storage;

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
    useProjectState = definitions.useProjectState;
    const ai = await import("./ai");
    getExternalAgentChat = ai.getExternalAgentChat;
    getLLMChat = ai.getLLMChat;
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
    seedChatSection();
  });

  afterEach(() => {
    resetProjectStores();
    memoryStorage.clear();
    vi.clearAllMocks();
  });

  afterAll(() => {
    delete (globalThis as { localStorage?: Storage }).localStorage;
  });

  it("syncs external agent chat history to section state", async () => {
    mockedRouteGetExternalAgentChat.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: {
        messages: [
          {
            id: "msg-1",
            role: ChatRoleEnum.assistant,
            content: [{ type: "text", text: "Sub agent done" }],
            attachments: [],
            tool_calls: null,
          },
        ],
        waitingForResponse: false,
        toolCallArguments: { "tool-1": "{}" },
        appGenerationByMessageId: {},
      },
    });
    mockedRouteSetChatSectionState.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: null,
    });

    await getExternalAgentChat(chatId, projectConfigId, sectionId);

    const impl = getCurrEffectiveSectionImplOfType(
      useProjectState.getState(),
      sectionId,
      SectionTypeEnum.Chat,
    );
    expect(
      impl.messages.some((message) => {
        if (message.role !== ChatRoleEnum.assistant) {
          return false;
        }
        return message.content?.some(
          (content) =>
            content.type === "text" && content.text === "Sub agent done",
        );
      }),
    ).toBe(true);
    expect(impl.toolCallArguments).toEqual({ "tool-1": "{}" });
    expect(impl.waitingForResponse).toBe(false);
    const persistedCall = mockedRouteSetChatSectionState.mock.calls.find(
      (call) => call[0]?.sectionId === sectionId,
    );
    expect(persistedCall).toBeDefined();
  });

  it("syncs LLM chat history to section state", async () => {
    const llmConfig: LLMConfig = {
      id: "llm-1",
      model: "test-model",
      provider: null,
      base_url: null,
      api_key_env: null,
      other_params: null,
      mcpServerIds: null,
      temporary: false,
    };
    mockedRouteGetLLMChat.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: {
        messages: [
          {
            id: "msg-2",
            role: ChatRoleEnum.assistant,
            content: [{ type: "text", text: "Hello" }],
            attachments: [],
            tool_calls: null,
          },
        ],
        toolCallArguments: { "tool-1": `{"task":"Hello"}` },
        waitingForResponse: true,
        llmConfig,
        appGenerationByMessageId: {},
      },
    });
    mockedRouteSetChatSectionState.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: null,
    });

    await getLLMChat(chatId, sectionId);

    const impl = getCurrEffectiveSectionImplOfType(
      useProjectState.getState(),
      sectionId,
      SectionTypeEnum.Chat,
    );
    expect(
      impl.messages.some((message) => {
        if (message.role !== ChatRoleEnum.assistant) {
          return false;
        }
        return message.content?.some(
          (content) => content.type === "text" && content.text === "Hello",
        );
      }),
    ).toBe(true);
    expect(impl.toolCallArguments).toEqual({ "tool-1": `{"task":"Hello"}` });
    expect(impl.waitingForResponse).toBe(true);
    const persistedCall = mockedRouteSetChatSectionState.mock.calls.find(
      (call) => call[0]?.sectionId === sectionId,
    );
    expect(persistedCall).toBeDefined();
    if (!persistedCall) {
      throw new Error("Expected setChatSectionState call for LLM hydrate.");
    }
    expect(persistedCall[0].state.toolCallArguments).toEqual({
      "tool-1": `{"task":"Hello"}`,
    });
  });

  it("replaces local thought text with backend-authoritative hydrate during active LLM streams", async () => {
    const llmConfig: LLMConfig = {
      id: "llm-1",
      model: "test-model",
      provider: null,
      base_url: null,
      api_key_env: null,
      other_params: null,
      mcpServerIds: null,
      temporary: false,
    };
    const backendSummary = "Structured summary title from backend metadata.";
    mockedRouteGetLLMChat.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: {
        messages: [
          {
            id: "msg-thinking",
            role: ChatRoleEnum.assistant,
            content: [
              createMessageThinkingContent({
                thinking: "",
                summary: backendSummary,
                signature: "backend-signature",
              }),
            ],
            attachments: [],
            tool_calls: null,
          },
        ],
        waitingForResponse: true,
        llmConfig,
        contextUsage: null,
      },
    });
    mockedRouteSetChatSectionState.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: null,
    });

    useProjectState.setState((state) => {
      const impl = state.sectionImpls[implId];
      if (!impl || impl.type !== SectionTypeEnum.Chat) {
        return;
      }
      impl.messages = [
        {
          id: "msg-thinking",
          role: ChatRoleEnum.assistant,
          content: [
            createMessageThinkingContent({
              thinking:
                "Reviewing grouped activity rows before final answer output.",
              summary: "",
              signature: "",
            }),
          ],
          attachments: [],
          tool_calls: null,
        },
      ];
      impl.waitingForResponse = true;
    });
    markChatStreamActive(chatId, sectionId);

    await getLLMChat(chatId, sectionId);

    const impl = getCurrEffectiveSectionImplOfType(
      useProjectState.getState(),
      sectionId,
      SectionTypeEnum.Chat,
    );
    const message = impl.messages.find(
      (entry) =>
        entry.id === "msg-thinking" && entry.role === ChatRoleEnum.assistant,
    );
    expect(message?.content).toEqual([
      createMessageThinkingContent({
        thinking: "",
        summary: backendSummary,
        signature: "backend-signature",
      }),
    ]);
    const persistedCall = mockedRouteSetChatSectionState.mock.calls.find(
      (call) => call[0]?.sectionId === sectionId,
    );
    expect(persistedCall).toBeDefined();
    if (!persistedCall) {
      throw new Error(
        "Expected setChatSectionState call for merged thought hydrate.",
      );
    }
    expect(persistedCall[0].state.messages[0].content).toEqual([
      createMessageThinkingContent({
        thinking: "",
        summary: backendSummary,
        signature: "backend-signature",
      }),
    ]);
  });

  it("replaces section messages with backend history while preserving explicit stream overlays", async () => {
    mockedRouteGetExternalAgentChat.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: {
        messages: [
          {
            id: "msg-remote",
            role: ChatRoleEnum.assistant,
            content: [{ type: "text", text: "From backend" }],
            attachments: [],
            tool_calls: null,
          },
        ],
        waitingForResponse: false,
        toolCallArguments: { remote: "{}" },
        appGenerationByMessageId: {},
      },
    });
    mockedRouteSetChatSectionState.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: null,
    });

    useProjectState.setState((state) => {
      const impl = state.sectionImpls[implId];
      if (!impl || impl.type !== SectionTypeEnum.Chat) {
        return;
      }
      impl.messages = [
        {
          id: "msg-local",
          role: ChatRoleEnum.user,
          content: [createMessageTextContent({ text: "Local message" })],
          attachments: [],
        },
      ];
      impl.waitingForResponse = true;
      impl.toolCallArguments = { local: "{}" };
    });
    markChatStreamActive(chatId, sectionId);

    await getExternalAgentChat(chatId, projectConfigId, sectionId);

    const impl = getCurrEffectiveSectionImplOfType(
      useProjectState.getState(),
      sectionId,
      SectionTypeEnum.Chat,
    );
    expect(impl.messages.map((message) => message.id)).toEqual(["msg-remote"]);
    expect(impl.waitingForResponse).toBe(true);
    expect(impl.toolCallArguments).toEqual({ local: "{}", remote: "{}" });
    const persistedCall = mockedRouteSetChatSectionState.mock.calls.find(
      (call) => call[0]?.sectionId === sectionId,
    );
    expect(persistedCall).toBeDefined();
    if (!persistedCall) {
      throw new Error("Expected setChatSectionState call for merged hydrate.");
    }
    const persistedState = persistedCall[0].state;
    expect(persistedState.messages).toHaveLength(1);
    expect(persistedState.messages[0]?.id).toBe("msg-remote");
    expect(persistedState.waitingForResponse).toBe(true);
    expect(persistedState.toolCallArguments).toEqual({
      local: "{}",
      remote: "{}",
    });
  });

  it("keeps local-only section tool call overlays but lets backend win for overlapping ids during active-stream hydrate", async () => {
    mockedRouteGetExternalAgentChat.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: {
        messages: [
          {
            id: "msg-remote-tool-args",
            role: ChatRoleEnum.assistant,
            content: [{ type: "text", text: "From backend" }],
            attachments: [],
            tool_calls: null,
          },
        ],
        waitingForResponse: false,
        toolCallArguments: {
          shared: `{"task":"Backend canonical"}`,
          remoteOnly: `{"task":"Backend only"}`,
        },
        appGenerationByMessageId: {},
      },
    });
    mockedRouteSetChatSectionState.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: null,
    });

    useProjectState.setState((state) => {
      const impl = state.sectionImpls[implId];
      if (!impl || impl.type !== SectionTypeEnum.Chat) {
        return;
      }
      impl.messages = [
        {
          id: "msg-local-tool-args",
          role: ChatRoleEnum.user,
          content: [createMessageTextContent({ text: "Local message" })],
          attachments: [],
        },
      ];
      impl.waitingForResponse = true;
      impl.toolCallArguments = {
        shared: `{"task":"Local stale overlay"}`,
        localOnly: `{"task":"Still local only"}`,
      };
    });
    markChatStreamActive(chatId, sectionId);

    await getExternalAgentChat(chatId, projectConfigId, sectionId);

    const impl = getCurrEffectiveSectionImplOfType(
      useProjectState.getState(),
      sectionId,
      SectionTypeEnum.Chat,
    );
    expect(impl.toolCallArguments).toEqual({
      shared: `{"task":"Backend canonical"}`,
      remoteOnly: `{"task":"Backend only"}`,
      localOnly: `{"task":"Still local only"}`,
    });
    const persistedCall = mockedRouteSetChatSectionState.mock.calls.find(
      (call) => call[0]?.sectionId === sectionId,
    );
    expect(persistedCall).toBeDefined();
    if (!persistedCall) {
      throw new Error(
        "Expected setChatSectionState call for overlapped hydrate.",
      );
    }
    expect(persistedCall[0].state.toolCallArguments).toEqual({
      shared: `{"task":"Backend canonical"}`,
      remoteOnly: `{"task":"Backend only"}`,
      localOnly: `{"task":"Still local only"}`,
    });
  });

  it("syncs the active section branch to hydrated backend messages without rewriting inactive branches", async () => {
    const authoritativeMessage = {
      id: "msg-remote-branch",
      role: ChatRoleEnum.assistant,
      content: [createMessageTextContent({ text: "Backend branch history" })],
      attachments: [],
      tool_calls: null,
    };
    mockedRouteGetExternalAgentChat.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: {
        messages: [authoritativeMessage],
        waitingForResponse: false,
        toolCallArguments: { remote: "{}" },
        appGenerationByMessageId: {},
      },
    });
    mockedRouteSetChatSectionState.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: null,
    });

    useProjectState.setState((state) => {
      const impl = state.sectionImpls[implId];
      if (!impl || impl.type !== SectionTypeEnum.Chat) {
        return;
      }
      impl.messages = [
        {
          id: "msg-local-active",
          role: ChatRoleEnum.user,
          content: [createMessageTextContent({ text: "Local active branch" })],
          attachments: [],
        },
      ];
      impl.activeBranchId = "branch-active";
      impl.branches = {
        "branch-active": {
          messages: [
            {
              id: "msg-local-active",
              role: ChatRoleEnum.user,
              content: [
                createMessageTextContent({ text: "Local active branch" }),
              ],
              attachments: [],
            },
          ],
          createdAt: 100,
          parentBranchId: null,
          branchFromMessageId: null,
        },
        "branch-inactive": {
          messages: [
            {
              id: "msg-inactive",
              role: ChatRoleEnum.user,
              content: [
                createMessageTextContent({ text: "Inactive branch draft" }),
              ],
              attachments: [],
            },
          ],
          createdAt: 200,
          parentBranchId: "branch-active",
          branchFromMessageId: "msg-local-active",
        },
      };
      impl.waitingForResponse = true;
      impl.toolCallArguments = { local: "{}" };
    });
    markChatStreamActive(chatId, sectionId);

    await getExternalAgentChat(chatId, projectConfigId, sectionId);

    const impl = getCurrEffectiveSectionImplOfType(
      useProjectState.getState(),
      sectionId,
      SectionTypeEnum.Chat,
    );
    expect(impl.messages).toEqual([authoritativeMessage]);
    expect(impl.waitingForResponse).toBe(true);
    expect(impl.toolCallArguments).toEqual({ local: "{}", remote: "{}" });
    expect(impl.branches["branch-active"]?.messages).toEqual([
      authoritativeMessage,
    ]);
    expect(impl.branches["branch-inactive"]?.messages).toEqual([
      {
        id: "msg-inactive",
        role: ChatRoleEnum.user,
        content: [createMessageTextContent({ text: "Inactive branch draft" })],
        attachments: [],
      },
    ]);
    const persistedCall = mockedRouteSetChatSectionState.mock.calls.find(
      (call) => call[0]?.sectionId === sectionId,
    );
    expect(persistedCall).toBeDefined();
    if (!persistedCall) {
      throw new Error(
        "Expected setChatSectionState call for active branch hydrate sync.",
      );
    }
    expect(persistedCall[0].state.messages).toEqual([authoritativeMessage]);
    expect(persistedCall[0].state.branches["branch-active"]?.messages).toEqual([
      authoritativeMessage,
    ]);
    expect(
      persistedCall[0].state.branches["branch-inactive"]?.messages,
    ).toEqual([
      {
        id: "msg-inactive",
        role: ChatRoleEnum.user,
        content: [createMessageTextContent({ text: "Inactive branch draft" })],
        attachments: [],
      },
    ]);
  });

  it("drops local-only section messages after hydrate when stream is inactive", async () => {
    mockedRouteGetExternalAgentChat.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: {
        messages: [
          {
            id: "msg-remote-only",
            role: ChatRoleEnum.assistant,
            content: [{ type: "text", text: "Backend canonical message" }],
            attachments: [],
            tool_calls: null,
          },
        ],
        waitingForResponse: false,
        toolCallArguments: {},
        appGenerationByMessageId: {},
      },
    });
    mockedRouteSetChatSectionState.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: null,
    });

    useProjectState.setState((state) => {
      const impl = state.sectionImpls[implId];
      if (!impl || impl.type !== SectionTypeEnum.Chat) {
        return;
      }
      impl.messages = [
        {
          id: "msg-local-only",
          role: ChatRoleEnum.user,
          content: [createMessageTextContent({ text: "Local speculative" })],
          attachments: [],
        },
      ];
    });

    await getExternalAgentChat(chatId, projectConfigId, sectionId);

    const impl = getCurrEffectiveSectionImplOfType(
      useProjectState.getState(),
      sectionId,
      SectionTypeEnum.Chat,
    );
    expect(impl.messages.map((message) => message.id)).toEqual([
      "msg-remote-only",
    ]);
  });

  it("replaces tool call arguments when not streaming", async () => {
    mockedRouteGetExternalAgentChat.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: {
        messages: [
          {
            id: "msg-remote",
            role: ChatRoleEnum.assistant,
            content: [{ type: "text", text: "Remote only" }],
            attachments: [],
            tool_calls: null,
          },
        ],
        waitingForResponse: false,
        toolCallArguments: { remote: "{}" },
        appGenerationByMessageId: {},
      },
    });
    mockedRouteSetChatSectionState.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: null,
    });

    useProjectState.setState((state) => {
      const impl = state.sectionImpls[implId];
      if (!impl || impl.type !== SectionTypeEnum.Chat) {
        return;
      }
      impl.toolCallArguments = { local: "{}" };
    });

    await getExternalAgentChat(chatId, projectConfigId, sectionId);

    const impl = getCurrEffectiveSectionImplOfType(
      useProjectState.getState(),
      sectionId,
      SectionTypeEnum.Chat,
    );
    expect(impl.toolCallArguments).toEqual({ remote: "{}" });
    const persistedCall = mockedRouteSetChatSectionState.mock.calls.find(
      (call) => call[0]?.sectionId === sectionId,
    );
    expect(persistedCall).toBeDefined();
    if (!persistedCall) {
      throw new Error("Expected setChatSectionState call for replacement.");
    }
    expect(persistedCall[0].state.toolCallArguments).toEqual({ remote: "{}" });
  });

  it("clears stale llm tool call arguments when hydrate is not streaming", async () => {
    const llmConfig: LLMConfig = {
      id: "llm-1",
      model: "test-model",
      provider: null,
      base_url: null,
      api_key_env: null,
      other_params: null,
      mcpServerIds: null,
      temporary: false,
    };
    mockedRouteGetLLMChat.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: {
        messages: [
          {
            id: "msg-llm-remote",
            role: ChatRoleEnum.assistant,
            content: [{ type: "text", text: "Backend canonical message" }],
            attachments: [],
            tool_calls: null,
          },
        ],
        waitingForResponse: false,
        llmConfig,
        appGenerationByMessageId: {},
      },
    });
    mockedRouteSetChatSectionState.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: null,
    });

    useProjectState.setState((state) => {
      const impl = state.sectionImpls[implId];
      if (!impl || impl.type !== SectionTypeEnum.Chat) {
        return;
      }
      impl.toolCallArguments = { stale: "{}" };
    });
    useAIStore.setState({
      chatDetails: {
        [chatId]: {
          messages: [],
          toolCallArguments: { stale: "{}" },
          waitingForResponse: false,
          llmConfig: null,
          contextUsage: null,
        },
      },
    });

    await getLLMChat(chatId, sectionId);

    const impl = getCurrEffectiveSectionImplOfType(
      useProjectState.getState(),
      sectionId,
      SectionTypeEnum.Chat,
    );
    expect(impl.toolCallArguments).toEqual({});
    expect(
      useAIStore.getState().chatDetails[chatId]?.toolCallArguments,
    ).toEqual({});
    const persistedCall = mockedRouteSetChatSectionState.mock.calls.find(
      (call) => call[0]?.sectionId === sectionId,
    );
    expect(persistedCall).toBeDefined();
    if (!persistedCall) {
      throw new Error("Expected setChatSectionState call for llm hydrate.");
    }
    expect(persistedCall[0].state.toolCallArguments).toEqual({});
  });
});
