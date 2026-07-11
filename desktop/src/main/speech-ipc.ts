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
    "speechCreateTranscriptionSession",
    async (_event, request) => requireBackendClient().createSpeechTranscriptionSession(request),
    observerWithRedactedResult(ipcObserver, "speech_transcription_session"),
  );
  handleIpc(
    ipcMain,
    "speechSynthesizeEasyRunSummary",
    async (_event, request) => requireBackendClient().synthesizeEasyRunSummary(request),
    observerWithRedactedResult(ipcObserver, "speech_audio"),
  );
  handleIpc(
    ipcMain,
    "speechSynthesizeEasyRunHighlight",
    async (_event, request) => requireBackendClient().synthesizeEasyRunHighlight(request),
    observerWithRedactedResult(ipcObserver, "speech_audio"),
  );
}

function observerWithRedactedResult(
  observer: IpcObserver | undefined,
  resultType: "speech_audio" | "speech_transcription_session",
): IpcObserver | undefined {
  if (!observer) {
    return undefined;
  }
  return {
    failed: observer.failed,
    finished: (event) => {
      observer.finished({
        ...event,
        result: { redacted: true, type: resultType },
      });
    },
    started: observer.started,
  };
}
