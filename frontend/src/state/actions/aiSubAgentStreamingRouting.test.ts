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

function getAssistantMessageText(
  sectionId: string,
  messageId: string,
): string | null {
  const impl = getCurrEffectiveSectionImplOfType(
    useProjectState.getState(),
    sectionId,
    SectionTypeEnum.Chat,
  );
  const message = impl.messages.find((entry) => entry.id === messageId);
  if (!message || message.role !== ChatRoleEnum.assistant) {
    return null;
  }
  const content = message.content ?? [];
  const text = content
    .filter((item) => item.type === "text")
    .map((item) => item.text)
    .join("");
  return text || null;
}

describe("sub-agent streaming routing", () => {
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

  it("routes streaming chunks to the sub-agent section, not the parent", async () => {
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

    const streamMessageId = `subagent-result:${subChatId}`;
    receiveLLMResponseChunk({
      chatId: subChatId,
      sectionId: null,
      chunk: {
        type: StreamingEventTypeEnum.MESSAGE_START,
        message: {
          id: streamMessageId,
          role: ChatRoleEnum.assistant,
          content: [],
          attachments: [],
          tool_calls: null,
        },
      },
    });
    receiveLLMResponseChunk({
      chatId: subChatId,
      sectionId: null,
      chunk: {
        type: StreamingEventTypeEnum.DELTA,
        message_id: streamMessageId,
        content: [{ type: "text_delta", index: 0, text: "Hello" }],
      },
    });

    const parentText = getAssistantMessageText(
      parentSectionId,
      streamMessageId,
    );
    expect(parentText).toBeNull();

    const subText = getAssistantMessageText(subSectionId, streamMessageId);
    expect(subText).toBe("Hello");
  });

  it("buffers sub-agent stream chunks before section creation and flushes in order", async () => {
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

    const streamMessageId = `subagent-result:${subChatId}`;
    receiveLLMResponseChunk({
      chatId: subChatId,
      sectionId: null,
      chunk: {
        type: StreamingEventTypeEnum.MESSAGE_START,
        message: {
          id: streamMessageId,
          role: ChatRoleEnum.assistant,
          content: [],
          attachments: [],
          tool_calls: null,
        },
      },
    });
    receiveLLMResponseChunk({
      chatId: subChatId,
      sectionId: null,
      chunk: {
        type: StreamingEventTypeEnum.DELTA,
        message_id: streamMessageId,
        content: [{ type: "text_delta", index: 0, text: "Hello " }],
      },
    });
    receiveLLMResponseChunk({
      chatId: subChatId,
      sectionId: null,
      chunk: {
        type: StreamingEventTypeEnum.DELTA,
        message_id: streamMessageId,
        content: [{ type: "text_delta", index: 0, text: "World" }],
      },
    });
    receiveLLMResponseChunk({
      chatId: subChatId,
      sectionId: null,
      chunk: {
        type: StreamingEventTypeEnum.MESSAGE_STOP,
        message_id: streamMessageId,
      },
    });

    const parentText = getAssistantMessageText(
      parentSectionId,
      streamMessageId,
    );
    expect(parentText).toBeNull();

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

    const subText = getAssistantMessageText(subSectionId, streamMessageId);
    expect(subText).toBe("Hello World");
  });

  it("applies incremental sub-agent deltas once the section exists", async () => {
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

    const streamMessageId = `subagent-result:${subChatId}`;
    receiveLLMResponseChunk({
      chatId: subChatId,
      sectionId: null,
      chunk: {
        type: StreamingEventTypeEnum.MESSAGE_START,
        message: {
          id: streamMessageId,
          role: ChatRoleEnum.assistant,
          content: [],
          attachments: [],
          tool_calls: null,
        },
      },
    });
    receiveLLMResponseChunk({
      chatId: subChatId,
      sectionId: null,
      chunk: {
        type: StreamingEventTypeEnum.DELTA,
        message_id: streamMessageId,
        content: [{ type: "text_delta", index: 0, text: "Hello" }],
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

    const initialText = getAssistantMessageText(subSectionId, streamMessageId);
    expect(initialText).toBe("Hello");

    receiveLLMResponseChunk({
      chatId: subChatId,
      sectionId: null,
      chunk: {
        type: StreamingEventTypeEnum.DELTA,
        message_id: streamMessageId,
        content: [{ type: "text_delta", index: 0, text: " World" }],
      },
    });

    const updatedText = getAssistantMessageText(subSectionId, streamMessageId);
    expect(updatedText).toBe("Hello World");
  });
});
