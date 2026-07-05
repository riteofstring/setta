import type { IpcMain } from "electron";

import type { BackendClient } from "@generated/backend";
import { handleIpc, type IpcObserver } from "@shared/ipc";

interface EasyRunIpcRegistration {
  ipcMain: Pick<IpcMain, "handle">;
  ipcObserver?: IpcObserver;
  requireBackendClient: () => BackendClient;
}

export function registerEasyRunIpcHandlers({
  ipcMain,
  ipcObserver,
  requireBackendClient,
}: EasyRunIpcRegistration): void {
  handleIpc(
    ipcMain,
    "easyRunSnapshot",
    async (_event, workspaceId) => {
      return requireBackendClient().readEasyRunSnapshot({ workspaceId });
    },
    ipcObserver,
  );
}
