import { useAIStore } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  getDefaultChatAppGenerationDetails,
  setChatAppGenerationForMessage,
} from "state/utils/chatAppGeneration";
import {
  createMessageTextContent,
  createUserChatMessage,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  getChatAppGenerationDetailsForTarget,
  getPendingChatAppGenerationDetailsForSurface,
} from "./aiPendingChatAppGenerationState";

describe("aiPendingChatAppGenerationState", () => {
  const surfaceId = "surface-a";

  beforeEach(() => {
    resetProjectStores();
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("reads pending surface app-generation details before a chat is materialized", () => {
    const pendingMessage = createUserChatMessage({
      id: "pending-user-msg",
      content: [createMessageTextContent({ text: "Build an app shell" })],
      attachments: [],
    });
    const pendingDetails = setChatAppGenerationForMessage(
      getDefaultChatAppGenerationDetails(),
      [pendingMessage],
      pendingMessage.id,
      { mode: "prompt_builder" },
    );
    useAIStore.setState({
      pendingChatAppGenerationDetailsBySurfaceId: {
        [surfaceId]: pendingDetails,
      },
    });

    expect(
      getPendingChatAppGenerationDetailsForSurface(
        useAIStore.getState(),
        surfaceId,
      ),
    ).toEqual(pendingDetails);
    expect(
      getChatAppGenerationDetailsForTarget(
        useAIStore.getState(),
        null,
        surfaceId,
      ),
    ).toEqual(pendingDetails);
  });

  it("falls back to the materialized chat app-generation details when a chat id exists", () => {
    const chatId = "chat-1";
    const materializedMessage = createUserChatMessage({
      id: "materialized-user-msg",
      content: [createMessageTextContent({ text: "Keep app context" })],
      attachments: [],
    });
    const materializedDetails = setChatAppGenerationForMessage(
      getDefaultChatAppGenerationDetails(),
      [materializedMessage],
      materializedMessage.id,
      { mode: "json_render" },
    );
    useAIStore.setState({
      chatAppGenerationDetailsByChatId: {
        [chatId]: materializedDetails,
      },
    });

    expect(
      getChatAppGenerationDetailsForTarget(
        useAIStore.getState(),
        chatId,
        surfaceId,
      ),
    ).toEqual(materializedDetails);
  });
});
