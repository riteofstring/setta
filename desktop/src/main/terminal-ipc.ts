import type { IpcMain } from "electron";
import { Buffer } from "node:buffer";

import type { BackendClient } from "@generated/backend";
import { handleIpc, ipcMessages, type IpcObserver } from "@shared/ipc";
import type { TerminalStreamInput } from "@shared/terminal-stream-client";
import type { TerminalInputRequest } from "@shared/types";

interface TerminalIpcRegistration {
  ipcMain: Pick<IpcMain, "handle" | "on">;
  ipcObserver?: IpcObserver;
  recordAppEvent?: (type: string, payload: unknown) => void;
  requireBackendClient: () => BackendClient;
  sendTerminalInput: (input: TerminalStreamInput) => void;
}

export function registerTerminalIpcHandlers({
  ipcMain,
  ipcObserver,
  recordAppEvent,
  requireBackendClient,
  sendTerminalInput,
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
  ipcMain.on(ipcMessages.terminalInput, (_event, input: TerminalInputRequest) => {
    const mainReceivedAt = new Date().toISOString();
    recordAppEvent?.("terminal_input_main_received", {
      byteCount: Buffer.byteLength(input.dataBase64, "base64"),
      clientId: input.trace.clientId,
      inputSequence: input.trace.inputSequence,
      mainReceivedAt,
      runId: input.trace.runId,
      sessionId: input.sessionId,
    });
    sendTerminalInput(input);
  });
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
    async (_event, request) => {
      return requireBackendClient().closeTerminal(request);
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
