import type { BackendClient } from "@generated/backend";
import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { ipcChannels } from "@shared/ipc";
import { describe, expect, test, vi } from "vitest";

import { registerConversationIpcHandlers } from "./conversation-ipc";

describe("conversation IPC handlers", () => {
  test("forwards the generated navigator request and page", async () => {
    const handlers = new Map<string, Parameters<IpcMain["handle"]>[1]>();
    const ipcMain = {
      handle: (channel, handler) => handlers.set(channel, handler),
    } as Pick<IpcMain, "handle">;
    const page = { items: [], nextCursor: null };
    const listTopicConversations = vi.fn(async () => page);
    const backend = { listTopicConversations } as unknown as BackendClient;
    registerConversationIpcHandlers({ ipcMain, requireBackendClient: () => backend });
    const request = { cursor: null, limit: 80, query: "", workspaceId: "workspace_api" };

    const handler = handlers.get(ipcChannels.conversationListTopicConversations);
    if (!handler) {
      throw new Error("conversation navigator handler was not registered");
    }
    await expect(handler({} as IpcMainInvokeEvent, request)).resolves.toEqual(page);
    expect(listTopicConversations).toHaveBeenCalledWith(request);
  });
});
