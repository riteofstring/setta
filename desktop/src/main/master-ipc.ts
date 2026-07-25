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
    "masterCancelInput",
    async (_event, request) => requireBackendClient().cancelMasterInput(request),
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "masterReadActiveInteraction",
    async () => requireBackendClient().readActiveMasterShellInteraction(),
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "masterReadTranscript",
    async (_event, request) => requireBackendClient().readMasterTranscript(request),
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "masterResolvePresentation",
    async (_event, request) => requireBackendClient().resolveMasterPresentationIntent(request),
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
    "masterWaitInteraction",
    async (_event, request) => requireBackendClient().waitMasterShellInteraction(request),
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "masterWaitPresentation",
    async (_event, request) => requireBackendClient().waitMasterPresentationIntent(request),
    ipcObserver,
  );
}
