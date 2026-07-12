import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { describe, expect, test, vi } from "vitest";

import { createRendererIpcInvoke, handleIpc, ipcChannels } from "./ipc";

describe("typed IPC adapters", () => {
  test("renderer invoke uses shared channel constants", async () => {
    const invoke = vi.fn(async () => "ok");
    const renderer = { invoke };
    const typedInvoke = createRendererIpcInvoke(renderer);

    const request = { conversationId: "conversation_api", workspaceId: "workspace_api" };
    await typedInvoke("conversationReadSnapshot", request);

    expect(invoke).toHaveBeenCalledWith(ipcChannels.conversationReadSnapshot, request);
  });

  test("renderer invoke removes Electron remote method wrapper from errors", async () => {
    const invoke = vi.fn(async () => {
      throw new Error(
        "Error invoking remote method 'conversation:list-topic-conversations': Error: malformed conversation state /tmp/run.json",
      );
    });
    const typedInvoke = createRendererIpcInvoke({ invoke });

    await expect(
      typedInvoke("conversationListTopicConversations", {
        cursor: null,
        limit: 40,
        query: "",
        workspaceId: "workspace_api",
      }),
    ).rejects.toThrow("malformed conversation state /tmp/run.json");
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

  test("main handler observer sees invocation lifecycle", async () => {
    type MainHandler = Parameters<IpcMain["handle"]>[1];
    const handlers = new Map<string, MainHandler>();
    const main: Pick<IpcMain, "handle"> = {
      handle: (channel, handler) => {
        handlers.set(channel, handler);
      },
    };
    const started = vi.fn();
    const finished = vi.fn();
    const failed = vi.fn();

    handleIpc(
      main,
      "workspaceSelect",
      (_event, id) => ({
        activeWorkspaces: [],
        recentWorkspaces: [],
        selectedWorkspaceId: id,
      }),
      { failed, finished, started },
    );

    const handler = handlers.get(ipcChannels.workspaceSelect);
    if (!handler) {
      throw new Error("workspace select handler was not registered");
    }

    const result = await Promise.resolve(handler({} as IpcMainInvokeEvent, "workspace_api"));

    expect(result).toMatchObject({ selectedWorkspaceId: "workspace_api" });
    expect(started).toHaveBeenCalledWith(
      expect.objectContaining({
        args: ["workspace_api"],
        channel: ipcChannels.workspaceSelect,
      }),
    );
    expect(finished).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: ipcChannels.workspaceSelect,
        result,
      }),
    );
    expect(failed).not.toHaveBeenCalled();
  });

  test("main handler observer sees invocation failures", async () => {
    type MainHandler = Parameters<IpcMain["handle"]>[1];
    const handlers = new Map<string, MainHandler>();
    const main: Pick<IpcMain, "handle"> = {
      handle: (channel, handler) => {
        handlers.set(channel, handler);
      },
    };
    const started = vi.fn();
    const finished = vi.fn();
    const failed = vi.fn();

    handleIpc(
      main,
      "workspaceSelect",
      () => {
        throw new Error("select failed");
      },
      { failed, finished, started },
    );

    const handler = handlers.get(ipcChannels.workspaceSelect);
    if (!handler) {
      throw new Error("workspace select handler was not registered");
    }

    await expect(handler({} as IpcMainInvokeEvent, "workspace_api")).rejects.toThrow(
      "select failed",
    );

    expect(started).toHaveBeenCalledOnce();
    expect(finished).not.toHaveBeenCalled();
    expect(failed).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: ipcChannels.workspaceSelect,
        error: expect.any(Error),
      }),
    );
  });
});
