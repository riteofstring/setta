import type { SettaAPI } from "@shared/types";
import { beforeEach, describe, expect, test, vi } from "vitest";

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

    expect(invoke).toHaveBeenNthCalledWith(1, "workspace:session");
    expect(invoke).toHaveBeenNthCalledWith(2, "workspace:open-local-folder");
    expect(invoke).toHaveBeenNthCalledWith(3, "workspace:select", "workspace_api");
    expect(invoke).toHaveBeenNthCalledWith(4, "workspace:close", "workspace_api");
    expect(invoke).toHaveBeenNthCalledWith(5, "workspace:reorder", [
      "workspace_web",
      "workspace_api",
    ]);
    expect(invoke).toHaveBeenNthCalledWith(6, "workspace:remove-recent", "workspace_web");
  });
});
