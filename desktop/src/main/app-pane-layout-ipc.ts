import type { IpcMain } from "electron";

import type { BackendClient } from "@generated/backend";
import { handleIpc, type IpcObserver } from "@shared/ipc";

interface AppPaneLayoutIpcRegistration {
  ipcMain: Pick<IpcMain, "handle">;
  ipcObserver?: IpcObserver;
  requireBackendClient: () => BackendClient;
}

export function registerAppPaneLayoutIpcHandlers({
  ipcMain,
  ipcObserver,
  requireBackendClient,
}: AppPaneLayoutIpcRegistration): void {
  handleIpc(
    ipcMain,
    "appPaneLayoutRead",
    async () => {
      return requireBackendClient().readAppPaneLayout();
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "appPaneLayoutSave",
    async (_event, layout) => {
      return requireBackendClient().saveAppPaneLayout({ layout });
    },
    ipcObserver,
  );
}
