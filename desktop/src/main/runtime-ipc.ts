import type { IpcMain } from "electron";

import { handleIpc, type IpcObserver } from "@shared/ipc";
import type { RuntimeRegistryController } from "./runtime-registry";

interface RuntimeIpcRegistration {
  ipcMain: Pick<IpcMain, "handle">;
  ipcObserver?: IpcObserver;
  requireRuntimeRegistry: () => RuntimeRegistryController;
}

export function registerRuntimeIpcHandlers({
  ipcMain,
  ipcObserver,
  requireRuntimeRegistry,
}: RuntimeIpcRegistration): void {
  handleIpc(
    ipcMain,
    "runtimeCurrent",
    async () => {
      return requireRuntimeRegistry().snapshot();
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "runtimeList",
    async () => {
      return requireRuntimeRegistry().list();
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "runtimeAddByPairingUrl",
    async (_event, pairingUrl) => {
      return requireRuntimeRegistry().addByPairingURL(pairingUrl);
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "runtimeCreateDevicePairing",
    async () => {
      return requireRuntimeRegistry().createDevicePairing();
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "runtimeSwitch",
    async (_event, runtimeId) => {
      return requireRuntimeRegistry().switchToRuntime(runtimeId);
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "runtimeRemove",
    async (_event, runtimeId) => {
      return requireRuntimeRegistry().removeRuntime(runtimeId);
    },
    ipcObserver,
  );
}
