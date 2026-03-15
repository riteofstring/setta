import { useAIStore } from "state/definitions";
import { resetProjectStores } from "state/utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearInterruptedAssistantMessages,
  getInterruptedAssistantMessageIdsByChat,
  markInterruptedAssistantMessage,
  restoreInterruptedAssistantMessageIds,
} from "./aiInterruptedAssistantMessages";

describe("aiInterruptedAssistantMessages", () => {
  beforeEach(() => {
    resetProjectStores();
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("marks and clears interrupted assistant messages per chat", () => {
    markInterruptedAssistantMessage("chat-a", "assistant-1");
    markInterruptedAssistantMessage("chat-a", "assistant-2");

    expect(getInterruptedAssistantMessageIdsByChat("chat-a")).toEqual({
      "assistant-1": true,
      "assistant-2": true,
    });

    clearInterruptedAssistantMessages("chat-a", ["assistant-1", null]);

    expect(getInterruptedAssistantMessageIdsByChat("chat-a")).toEqual({
      "assistant-2": true,
    });
  });

  it("restores a snapshot and clears the chat entry when the snapshot is empty", () => {
    useAIStore.setState({
      interruptedAssistantMessageIdsByChatId: {
        "chat-a": {
          "assistant-stale": true,
        },
      },
    });

    restoreInterruptedAssistantMessageIds("chat-a", {
      "assistant-live": true,
    });

    expect(getInterruptedAssistantMessageIdsByChat("chat-a")).toEqual({
      "assistant-live": true,
    });

    restoreInterruptedAssistantMessageIds("chat-a", {});

    expect(
      useAIStore.getState().interruptedAssistantMessageIdsByChatId["chat-a"],
    ).toBeUndefined();
  });
});
