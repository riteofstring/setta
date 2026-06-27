import type { IpcMain } from "electron";

import type { BackendClient } from "@generated/backend";
import { handleIpc, type IpcObserver } from "@shared/ipc";

interface TerminalIpcRegistration {
  ipcMain: Pick<IpcMain, "handle">;
  ipcObserver?: IpcObserver;
  requireBackendClient: () => BackendClient;
}

export function registerTerminalIpcHandlers({
  ipcMain,
  ipcObserver,
  requireBackendClient,
}: TerminalIpcRegistration): void {
  handleIpc(
    ipcMain,
    "terminalCreate",
    async (_event, ...args) => {
      const [workspaceId, paneId, profileId, cwd, cols, rows] = args;
      return requireBackendClient().createTerminal({
        cols,
        cwd,
        paneId,
        profileId,
        rows,
        workspaceId,
      });
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "terminalAttach",
    async (_event, workspaceId, paneId) => {
      return requireBackendClient().attachTerminal({ paneId, workspaceId });
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "terminalInput",
    async (_event, input) => {
      return requireBackendClient().terminalInput(input);
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "terminalResize",
    async (_event, request) => {
      return requireBackendClient().resizeTerminal(request);
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "terminalClose",
    async (_event, sessionId, mode) => {
      return requireBackendClient().closeTerminal({ mode, sessionId });
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "terminalListProfiles",
    async () => {
      return requireBackendClient().listTerminalProfiles();
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "terminalCreateProfile",
    async (_event, request) => {
      return requireBackendClient().createTerminalProfile(request);
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "terminalUpdateProfile",
    async (_event, request) => {
      return requireBackendClient().updateTerminalProfile(request);
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "terminalDeleteProfile",
    async (_event, request) => {
      return requireBackendClient().deleteTerminalProfile(request);
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "terminalSelectDefaultProfile",
    async (_event, request) => {
      return requireBackendClient().selectDefaultTerminalProfile(request);
    },
    ipcObserver,
  );
}
