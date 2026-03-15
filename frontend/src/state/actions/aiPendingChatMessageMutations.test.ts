import { useAIStore } from "state/stores/aiStores";
import { resetProjectStores } from "state/utils";
import {
  getDefaultChatAppGenerationDetails,
  setChatAppGenerationForMessage,
} from "state/utils/chatAppGenerationDetails";
import {
  createMessageTextContent,
  createUserChatMessage,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  applyOptimisticUserMessage,
  rollbackOptimisticUserMessage,
} from "./aiPendingChatMessageMutations";
import {
  getStopEligibleAssistantMessageId,
  setStopEligibleAssistantMessageId,
} from "./aiStopEligibleAssistantMessages";

describe("aiPendingChatMessageMutations", () => {
  beforeEach(() => {
    resetProjectStores();
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("applies an optimistic user message to a pending surface and tracks app-generation metadata", () => {
    const surfaceId = "surface-a";
    const userMessage = createUserChatMessage({
      id: "pending-user-msg",
      content: [createMessageTextContent({ text: "Build a dashboard" })],
      attachments: [],
    });

    applyOptimisticUserMessage(null, userMessage, surfaceId, {
      mode: "prompt_builder",
    });

    expect(
      useAIStore.getState().pendingChatDetailsBySurfaceId[surfaceId],
    ).toMatchObject({
      messages: [userMessage],
      waitingForResponse: true,
    });
    expect(
      useAIStore.getState().pendingChatAppGenerationDetailsBySurfaceId[
        surfaceId
      ],
    ).toEqual(
      setChatAppGenerationForMessage(
        getDefaultChatAppGenerationDetails(),
        [userMessage],
        userMessage.id,
        { mode: "prompt_builder" },
      ),
    );
  });

  it("rolls back an optimistic user message from a materialized chat and clears stop-eligible state", () => {
    const chatId = "chat-1";
    const userMessage = createUserChatMessage({
      id: "user-msg-1",
      content: [createMessageTextContent({ text: "Hello" })],
      attachments: [],
    });
    setStopEligibleAssistantMessageId(chatId, "assistant-1");

    applyOptimisticUserMessage(chatId, userMessage);
    expect(getStopEligibleAssistantMessageId(chatId)).toBeNull();

    rollbackOptimisticUserMessage(chatId, userMessage.id);

    expect(useAIStore.getState().chatDetails[chatId]).toMatchObject({
      messages: [],
      waitingForResponse: false,
    });
    expect(
      useAIStore.getState().chatAppGenerationDetailsByChatId[chatId],
    ).toEqual(
      setChatAppGenerationForMessage(
        getDefaultChatAppGenerationDetails(),
        [],
        userMessage.id,
        null,
      ),
    );
  });
});
