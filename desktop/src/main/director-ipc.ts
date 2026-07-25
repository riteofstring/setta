import type { IpcMain } from "electron";

import type { BackendClient } from "@generated/backend";
import { handleIpc, type IpcObserver } from "@shared/ipc";
import type { DirectorEventRegistry } from "./director-event-registry";

interface DirectorIpcRegistration {
  directorEvents: DirectorEventRegistry;
  ipcMain: Pick<IpcMain, "handle">;
  ipcObserver?: IpcObserver;
  requireBackendClient: () => BackendClient;
}

export function registerDirectorIpcHandlers({
  directorEvents,
  ipcMain,
  ipcObserver,
  requireBackendClient,
}: DirectorIpcRegistration): void {
  handleIpc(
    ipcMain,
    "directorReadSnapshot",
    async () => requireBackendClient().readDirectorSnapshot(),
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "directorDispatchIntent",
    async (_event, intent) => requireBackendClient().dispatchDirectorIntent({ intent }),
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "directorSubscribeEvents",
    async (event, request) => {
      directorEvents.subscribe(event.sender, request.cursor);
    },
    ipcObserver,
  );
}
