import type { UpdateAppearanceSettingsRequest } from "@generated/backend";
import { ipcChannels, ipcEvents, ipcMessages } from "@shared/ipc";
import type { SettaAPI, WorkspaceBrowserViewBatch } from "@shared/types";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { codexAccountChangeEvent } from "./index.test.fixtures";

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
    ipcRenderer: { invoke, on, removeListener, send },
  }));

  await import("./index");

  return { api: exposed.setta as SettaAPI, invoke, on, removeListener, send };
}

describe("preload workspace API", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock("electron");
  });

  test("exposes typed app methods through IPC", async () => {
    const { api, invoke } = await exposePreloadAPI();
    expect(Object.keys(api.app).sort()).toEqual([
      "captureRendererRegion",
      "endWindowDrag",
      "installedEditors",
      "moveWindowDrag",
      "openExternalUrl",
      "openWorkspaceInEditor",
      "platform",
      "startWindowDrag",
      "versions",
      "workspaceGitInfo",
    ]);

    const dragPoint = { screenX: 200, screenY: 120 };
    await api.app.installedEditors();
    await api.app.startWindowDrag(dragPoint);
    await api.app.moveWindowDrag({ screenX: 230, screenY: 140 });
    await api.app.endWindowDrag();
    await api.app.openWorkspaceInEditor("vscode", "/tmp/api");
    await api.app.versions();
    await api.app.workspaceGitInfo("/tmp/api");
    await api.app.openExternalUrl("https://example.test/login");

    expect(api.app.platform).toBe(process.platform);
    expectInvokeCalls(invoke, [
      [ipcChannels.appInstalledEditors],
      [ipcChannels.appWindowDragStart, dragPoint],
      [ipcChannels.appWindowDragMove, { screenX: 230, screenY: 140 }],
      [ipcChannels.appWindowDragEnd],
      [ipcChannels.appOpenWorkspaceInEditor, "vscode", "/tmp/api"],
      [ipcChannels.appVersions],
      [ipcChannels.appWorkspaceGitInfo, "/tmp/api"],
      [ipcChannels.appOpenExternalUrl, "https://example.test/login"],
    ]);
  });

  test("exposes typed workspace methods through IPC", async () => {
    const { api, invoke } = await exposePreloadAPI();
    expect(Object.keys(api.workspace).sort()).toEqual([
      "close",
      "openLocalFolder",
      "openPath",
      "readUILayout",
      "refreshAvailability",
      "relocateLocalFolder",
      "removeRecent",
      "reorder",
      "saveUILayout",
      "select",
      "session",
    ]);

    const layout = {
      columns: [],
      focusedPaneId: "workspace_pane_0",
      panes: [],
      schemaVersion: 1,
      workspaceId: "workspace_api",
    };
    await api.workspace.session();
    await api.workspace.openLocalFolder();
    await api.workspace.openPath("/tmp/recent");
    await api.workspace.readUILayout("workspace_api");
    await api.workspace.refreshAvailability("workspace_api");
    await api.workspace.relocateLocalFolder("workspace_api");
    await api.workspace.saveUILayout(layout);
    await api.workspace.select("workspace_api");
    await api.workspace.close("workspace_api");
    await api.workspace.reorder(["workspace_web", "workspace_api"]);
    await api.workspace.removeRecent("workspace_web");

    expectInvokeCalls(invoke, [
      [ipcChannels.workspaceSession],
      [ipcChannels.workspaceOpenLocalFolder],
      [ipcChannels.workspaceOpenPath, "/tmp/recent"],
      [ipcChannels.workspaceReadUILayout, "workspace_api"],
      [ipcChannels.workspaceRefreshAvailability, "workspace_api"],
      [ipcChannels.workspaceRelocateLocalFolder, "workspace_api"],
      [ipcChannels.workspaceSaveUILayout, layout],
      [ipcChannels.workspaceSelect, "workspace_api"],
      [ipcChannels.workspaceClose, "workspace_api"],
      [ipcChannels.workspaceReorder, ["workspace_web", "workspace_api"]],
      [ipcChannels.workspaceRemoveRecent, "workspace_web"],
    ]);
  });

  test("exposes typed workspace native view methods through IPC", async () => {
    const { api, invoke, on, removeListener, send } = await exposePreloadAPI();
    await api.app.captureRendererRegion({ height: 40, width: 80, x: 12, y: 24 });
    const nativeViews = api.workspaceNativeViews;
    if (!nativeViews) {
      throw new Error("workspace native view API was not exposed");
    }
    const batch: WorkspaceBrowserViewBatch = {
      focusedSurfaceId: "surface_browser",
      masterVoiceShortcut: "mod_shift_k",
      totalBrowserPanes: 24,
      updates: [],
      visibleBrowserPanes: 6,
      workspaceId: "workspace_api",
    };
    nativeViews.batchBrowserViewUpdates(batch);
    await nativeViews.readBrowserViewStats();
    await nativeViews.teardownBrowserViews("workspace_api");

    const keyListener = vi.fn();
    const unsubscribeKey = nativeViews.onBrowserViewKey(keyListener);
    const keyHandler = eventHandler(on, ipcEvents.workspaceBrowserViewKey);
    keyHandler({}, browserKeyEvent());
    unsubscribeKey();

    const snapshotListener = vi.fn();
    const unsubscribeSnapshot = nativeViews.onBrowserViewSnapshot(snapshotListener);
    const snapshotHandler = eventHandler(on, ipcEvents.workspaceBrowserViewSnapshot);
    const snapshot = browserSnapshot();
    snapshotHandler({}, snapshot);
    unsubscribeSnapshot();

    expect(send).toHaveBeenCalledWith(ipcMessages.workspaceBrowserViewBatch, batch);
    expectInvokeCalls(invoke, [
      [ipcChannels.appCaptureRendererRegion, { height: 40, width: 80, x: 12, y: 24 }],
      [ipcChannels.workspaceBrowserViewStats],
      [ipcChannels.workspaceBrowserViewsTeardown, "workspace_api"],
    ]);
    expect(keyListener).toHaveBeenCalledWith(browserKeyEvent());
    expect(snapshotListener).toHaveBeenCalledWith(snapshot);
    expect(removeListener).toHaveBeenCalledWith(ipcEvents.workspaceBrowserViewKey, keyHandler);
    expect(removeListener).toHaveBeenCalledWith(
      ipcEvents.workspaceBrowserViewSnapshot,
      snapshotHandler,
    );
  });

  test("exposes typed appearance and account methods through IPC", async () => {
    const { api, invoke, on, removeListener } = await exposePreloadAPI();
    const appearance = { settings: {} } as unknown as UpdateAppearanceSettingsRequest;
    const refreshRequest = { refreshToken: true };
    const loginRequest = { apiKey: "", type: "chatgpt" as const };
    const cancelRequest = { loginId: "login_api" };
    const logoutRequest = {};

    await api.appearance.presets();
    await api.appearance.read();
    await api.appearance.update(appearance);
    await api.codexAccount.read();
    await api.codexAccount.refresh(refreshRequest);
    await api.codexAccount.startLogin(loginRequest);
    await api.codexAccount.cancelLogin(cancelRequest);
    await api.codexAccount.logout(logoutRequest);
    const accountListener = vi.fn();
    const unsubscribeAccount = api.codexAccount.onChanged(accountListener);
    const accountHandler = eventHandler(on, ipcEvents.codexAccountChange);
    const accountEvent = codexAccountChangeEvent();
    accountHandler({}, accountEvent);
    unsubscribeAccount();

    expectInvokeCalls(invoke, [
      [ipcChannels.appearancePresets],
      [ipcChannels.appearanceRead],
      [ipcChannels.appearanceUpdate, appearance],
      [ipcChannels.codexAccountRead],
      [ipcChannels.codexAccountRefresh, refreshRequest],
      [ipcChannels.codexAccountStartLogin, loginRequest],
      [ipcChannels.codexAccountCancelLogin, cancelRequest],
      [ipcChannels.codexAccountLogout, logoutRequest],
    ]);
    expect(accountListener).toHaveBeenCalledWith(accountEvent);
    expect(removeListener).toHaveBeenCalledWith(ipcEvents.codexAccountChange, accountHandler);
  });
});

function eventHandler(on: ReturnType<typeof vi.fn>, channel: string) {
  const handler = on.mock.calls.find((call) => call[0] === channel)?.[1];
  if (typeof handler !== "function") {
    throw new Error(`event handler was not registered for ${channel}`);
  }
  return handler;
}

function browserKeyEvent() {
  return {
    altKey: false,
    ctrlKey: true,
    key: "k",
    metaKey: false,
    shiftKey: false,
    surfaceId: "surface_browser",
    workspaceId: "workspace_api",
  };
}

function browserSnapshot() {
  return {
    capturedAt: 99,
    height: 120,
    imageDataUrl: "data:image/png;base64,AAAA",
    paneId: "pane_browser",
    surfaceId: "surface_browser",
    title: "Browser",
    width: 240,
    workspaceId: "workspace_api",
  };
}

function expectInvokeCalls(invoke: ReturnType<typeof vi.fn>, calls: unknown[][]) {
  expect(invoke).toHaveBeenCalledTimes(calls.length);
  for (const call of calls) {
    expect(invoke).toHaveBeenCalledWith(...call);
  }
}
