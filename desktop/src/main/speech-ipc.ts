import type { IpcMain } from "electron";

import type { BackendClient } from "@generated/backend";
import { handleIpc, type IpcObserver } from "@shared/ipc";

interface SpeechIpcRegistration {
  ipcMain: Pick<IpcMain, "handle">;
  ipcObserver?: IpcObserver;
  requireBackendClient: () => BackendClient;
}

export function registerSpeechIpcHandlers({
  ipcMain,
  ipcObserver,
  requireBackendClient,
}: SpeechIpcRegistration): void {
  handleIpc(
    ipcMain,
    "speechReadCapabilities",
    async () => requireBackendClient().readSpeechCapabilities(),
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "speechReadMasterVoiceSelection",
    async () => requireBackendClient().readMasterVoiceSelection(),
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "speechUpdateMasterVoiceSelection",
    async (_event, request) => requireBackendClient().updateMasterVoiceSelection(request),
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "speechCreateTranscriptionSession",
    async () => requireBackendClient().createSpeechTranscriptionSession({}),
    observerWithRedactedResult(ipcObserver),
  );
}

function observerWithRedactedResult(observer: IpcObserver | undefined): IpcObserver | undefined {
  if (!observer) {
    return undefined;
  }
  return {
    failed: observer.failed,
    finished: (event) => {
      observer.finished({
        ...event,
        result: { redacted: true, type: "speech_transcription_session" },
      });
    },
    started: observer.started,
  };
}
