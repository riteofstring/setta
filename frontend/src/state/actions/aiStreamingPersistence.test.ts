import {
  getCurrEffectiveSectionImplOfType,
  processProjectStateUpdateFromBackend,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  ChatRoleEnum,
  SectionTypeEnum,
  StreamingEventTypeEnum,
  createChatSectionImpl,
  createCore,
  createProjectConfig,
  createVariant,
} from "utils/generatedTypes";
import {
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
    route_set_chat_section_state: vi.fn(),
  };
});

let receiveLLMResponseChunk: typeof import("./ai").receiveLLMResponseChunk;

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

describe("chat streaming persistence", () => {
  beforeAll(async () => {
    receiveLLMResponseChunk = (await import("./ai")).receiveLLMResponseChunk;
  });

  beforeEach(() => {
    resetProjectStores();
    seedChatSection();
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("persists streaming content on message stop and survives reload", async () => {
    const route_set_chat_section_state = (
      await import("utils/generatedEndpoints")
    ).route_set_chat_section_state as unknown as vi.Mock;
    route_set_chat_section_state.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: null,
    });

    receiveLLMResponseChunk({
      chatId,
      sectionId,
      chunk: {
        type: StreamingEventTypeEnum.message_start,
        message: {
          id: "msg-stream",
          role: ChatRoleEnum.assistant,
          content: [],
          attachments: [],
          tool_calls: null,
        },
      },
    });
    receiveLLMResponseChunk({
      chatId,
      sectionId,
      chunk: {
        type: StreamingEventTypeEnum.delta,
        message_id: "msg-stream",
        content: [{ type: "text_delta", index: 0, text: "Streaming" }],
      },
    });
    receiveLLMResponseChunk({
      chatId,
      sectionId,
      chunk: {
        type: StreamingEventTypeEnum.message_stop,
        message_id: "msg-stream",
      },
    });

    expect(route_set_chat_section_state).toHaveBeenCalledTimes(1);
    const persistedState = route_set_chat_section_state.mock.calls[0][0].state;
    const persistedText = persistedState.messages
      .filter((message) => message.role === ChatRoleEnum.assistant)
      .flatMap((message) => message.content ?? [])
      .filter((item) => item.type === "text")
      .map((item) => item.text)
      .join("");
    expect(persistedText).toContain("Streaming");

    const backendState = JSON.parse(JSON.stringify(useProjectState.getState()));
    const backendImpl = backendState.sectionImpls[implId];
    if (backendImpl && backendImpl.type === SectionTypeEnum.Chat) {
      backendImpl.messages = persistedState.messages;
      backendImpl.inputText = persistedState.inputText;
      backendImpl.waitingForResponse = persistedState.waitingForResponse;
      backendImpl.toolCallArguments = persistedState.toolCallArguments;
    }

    resetProjectStores();
    seedChatSection();

    processProjectStateUpdateFromBackend({
      projectState: backendState,
      completedOpIds: [],
      pendingOpIds: [],
    });

    const impl = getCurrEffectiveSectionImplOfType(
      useProjectState.getState(),
      sectionId,
      SectionTypeEnum.Chat,
    );
    const text = impl.messages
      .filter((message) => message.role === ChatRoleEnum.assistant)
      .flatMap((message) => message.content ?? [])
      .filter((item) => item.type === "text")
      .map((item) => item.text)
      .join("");
    expect(text).toContain("Streaming");
  });

  it("avoids double persistence when finalized then stopped", async () => {
    const route_set_chat_section_state = (
      await import("utils/generatedEndpoints")
    ).route_set_chat_section_state as unknown as vi.Mock;
    route_set_chat_section_state.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: null,
    });

    receiveLLMResponseChunk({
      chatId,
      sectionId,
      chunk: {
        type: StreamingEventTypeEnum.message_start,
        message: {
          id: "msg-final",
          role: ChatRoleEnum.assistant,
          content: [],
          attachments: [],
          tool_calls: null,
        },
      },
    });
    receiveLLMResponseChunk({
      chatId,
      sectionId,
      chunk: {
        type: StreamingEventTypeEnum.delta,
        message_id: "msg-final",
        content: [{ type: "text_delta", index: 0, text: "Finalized" }],
      },
    });
    receiveLLMResponseChunk({
      chatId,
      sectionId,
      chunk: {
        type: StreamingEventTypeEnum.message_finalized,
        message: {
          id: "msg-final",
          role: ChatRoleEnum.assistant,
          content: [{ type: "text", text: "Finalized" }],
          attachments: [],
          tool_calls: null,
        },
      },
    });
    receiveLLMResponseChunk({
      chatId,
      sectionId,
      chunk: {
        type: StreamingEventTypeEnum.message_stop,
        message_id: "msg-final",
      },
    });

    expect(route_set_chat_section_state).toHaveBeenCalledTimes(1);
  });
});
