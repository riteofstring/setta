import type { Conversation } from "@generated/backend";
import type { SettaAPI } from "@shared/types";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { useChatStore } from "./chat-store";

describe("chat store command listing", () => {
  beforeEach(() => {
    useChatStore.setState({
      commandListError: null,
      commandListStatus: "idle",
      error: null,
      selectedConversation: testConversation(),
      workspaceId: "workspace_api",
    });
  });

  test("exposes command-list failures without setting the global chat error", async () => {
    const listCommands = vi.fn().mockRejectedValue(new Error("command registry failed"));
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        setta: { chat: { listCommands } } as unknown as SettaAPI,
      },
    });

    await expect(useChatStore.getState().listCommands()).rejects.toThrow("command registry failed");

    expect(listCommands).toHaveBeenCalledWith("workspace_api", "conversation_api");
    expect(useChatStore.getState().commandListStatus).toBe("failed");
    expect(useChatStore.getState().commandListError).toBe("command registry failed");
    expect(useChatStore.getState().error).toBeNull();
  });
});

function testConversation(): Conversation {
  return {
    archivedAt: "",
    codexSettings: null,
    createdAt: "2026-06-05T20:00:00Z",
    harnessRefs: [],
    id: "conversation_api",
    schemaVersion: 1,
    title: "Test",
    updatedAt: "2026-06-05T20:00:00Z",
    workspaceId: "workspace_api",
  };
}
