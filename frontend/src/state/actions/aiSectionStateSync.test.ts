import { getCurrEffectiveSectionImplOfType } from "state/actions/sectionInfos";
import { markChatStreamActive } from "state/aiStreamingTracker";
import { resetProjectStores } from "state/utils";
import {
  ChatRoleEnum,
  LLMConfig,
  SectionTypeEnum,
  createChatSectionImpl,
  createCore,
  createMessageTextContent,
  createMessageThinkingContent,
  createProjectConfig,
  createUserDefaultChatSectionImpl,
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

vi.mock("utils/generatedEndpoints", async () => {
  const actual = await vi.importActual<
    typeof import("utils/generatedEndpoints")
  >("utils/generatedEndpoints");
  return {
    ...actual,
    route_get_llm_chat: vi.fn(),
    route_get_external_agent_chat: vi.fn(),
    route_set_chat_section_state: vi.fn(),
  };
});

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
  const sectionImpl = createChatSectionImpl(
    createUserDefaultChatSectionImpl({ chatId }),
    {
      id: implId,
      chatId,
      managed: true,
      engineConfigId: "engine-1",
      thinking: true,
    },
  );
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
    const route_get_external_agent_chat = (
      await import("utils/generatedEndpoints")
    ).route_get_external_agent_chat as unknown as vi.Mock;
    const route_set_chat_section_state = (
      await import("utils/generatedEndpoints")
    ).route_set_chat_section_state as unknown as vi.Mock;
    route_get_external_agent_chat.mockResolvedValue({
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
    route_set_chat_section_state.mockResolvedValue({
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
    const persistedCall = route_set_chat_section_state.mock.calls.find(
      (call) => call[0]?.sectionId === sectionId,
    );
    expect(persistedCall).toBeDefined();
  });

  it("syncs LLM chat history to section state", async () => {
    const route_get_llm_chat = (await import("utils/generatedEndpoints"))
      .route_get_llm_chat as unknown as vi.Mock;
    const route_set_chat_section_state = (
      await import("utils/generatedEndpoints")
    ).route_set_chat_section_state as unknown as vi.Mock;
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
    route_get_llm_chat.mockResolvedValue({
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
    route_set_chat_section_state.mockResolvedValue({
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
    const persistedCall = route_set_chat_section_state.mock.calls.find(
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
    const route_get_llm_chat = (await import("utils/generatedEndpoints"))
      .route_get_llm_chat as unknown as vi.Mock;
    const route_set_chat_section_state = (
      await import("utils/generatedEndpoints")
    ).route_set_chat_section_state as unknown as vi.Mock;
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
    route_get_llm_chat.mockResolvedValue({
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
    route_set_chat_section_state.mockResolvedValue({
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
    const persistedCall = route_set_chat_section_state.mock.calls.find(
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
    const route_get_external_agent_chat = (
      await import("utils/generatedEndpoints")
    ).route_get_external_agent_chat as unknown as vi.Mock;
    const route_set_chat_section_state = (
      await import("utils/generatedEndpoints")
    ).route_set_chat_section_state as unknown as vi.Mock;
    route_get_external_agent_chat.mockResolvedValue({
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
    route_set_chat_section_state.mockResolvedValue({
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
    const persistedCall = route_set_chat_section_state.mock.calls.find(
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

  it("drops local-only section messages after hydrate when stream is inactive", async () => {
    const route_get_external_agent_chat = (
      await import("utils/generatedEndpoints")
    ).route_get_external_agent_chat as unknown as vi.Mock;
    const route_set_chat_section_state = (
      await import("utils/generatedEndpoints")
    ).route_set_chat_section_state as unknown as vi.Mock;
    route_get_external_agent_chat.mockResolvedValue({
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
    route_set_chat_section_state.mockResolvedValue({
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
    const route_get_external_agent_chat = (
      await import("utils/generatedEndpoints")
    ).route_get_external_agent_chat as unknown as vi.Mock;
    const route_set_chat_section_state = (
      await import("utils/generatedEndpoints")
    ).route_set_chat_section_state as unknown as vi.Mock;
    route_get_external_agent_chat.mockResolvedValue({
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
    route_set_chat_section_state.mockResolvedValue({
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
    const persistedCall = route_set_chat_section_state.mock.calls.find(
      (call) => call[0]?.sectionId === sectionId,
    );
    expect(persistedCall).toBeDefined();
    if (!persistedCall) {
      throw new Error("Expected setChatSectionState call for replacement.");
    }
    expect(persistedCall[0].state.toolCallArguments).toEqual({ remote: "{}" });
  });

  it("clears stale llm tool call arguments when hydrate is not streaming", async () => {
    const route_get_llm_chat = (await import("utils/generatedEndpoints"))
      .route_get_llm_chat as unknown as vi.Mock;
    const route_set_chat_section_state = (
      await import("utils/generatedEndpoints")
    ).route_set_chat_section_state as unknown as vi.Mock;
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
    route_get_llm_chat.mockResolvedValue({
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
    route_set_chat_section_state.mockResolvedValue({
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
    const persistedCall = route_set_chat_section_state.mock.calls.find(
      (call) => call[0]?.sectionId === sectionId,
    );
    expect(persistedCall).toBeDefined();
    if (!persistedCall) {
      throw new Error("Expected setChatSectionState call for llm hydrate.");
    }
    expect(persistedCall[0].state.toolCallArguments).toEqual({});
  });
});
