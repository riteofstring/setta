import { describe, expect, it } from "vitest";
import {
  resolveProjectChatEngineSwitchContinuationAfterContextChange,
  resolveProjectChatEngineSwitchContinuationOnEngineChange,
  shouldProjectChatSkipEngineSyncForContinuation,
} from "./ProjectChat";

describe("project chat engine-switch continuation integration", () => {
  it("keeps manual engine selection on the same thread until continuation context is cleared", () => {
    const continuation =
      resolveProjectChatEngineSwitchContinuationOnEngineChange({
        chatId: "chat-1",
        nextEngineId: "engine-b",
        chatEngineConfigByChatId: new Map([["chat-1", "engine-a"]]),
      });

    expect(continuation).toEqual({
      sourceChatId: "chat-1",
      sourceEngineConfigId: "engine-a",
      targetEngineConfigId: "engine-b",
    });
    expect(
      shouldProjectChatSkipEngineSyncForContinuation({
        continuation,
        chatId: "chat-1",
      }),
    ).toBe(true);

    const preserved =
      resolveProjectChatEngineSwitchContinuationAfterContextChange({
        continuation,
        chatId: "chat-1",
        selectedEngineId: "engine-b",
      });
    expect(preserved).toEqual(continuation);

    const clearedAfterStartingNewThread =
      resolveProjectChatEngineSwitchContinuationAfterContextChange({
        continuation: preserved,
        chatId: undefined,
        selectedEngineId: "engine-b",
      });
    expect(clearedAfterStartingNewThread).toBeNull();
  });
});
