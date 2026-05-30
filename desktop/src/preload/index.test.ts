import type { SettaAPI } from "@shared/types";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { ipcChannels } from "@shared/ipc";

describe("preload workspace API", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock("electron");
  });

  test("exposes typed workspace methods through IPC", async () => {
    const exposed: Record<string, unknown> = {};
    const invoke = vi.fn();
    vi.doMock("electron", () => ({
      contextBridge: {
        exposeInMainWorld: (name: string, api: unknown) => {
          exposed[name] = api;
        },
      },
      ipcRenderer: {
        invoke,
      },
    }));

    await import("./index");

    const api = exposed.setta as SettaAPI;
    expect(Object.keys(api.workspace).sort()).toEqual([
      "close",
      "openLocalFolder",
      "removeRecent",
      "reorder",
      "select",
      "session",
    ]);

    await api.workspace.session();
    await api.workspace.openLocalFolder();
    await api.workspace.select("workspace_api");
    await api.workspace.close("workspace_api");
    await api.workspace.reorder(["workspace_web", "workspace_api"]);
    await api.workspace.removeRecent("workspace_web");

    expect(invoke).toHaveBeenNthCalledWith(1, ipcChannels.workspaceSession);
    expect(invoke).toHaveBeenNthCalledWith(2, ipcChannels.workspaceOpenLocalFolder);
    expect(invoke).toHaveBeenNthCalledWith(3, ipcChannels.workspaceSelect, "workspace_api");
    expect(invoke).toHaveBeenNthCalledWith(4, ipcChannels.workspaceClose, "workspace_api");
    expect(invoke).toHaveBeenNthCalledWith(5, ipcChannels.workspaceReorder, [
      "workspace_web",
      "workspace_api",
    ]);
    expect(invoke).toHaveBeenNthCalledWith(6, ipcChannels.workspaceRemoveRecent, "workspace_web");
  });

  test("exposes browser pane methods through shared IPC channels", async () => {
    const exposed: Record<string, unknown> = {};
    const invoke = vi.fn();
    vi.doMock("electron", () => ({
      contextBridge: {
        exposeInMainWorld: (name: string, api: unknown) => {
          exposed[name] = api;
        },
      },
      ipcRenderer: {
        invoke,
      },
    }));

    await import("./index");

    const api = exposed.setta as SettaAPI;
    await api.browserPane.status();
    await api.browserPane.setBounds({ height: 4, width: 3, x: 1, y: 2 });
    await api.browserPane.inspect("#preview-title");
    await api.browserPane.click({ x: 5, y: 6 });
    await api.browserPane.typeText("hello");

    expect(invoke).toHaveBeenNthCalledWith(1, ipcChannels.browserPaneStatus);
    expect(invoke).toHaveBeenNthCalledWith(2, ipcChannels.browserPaneSetBounds, {
      height: 4,
      width: 3,
      x: 1,
      y: 2,
    });
    expect(invoke).toHaveBeenNthCalledWith(3, ipcChannels.browserPaneInspect, "#preview-title");
    expect(invoke).toHaveBeenNthCalledWith(4, ipcChannels.browserPaneClick, { x: 5, y: 6 });
    expect(invoke).toHaveBeenNthCalledWith(5, ipcChannels.browserPaneTypeText, "hello");
  });
});
