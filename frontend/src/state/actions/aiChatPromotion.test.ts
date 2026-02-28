import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useAIStore, useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  StreamingEventTypeEnum,
  createAssistantChatMessage,
  createLLMConfig,
  createMessageTextContent,
  createProjectConfig,
  createUserChatMessage,
} from "utils/generatedTypes";

import { getDefaultChatDetails, receiveLLMResponseChunk } from "./ai";

describe("ai pending chat promotion", () => {
  beforeEach(() => {
    resetProjectStores();
    useProjectState.setState((state) => {
      state.projectConfig = createProjectConfig({ id: "project-1" });
    });
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("does not emit a store update when promotion is a no-op", () => {
    useAIStore.setState({
      activeChatId: "existing-chat",
      pendingChatDetails: null,
      chatDetails: {},
    });

    let updateCount = 0;
    const unsubscribe = useAIStore.subscribe(() => {
      updateCount += 1;
    });

    receiveLLMResponseChunk({
      chatId: "some-chat",
      sectionId: null,
      chunk: {
        type: StreamingEventTypeEnum.DELTA,
        message_id: "msg-1",
        content: null,
      },
    });

    unsubscribe();

    expect(updateCount).toBe(0);
  });

  it("promotes pending chat details when the active chat is pending", () => {
    useAIStore.setState({
      activeChatId: null,
      pendingChatDetails: getDefaultChatDetails(),
      chatDetails: {},
    });

    let updateCount = 0;
    const unsubscribe = useAIStore.subscribe(() => {
      updateCount += 1;
    });

    receiveLLMResponseChunk({
      chatId: "new-chat",
      sectionId: null,
      chunk: {
        type: StreamingEventTypeEnum.DELTA,
        message_id: "msg-1",
        content: null,
      },
    });

    unsubscribe();

    const state = useAIStore.getState();
    expect(updateCount).toBe(1);
    expect(state.activeChatId).toBe("new-chat");
    expect(state.pendingChatDetails).toBeNull();
    expect(state.chatDetails["new-chat"]).toMatchObject({
      messages: [],
      toolCallArguments: {},
      waitingForResponse: false,
    });
  });

  it("does not promote pending draft details into an already materialized chat", () => {
    const pendingUserMessage = createUserChatMessage({
      id: "pending-user-msg",
      content: [
        createMessageTextContent({
          text: "Can you run a bunch of read only bash commands?",
        }),
      ],
      attachments: [],
    });
    const existingUserMessage = createUserChatMessage({
      id: "existing-user-msg",
      content: [createMessageTextContent({ text: "Write a long poem" })],
      attachments: [],
    });
    useAIStore.setState({
      activeChatId: undefined,
      pendingChatDetails: {
        ...getDefaultChatDetails(),
        messages: [pendingUserMessage],
        waitingForResponse: true,
      },
      chatDetails: {
        "existing-chat": {
          ...getDefaultChatDetails(),
          messages: [existingUserMessage],
          waitingForResponse: true,
        },
      },
    });

    // Simulate late chunks from the previous chat while a new draft submit is pending.
    receiveLLMResponseChunk({
      chatId: "existing-chat",
      sectionId: null,
      chunk: {
        type: StreamingEventTypeEnum.MESSAGE_START,
        message: createAssistantChatMessage({
          id: "existing-assistant-msg",
          content: [createMessageTextContent({ text: "Continuing poem..." })],
        }),
      },
    });

    const state = useAIStore.getState();
    const existingMessageIds = state.chatDetails["existing-chat"]?.messages.map(
      (message) => message.id,
    );
    const pendingMessageIds = state.pendingChatDetails?.messages.map(
      (message) => message.id,
    );
    expect(state.activeChatId).toBeUndefined();
    expect(pendingMessageIds).toContain("pending-user-msg");
    expect(existingMessageIds).not.toContain("pending-user-msg");
  });

  it("promotes pending details into an unmaterialized chat details slot", () => {
    const pendingUserMessage = createUserChatMessage({
      id: "pending-slot-user-msg",
      content: [
        createMessageTextContent({
          text: "Pending draft should bind to this new chat.",
        }),
      ],
      attachments: [],
    });
    useAIStore.setState({
      activeChatId: undefined,
      pendingChatDetails: {
        ...getDefaultChatDetails(),
        messages: [pendingUserMessage],
        waitingForResponse: true,
      },
      chatDetails: {
        "new-chat": getDefaultChatDetails(),
      },
    });

    // First chunk for the new chat should claim the pending draft details.
    receiveLLMResponseChunk({
      chatId: "new-chat",
      sectionId: null,
      chunk: {
        type: StreamingEventTypeEnum.MESSAGE_START,
        message: createAssistantChatMessage({
          id: "new-chat-assistant-msg",
          content: [
            createMessageTextContent({ text: "Routing pending draft now." }),
          ],
        }),
      },
    });

    const state = useAIStore.getState();
    const routedMessageIds = state.chatDetails["new-chat"]?.messages.map(
      (message) => message.id,
    );
    expect(state.activeChatId).toBe("new-chat");
    expect(state.pendingChatDetails).toBeNull();
    expect(routedMessageIds).toContain("pending-slot-user-msg");
  });

  it("does not promote when existing chat has tool call argument state", () => {
    const pendingUserMessage = createUserChatMessage({
      id: "pending-tool-args-msg",
      content: [createMessageTextContent({ text: "Pending tool-args test." })],
      attachments: [],
    });
    useAIStore.setState({
      activeChatId: undefined,
      pendingChatDetails: {
        ...getDefaultChatDetails(),
        messages: [pendingUserMessage],
        waitingForResponse: true,
      },
      chatDetails: {
        "existing-chat": {
          ...getDefaultChatDetails(),
          toolCallArguments: {
            "tool-call-1": "{\n  \"path\": \"/tmp\"\n}",
          },
        },
      },
    });

    receiveLLMResponseChunk({
      chatId: "existing-chat",
      sectionId: null,
      chunk: {
        type: StreamingEventTypeEnum.DELTA,
        message_id: "existing-assistant-msg",
        content: [],
      },
    });

    const state = useAIStore.getState();
    expect(state.activeChatId).toBeUndefined();
    expect(
      state.pendingChatDetails?.messages.some(
        (message) => message.id === "pending-tool-args-msg",
      ),
    ).toBe(true);
    expect(
      state.chatDetails["existing-chat"]?.messages.some(
        (message) => message.id === "pending-tool-args-msg",
      ),
    ).toBe(false);
  });

  it("does not promote when existing chat has hydrated llm config metadata", () => {
    const pendingUserMessage = createUserChatMessage({
      id: "pending-llm-config-msg",
      content: [
        createMessageTextContent({ text: "Pending llm-config routing test." }),
      ],
      attachments: [],
    });
    useAIStore.setState({
      activeChatId: undefined,
      pendingChatDetails: {
        ...getDefaultChatDetails(),
        messages: [pendingUserMessage],
        waitingForResponse: true,
      },
      chatDetails: {
        "existing-chat": {
          ...getDefaultChatDetails(),
          llmConfig: createLLMConfig({
            id: "llm-existing",
            model: "gpt-4o-mini",
            provider: "openai",
            base_url: null,
            api_key_env: null,
            other_params: null,
            mcpServerIds: [],
            temporary: false,
          }),
        },
      },
    });

    receiveLLMResponseChunk({
      chatId: "existing-chat",
      sectionId: null,
      chunk: {
        type: StreamingEventTypeEnum.DELTA,
        message_id: "existing-assistant-msg",
        content: [],
      },
    });

    const state = useAIStore.getState();
    expect(state.activeChatId).toBeUndefined();
    expect(
      state.pendingChatDetails?.messages.some(
        (message) => message.id === "pending-llm-config-msg",
      ),
    ).toBe(true);
    expect(
      state.chatDetails["existing-chat"]?.messages.some(
        (message) => message.id === "pending-llm-config-msg",
      ),
    ).toBe(false);
  });

  it("does not promote when existing chat has context-usage metadata", () => {
    const pendingUserMessage = createUserChatMessage({
      id: "pending-context-usage-msg",
      content: [
        createMessageTextContent({
          text: "Pending context-usage routing test.",
        }),
      ],
      attachments: [],
    });
    useAIStore.setState({
      activeChatId: undefined,
      pendingChatDetails: {
        ...getDefaultChatDetails(),
        messages: [pendingUserMessage],
        waitingForResponse: true,
      },
      chatDetails: {
        "existing-chat": {
          ...getDefaultChatDetails(),
          contextUsage: {
            contextWindowTokens: 200_000,
            contextUsedTokens: 12_000,
            estimated: false,
          },
        },
      },
    });

    receiveLLMResponseChunk({
      chatId: "existing-chat",
      sectionId: null,
      chunk: {
        type: StreamingEventTypeEnum.DELTA,
        message_id: "existing-assistant-msg",
        content: [],
      },
    });

    const state = useAIStore.getState();
    expect(state.activeChatId).toBeUndefined();
    expect(
      state.pendingChatDetails?.messages.some(
        (message) => message.id === "pending-context-usage-msg",
      ),
    ).toBe(true);
    expect(
      state.chatDetails["existing-chat"]?.messages.some(
        (message) => message.id === "pending-context-usage-msg",
      ),
    ).toBe(false);
  });
});
