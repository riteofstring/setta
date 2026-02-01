import { getCurrEffectiveSectionImplOfType } from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
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

vi.mock("state/actions/agenticEdges", () => ({
  createAgenticEdgeFromSections: vi.fn(),
}));

vi.mock("utils/generatedEndpoints", async () => {
  const actual = await vi.importActual<
    typeof import("utils/generatedEndpoints")
  >("utils/generatedEndpoints");
  return {
    ...actual,
    route_create_top_level_section: vi.fn(),
    route_set_section_name: vi.fn(),
    route_set_chat_section_state: vi.fn(),
  };
});

let receiveLLMResponseChunk: typeof import("./ai").receiveLLMResponseChunk;
let resetAIStreamingStateForTests: typeof import("./ai").resetAIStreamingStateForTests;

const projectConfigId = "project-1";
const parentSectionId = "section-parent";
const parentVariantId = "variant-parent";
const parentImplId = "impl-parent";
const parentChatId = "chat-parent";
const subSectionId = "section-sub";
const subVariantId = "variant-sub";
const subImplId = "impl-sub";
const subChatId = "toolu_sub";

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

function addChatSection({
  sectionId,
  variantId,
  implId,
  chatId,
}: {
  sectionId: string;
  variantId: string;
  implId: string;
  chatId: string | null;
}) {
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
    state.sections[sectionId] = sectionCore;
    state.sectionVariants[variantId] = sectionVariant;
    state.sectionImpls[implId] = sectionImpl;
    state.projectConfig.sectionVariantMap[sectionId] = variantId;
  });
}

function seedParentSection() {
  useProjectState.setState((state) => {
    state.projectConfig = createProjectConfig({ id: projectConfigId });
    state.sections = {};
    state.sectionVariants = {};
    state.sectionImpls = {};
    state.projectConfig.sectionVariantMap = {};
    state.previewSectionVariantMap = {};
  });
  addChatSection({
    sectionId: parentSectionId,
    variantId: parentVariantId,
    implId: parentImplId,
    chatId: parentChatId,
  });
}

function hasAssistantMessage(sectionId: string, messageId: string): boolean {
  const impl = getCurrEffectiveSectionImplOfType(
    useProjectState.getState(),
    sectionId,
    SectionTypeEnum.Chat,
  );
  return impl.messages.some(
    (entry) => entry.role === ChatRoleEnum.assistant && entry.id === messageId,
  );
}

describe("sub-agent approval routing", () => {
  beforeAll(async () => {
    const aiModule = await import("./ai");
    receiveLLMResponseChunk = aiModule.receiveLLMResponseChunk;
    resetAIStreamingStateForTests = aiModule.resetAIStreamingStateForTests;
  });

  beforeEach(() => {
    resetProjectStores();
    resetAIStreamingStateForTests();
    seedParentSection();
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetProjectStores();
  });

  afterAll(() => {
    vi.clearAllMocks();
  });

  it("routes approval streaming to the sub-agent section", async () => {
    const route_create_top_level_section = (
      await import("utils/generatedEndpoints")
    ).route_create_top_level_section as unknown as vi.Mock;
    route_create_top_level_section.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: { sectionId: subSectionId },
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
              id: subChatId,
              type: "function",
              function: {
                name: "Task",
                arguments: { task: "Write notes" },
              },
            },
          ],
        },
      },
    });

    addChatSection({
      sectionId: subSectionId,
      variantId: subVariantId,
      implId: subImplId,
      chatId: subChatId,
    });

    await flushPromises();

    const approvalId = "approval-1";
    const approvalPayload = JSON.stringify({
      approvalId,
      toolName: "write_file",
      toolType: "file",
      input: { path: "/tmp/demo.txt" },
      toolContext: { parentToolCallId: subChatId },
    });

    receiveLLMResponseChunk({
      chatId: parentChatId,
      sectionId: parentSectionId,
      chunk: {
        type: StreamingEventTypeEnum.MESSAGE_START,
        message: {
          id: approvalId,
          role: ChatRoleEnum.assistant,
          content: [],
          attachments: [],
          tool_calls: [
            {
              id: approvalId,
              type: "function",
              function: {
                name: "setta.approval",
                arguments: {
                  approvalId,
                  toolName: "write_file",
                  toolType: "file",
                  input: { path: "/tmp/demo.txt" },
                  toolContext: { parentToolCallId: subChatId },
                },
              },
            },
          ],
        },
      },
    });
    receiveLLMResponseChunk({
      chatId: parentChatId,
      sectionId: parentSectionId,
      chunk: {
        type: StreamingEventTypeEnum.TOOL_CALL_DELTA,
        message_id: approvalId,
        tool_call_id: approvalId,
        tool_name: "setta.approval",
        arguments_delta: approvalPayload,
      },
    });
    receiveLLMResponseChunk({
      chatId: parentChatId,
      sectionId: parentSectionId,
      chunk: {
        type: StreamingEventTypeEnum.MESSAGE_STOP,
        message_id: approvalId,
      },
    });

    expect(hasAssistantMessage(parentSectionId, approvalId)).toBe(false);
    expect(hasAssistantMessage(subSectionId, approvalId)).toBe(true);
  });
});
