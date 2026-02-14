import type { ChatDetails } from "state/definitions";
import { describe, expect, it, vi } from "vitest";
import {
  createHasActiveProjectAIChatSelector,
  hasWaitingChatResponses,
  type AIWaitingSlice,
} from "./overviewSelectors";

function buildChatDetails(waitingForResponse: boolean): ChatDetails {
  return {
    messages: [],
    toolCallArguments: {},
    waitingForResponse,
    llmConfig: null,
  };
}

describe("overviewSelectors", () => {
  it("returns true when pending chat is waiting", () => {
    const selector = createHasActiveProjectAIChatSelector();
    const state: AIWaitingSlice = {
      chatDetails: {},
      pendingChatDetails: buildChatDetails(true),
    };
    expect(selector(state)).toBe(true);
  });

  it("returns true when any persisted chat is waiting", () => {
    const selector = createHasActiveProjectAIChatSelector();
    const state: AIWaitingSlice = {
      chatDetails: {
        "chat-1": buildChatDetails(false),
        "chat-2": buildChatDetails(true),
      },
      pendingChatDetails: null,
    };
    expect(selector(state)).toBe(true);
  });

  it("caches chatDetails scans until the map reference changes", () => {
    const scanChatDetails = vi.fn(() => false);
    const selector = createHasActiveProjectAIChatSelector(scanChatDetails);
    const stableChatDetails = {
      "chat-1": buildChatDetails(false),
    };
    const baseState: AIWaitingSlice = {
      chatDetails: stableChatDetails,
      pendingChatDetails: null,
    };

    expect(selector(baseState)).toBe(false);
    expect(selector(baseState)).toBe(false);
    expect(scanChatDetails).toHaveBeenCalledTimes(1);

    const stateWithPending: AIWaitingSlice = {
      ...baseState,
      pendingChatDetails: buildChatDetails(true),
    };
    expect(selector(stateWithPending)).toBe(true);
    expect(scanChatDetails).toHaveBeenCalledTimes(1);

    const nextState: AIWaitingSlice = {
      chatDetails: { ...stableChatDetails },
      pendingChatDetails: null,
    };
    expect(selector(nextState)).toBe(false);
    expect(scanChatDetails).toHaveBeenCalledTimes(2);
  });

  it("scans waiting state without allocating object values", () => {
    const chatDetails = {
      "chat-1": buildChatDetails(false),
      "chat-2": buildChatDetails(false),
    };
    expect(hasWaitingChatResponses(chatDetails)).toBe(false);
  });
});
