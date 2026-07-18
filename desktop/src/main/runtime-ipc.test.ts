import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { ipcChannels, type IpcObserver } from "@shared/ipc";
import { describe, expect, test, vi } from "vitest";

import { registerRuntimeIpcHandlers } from "./runtime-ipc";
import type { RuntimeRegistryController } from "./runtime-registry";

describe("runtime IPC handlers", () => {
  test("returns current runtime credential without device identity secret", async () => {
    const handlers = new Map<string, Parameters<IpcMain["handle"]>[1]>();
    const ipcMain = {
      handle: (channel, handler) => {
        handlers.set(channel, handler);
      },
    } as Pick<IpcMain, "handle">;
    const ipcObserver = {
      failed: vi.fn(),
      finished: vi.fn(),
      started: vi.fn(),
    } satisfies IpcObserver;

    registerRuntimeIpcHandlers({
      ipcMain,
      ipcObserver,
      requireRuntimeRegistry: () =>
        ({
          currentRuntimeCredential: async () => ({
            deviceId: "device_test",
            expiresAt: "2026-07-16T12:05:00.000Z",
            runtimeId: "runtime_test",
            token: "runtime_credential",
          }),
        }) as RuntimeRegistryController,
    });

    const result = await invoke(handlers, ipcChannels.runtimeCurrentCredential);

    expect(result).toEqual({
      expiresAt: "2026-07-16T12:05:00.000Z",
      runtimeId: "runtime_test",
      token: "runtime_credential",
    });
    expect(JSON.stringify(result)).not.toContain("device_test");
    expect(ipcObserver.started).not.toHaveBeenCalled();
    expect(ipcObserver.finished).not.toHaveBeenCalled();
    expect(ipcObserver.failed).not.toHaveBeenCalled();
  });
});

async function invoke(handlers: Map<string, Parameters<IpcMain["handle"]>[1]>, channel: string) {
  const handler = handlers.get(channel);
  if (!handler) {
    throw new Error(`handler ${channel} was not registered`);
  }
  return handler({} as IpcMainInvokeEvent);
}
