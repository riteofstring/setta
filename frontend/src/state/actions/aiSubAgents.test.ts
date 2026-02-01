import { resetProjectStores } from "state/utils";
import {
  route_create_agentic_edge,
  route_create_top_level_section,
  route_set_chat_section_state,
  route_set_section_name,
} from "utils/generatedEndpoints";
import {
  AgenticEdgeContextModeEnum,
  AgenticEdgeKindEnum,
  ChatRoleEnum,
  SectionTypeEnum,
  StreamingEventTypeEnum,
  createChatSectionImpl,
  createCore,
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
let receiveLLMResponseChunk: typeof import("./ai").receiveLLMResponseChunk;
let useAIStore: typeof import("state/definitions").useAIStore;
let useProjectState: typeof import("state/definitions").useProjectState;
let useShareSession: typeof import("state/definitions").useShareSession;

vi.mock("utils/generatedEndpoints", async () => {
  const actual = await vi.importActual<
    typeof import("utils/generatedEndpoints")
  >("utils/generatedEndpoints");
  return {
    ...actual,
    route_create_top_level_section: vi.fn(),
    route_set_section_name: vi.fn(),
    route_set_chat_section_state: vi.fn(),
    route_create_agentic_edge: vi.fn(),
  };
});

const projectConfigId = "project-1";
const parentSectionId = "section-parent";
const parentVariantId = "variant-parent";
const parentImplId = "impl-parent";
const parentChatId = "chat-parent";

const childSectionId = "section-child";
const childVariantId = "variant-child";
const childImplId = "impl-child";

const toolCallId = "tool-1";

function flushPromises() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function seedChatSection({
  sectionId,
  variantId,
  implId,
  chatId,
  name,
}: {
  sectionId: string;
  variantId: string;
  implId: string;
  chatId: string | null;
  name: string;
}) {
  const sectionCore = createCore({
    id: sectionId,
    name,
    variants: [variantId],
    defaultVariant: variantId,
  });
  const sectionVariant = createVariant({
    id: variantId,
    name: `${name} variant`,
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
    state.sections = { ...state.sections, [sectionId]: sectionCore };
    state.sectionVariants = {
      ...state.sectionVariants,
      [variantId]: sectionVariant,
    };
    state.sectionImpls = { ...state.sectionImpls, [implId]: sectionImpl };
    state.projectConfig.sectionVariantMap = {
      ...state.projectConfig.sectionVariantMap,
      [sectionId]: variantId,
    };
  });
}

describe("sub-agent chat section surfacing", () => {
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
    useShareSession = definitions.useShareSession;
    receiveLLMResponseChunk = (await import("./ai")).receiveLLMResponseChunk;
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
    useShareSession.setState({ isShareMode: false });
    useProjectState.setState((state) => {
      state.projectConfig = createProjectConfig({ id: projectConfigId });
      state.sections = {};
      state.sectionVariants = {};
      state.sectionImpls = {};
      state.previewSectionVariantMap = {};
    });
    useAIStore.setState({ agentProfiles: [] });
    seedChatSection({
      sectionId: parentSectionId,
      variantId: parentVariantId,
      implId: parentImplId,
      chatId: parentChatId,
      name: "Parent Chat",
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetProjectStores();
    memoryStorage.clear();
  });

  afterAll(() => {
    delete (globalThis as { localStorage?: Storage }).localStorage;
  });

  it("creates a sub-agent chat section and links it", async () => {
    const createSectionMock =
      route_create_top_level_section as unknown as vi.Mock;
    createSectionMock.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: { sectionId: childSectionId, panTo: null },
    });
    const toolCall = {
      id: toolCallId,
      type: "function" as const,
      function: {
        name: "Task",
        arguments: { task: "Summarize logs" },
      },
    };
    const assistantMessage = {
      id: "msg-1",
      role: ChatRoleEnum.assistant,
      content: [],
      tool_calls: [toolCall],
    };

    receiveLLMResponseChunk({
      chatId: parentChatId,
      sectionId: parentSectionId,
      chunk: {
        type: StreamingEventTypeEnum.MESSAGE_FINALIZED,
        message: assistantMessage,
      },
    });
    await flushPromises();

    expect(route_create_top_level_section).toHaveBeenCalledTimes(1);
    const createArgs = createSectionMock.mock.calls[0][0];
    expect(createArgs.projectConfigId).toBe(projectConfigId);
    expect(createArgs.implType).toBe(SectionTypeEnum.Chat);
    expect(createArgs.implOverrides.managed).toBe(true);
    expect(createArgs.implOverrides.engineConfigId).toBe("engine-1");
    expect(createArgs.implOverrides.messages[0].role).toBe(ChatRoleEnum.system);
    expect(createArgs.implOverrides.messages[1].role).toBe(
      ChatRoleEnum.user,
    );
    expect(createArgs.implOverrides.messages[2].role).toBe(
      ChatRoleEnum.assistant,
    );
    expect(createArgs.implOverrides.messages[2].tool_calls[0].id).toBe(
      toolCallId,
    );

    expect(route_set_section_name).toHaveBeenCalledWith({
      projectConfigId,
      sectionId: childSectionId,
      name: "Sub-agent - Summarize logs",
    });
    expect(route_create_agentic_edge).toHaveBeenCalledWith({
      projectConfigId,
      sourceSectionId: parentSectionId,
      targetSectionId: childSectionId,
      kind: AgenticEdgeKindEnum.chat_chat,
      contextMode: AgenticEdgeContextModeEnum.reference_only,
    });

    seedChatSection({
      sectionId: childSectionId,
      variantId: childVariantId,
      implId: childImplId,
      chatId: null,
      name: "Child Chat",
    });

    receiveLLMResponseChunk({
      chatId: parentChatId,
      sectionId: parentSectionId,
      chunk: {
        type: StreamingEventTypeEnum.TOOL_RESULT,
        result: {
          id: "tool-msg-1",
          role: ChatRoleEnum.tool,
          tool_call_id: toolCallId,
          tool_name: "Task",
          arguments: {},
          result: "done",
          content: [],
          is_error: false,
          started_at: new Date().toISOString(),
          completed_at: null,
        },
      },
    });
    await flushPromises();

    const setChatStateMock = route_set_chat_section_state as unknown as vi.Mock;
    expect(setChatStateMock).toHaveBeenCalled();
    const childCall = setChatStateMock.mock.calls.find(
      (call) => call[0]?.sectionId === childSectionId,
    );
    expect(childCall).toBeDefined();
    if (!childCall) {
      throw new Error("Expected setChatSectionState call for child section.");
    }
    const setArgs = childCall[0];
    expect(
      setArgs.state.messages.some(
        (message) =>
          message.role === ChatRoleEnum.tool &&
          message.tool_call_id === toolCallId,
      ),
    ).toBe(true);
    expect(
      setArgs.state.messages.some(
        (message) =>
          message.role === ChatRoleEnum.assistant &&
          message.content?.some(
            (entry) => entry.type === "text" && entry.text === "done",
          ),
      ),
    ).toBe(true);
  });
});
