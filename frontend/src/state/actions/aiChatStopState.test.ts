import { useAIFollow, useAIStore } from "state/stores/aiStores";
import { resetProjectStores } from "state/utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDefaultChatDetails } from "./aiChatDetails";
import {
  applyConfirmedExternalStopInterruption,
  reconcileStoppedLLMChatOutcome,
  restoreStoppedChatFollowState,
  restoreStoppedChatResponseLocally,
  stopChatResponseLocally,
} from "./aiChatStopState";
import { setStopEligibleAssistantMessageId } from "./aiStopEligibleAssistantMessages";

describe("aiChatStopState", () => {
  beforeEach(() => {
    resetProjectStores();
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("stops locally, clears follow state, and restores the chat snapshot", () => {
    useAIStore.setState({
      chatDetails: {
        "chat-a": {
          ...getDefaultChatDetails(),
          waitingForResponse: true,
          toolCallArguments: {
            "tool-a": '{"value":1}',
          },
        },
      },
      stopEligibleAssistantMessageIdByChatId: {
        "chat-a": "assistant-live",
      },
      interruptedAssistantMessageIdsByChatId: {
        "chat-a": {
          "assistant-prior": true,
        },
      },
    });
    setStopEligibleAssistantMessageId("chat-a", "assistant-live");
    useAIFollow.setState({
      toolArgumentsIdsByProjectConfigId: {
        "project-a": {
          "chat-a": {
            section: ["section-1"],
          },
        },
      },
    });

    const snapshot = stopChatResponseLocally("chat-a", {
      followProjectConfigId: "project-a",
    });

    expect(
      useAIStore.getState().chatDetails["chat-a"]?.waitingForResponse,
    ).toBe(false);
    expect(
      useAIStore.getState().interruptedAssistantMessageIdsByChatId["chat-a"],
    ).toEqual({
      "assistant-prior": true,
      "assistant-live": true,
    });
    expect(
      useAIFollow.getState().toolArgumentsIdsByProjectConfigId["project-a"]?.[
        "chat-a"
      ],
    ).toBeUndefined();

    restoreStoppedChatResponseLocally("chat-a", snapshot);
    restoreStoppedChatFollowState("chat-a", snapshot);

    expect(useAIStore.getState().chatDetails["chat-a"]).toMatchObject({
      waitingForResponse: true,
      toolCallArguments: {
        "tool-a": '{"value":1}',
      },
    });
    expect(
      useAIFollow.getState().toolArgumentsIdsByProjectConfigId["project-a"]?.[
        "chat-a"
      ],
    ).toEqual({
      section: ["section-1"],
    });
  });

  it("reconciles the confirmed interrupted assistant id from the backend", () => {
    const chatId = "chat-a";
    useAIStore.setState({
      interruptedAssistantMessageIdsByChatId: {
        [chatId]: {
          "assistant-prior": true,
        },
      },
    });

    reconcileStoppedLLMChatOutcome({
      chatId,
      localSnapshot: {
        waitingForResponse: true,
        toolCallArguments: {},
        interruptedAssistantMessageIdsByChat: {
          "assistant-prior": true,
        },
        stopEligibleAssistantMessageId: "assistant-local",
        followProjectConfigId: null,
        followToolArgumentIdsByType: null,
      },
      stopOutcome: {
        alreadyStopped: false,
        stoppedMessageId: "assistant-server",
      },
    });

    expect(
      useAIStore.getState().interruptedAssistantMessageIdsByChatId[chatId],
    ).toEqual({
      "assistant-prior": true,
      "assistant-server": true,
    });
  });

  it("applies the confirmed external stop interruption after restoring the snapshot", () => {
    const chatId = "chat-a";
    useAIStore.setState({
      interruptedAssistantMessageIdsByChatId: {
        [chatId]: {
          "assistant-stale": true,
        },
      },
    });

    applyConfirmedExternalStopInterruption(chatId, {
      waitingForResponse: false,
      toolCallArguments: {},
      interruptedAssistantMessageIdsByChat: {
        "assistant-prior": true,
      },
      stopEligibleAssistantMessageId: "assistant-live",
      followProjectConfigId: null,
      followToolArgumentIdsByType: null,
    });

    expect(
      useAIStore.getState().interruptedAssistantMessageIdsByChatId[chatId],
    ).toEqual({
      "assistant-prior": true,
      "assistant-live": true,
    });
  });
});
