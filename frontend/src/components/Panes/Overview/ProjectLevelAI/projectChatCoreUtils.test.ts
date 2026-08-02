import { describe, expect, it } from "vitest";

import { resolveProjectChatRedoTarget } from "./projectChatCoreUtils";

describe("resolveProjectChatRedoTarget", () => {
  it("falls back to the last chat id when redo remains executable", () => {
    expect(
      resolveProjectChatRedoTarget({
        chatId: null,
        lastChatId: "chat-2",
        waitingForResponse: false,
        requiresNewThreadContinuation: false,
        engineConfigId: "engine-1",
        hasLLMConfig: true,
        isExternalEngine: false,
        externalEngineAvailable: true,
      }),
    ).toEqual({ resolvedChatId: "chat-2" });
  });

  it("blocks redo while waiting or when the selected engine is unavailable", () => {
    expect(
      resolveProjectChatRedoTarget({
        chatId: "chat-1",
        lastChatId: "chat-2",
        waitingForResponse: true,
        requiresNewThreadContinuation: false,
        engineConfigId: "engine-1",
        hasLLMConfig: true,
        isExternalEngine: false,
        externalEngineAvailable: true,
      }),
    ).toBeNull();
    expect(
      resolveProjectChatRedoTarget({
        chatId: "chat-1",
        lastChatId: "chat-2",
        waitingForResponse: false,
        requiresNewThreadContinuation: false,
        engineConfigId: "engine-1",
        hasLLMConfig: false,
        isExternalEngine: false,
        externalEngineAvailable: true,
      }),
    ).toBeNull();
  });
});
