import type { SettaAPI } from "@shared/types";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { useChatStore } from "./chat-store";

describe("chat store background workspace sync", () => {
  beforeEach(() => {
    useChatStore.setState(useChatStore.getInitialState(), true);
  });

  test("syncs workspace chat without leaking load command rejection", async () => {
    const listConversations = vi.fn().mockRejectedValue(new Error("workspace load failed"));
    installMinimalSettaAPI({ listConversations });

    await expect(useChatStore.getState().syncWorkspaceChat("workspace_api")).resolves.toBe(
      undefined,
    );

    expect(listConversations).toHaveBeenCalledWith("workspace_api");
    expect(useChatStore.getState().error).toBe("workspace load failed");
    expect(useChatStore.getState().status).toBe("error");
  });
});

function installMinimalSettaAPI({
  listConversations,
}: {
  listConversations: SettaAPI["chat"]["listConversations"];
}) {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      setta: {
        chat: {
          listConversations,
        },
        workspace: {
          selectedConversations: async () => ({ selectedConversationIdsByWorkspaceId: {} }),
        },
      } as unknown as SettaAPI,
    },
  });
}
