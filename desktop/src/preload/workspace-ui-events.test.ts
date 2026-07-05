import type { SettaAPI } from "@shared/types";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { ipcEvents, ipcMessages } from "@shared/ipc";
import { workspaceUIEvent } from "./index.test.fixtures";

async function exposePreloadAPI({
  invoke = vi.fn(),
  on = vi.fn(),
  removeListener = vi.fn(),
  send = vi.fn(),
} = {}) {
  const exposed: Record<string, unknown> = {};
  vi.doMock("electron", () => ({
    contextBridge: {
      exposeInMainWorld: (name: string, api: unknown) => {
        exposed[name] = api;
      },
    },
    ipcRenderer: {
      invoke,
      on,
      removeListener,
      send,
    },
  }));

  await import("./index");

  return { api: exposed.setta as SettaAPI, on, removeListener, send };
}

describe("preload workspace UI events", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock("electron");
  });

  test("subscribes to workspace-scoped UI events through IPC", async () => {
    const { api, on, removeListener, send } = await exposePreloadAPI();
    const listener = vi.fn();
    const unsubscribe = api.workspace.onUIEvent("workspace_api", listener);
    const handler = on.mock.calls.find((call) => call[0] === ipcEvents.workspaceUIEvent)?.[1];
    if (typeof handler !== "function") {
      throw new Error("workspace UI event handler was not registered");
    }
    const event = workspaceUIEvent("workspace_api");

    handler({}, workspaceUIEvent("workspace_other"));
    handler({}, event);
    unsubscribe();

    expect(send).toHaveBeenCalledWith(ipcMessages.workspaceUIEventSubscribe, "workspace_api");
    expect(listener).toHaveBeenCalledWith(event);
    expect(removeListener).toHaveBeenCalledWith(ipcEvents.workspaceUIEvent, handler);
    expect(send).toHaveBeenCalledWith(ipcMessages.workspaceUIEventUnsubscribe, "workspace_api");
  });
});
