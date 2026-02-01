import {
  getCurrEffectiveSectionImplOfType,
  processProjectStateUpdateFromBackend,
} from "state/actions/sectionInfos";
import { resetProjectStores } from "state/utils";
import {
  ChatRoleEnum,
  SectionTypeEnum,
  StreamingEventTypeEnum,
  createChatSectionImpl,
  createCore,
  createMessageTextContent,
  createProjectConfig,
  createUserDefaultChatSectionImpl,
  createVariant,
} from "utils/generatedTypes";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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
let useProjectState: typeof import("state/definitions").useProjectState;

const projectConfigId = "project-1";
const sectionId = "section-1";
const variantId = "variant-1";
const implId = "impl-1";
const chatId = "chat-1";

function seedChatSection({
  chatId: initialChatId,
}: {
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
    createUserDefaultChatSectionImpl({ chatId: initialChatId }),
    {
      id: implId,
      chatId: initialChatId,
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

describe("section chat streaming updates", () => {
  beforeAll(async () => {
    const definitions = await import("state/definitions");
    useProjectState = definitions.useProjectState;
    receiveLLMResponseChunk = (await import("./ai")).receiveLLMResponseChunk;
  });

  beforeEach(() => {
    resetProjectStores();
    seedChatSection({ chatId });
  });

  afterEach(() => {
    resetProjectStores();
    vi.clearAllMocks();
  });

  it("updates section state when streaming includes sectionId", () => {
    const assistantMessage = {
      id: "msg-1",
      role: ChatRoleEnum.assistant,
      content: [{ type: "text", text: "Hello there" }],
      attachments: [],
      tool_calls: null,
    };

    receiveLLMResponseChunk({
      chatId,
      sectionId,
      chunk: {
        type: StreamingEventTypeEnum.MESSAGE_FINALIZED,
        message: assistantMessage,
      },
    });

    const impl = getCurrEffectiveSectionImplOfType(
      useProjectState.getState(),
      sectionId,
      SectionTypeEnum.Chat,
    );
    expect(impl.messages.some((message) => {
      if (message.role !== ChatRoleEnum.assistant) {
        return false;
      }
      return message.content?.some(
        (content) => content.type === "text" && content.text === "Hello there",
      );
    })).toBe(true);
    expect(impl.waitingForResponse).toBe(false);
  });

  it("routes streaming to section by chatId when sectionId is missing", () => {
    const assistantMessage = {
      id: "msg-1b",
      role: ChatRoleEnum.assistant,
      content: [{ type: "text", text: "Hello via chatId" }],
      attachments: [],
      tool_calls: null,
    };

    receiveLLMResponseChunk({
      chatId,
      sectionId: null,
      chunk: {
        type: StreamingEventTypeEnum.MESSAGE_FINALIZED,
        message: assistantMessage,
      },
    });

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
            content.type === "text" && content.text === "Hello via chatId",
        );
      }),
    ).toBe(true);
  });

  it("persists section state on finalized messages", async () => {
    const route_set_chat_section_state =
      (await import("utils/generatedEndpoints")).route_set_chat_section_state as unknown as vi.Mock;
    route_set_chat_section_state.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: null,
    });
    const assistantMessage = {
      id: "msg-2",
      role: ChatRoleEnum.assistant,
      content: [{ type: "text", text: "Persist me" }],
      attachments: [],
      tool_calls: null,
    };

    receiveLLMResponseChunk({
      chatId,
      sectionId,
      chunk: {
        type: StreamingEventTypeEnum.MESSAGE_FINALIZED,
        message: assistantMessage,
      },
    });

    expect(route_set_chat_section_state).toHaveBeenCalledTimes(1);
    const payload = route_set_chat_section_state.mock.calls[0][0];
    expect(payload.sectionId).toBe(sectionId);
    expect(payload.projectConfigId).toBe(projectConfigId);
    expect(payload.state.messages).toHaveLength(1);
    expect(payload.state.waitingForResponse).toBe(false);
  });

  it("persists section state on tool results", async () => {
    const route_set_chat_section_state =
      (await import("utils/generatedEndpoints")).route_set_chat_section_state as unknown as vi.Mock;
    route_set_chat_section_state.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: null,
    });
    const toolResult = {
      id: "tool-msg-1",
      role: ChatRoleEnum.tool,
      tool_call_id: "tool-call-stream-test",
      tool_name: "test_tool",
      arguments: { ok: true },
      result: { ok: true },
      content: [],
      is_error: false,
      started_at: "2026-02-01T00:00:00.000Z",
      completed_at: "2026-02-01T00:00:01.000Z",
    };

    receiveLLMResponseChunk({
      chatId,
      sectionId,
      chunk: {
        type: StreamingEventTypeEnum.TOOL_RESULT,
        result: toolResult,
      },
    });

    expect(route_set_chat_section_state).toHaveBeenCalledTimes(1);
    const payload = route_set_chat_section_state.mock.calls[0][0];
    expect(payload.sectionId).toBe(sectionId);
    expect(payload.projectConfigId).toBe(projectConfigId);
    expect(payload.state.messages).toHaveLength(1);
  });

  it("keeps streaming content when backend updates arrive mid-stream", () => {
    const userMessage = {
      id: "user-1",
      role: ChatRoleEnum.user,
      content: [createMessageTextContent({ text: "Hi" })],
      attachments: [],
    };
    useProjectState.setState((state) => {
      const impl = state.sectionImpls[implId];
      if (impl && impl.type === SectionTypeEnum.Chat) {
        impl.messages = [userMessage];
        impl.waitingForResponse = true;
      }
    });

    receiveLLMResponseChunk({
      chatId,
      sectionId,
      chunk: {
        type: StreamingEventTypeEnum.MESSAGE_START,
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
        type: StreamingEventTypeEnum.DELTA,
        message_id: "msg-stream",
        content: [{ type: "text_delta", index: 0, text: "Streaming" }],
      },
    });

    let impl = getCurrEffectiveSectionImplOfType(
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
            content.type === "text" && content.text.includes("Streaming"),
        );
      }),
    ).toBe(true);

    const backendState = JSON.parse(JSON.stringify(useProjectState.getState()));
    const backendImpl = backendState.sectionImpls[implId];
    if (backendImpl && backendImpl.type === SectionTypeEnum.Chat) {
      backendImpl.messages = [userMessage];
      backendImpl.waitingForResponse = true;
      backendImpl.toolCallArguments = {};
    }

    processProjectStateUpdateFromBackend({
      projectState: backendState,
      completedOpIds: [],
      pendingOpIds: [],
    });

    impl = getCurrEffectiveSectionImplOfType(
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
            content.type === "text" && content.text.includes("Streaming"),
        );
      }),
    ).toBe(true);
  });
});
