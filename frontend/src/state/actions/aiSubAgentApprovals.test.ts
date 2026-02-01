import { getCurrEffectiveSectionImplOfType } from "state/actions/sectionInfos";
import { resetProjectStores } from "state/utils";
import {
  route_create_agentic_edge,
  route_create_top_level_section,
  route_set_chat_section_state,
  route_set_section_name,
} from "utils/generatedEndpoints";
import {
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
let useProjectState: typeof import("state/definitions").useProjectState;
let useShareSession: typeof import("state/definitions").useShareSession;
let useAIStore: typeof import("state/definitions").useAIStore;

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

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

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

describe("sub-agent approval routing", () => {
  const projectConfigId = "approval-project";
  const parentSectionId = "section-parent";
  const parentVariantId = "variant-parent";
  const parentImplId = "impl-parent";
  const parentChatId = "chat-parent";
  const childSectionId = "section-child";
  const childVariantId = "variant-child";
  const childImplId = "impl-child";
  const subAgentToolCallId = "tool-subagent";
  const approvalToolCallId = "tool-approval";

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
    useProjectState = definitions.useProjectState;
    useShareSession = definitions.useShareSession;
    useAIStore = definitions.useAIStore;
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
    useAIStore.setState({ agentProfiles: [] });
    useProjectState.setState((state) => {
      state.projectConfig = createProjectConfig({ id: projectConfigId });
      state.sections = {};
      state.sectionVariants = {};
      state.sectionImpls = {};
      state.previewSectionVariantMap = {};
    });
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
    vi.clearAllMocks();
  });

  afterAll(() => {
    delete (globalThis as { localStorage?: Storage }).localStorage;
    vi.clearAllMocks();
  });

  it("routes approval requests tied to a sub-agent into the sub-agent section", async () => {
    const createSectionMock =
      route_create_top_level_section as unknown as vi.Mock;
    createSectionMock.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: { sectionId: childSectionId, panTo: null },
    });

    receiveLLMResponseChunk({
      chatId: parentChatId,
      sectionId: parentSectionId,
      chunk: {
        type: StreamingEventTypeEnum.MESSAGE_FINALIZED,
        message: {
          id: "msg-parent",
          role: ChatRoleEnum.assistant,
          content: [],
          attachments: [],
          tool_calls: [
            {
              id: subAgentToolCallId,
              type: "function",
              function: {
                name: "Task",
                arguments: { task: "Run report" },
              },
            },
          ],
        },
      },
    });
    await flushPromises();

    seedChatSection({
      sectionId: childSectionId,
      variantId: childVariantId,
      implId: childImplId,
      chatId: subAgentToolCallId,
      name: "Child Chat",
    });

    receiveLLMResponseChunk({
      chatId: parentChatId,
      sectionId: parentSectionId,
      chunk: {
        type: StreamingEventTypeEnum.MESSAGE_START,
        message: {
          id: approvalToolCallId,
          role: ChatRoleEnum.assistant,
          content: [],
          attachments: [],
          tool_calls: [
            {
              id: approvalToolCallId,
              type: "function",
              function: {
                name: "setta.approval",
                arguments: {
                  approvalId: approvalToolCallId,
                  tool: "Bash",
                  input: { command: "ls" },
                  toolName: "Bash",
                  toolContext: { parentToolCallId: subAgentToolCallId },
                },
              },
            },
          ],
        },
      },
    });

    const parentImpl = getCurrEffectiveSectionImplOfType(
      useProjectState.getState(),
      parentSectionId,
      SectionTypeEnum.Chat,
    );
    const childImpl = getCurrEffectiveSectionImplOfType(
      useProjectState.getState(),
      childSectionId,
      SectionTypeEnum.Chat,
    );
    const parentHasApproval = parentImpl.messages.some((message) =>
      message.tool_calls?.some((toolCall) => toolCall.id === approvalToolCallId),
    );
    const childHasApproval = childImpl.messages.some((message) =>
      message.tool_calls?.some((toolCall) => toolCall.id === approvalToolCallId),
    );

    expect(childHasApproval).toBe(true);
    expect(parentHasApproval).toBe(false);
  });
});
