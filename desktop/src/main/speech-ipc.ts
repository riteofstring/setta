import type { IpcMain } from "electron";

import type { BackendClient } from "@generated/backend";
import { handleIpc, type IpcObserver } from "@shared/ipc";
import {
  type SpeechSynthesisIpcRequest,
  validateSpeechSynthesisOperationId,
} from "@shared/speech-ipc";

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
  const synthesisOperations = new SpeechSynthesisOperations();
  handleIpc(ipcMain, "speechCancelSynthesis", async (_event, operationId) => {
    synthesisOperations.cancel(operationId);
  });
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
  handleIpc(
    ipcMain,
    "speechSynthesize",
    async (_event, operation) =>
      synthesisOperations.run(operation, (request, signal) =>
        requireBackendClient().synthesizeSpeech(request, { signal }),
      ),
    observerWithRedactedAudio(ipcObserver),
  );
}

class SpeechSynthesisOperations {
  private readonly active = new Map<string, AbortController>();

  cancel(operationId: string): void {
    validateSpeechSynthesisOperationId(operationId);
    this.active.get(operationId)?.abort();
  }

  async run(
    operation: SpeechSynthesisIpcRequest,
    synthesize: (
      request: SpeechSynthesisIpcRequest["request"],
      signal: AbortSignal,
    ) => ReturnType<BackendClient["synthesizeSpeech"]>,
  ) {
    validateSpeechSynthesisOperationId(operation.operationId);
    if (this.active.has(operation.operationId)) {
      throw new Error("Speech synthesis operation is already active.");
    }
    const controller = new AbortController();
    this.active.set(operation.operationId, controller);
    try {
      return await synthesize(operation.request, controller.signal);
    } finally {
      if (this.active.get(operation.operationId) === controller) {
        this.active.delete(operation.operationId);
      }
    }
  }
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

function observerWithRedactedAudio(observer: IpcObserver | undefined): IpcObserver | undefined {
  if (!observer) {
    return undefined;
  }
  return {
    failed: observer.failed,
    finished: (event) => {
      const result = event.result as {
        format: unknown;
        mediaType: unknown;
        resolvedVoiceId: unknown;
        source: unknown;
      };
      observer.finished({
        ...event,
        result: {
          format: result.format,
          mediaType: result.mediaType,
          resolvedVoiceId: result.resolvedVoiceId,
          source: result.source,
          type: "speech_audio",
        },
      });
    },
    started: observer.started,
  };
}
