import type { IpcMain, IpcMainInvokeEvent } from "electron";
import type { BackendClient } from "@generated/backend";
import { createBackendRequestError } from "@shared/backend-runtime";
import { ipcChannels } from "@shared/ipc";
import { describe, expect, test, vi } from "vitest";

import { registerEasyRunIpcHandlers } from "./easy-run-ipc";

describe("easy-run IPC handlers", () => {
  test("returns generated backend error facts across the Electron boundary", async () => {
    const handlers = new Map<string, Parameters<IpcMain["handle"]>[1]>();
    const ipcMain = {
      handle: (channel, handler) => {
        handlers.set(channel, handler);
      },
    } as Pick<IpcMain, "handle">;
    const steerEasyRun = vi.fn(async () => {
      throw createBackendRequestError(
        "steer_easy_run_focus_update_failed",
        "steering accepted but focus update failed: narrator unavailable",
        true,
      );
    });
    const backend = { steerEasyRun } as unknown as BackendClient;

    registerEasyRunIpcHandlers({
      ipcMain,
      requireBackendClient: () => backend,
    });

    const result = await invoke(handlers, ipcChannels.easyRunSteer, {
      text: "keep going",
      workspaceId: "workspace_api",
    });

    expect(result).toEqual({
      code: "steer_easy_run_focus_update_failed",
      kind: "failure",
      message: "steering accepted but focus update failed: narrator unavailable",
      operationApplied: true,
    });
  });
});

async function invoke(
  handlers: Map<string, Parameters<IpcMain["handle"]>[1]>,
  channel: string,
  request: unknown,
) {
  const handler = handlers.get(channel);
  if (!handler) {
    throw new Error(`handler ${channel} was not registered`);
  }
  return handler({} as IpcMainInvokeEvent, request);
}
