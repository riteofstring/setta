import type { IpcMain } from "electron";

import { handleIpc, type IpcObserver } from "@shared/ipc";
import { ensureHostedAccess } from "./hosted-access-client";
import type { HostedAccessProgressRegistry } from "./hosted-access-progress-registry";

interface HostedAccessIpcRegistration {
  hostedAccessProgress: HostedAccessProgressRegistry;
  ipcMain: Pick<IpcMain, "handle">;
  ipcObserver?: IpcObserver;
  socketPath: () => string;
}

export function registerHostedAccessIpcHandlers({
  hostedAccessProgress,
  ipcMain,
  ipcObserver,
  socketPath,
}: HostedAccessIpcRegistration): void {
  handleIpc(
    ipcMain,
    "hostedAccessEnsure",
    async (_event, intent) => ensureHostedAccess(socketPath(), intent),
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "hostedAccessSubscribeProgress",
    async (event, request) => hostedAccessProgress.subscribe(event.sender, request),
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "hostedAccessReleaseProgress",
    async (event, request) => hostedAccessProgress.release(event.sender, request.intentId),
    ipcObserver,
  );
}
