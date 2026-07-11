import type { IpcMain } from "electron";
import { Buffer } from "node:buffer";

import type { BackendClient } from "@generated/backend";
import { handleIpc, type IpcObserver } from "@shared/ipc";

interface TerminalIpcRegistration {
  ipcMain: Pick<IpcMain, "handle">;
  ipcObserver?: IpcObserver;
  recordAppEvent?: (type: string, payload: unknown) => void;
  requireBackendClient: () => BackendClient;
}

export function registerTerminalIpcHandlers({
  ipcMain,
  ipcObserver,
  recordAppEvent,
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
      const mainReceivedAt = new Date().toISOString();
      recordAppEvent?.("terminal_input_main_received", {
        byteCount: Buffer.byteLength(input.dataBase64, "base64"),
        clientId: input.trace.clientId,
        inputSequence: input.trace.inputSequence,
        mainReceivedAt,
        runId: input.trace.runId,
        sessionId: input.sessionId,
      });
      const httpDispatchedAt = new Date().toISOString();
      recordAppEvent?.("terminal_input_http_dispatched", {
        byteCount: Buffer.byteLength(input.dataBase64, "base64"),
        clientId: input.trace.clientId,
        httpDispatchedAt,
        inputSequence: input.trace.inputSequence,
        runId: input.trace.runId,
        sessionId: input.sessionId,
      });
      const result = await requireBackendClient().terminalInput({
        ...input,
        trace: { ...input.trace, httpDispatchedAt, mainReceivedAt },
      });
      recordAppEvent?.("terminal_input_http_response_received", {
        acceptedBytes: result.acceptedBytes,
        clientId: result.trace.clientId,
        handlerReceivedAt: result.trace.handlerReceivedAt,
        inputSequence: result.trace.inputSequence,
        ptyWriteCompletedAt: result.trace.ptyWriteCompletedAt,
        receivedAt: new Date().toISOString(),
        runId: result.trace.runId,
        sessionId: input.sessionId,
      });
      return result;
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
