import type { IpcMain } from "electron";

import type { BackendClient } from "@generated/backend";
import { handleIpc, type IpcObserver } from "@shared/ipc";
import {
  decodeSpeechCredentialProviderRequest,
  decodeSpeechCredentialSaveRequest,
  type SpeechCredentialProviderRequest,
  type SpeechCredentialSaveRequest,
  type SpeechCredentialSettings,
  type SpeechSynthesisIpcRequest,
  validateSpeechSynthesisOperationId,
} from "@shared/speech-ipc";

interface SpeechCredentialIpcCoordinator {
  readCredentialSettings: (
    request: SpeechCredentialProviderRequest,
  ) => Promise<SpeechCredentialSettings>;
  removeCredential: (request: SpeechCredentialProviderRequest) => Promise<SpeechCredentialSettings>;
  saveCredential: (request: SpeechCredentialSaveRequest) => Promise<SpeechCredentialSettings>;
}

interface SpeechIpcRegistration {
  ipcMain: Pick<IpcMain, "handle">;
  ipcObserver?: IpcObserver;
  requireBackendClient: () => BackendClient;
  requireSpeechCredentialCoordinator: () => SpeechCredentialIpcCoordinator;
}

export function registerSpeechIpcHandlers({
  ipcMain,
  ipcObserver,
  requireBackendClient,
  requireSpeechCredentialCoordinator,
}: SpeechIpcRegistration): void {
  const synthesisOperations = new SpeechSynthesisOperations();
  handleIpc(ipcMain, "speechCancelSynthesis", async (_event, operationId) => {
    synthesisOperations.cancel(operationId);
  });
  handleIpc(
    ipcMain,
    "speechReadCredentialSettings",
    async (_event, request) => {
      const decoded = decodeCredentialProviderRequest(request);
      if (decoded === null) {
        return invalidCredentialProviderRequestSettings("read");
      }
      return requireSpeechCredentialCoordinator().readCredentialSettings(decoded);
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "speechSaveCredential",
    async (_event, request) => {
      const decoded = decodeCredentialSaveRequest(request);
      if (decoded === null) {
        return invalidCredentialSaveRequestSettings();
      }
      return requireSpeechCredentialCoordinator().saveCredential(decoded);
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "speechRemoveCredential",
    async (_event, request) => {
      const decoded = decodeCredentialProviderRequest(request);
      if (decoded === null) {
        return invalidCredentialProviderRequestSettings("remove");
      }
      return requireSpeechCredentialCoordinator().removeCredential(decoded);
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "speechReadCapabilities",
    async () => requireBackendClient().readSpeechCapabilities(),
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "speechReadNarratorVoiceDefault",
    async () => requireBackendClient().readNarratorVoiceDefault(),
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
    "speechUpdateNarratorVoiceDefault",
    async (_event, request) => requireBackendClient().updateNarratorVoiceDefault(request),
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
    async (_event, request) => requireBackendClient().createSpeechTranscriptionSession(request),
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

function decodeCredentialSaveRequest(request: unknown): SpeechCredentialSaveRequest | null {
  try {
    return decodeSpeechCredentialSaveRequest(request);
  } catch {
    return null;
  }
}

function decodeCredentialProviderRequest(request: unknown): SpeechCredentialProviderRequest | null {
  try {
    return decodeSpeechCredentialProviderRequest(request);
  } catch {
    return null;
  }
}

function invalidCredentialSaveRequestSettings(): SpeechCredentialSettings {
  return {
    message: "Speech credential save request is invalid.",
    operation: "save",
    status: "failed",
  };
}

function invalidCredentialProviderRequestSettings(
  operation: "read" | "remove",
): SpeechCredentialSettings {
  return {
    message: "Speech credential provider request is invalid.",
    operation,
    status: "failed",
  };
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
