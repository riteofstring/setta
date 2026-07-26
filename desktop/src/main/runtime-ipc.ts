import type { IpcMain } from "electron";

import { handleIpc, ipcChannels, type IpcObserver } from "@shared/ipc";
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
  ipcMain.handle(ipcChannels.runtimeCurrentCredential, async () => {
    const credential = await requireRuntimeRegistry().currentRuntimeCredential();
    return {
      expiresAt: credential.expiresAt,
      runtimeId: credential.runtimeId,
      token: credential.token,
    };
  });
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
