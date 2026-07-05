import type { IpcMain } from "electron";

import { handleIpc, type IpcObserver } from "@shared/ipc";
import type { RuntimeRegistryController } from "./runtime-registry";
import { runSettaRemoteAddSSH } from "./runtime-ssh";

interface RuntimeIpcRegistration {
  appDataDir: string;
  ipcMain: Pick<IpcMain, "handle">;
  ipcObserver?: IpcObserver;
  repoRoot: string;
  requireRuntimeRegistry: () => RuntimeRegistryController;
}

export function registerRuntimeIpcHandlers({
  appDataDir,
  ipcMain,
  ipcObserver,
  repoRoot,
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
    "runtimeAddExistingMachineOverSSH",
    async (_event, request) => {
      const result = await runSettaRemoteAddSSH(request, {
        appDataDir,
        env: process.env,
        repoRoot,
      });
      return requireRuntimeRegistry().addByPairingURL(result.pairingUrl);
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
