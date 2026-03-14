import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useAIStore, useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  StreamingEventTypeEnum,
  createAssistantChatMessage,
  createMessageTextContent,
  createProjectConfig,
  createUserChatMessage,
} from "utils/generatedTypes";

import { getDefaultChatDetails, receiveLLMResponseChunk } from "./ai";
import { finalizePendingChatDetails } from "./aiChatSubmission";

const SURFACE_A = "surface-a";
const SURFACE_B = "surface-b";

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
});
