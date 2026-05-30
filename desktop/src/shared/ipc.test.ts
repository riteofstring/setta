import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { describe, expect, test, vi } from "vitest";

import { createRendererIpcInvoke, handleIpc, ipcChannels } from "./ipc";

describe("typed IPC adapters", () => {
  test("renderer invoke uses shared channel constants", async () => {
    const invoke = vi.fn(async () => "ok");
    const renderer = { invoke };
    const typedInvoke = createRendererIpcInvoke(renderer);

    await typedInvoke("chatMessagePage", "workspace_api", "conversation_api", 0, 40);

    expect(invoke).toHaveBeenCalledWith(
      ipcChannels.chatMessagePage,
      "workspace_api",
      "conversation_api",
      0,
      40,
    );
  });

  test("main handler registration preserves argument order", async () => {
    type MainHandler = Parameters<IpcMain["handle"]>[1];
    const handlers = new Map<string, MainHandler>();
    const main: Pick<IpcMain, "handle"> = {
      handle: (channel, handler) => {
        handlers.set(channel, handler);
      },
    };
    handleIpc(main, "workspaceReorder", (_event, ids) => ({
      activeWorkspaces: ids.map((id) => ({
        displayName: id,
        id,
        lastOpenedAt: "2026-05-29T20:00:00Z",
        rootPath: "/tmp/" + id,
      })),
      recentWorkspaces: [],
      selectedWorkspaceId: ids[0] ?? "",
    }));

    const handler = handlers.get(ipcChannels.workspaceReorder);
    if (!handler) {
      throw new Error("workspace reorder handler was not registered");
    }

    const result = await Promise.resolve(
      handler({} as IpcMainInvokeEvent, ["workspace_web", "workspace_api"]),
    );
    expect(result).toMatchObject({
      activeWorkspaces: [{ id: "workspace_web" }, { id: "workspace_api" }],
    });
  });
});
