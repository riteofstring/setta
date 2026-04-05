import { readFileSync } from "node:fs";
import {
  getCurrEffectiveSectionImplOfType,
  processProjectStateUpdateFromBackend,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import { markChatStreamActive } from "state/aiStreamingTracker";
import { resetProjectStores } from "state/utils";
import {
  ChatRoleEnum,
  SectionTypeEnum,
  StreamingEventTypeEnum,
  createChatSectionImpl,
  createCore,
  createMessageTextContent,
  createMessageThinkingContent,
  createProjectConfig,
  createUserDefaultChatSectionImpl,
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
    route_create_top_level_section: vi.fn(),
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
const MANAGED_CHAT_STREAM_CONTRACT_FIXTURE_PATH = new URL(
  "../../../../tests/fixtures/llm/managed_chat_stream_contract_cases.json",
  import.meta.url,
);

type ManagedChatStreamContractCase = {
  name: string;
  initialState: {
    messages: Array<Record<string, unknown>>;
    waitingForResponse: boolean;
    toolCallArguments: Record<string, string>;
  };
  chunks: Array<Record<string, unknown>>;
  expectedState: {
    messages: Array<Record<string, unknown>>;
    waitingForResponse: boolean;
    toolCallArguments: Record<string, string>;
  };
};

const MANAGED_CHAT_STREAM_CONTRACT_CASES = (
  JSON.parse(
    readFileSync(MANAGED_CHAT_STREAM_CONTRACT_FIXTURE_PATH, "utf-8"),
  ) as {
    cases: ManagedChatStreamContractCase[];
  }
).cases;

function seedChatSection({ chatId: initialChatId }: { chatId: string | null }) {
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

function cloneContractValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function stripMessageCreatedAt(
  message: Record<string, unknown>,
): Record<string, unknown> {
  const { createdAt: _createdAt, ...rest } = message;
  return rest;
}

describe("section chat streaming updates", () => {
  beforeAll(async () => {
    const definitions = await import("state/definitions");
    useProjectState = definitions.useProjectState;
    receiveLLMResponseChunk = (await import("./ai")).receiveLLMResponseChunk;
  });

  beforeEach(async () => {
    resetProjectStores();
    seedChatSection({ chatId });
    const route_create_top_level_section = (
      await import("utils/generatedEndpoints")
    ).route_create_top_level_section as unknown as vi.Mock;
    const route_set_chat_section_state = (
      await import("utils/generatedEndpoints")
    ).route_set_chat_section_state as unknown as vi.Mock;
    route_create_top_level_section.mockReturnValue({
      status: 500,
      hasResponse: true,
      data: null,
    });
    route_set_chat_section_state.mockReturnValue({
      status: 200,
      hasResponse: true,
      data: null,
    });
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
    expect(
      impl.messages.some((message) => {
        if (message.role !== ChatRoleEnum.assistant) {
          return false;
        }
        return message.content?.some(
          (content) =>
            content.type === "text" && content.text === "Hello there",
        );
      }),
    ).toBe(true);
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

  it("rebuilds chatId lookup when chatId changes", () => {
    const initialMessage = {
      id: "msg-lookup-1",
      role: ChatRoleEnum.assistant,
      content: [{ type: "text", text: "First routing" }],
      attachments: [],
      tool_calls: null,
    };
    receiveLLMResponseChunk({
      chatId,
      sectionId: null,
      chunk: {
        type: StreamingEventTypeEnum.MESSAGE_FINALIZED,
        message: initialMessage,
      },
    });

    const updatedChatId = "chat-2";
    useProjectState.setState((state) => {
      const impl = state.sectionImpls[implId];
      if (!impl || impl.type !== SectionTypeEnum.Chat) {
        return;
      }
      impl.chatId = updatedChatId;
    });

    const updatedMessage = {
      id: "msg-lookup-2",
      role: ChatRoleEnum.assistant,
      content: [{ type: "text", text: "Updated routing" }],
      attachments: [],
      tool_calls: null,
    };
    receiveLLMResponseChunk({
      chatId: updatedChatId,
      sectionId: null,
      chunk: {
        type: StreamingEventTypeEnum.MESSAGE_FINALIZED,
        message: updatedMessage,
      },
    });

    const impl = getCurrEffectiveSectionImplOfType(
      useProjectState.getState(),
      sectionId,
      SectionTypeEnum.Chat,
    );
    expect(
      impl.messages.some((message) => message.id === updatedMessage.id),
    ).toBe(true);
  });

  it("persists section state on finalized messages", async () => {
    const route_set_chat_section_state = (
      await import("utils/generatedEndpoints")
    ).route_set_chat_section_state as unknown as vi.Mock;
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
    const route_set_chat_section_state = (
      await import("utils/generatedEndpoints")
    ).route_set_chat_section_state as unknown as vi.Mock;
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

  it("preserves assistant text when finalized tool-call message has empty content", () => {
    receiveLLMResponseChunk({
      chatId,
      sectionId,
      chunk: {
        type: StreamingEventTypeEnum.MESSAGE_START,
        message: {
          id: "msg-tool-call",
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
        message_id: "msg-tool-call",
        content: [{ type: "text_delta", index: 0, text: "Launching tasks" }],
      },
    });
    receiveLLMResponseChunk({
      chatId,
      sectionId,
      chunk: {
        type: StreamingEventTypeEnum.MESSAGE_FINALIZED,
        message: {
          id: "msg-tool-call",
          role: ChatRoleEnum.assistant,
          content: [],
          attachments: [],
          tool_calls: [
            {
              id: "tool-call-1",
              type: "function",
              function: {
                name: "Task",
                arguments: { task: "Do work" },
              },
            },
          ],
        },
      },
    });

    const impl = getCurrEffectiveSectionImplOfType(
      useProjectState.getState(),
      sectionId,
      SectionTypeEnum.Chat,
    );
    const assistant = impl.messages.find(
      (message) =>
        message.role === ChatRoleEnum.assistant &&
        message.id === "msg-tool-call",
    );
    expect(assistant).toBeTruthy();
    expect(
      assistant?.content?.some(
        (content) =>
          content.type === "text" && content.text === "Launching tasks",
      ),
    ).toBe(true);
  });

  it("keeps placeholder thinking deltas and replaces placeholder ids on finalized messages", () => {
    receiveLLMResponseChunk({
      chatId,
      sectionId,
      chunk: {
        type: StreamingEventTypeEnum.DELTA,
        message_id: "resp_placeholder_1",
        content: [
          {
            type: "thinking_delta",
            index: 0,
            thinking: "Analyzing code paths...",
            summary: "Reviewing code paths",
            signature: "",
          },
        ],
      },
    });
    receiveLLMResponseChunk({
      chatId,
      sectionId,
      chunk: {
        type: StreamingEventTypeEnum.MESSAGE_FINALIZED,
        message: {
          id: "msg-finalized-thinking",
          role: ChatRoleEnum.assistant,
          content: [],
          attachments: [],
          tool_calls: null,
        },
      },
    });

    const impl = getCurrEffectiveSectionImplOfType(
      useProjectState.getState(),
      sectionId,
      SectionTypeEnum.Chat,
    );
    const placeholderMessage = impl.messages.find(
      (message) => message.id === "resp_placeholder_1",
    );
    expect(placeholderMessage).toBeUndefined();

    const finalizedMessage = impl.messages.find(
      (message) => message.id === "msg-finalized-thinking",
    );
    expect(finalizedMessage?.role).toBe(ChatRoleEnum.assistant);
    expect(finalizedMessage?.content).toEqual([
      createMessageThinkingContent({
        thinking: "Analyzing code paths...",
        summary: "Reviewing code paths",
        signature: "",
      }),
    ]);
  });

  it("replaces section messages with backend state when backend updates arrive mid-stream", () => {
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
        impl.inputText = "Draft preserved locally";
        impl.toolCallArguments = { local: "{}" };
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
    setCurrEffectiveSectionImplValue<"ChatSection">(backendState, sectionId, {
      messages: [userMessage],
      inputText:
        "Backend stale draft that should not replace the local draft input",
      waitingForResponse: false,
      toolCallArguments: { remote: "{}" },
    });

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
    expect(impl.messages).toEqual([userMessage]);
    expect(impl.inputText).toBe("Draft preserved locally");
    expect(impl.toolCallArguments).toEqual({
      local: "{}",
      remote: "{}",
    });
    expect(impl.waitingForResponse).toBe(true);
  });

  it("lets backend tool call arguments win for overlapping ids during mid-stream backend projection updates", () => {
    useProjectState.setState((state) => {
      const impl = state.sectionImpls[implId];
      if (impl && impl.type === SectionTypeEnum.Chat) {
        impl.toolCallArguments = {
          shared: `{"task":"Local stale overlay"}`,
          localOnly: `{"task":"Still local only"}`,
        };
        impl.waitingForResponse = true;
      }
    });
    markChatStreamActive(chatId, sectionId);

    const backendState = JSON.parse(JSON.stringify(useProjectState.getState()));
    setCurrEffectiveSectionImplValue<"ChatSection">(backendState, sectionId, {
      toolCallArguments: {
        shared: `{"task":"Backend canonical"}`,
        remoteOnly: `{"task":"Backend only"}`,
      },
      waitingForResponse: false,
    });

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
    expect(impl.toolCallArguments).toEqual({
      shared: `{"task":"Backend canonical"}`,
      remoteOnly: `{"task":"Backend only"}`,
      localOnly: `{"task":"Still local only"}`,
    });
    expect(impl.waitingForResponse).toBe(true);
  });

  it("keeps local managed draft input while letting backend state win once the stream is inactive", () => {
    const backendMessage = {
      id: "backend-msg",
      role: ChatRoleEnum.assistant,
      content: [createMessageTextContent({ text: "Authoritative backend" })],
      attachments: [],
      tool_calls: null,
    };
    useProjectState.setState((state) => {
      const impl = state.sectionImpls[implId];
      if (impl && impl.type === SectionTypeEnum.Chat) {
        impl.messages = [
          {
            id: "local-msg",
            role: ChatRoleEnum.user,
            content: [createMessageTextContent({ text: "Local speculative" })],
            attachments: [],
          },
        ];
        impl.inputText = "Draft";
        impl.toolCallArguments = { local: "{}" };
        impl.waitingForResponse = true;
      }
    });

    const backendState = JSON.parse(JSON.stringify(useProjectState.getState()));
    setCurrEffectiveSectionImplValue<"ChatSection">(backendState, sectionId, {
      messages: [backendMessage],
      inputText:
        "Backend stale draft input that is longer than the local draft",
      waitingForResponse: false,
      toolCallArguments: { remote: "{}" },
    });

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
    expect(impl.messages).toEqual([backendMessage]);
    expect(impl.inputText).toBe("Draft");
    expect(impl.toolCallArguments).toEqual({ remote: "{}" });
    expect(impl.waitingForResponse).toBe(false);
  });

  it.each(MANAGED_CHAT_STREAM_CONTRACT_CASES)(
    "matches managed chat stream contract fixture $name",
    (fixtureCase) => {
      useProjectState.setState((state) => {
        const impl = state.sectionImpls[implId];
        if (!impl || impl.type !== SectionTypeEnum.Chat) {
          return;
        }
        impl.messages = cloneContractValue(fixtureCase.initialState.messages);
        impl.waitingForResponse = fixtureCase.initialState.waitingForResponse;
        impl.toolCallArguments = cloneContractValue(
          fixtureCase.initialState.toolCallArguments,
        );
      });

      for (const chunk of fixtureCase.chunks) {
        receiveLLMResponseChunk({
          chatId,
          sectionId,
          chunk: cloneContractValue(chunk) as never,
        });
      }

      const impl = getCurrEffectiveSectionImplOfType(
        useProjectState.getState(),
        sectionId,
        SectionTypeEnum.Chat,
      );
      expect({
        messages: impl.messages.map((message) =>
          stripMessageCreatedAt(message as Record<string, unknown>),
        ),
        waitingForResponse: impl.waitingForResponse,
        toolCallArguments: impl.toolCallArguments ?? {},
      }).toEqual(fixtureCase.expectedState);
    },
  );
});
