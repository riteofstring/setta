import type { IpcMain } from "electron";

import type { BackendClient } from "@generated/backend";
import { handleIpc, type IpcObserver } from "@shared/ipc";
import {
  decodeLocalMacOSVoiceSessionRequest,
  decodeLocalMacOSVoiceStartCaptureRequest,
  decodeSpeechCredentialProviderRequest,
  decodeSpeechCredentialSaveRequest,
  type LocalMacOSVoiceCancelCaptureResult,
  type LocalMacOSVoiceCaptureFailure,
  type LocalMacOSVoiceFinishCaptureResult,
  type LocalMacOSVoiceStartCaptureResult,
  type LocalMacOSVoiceStartCaptureRequest,
  type SpeechCredentialProviderRequest,
  type SpeechCredentialSaveRequest,
  type SpeechCredentialSettings,
  type SpeechSynthesisIpcRequest,
  validateSpeechSynthesisOperationId,
} from "@shared/speech-ipc";
import {
  LocalMacOSVoiceHelperCommandError,
  LocalMacOSVoiceHelperProtocolError,
  LocalMacOSVoiceHelperUnavailableError,
  type LocalMacOSVoiceHelper,
} from "./local-macos-voice-helper";

const localMacOSCommandFailureCodes = {
  duration_limit: "duration_limit",
  helper_unavailable: "provider_unavailable",
  invalid_session: "invalid_session",
  microphone_denied: "microphone_permission_denied",
  missing_model: "not_configured",
  model_hash_mismatch: "not_configured",
  no_speech: "no_speech",
  synthesis_unavailable: "provider_unavailable",
  transcript_too_large: "transcript_too_large",
  transcription_failed: "transcription_failed",
} as const satisfies Record<string, LocalMacOSVoiceCaptureFailure["code"]>;

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
  requireLocalMacOSVoiceHelper: () => LocalMacOSVoiceHelper;
  requireBackendClient: () => BackendClient;
  requireSpeechCredentialCoordinator: () => SpeechCredentialIpcCoordinator;
}

export function registerSpeechIpcHandlers({
  ipcMain,
  ipcObserver,
  requireLocalMacOSVoiceHelper,
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
    "speechReadLocalMacOSVoiceHealth",
    async () => requireLocalMacOSVoiceHelper().readHealth(),
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "speechStartLocalMacOSVoiceCapture",
    async (_event, request) => {
      const decoded = decodeLocalStartRequest(request);
      if (decoded === null) {
        return localCaptureFailed(
          "session_failed",
          "Local macOS voice capture start request is invalid.",
        );
      }
      return startLocalMacOSVoiceCapture(requireLocalMacOSVoiceHelper(), decoded);
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "speechFinishLocalMacOSVoiceCapture",
    async (_event, request) => {
      const decoded = decodeLocalSessionRequest(request);
      if (decoded === null) {
        return localCaptureFailed(
          "session_failed",
          "Local macOS voice capture finish request is invalid.",
        );
      }
      try {
        const result = await requireLocalMacOSVoiceHelper().finishCapture({
          sessionId: decoded.captureSessionId,
        });
        return {
          captureSessionId: result.sessionId,
          status: "completed",
          transcript: result.transcript,
        } satisfies LocalMacOSVoiceFinishCaptureResult;
      } catch (error) {
        return localCaptureFailedFromError(error);
      }
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "speechCancelLocalMacOSVoiceCapture",
    async (_event, request) => {
      const decoded = decodeLocalSessionRequest(request);
      if (decoded === null) {
        return localCaptureFailed(
          "session_failed",
          "Local macOS voice capture cancel request is invalid.",
        );
      }
      try {
        const result = await requireLocalMacOSVoiceHelper().cancelCapture({
          sessionId: decoded.captureSessionId,
        });
        return {
          captureSessionId: result.sessionId,
          status: "canceled",
        } satisfies LocalMacOSVoiceCancelCaptureResult;
      } catch (error) {
        return localCaptureFailedFromError(error);
      }
    },
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

function decodeLocalStartRequest(request: unknown): LocalMacOSVoiceStartCaptureRequest | null {
  try {
    return decodeLocalMacOSVoiceStartCaptureRequest(request);
  } catch {
    return null;
  }
}

function decodeLocalSessionRequest(request: unknown): { captureSessionId: string } | null {
  try {
    return decodeLocalMacOSVoiceSessionRequest(request);
  } catch {
    return null;
  }
}

async function startLocalMacOSVoiceCapture(
  helper: LocalMacOSVoiceHelper,
  request: LocalMacOSVoiceStartCaptureRequest,
): Promise<LocalMacOSVoiceStartCaptureResult> {
  try {
    const result = await helper.startCapture({
      maximumRecordingSeconds: request.maximumRecordingSeconds,
      maximumTranscriptCharacters: request.maximumTranscriptCharacters,
      sessionId: request.captureSessionId,
    });
    return {
      captureSessionId: result.sessionId,
      status: "started",
    };
  } catch (error) {
    return localCaptureFailedFromError(error);
  }
}

function localCaptureFailed(
  code: LocalMacOSVoiceCaptureFailure["code"],
  message: string,
): { failure: LocalMacOSVoiceCaptureFailure; status: "failed" } {
  return { failure: { code, message }, status: "failed" };
}

function localCaptureFailedFromError(error: unknown): {
  failure: LocalMacOSVoiceCaptureFailure;
  status: "failed";
} {
  if (error instanceof LocalMacOSVoiceHelperUnavailableError) {
    return localCaptureFailedFromHealth(error);
  }
  if (error instanceof LocalMacOSVoiceHelperCommandError) {
    return localCaptureFailedFromCommandError(error);
  }
  if (error instanceof LocalMacOSVoiceHelperProtocolError) {
    return localCaptureFailed(
      "malformed_event",
      "Local macOS voice helper returned an invalid session event.",
    );
  }
  return localCaptureFailed("session_failed", "Local macOS voice capture failed.");
}

function localCaptureFailedFromHealth(error: LocalMacOSVoiceHelperUnavailableError): {
  failure: LocalMacOSVoiceCaptureFailure;
  status: "failed";
} {
  switch (error.health.status) {
    case "missing_model":
    case "model_hash_mismatch":
      return localCaptureFailed("not_configured", error.health.message);
    case "helper_unavailable":
    case "synthesis_unavailable":
      return localCaptureFailed("provider_unavailable", error.health.message);
    case "microphone_denied":
      return localCaptureFailed("microphone_permission_denied", error.health.message);
    default:
      return assertNever(error.health);
  }
}

function localCaptureFailedFromCommandError(error: LocalMacOSVoiceHelperCommandError): {
  failure: LocalMacOSVoiceCaptureFailure;
  status: "failed";
} {
  const code =
    localMacOSCommandFailureCodes[error.code as keyof typeof localMacOSCommandFailureCodes];
  if (!code) {
    return localCaptureFailed("transcription_failed", "Local macOS voice capture failed.");
  }
  return localCaptureFailed(code, error.message);
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

function assertNever(value: never): never {
  throw new Error(`Unhandled speech IPC value: ${JSON.stringify(value)}`);
}
