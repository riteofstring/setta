import { getDefaultChatDetails } from "state/actions/aiChatDetails";
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
  clearPendingChatDetails,
  finalizePendingChatDetails,
  initializePendingChatDetails,
  seedPendingChatDetails,
} from "./aiChatSubmission";

describe("aiPendingChatState", () => {
  const surfaceId = "surface-a";

  beforeEach(() => {
    resetProjectStores();
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("initializes, seeds, and clears pending surface state with app-generation metadata", () => {
    initializePendingChatDetails(surfaceId);

    expect(
      useAIStore.getState().pendingChatDetailsBySurfaceId[surfaceId],
    ).toEqual(getDefaultChatDetails());

    const pendingMessage = createUserChatMessage({
      id: "pending-user-msg",
      content: [createMessageTextContent({ text: "Build a dashboard" })],
      attachments: [],
    });
    const appGenerationDetails = setChatAppGenerationForMessage(
      getDefaultChatAppGenerationDetails(),
      [pendingMessage],
      pendingMessage.id,
      { mode: "prompt_builder" },
    );

    seedPendingChatDetails([pendingMessage], surfaceId, appGenerationDetails);

    expect(
      useAIStore.getState().pendingChatDetailsBySurfaceId[surfaceId]?.messages,
    ).toEqual([pendingMessage]);
    expect(
      useAIStore.getState().pendingChatAppGenerationDetailsBySurfaceId[
        surfaceId
      ],
    ).toEqual(appGenerationDetails);

    clearPendingChatDetails(surfaceId);

    expect(
      useAIStore.getState().pendingChatDetailsBySurfaceId[surfaceId],
    ).toBeUndefined();
    expect(
      useAIStore.getState().pendingChatAppGenerationDetailsBySurfaceId[
        surfaceId
      ],
    ).toBeUndefined();
  });

  it("finalizes the pending surface into the materialized chat and merges app-generation state", () => {
    const chatId = "materialized-chat";
    const pendingMessage = createUserChatMessage({
      id: "pending-user-msg",
      content: [
        createMessageTextContent({ text: "Keep the same app context" }),
      ],
      attachments: [],
    });
    const appGenerationDetails = setChatAppGenerationForMessage(
      getDefaultChatAppGenerationDetails(),
      [pendingMessage],
      pendingMessage.id,
      { mode: "json_render" },
    );

    seedPendingChatDetails([pendingMessage], surfaceId, appGenerationDetails);
    useAIStore.setState({
      chatDetails: {
        [chatId]: {
          ...getDefaultChatDetails(),
          messages: [],
        },
      },
    });

    finalizePendingChatDetails(chatId, surfaceId);

    expect(useAIStore.getState().chatDetails[chatId]?.messages).toEqual([
      pendingMessage,
    ]);
    expect(
      useAIStore.getState().chatAppGenerationDetailsByChatId[chatId],
    ).toEqual(appGenerationDetails);
    expect(
      useAIStore.getState().pendingChatDetailsBySurfaceId[surfaceId],
    ).toBeUndefined();
    expect(
      useAIStore.getState().pendingChatAppGenerationDetailsBySurfaceId[
        surfaceId
      ],
    ).toBeUndefined();
  });
});
