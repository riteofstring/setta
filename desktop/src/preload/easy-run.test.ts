import type { SettaAPI } from "@shared/types";
import { ipcChannels } from "@shared/ipc";
import { beforeEach, describe, expect, test, vi } from "vitest";

describe("preload Easy Run API", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock("electron");
  });

  test("preserves typed steering results", async () => {
    const invoke = vi.fn().mockResolvedValue({
      code: "steer_easy_run_focus_update_failed",
      kind: "failure",
      message: "steering accepted but focus update failed: narrator unavailable",
      operationApplied: true,
    });
    const exposed: Record<string, unknown> = {};
    vi.doMock("electron", () => ({
      contextBridge: {
        exposeInMainWorld: (name: string, api: unknown) => {
          exposed[name] = api;
        },
      },
      ipcRenderer: { invoke, on: vi.fn(), removeListener: vi.fn(), send: vi.fn() },
    }));
    await import("./index");
    const api = exposed.setta as SettaAPI;

    const result = await api.easyRun.steer({
      text: "keep going",
      workspaceId: "workspace_api",
    });

    expect(result).toMatchObject({ kind: "failure", operationApplied: true });
    expect(invoke).toHaveBeenCalledWith(ipcChannels.easyRunSteer, {
      text: "keep going",
      workspaceId: "workspace_api",
    });
  });
});
