import type { IpcMain } from "electron";

import type { BackendClient } from "@generated/backend";
import { handleIpc, type IpcObserver } from "@shared/ipc";

interface MasterIpcRegistration {
  ipcMain: Pick<IpcMain, "handle">;
  ipcObserver?: IpcObserver;
  requireBackendClient: () => BackendClient;
}

export function registerMasterIpcHandlers({
  ipcMain,
  ipcObserver,
  requireBackendClient,
}: MasterIpcRegistration): void {
  handleIpc(
    ipcMain,
    "masterReadRecentInputs",
    async () => requireBackendClient().readRecentMasterInputs(),
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "masterSubmitInput",
    async (_event, request) => requireBackendClient().submitMasterInput(request),
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "masterWaitInputState",
    async (_event, request) => requireBackendClient().waitMasterInputRoutingState(request),
    ipcObserver,
  );
}
