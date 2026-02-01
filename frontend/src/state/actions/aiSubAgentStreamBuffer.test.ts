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

describe("sub-agent streaming buffering", () => {
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

  it("queues sub-agent stream chunks until the section exists", async () => {
    const route_create_top_level_section = (
      await import("utils/generatedEndpoints")
    ).route_create_top_level_section as unknown as vi.Mock;

    let resolveCreate: (value: unknown) => void;
    const createPromise = new Promise((resolve) => {
      resolveCreate = resolve;
    });
    route_create_top_level_section.mockReturnValue(createPromise);

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

    receiveLLMResponseChunk({
      chatId: subChatId,
      sectionId: null,
      chunk: {
        type: StreamingEventTypeEnum.DELTA,
        message_id: `subagent-result:${subChatId}`,
        content: [{ type: "text_delta", index: 0, text: "Streaming..." }],
      },
    });

    addChatSection({
      sectionId: subSectionId,
      variantId: subVariantId,
      implId: subImplId,
      chatId: subChatId,
    });

    resolveCreate({
      status: 200,
      hasResponse: true,
      data: { sectionId: subSectionId },
    });
    await flushPromises();

    const impl = getCurrEffectiveSectionImplOfType(
      useProjectState.getState(),
      subSectionId,
      SectionTypeEnum.Chat,
    );
    expect(
      impl.messages.some((message) => {
        if (message.role !== ChatRoleEnum.assistant) {
          return false;
        }
        return message.content?.some(
          (content) =>
            content.type === "text" && content.text.includes("Streaming"),
        );
      }),
    ).toBe(true);
  });
});
