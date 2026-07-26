import type { UpdateAppearanceSettingsRequest } from "@generated/backend";
import { ipcChannels, ipcEvents } from "@shared/ipc";
import type { SettaAPI } from "@shared/types";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { codexAccountChangeEvent } from "./index.test.fixtures";

async function exposePreloadAPI({ invoke = vi.fn(), on = vi.fn(), removeListener = vi.fn() } = {}) {
  const exposed: Record<string, unknown> = {};
  vi.doMock("electron", () => ({
    contextBridge: {
      exposeInMainWorld: (name: string, api: unknown) => {
        exposed[name] = api;
      },
    },
    ipcRenderer: { invoke, on, removeListener, send: vi.fn() },
  }));

  await import("./index");

  return { api: exposed.setta as SettaAPI, invoke, on, removeListener };
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
      "refreshAvailability",
      "relocateLocalFolder",
      "removeRecent",
      "reorder",
      "select",
      "session",
    ]);

    await api.workspace.session();
    await api.workspace.openLocalFolder();
    await api.workspace.openPath("/tmp/recent");
    await api.workspace.refreshAvailability("workspace_api");
    await api.workspace.relocateLocalFolder("workspace_api");
    await api.workspace.select("workspace_api");
    await api.workspace.close("workspace_api");
    await api.workspace.reorder(["workspace_web", "workspace_api"]);
    await api.workspace.removeRecent("workspace_web");

    expectInvokeCalls(invoke, [
      [ipcChannels.workspaceSession],
      [ipcChannels.workspaceOpenLocalFolder],
      [ipcChannels.workspaceOpenPath, "/tmp/recent"],
      [ipcChannels.workspaceRefreshAvailability, "workspace_api"],
      [ipcChannels.workspaceRelocateLocalFolder, "workspace_api"],
      [ipcChannels.workspaceSelect, "workspace_api"],
      [ipcChannels.workspaceClose, "workspace_api"],
      [ipcChannels.workspaceReorder, ["workspace_web", "workspace_api"]],
      [ipcChannels.workspaceRemoveRecent, "workspace_web"],
    ]);
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

  test("exposes typed hosted access commands and progress through IPC", async () => {
    const { api, invoke, on, removeListener } = await exposePreloadAPI();
    const hostedAccess = api.hostedAccess;
    if (!hostedAccess) {
      throw new Error("hosted access API was not exposed");
    }
    const intent = {
      client: { deviceId: "phone-hosted", kind: "phone" as const },
      idempotencyKey: "intent-hosted",
      projectId: "project-hosted",
      requestedCapabilities: ["observe", "steer"] as ("observe" | "steer")[],
      userId: "user-hosted",
      workstreamId: "workstream-hosted",
    };
    const progress = {
      accessGrant: null,
      cursor: "1",
      intentId: "intent-hosted",
      occurredAt: "2026-07-24T15:00:00Z",
      reasonCode: null,
      retryable: false,
      state: "preparing_access" as const,
    };

    await hostedAccess.ensure(intent);
    await hostedAccess.subscribeProgress({ intentId: intent.idempotencyKey, lastEventId: "" });
    const listener = vi.fn();
    const unsubscribe = hostedAccess.onProgress(listener);
    const handler = eventHandler(on, ipcEvents.hostedAccessProgress);
    handler({}, progress);
    unsubscribe();
    await hostedAccess.releaseProgress({ intentId: intent.idempotencyKey });

    expectInvokeCalls(invoke, [
      [ipcChannels.hostedAccessEnsure, intent],
      [
        ipcChannels.hostedAccessSubscribeProgress,
        { intentId: intent.idempotencyKey, lastEventId: "" },
      ],
      [ipcChannels.hostedAccessReleaseProgress, { intentId: intent.idempotencyKey }],
    ]);
    expect(listener).toHaveBeenCalledWith(progress);
    expect(removeListener).toHaveBeenCalledWith(ipcEvents.hostedAccessProgress, handler);
  });
});

function eventHandler(on: ReturnType<typeof vi.fn>, channel: string) {
  const handler = on.mock.calls.find((call) => call[0] === channel)?.[1];
  if (typeof handler !== "function") {
    throw new Error(`event handler was not registered for ${channel}`);
  }
  return handler;
}

function expectInvokeCalls(invoke: ReturnType<typeof vi.fn>, calls: unknown[][]) {
  expect(invoke).toHaveBeenCalledTimes(calls.length);
  for (const call of calls) {
    expect(invoke).toHaveBeenCalledWith(...call);
  }
}
