import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useAIStore, useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  createAssistantChatMessage,
  createMessageTextContent,
  createProjectConfig,
  createUserChatMessage,
  StreamingEventTypeEnum,
  type LLMConfig,
} from "utils/generatedTypes";

import {
  finalizePendingChatDetails,
  getDefaultChatDetails,
  receiveLLMResponseChunk,
} from "./ai";

const SURFACE_A = "surface-a";
const SURFACE_B = "surface-b";

const TEST_LLM_CONFIG: LLMConfig = {
  id: "llm-primary",
  model: "gpt-4o-mini",
  provider: "openai",
  base_url: null,
  api_key_env: null,
  other_params: null,
  mcpServerIds: [],
  temporary: false,
};

const TEST_CONTEXT_USAGE = {
  contextWindowTokens: 128000,
  contextUsedTokens: 2048,
  estimated: false,
};

describe("surface-scoped pending chat details", () => {
  beforeEach(() => {
    resetProjectStores();
    useProjectState.setState((state) => {
      state.projectConfig = createProjectConfig({ id: "project-1" });
    });
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("does not auto-promote another surface's pending draft when an existing chat keeps streaming", () => {
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
      pendingChatDetailsBySurfaceId: {
        [SURFACE_A]: {
          ...getDefaultChatDetails(),
          messages: [pendingUserMessage],
          waitingForResponse: true,
        },
      },
      chatDetails: {
        "existing-chat": {
          ...getDefaultChatDetails(),
          messages: [existingUserMessage],
          waitingForResponse: true,
        },
      },
    });

    receiveLLMResponseChunk({
      chatId: "existing-chat",
      sectionId: null,
      chunk: {
        type: StreamingEventTypeEnum.message_start,
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
    const pendingMessageIds =
      state.pendingChatDetailsBySurfaceId[SURFACE_A]?.messages.map(
        (message) => message.id,
      ) ?? [];

    expect(state.activeChatId).toBeUndefined();
    expect(pendingMessageIds).toContain("pending-user-msg");
    expect(existingMessageIds).not.toContain("pending-user-msg");
  });

  it("finalizes only the owning surface and leaves other drafts untouched", () => {
    const surfaceAMessage = createUserChatMessage({
      id: "surface-a-user-msg",
      content: [createMessageTextContent({ text: "Draft from surface A" })],
      attachments: [],
    });
    const surfaceBMessage = createUserChatMessage({
      id: "surface-b-user-msg",
      content: [createMessageTextContent({ text: "Draft from surface B" })],
      attachments: [],
    });

    useAIStore.setState({
      pendingChatDetailsBySurfaceId: {
        [SURFACE_A]: {
          ...getDefaultChatDetails(),
          messages: [surfaceAMessage],
          waitingForResponse: true,
        },
        [SURFACE_B]: {
          ...getDefaultChatDetails(),
          messages: [surfaceBMessage],
          waitingForResponse: true,
        },
      },
      chatDetails: {
        "materialized-chat": {
          ...getDefaultChatDetails(),
          messages: [],
          waitingForResponse: false,
        },
      },
    });

    finalizePendingChatDetails("materialized-chat", SURFACE_A);

    const state = useAIStore.getState();
    const materializedMessages =
      state.chatDetails["materialized-chat"]?.messages.map(
        (message) => message.id,
      ) ?? [];

    expect(materializedMessages).toContain("surface-a-user-msg");
    expect(materializedMessages).not.toContain("surface-b-user-msg");
    expect(state.pendingChatDetailsBySurfaceId[SURFACE_A]).toBeUndefined();
    expect(state.pendingChatDetailsBySurfaceId[SURFACE_B]?.messages).toEqual([
      surfaceBMessage,
    ]);
  });

  it("keeps hydrated metadata authoritative when finalizing a pending draft", () => {
    const pendingUserMessage = createUserChatMessage({
      id: "surface-a-user-msg",
      content: [createMessageTextContent({ text: "Local optimistic text" })],
      attachments: [],
    });
    const hydratedUserMessage = createUserChatMessage({
      id: "surface-a-user-msg",
      content: [createMessageTextContent({ text: "Backend canonical text" })],
      attachments: [],
    });

    useAIStore.setState({
      pendingChatDetailsBySurfaceId: {
        [SURFACE_A]: {
          ...getDefaultChatDetails(),
          messages: [pendingUserMessage],
          waitingForResponse: true,
          toolCallArguments: {
            "tool-call-1": '{"source":"pending"}',
          },
        },
      },
      chatDetails: {
        "materialized-chat": {
          ...getDefaultChatDetails(),
          messages: [hydratedUserMessage],
          waitingForResponse: false,
          toolCallArguments: {
            "tool-call-1": '{"source":"backend"}',
          },
          llmConfig: TEST_LLM_CONFIG,
          contextUsage: TEST_CONTEXT_USAGE,
        },
      },
    });

    finalizePendingChatDetails("materialized-chat", SURFACE_A);

    const details = useAIStore.getState().chatDetails["materialized-chat"];
    expect(details).toEqual({
      messages: [hydratedUserMessage],
      waitingForResponse: true,
      toolCallArguments: {
        "tool-call-1": '{"source":"backend"}',
      },
      llmConfig: TEST_LLM_CONFIG,
      contextUsage: TEST_CONTEXT_USAGE,
    });
  });

  it("keeps pending-only messages ahead of hydrated output until backend history catches up", () => {
    const pendingUserMessage = createUserChatMessage({
      id: "pending-user-msg",
      content: [
        createMessageTextContent({ text: "Draft still materializing" }),
      ],
      attachments: [],
    });
    const hydratedAssistantMessage = createAssistantChatMessage({
      id: "assistant-msg",
      content: [createMessageTextContent({ text: "Backend output arrived" })],
      attachments: [],
      tool_calls: null,
    });

    useAIStore.setState({
      pendingChatDetailsBySurfaceId: {
        [SURFACE_A]: {
          ...getDefaultChatDetails(),
          messages: [pendingUserMessage],
          waitingForResponse: true,
        },
      },
      chatDetails: {
        "materialized-chat": {
          ...getDefaultChatDetails(),
          messages: [hydratedAssistantMessage],
          waitingForResponse: false,
          llmConfig: TEST_LLM_CONFIG,
          contextUsage: TEST_CONTEXT_USAGE,
        },
      },
    });

    finalizePendingChatDetails("materialized-chat", SURFACE_A);

    const details = useAIStore.getState().chatDetails["materialized-chat"];
    expect(details?.messages).toEqual([
      pendingUserMessage,
      hydratedAssistantMessage,
    ]);
    expect(details?.llmConfig).toEqual(TEST_LLM_CONFIG);
    expect(details?.contextUsage).toEqual(TEST_CONTEXT_USAGE);
    expect(details?.waitingForResponse).toBe(true);
  });
});
