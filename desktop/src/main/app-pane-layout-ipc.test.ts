import { describe, expect, test, vi } from "vitest";

import { ipcChannels } from "@shared/ipc";
import { registerAppPaneLayoutIpcHandlers } from "./app-pane-layout-ipc";

describe("app pane layout IPC", () => {
  test("registers read and save handlers against the backend client", async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>();
    const ipcMain = {
      handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
        handlers.set(channel, handler);
      }),
    };
    const backend = {
      readAppPaneLayout: vi.fn().mockResolvedValue({ layout: null }),
      saveAppPaneLayout: vi.fn().mockImplementation(async (request) => request.layout),
    };
    registerAppPaneLayoutIpcHandlers({
      ipcMain,
      requireBackendClient: () => backend as never,
    });

    expect([...handlers.keys()].sort()).toEqual([
      ipcChannels.appPaneLayoutRead,
      ipcChannels.appPaneLayoutSave,
    ]);
    const layout = appPaneLayout();
    await handlers.get(ipcChannels.appPaneLayoutRead)?.({});
    const saved = await handlers.get(ipcChannels.appPaneLayoutSave)?.({}, layout);

    expect(backend.readAppPaneLayout).toHaveBeenCalledWith();
    expect(backend.saveAppPaneLayout).toHaveBeenCalledWith({ layout });
    expect(saved).toBe(layout);
  });
});

function appPaneLayout() {
  return {
    columns: [
      {
        columnId: "app_column_0",
        idealWidthSpec: { unit: "px", value: 640 },
        index: 0,
        paneIds: ["app_pane_master"],
        planeIndex: 0,
        previousProportionWidth: null,
        slotIndex: 0,
        widthSpec: { unit: "px", value: 640 },
      },
    ],
    focusedPaneId: "app_pane_master",
    maximizedPaneId: "app_pane_master",
    panes: [
      {
        columnId: "app_column_0",
        conversationConfig: null,
        heat: 0,
        masterConfig: {},
        paneId: "app_pane_master",
        sequence: 0,
        subtitle: "Global coordinator",
        surfaceId: "app_surface_master",
        surfaceKind: "master",
        title: "Setta",
        tone: "slate",
        weight: 1,
      },
    ],
    schemaVersion: 1,
  };
}
