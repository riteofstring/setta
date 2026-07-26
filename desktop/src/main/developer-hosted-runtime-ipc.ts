import type { IpcMain } from "electron";

import { handleIpc, type IpcObserver } from "@shared/ipc";
import type { DeveloperHostedRuntimeController } from "./developer-hosted-runtime-controller";

interface DeveloperHostedRuntimeIpcRegistration {
  controller: DeveloperHostedRuntimeController;
  ipcMain: Pick<IpcMain, "handle">;
  ipcObserver?: IpcObserver;
}

export function registerDeveloperHostedRuntimeIpcHandlers({
  controller,
  ipcMain,
  ipcObserver,
}: DeveloperHostedRuntimeIpcRegistration): void {
  handleIpc(
    ipcMain,
    "developerHostedRuntimeAvailable",
    async () => controller.available(),
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "developerHostedRuntimeEnsure",
    async (_event, request) => controller.ensure(request),
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "developerHostedRuntimeDestroy",
    async (_event, request) => controller.destroy(request),
    ipcObserver,
  );
  handleIpc(ipcMain, "developerHostedRuntimeStatus", async () => controller.status(), ipcObserver);
}
