import type { IpcMain } from "electron";

import {
  decodeSpeechSynthesisRequest,
  type BackendClient,
  type SpeechAudio,
  type SpeechSynthesisInput,
  type SpeechSynthesisRequest,
} from "@generated/backend";
import { handleIpc, type IpcObserver } from "@shared/ipc";
import {
  decodeLocalMacOSVoiceSessionRequest,
  decodeLocalMacOSVoiceListenerPlaybackRequest,
  decodeLocalMacOSVoiceListenerSettingsUpdateRequest,
  decodeLocalMacOSVoiceListenerSubmissionRequest,
  decodeLocalMacOSVoiceStartCaptureRequest,
  decodeSpeechCredentialProviderRequest,
  decodeSpeechCredentialSaveRequest,
  decodeSpeechProviderSelectionUpdateRequest,
  type LocalMacOSVoiceCancelCaptureResult,
  type LocalMacOSVoiceCaptureFailure,
  type LocalMacOSVoiceFinishCaptureResult,
  type LocalMacOSVoiceListenerSettings,
  type LocalMacOSVoiceModelDownloadStatus,
  type LocalMacOSVoiceStartCaptureResult,
  type LocalMacOSVoiceStartCaptureRequest,
  type SpeechCredentialProviderRequest,
  type SpeechCredentialSaveRequest,
  type SpeechProviderSelectionSettings,
  type SpeechProviderSelectionUpdateRequest,
  type SpeechCredentialSettings,
  type SpeechSynthesisIpcRequest,
  validateSpeechSynthesisOperationId,
} from "@shared/speech-ipc";
import { localMacOSSpeechProviderID, openAISpeechProviderID } from "@shared/speech-providers";
import {
  LocalMacOSVoiceHelperCommandError,
  LocalMacOSVoiceHelperProtocolError,
  LocalMacOSVoiceHelperUnavailableError,
  type LocalMacOSVoiceHelper,
} from "./local-macos-voice-helper";
import { isCanonicalWAVBase64 } from "./speech-audio-validation";
import type { LocalMacOSVoiceListenerService } from "./local-macos-voice-listener-service";

const localMacOSProvider = localMacOSSpeechProviderID();
const openAIProvider = openAISpeechProviderID();

const localMacOSCommandFailureCodes = {
  duration_limit: "duration_limit",
  helper_unavailable: "provider_unavailable",
  invalid_session: "invalid_session",
  microphone_busy: "invalid_session",
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

interface SpeechProviderSelectionIpcStore {
  read: () => Promise<SpeechProviderSelectionSettings>;
  update: (
    provider: SpeechProviderSelectionUpdateRequest["provider"],
  ) => Promise<SpeechProviderSelectionSettings>;
}

interface LocalMacOSVoiceModelDownloadIpcService {
  readStatus: () => Promise<LocalMacOSVoiceModelDownloadStatus>;
  startDownload: () => Promise<LocalMacOSVoiceModelDownloadStatus>;
}

interface LocalMacOSVoiceListenerIpcService {
  completeSubmission: (captureSessionId: string) => Promise<LocalMacOSVoiceListenerSettings>;
  finishPlayback: (operationId: string) => Promise<LocalMacOSVoiceListenerSettings>;
  finishManualCapture: (captureSessionId: string) => Promise<void>;
  prepareManualCaptureStart: LocalMacOSVoiceListenerService["prepareManualCaptureStart"];
  readSettings: () => Promise<LocalMacOSVoiceListenerSettings>;
  startPlayback: (operationId: string) => Promise<LocalMacOSVoiceListenerSettings>;
  updateSettings: (enabled: boolean) => Promise<LocalMacOSVoiceListenerSettings>;
}

interface SpeechIpcRegistration {
  ipcMain: Pick<IpcMain, "handle">;
  ipcObserver?: IpcObserver;
  onProviderSelectionChanged?: (settings: SpeechProviderSelectionSettings) => void;
  requireLocalMacOSVoiceHelper: () => LocalMacOSVoiceHelper;
  requireLocalMacOSVoiceListenerService?: () => LocalMacOSVoiceListenerIpcService;
  requireLocalMacOSVoiceModelDownloadService?: () => LocalMacOSVoiceModelDownloadIpcService;
  requireBackendClient: () => BackendClient;
  requireSpeechCredentialCoordinator: () => SpeechCredentialIpcCoordinator;
  requireSpeechProviderSelectionStore?: () => SpeechProviderSelectionIpcStore;
}

export function registerSpeechIpcHandlers({
  ipcMain,
  ipcObserver,
  onProviderSelectionChanged,
  requireLocalMacOSVoiceHelper,
  requireLocalMacOSVoiceListenerService,
  requireLocalMacOSVoiceModelDownloadService,
  requireBackendClient,
  requireSpeechCredentialCoordinator,
  requireSpeechProviderSelectionStore,
}: SpeechIpcRegistration): void {
  const synthesisOperations = new SpeechSynthesisOperations();
  const localCaptureSessions = new LocalMacOSCaptureSessions();
  const requireProviderSelectionStore =
    requireSpeechProviderSelectionStore ??
    (() => {
      throw new Error("speech provider selection store is not ready");
    });
  const requireModelDownloadService =
    requireLocalMacOSVoiceModelDownloadService ??
    (() => {
      throw new Error("local macOS voice model download service is not ready");
    });
  const requireListenerService =
    requireLocalMacOSVoiceListenerService ??
    (() => {
      throw new Error("local macOS voice listener service is not ready");
    });
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
    "speechReadProviderSelection",
    async () => requireProviderSelectionStore().read(),
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "speechUpdateProviderSelection",
    async (_event, request) => {
      const settings = await requireProviderSelectionStore().update(
        decodeSpeechProviderSelectionUpdateRequest(request).provider,
      );
      onProviderSelectionChanged?.(settings);
      return settings;
    },
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
    "speechReadLocalMacOSVoiceModelDownload",
    async () => requireModelDownloadService().readStatus(),
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "speechStartLocalMacOSVoiceModelDownload",
    async () => requireModelDownloadService().startDownload(),
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "speechReadLocalMacOSVoiceListenerSettings",
    async () => requireListenerService().readSettings(),
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "speechUpdateLocalMacOSVoiceListenerSettings",
    async (_event, request) => {
      const decoded = decodeLocalMacOSVoiceListenerSettingsUpdateRequest(request);
      return requireListenerService().updateSettings(decoded.enabled);
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "speechCompleteLocalMacOSVoiceListenerSubmission",
    async (_event, request) => {
      const decoded = decodeLocalMacOSVoiceListenerSubmissionRequest(request);
      return requireListenerService().completeSubmission(decoded.captureSessionId);
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "speechStartLocalMacOSVoiceListenerPlayback",
    async (_event, request) => {
      const decoded = decodeLocalMacOSVoiceListenerPlaybackRequest(request);
      return requireListenerService().startPlayback(decoded.operationId);
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "speechFinishLocalMacOSVoiceListenerPlayback",
    async (_event, request) => {
      const decoded = decodeLocalMacOSVoiceListenerPlaybackRequest(request);
      return requireListenerService().finishPlayback(decoded.operationId);
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "speechListLocalMacOSVoices",
    async () => requireLocalMacOSVoiceHelper().listVoices(),
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
      return startLocalMacOSVoiceCapture(
        requireLocalMacOSVoiceHelper(),
        requireListenerService(),
        localCaptureSessions,
        decoded,
      );
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
      return finishLocalMacOSVoiceCapture(
        requireLocalMacOSVoiceHelper(),
        requireListenerService(),
        localCaptureSessions,
        decoded,
      );
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
      return cancelLocalMacOSVoiceCapture(
        requireLocalMacOSVoiceHelper(),
        requireListenerService(),
        localCaptureSessions,
        decoded,
      );
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
      synthesisOperations.run(operation, (request, operationId, signal) =>
        synthesizeSpeechWithProvider({
          backend: requireBackendClient(),
          operationId,
          request,
          requireLocalMacOSVoiceHelper,
          signal,
        }),
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
  listener: LocalMacOSVoiceListenerIpcService,
  sessions: LocalMacOSCaptureSessions,
  request: LocalMacOSVoiceStartCaptureRequest,
): Promise<LocalMacOSVoiceStartCaptureResult> {
  if (sessions.hasActive()) {
    return localCaptureFailed(
      "invalid_session",
      "Local macOS voice capture session is already active.",
    );
  }
  const listenerStart = await listener.prepareManualCaptureStart(request.captureSessionId);
  if (listenerStart.status === "blocked_by_wake_capture") {
    return localCaptureFailed(
      "invalid_session",
      `Always listening is already ${listenerStart.wakeStatus.replaceAll("_", " ")}.`,
    );
  }
  try {
    const result = await helper.startCapture({
      maximumRecordingSeconds: request.maximumRecordingSeconds,
      maximumTranscriptCharacters: request.maximumTranscriptCharacters,
      sessionId: request.captureSessionId,
    });
    if (result.sessionId !== request.captureSessionId) {
      return localCaptureFailed(
        "invalid_session",
        "Local macOS voice helper returned a different capture session.",
      );
    }
    sessions.start(request);
    return {
      captureSessionId: result.sessionId,
      status: "started",
    };
  } catch (error) {
    await listener.finishManualCapture(request.captureSessionId);
    return localCaptureFailedFromError(error);
  }
}

async function finishLocalMacOSVoiceCapture(
  helper: LocalMacOSVoiceHelper,
  listener: LocalMacOSVoiceListenerIpcService,
  sessions: LocalMacOSCaptureSessions,
  request: { captureSessionId: string },
): Promise<LocalMacOSVoiceFinishCaptureResult> {
  const session = sessions.read(request.captureSessionId);
  if (!session) {
    return localCaptureFailed(
      "invalid_session",
      "Local macOS voice capture session is not active.",
    );
  }
  try {
    const result = await helper.finishCapture({
      sessionId: request.captureSessionId,
    });
    sessions.finish(request.captureSessionId);
    await listener.finishManualCapture(request.captureSessionId);
    if (result.sessionId !== request.captureSessionId) {
      return localCaptureFailed(
        "invalid_session",
        "Local macOS voice helper returned a different capture session.",
      );
    }
    const failure = validateLocalMacOSVoiceTranscript(result.transcript, session);
    if (failure) {
      return failure;
    }
    return {
      captureSessionId: result.sessionId,
      status: "completed",
      transcript: result.transcript,
    };
  } catch (error) {
    sessions.finish(request.captureSessionId);
    await listener.finishManualCapture(request.captureSessionId);
    return localCaptureFailedFromError(error);
  }
}

async function cancelLocalMacOSVoiceCapture(
  helper: LocalMacOSVoiceHelper,
  listener: LocalMacOSVoiceListenerIpcService,
  sessions: LocalMacOSCaptureSessions,
  request: { captureSessionId: string },
): Promise<LocalMacOSVoiceCancelCaptureResult> {
  if (!sessions.has(request.captureSessionId)) {
    return localCaptureFailed(
      "invalid_session",
      "Local macOS voice capture session is not active.",
    );
  }
  try {
    const result = await helper.cancelCapture({
      sessionId: request.captureSessionId,
    });
    sessions.finish(request.captureSessionId);
    await listener.finishManualCapture(request.captureSessionId);
    if (result.sessionId !== request.captureSessionId) {
      return localCaptureFailed(
        "invalid_session",
        "Local macOS voice helper returned a different capture session.",
      );
    }
    return {
      captureSessionId: result.sessionId,
      status: "canceled",
    };
  } catch (error) {
    sessions.finish(request.captureSessionId);
    await listener.finishManualCapture(request.captureSessionId);
    return localCaptureFailedFromError(error);
  }
}

function validateLocalMacOSVoiceTranscript(
  transcript: string,
  session: LocalMacOSCaptureSession,
): LocalMacOSVoiceFinishCaptureResult | null {
  if (transcript.trim() === "") {
    return localCaptureFailed("no_speech", "No speech was detected. Please try again.");
  }
  if (transcript.length > session.maximumTranscriptCharacters) {
    return localCaptureFailed(
      "transcript_too_large",
      "Local macOS voice transcript exceeded the maximum allowed length.",
    );
  }
  return null;
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

function synthesizeSpeechWithProvider({
  backend,
  operationId,
  request,
  requireLocalMacOSVoiceHelper,
  signal,
}: {
  backend: BackendClient;
  operationId: string;
  request: SpeechSynthesisRequest;
  requireLocalMacOSVoiceHelper: () => LocalMacOSVoiceHelper;
  signal: AbortSignal;
}): Promise<SpeechAudio> {
  if (request.provider === openAIProvider) {
    return backend.synthesizeSpeech(request, { signal });
  }
  if (request.provider === localMacOSProvider) {
    return synthesizeLocalMacOSSpeech({
      backend,
      helper: requireLocalMacOSVoiceHelper(),
      operationId,
      request,
      signal,
    });
  }
  throw new Error(`Unsupported speech synthesis provider ${JSON.stringify(request.provider)}.`);
}

async function synthesizeLocalMacOSSpeech({
  backend,
  helper,
  operationId,
  request,
  signal,
}: {
  backend: BackendClient;
  helper: LocalMacOSVoiceHelper;
  operationId: string;
  request: SpeechSynthesisRequest;
  signal: AbortSignal;
}): Promise<SpeechAudio> {
  const input = await backend.resolveSpeechSynthesisInput(request, { signal });
  validateResolvedLocalSynthesisInput(input, request);
  const localVoiceId = await selectLocalMacOSVoiceID(helper, input.resolvedVoiceId);
  const result = await runAbortableLocalMacOSSynthesis(
    helper,
    {
      operationId,
      rate: input.rate,
      text: input.text,
      voiceId: localVoiceId,
    },
    signal,
  );
  if (!validLocalMacOSSynthesisResult(result, operationId)) {
    throw new Error("Local macOS speech output returned invalid audio.");
  }
  return {
    audioBase64: result.audioBase64,
    format: result.format,
    mediaType: result.mediaType,
    resolvedVoiceId: input.resolvedVoiceId,
    source: input.source,
  };
}

async function selectLocalMacOSVoiceID(
  helper: LocalMacOSVoiceHelper,
  requestedVoiceId: string,
): Promise<string> {
  let catalog: Awaited<ReturnType<LocalMacOSVoiceHelper["listVoices"]>>;
  try {
    catalog = await helper.listVoices();
  } catch (error) {
    throw localMacOSSynthesisError(error);
  }
  const defaultVoiceId = catalog.voiceIds[0];
  if (catalog.provider !== localMacOSProvider || !defaultVoiceId) {
    throw new Error("Local macOS speech output could not find an installed system voice.");
  }
  return catalog.voiceIds.includes(requestedVoiceId) ? requestedVoiceId : defaultVoiceId;
}

function validLocalMacOSSynthesisResult(
  result: Awaited<ReturnType<LocalMacOSVoiceHelper["synthesizeSpeech"]>>,
  operationId: string,
): boolean {
  return (
    result.operationId === operationId &&
    result.mediaType === "audio/wav" &&
    result.format === "wav" &&
    isCanonicalWAVBase64(result.audioBase64)
  );
}

function validateResolvedLocalSynthesisInput(
  input: SpeechSynthesisInput,
  request: SpeechSynthesisRequest,
): void {
  if (
    input.provider !== localMacOSProvider ||
    input.resolvedVoiceId !== request.resolvedVoiceId ||
    input.source.speaker !== request.source.speaker ||
    input.source.eventId !== request.source.eventId ||
    input.source.conversationId !== request.source.conversationId ||
    input.text.trim() === "" ||
    input.rate <= 0
  ) {
    throw new Error("The runtime returned invalid local speech synthesis input.");
  }
}

function runAbortableLocalMacOSSynthesis(
  helper: LocalMacOSVoiceHelper,
  request: Parameters<LocalMacOSVoiceHelper["synthesizeSpeech"]>[0],
  signal: AbortSignal,
): Promise<Awaited<ReturnType<LocalMacOSVoiceHelper["synthesizeSpeech"]>>> {
  if (signal.aborted) {
    return Promise.reject(synthesisAbortError());
  }
  return new Promise((resolve, reject) => {
    const aborted = () => {
      void helper.cancelSynthesis({ operationId: request.operationId }).catch(() => undefined);
      reject(synthesisAbortError());
    };
    signal.addEventListener("abort", aborted, { once: true });
    void helper.synthesizeSpeech(request).then(
      (value) => {
        signal.removeEventListener("abort", aborted);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", aborted);
        reject(localMacOSSynthesisError(error));
      },
    );
  });
}

function localMacOSSynthesisError(error: unknown): Error {
  if (error instanceof LocalMacOSVoiceHelperUnavailableError) {
    return new Error(error.health.message);
  }
  if (error instanceof LocalMacOSVoiceHelperCommandError) {
    switch (error.code) {
      case "synthesis_failed":
      case "synthesis_unavailable":
      case "text_too_large":
      case "voice_unavailable":
        return new Error(error.message);
      default:
        return new Error("Local macOS speech output failed.");
    }
  }
  if (error instanceof LocalMacOSVoiceHelperProtocolError) {
    return new Error("Local macOS speech output returned invalid audio.");
  }
  return error instanceof Error ? error : new Error("Local macOS speech output failed.");
}

function synthesisAbortError(): DOMException {
  return new DOMException("Speech synthesis was stopped.", "AbortError");
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
      request: SpeechSynthesisRequest,
      operationId: string,
      signal: AbortSignal,
    ) => Promise<SpeechAudio>,
  ) {
    validateSpeechSynthesisOperationId(operation.operationId);
    const request = decodeSpeechSynthesisRequest(operation.request);
    if (this.active.has(operation.operationId)) {
      throw new Error("Speech synthesis operation is already active.");
    }
    const controller = new AbortController();
    this.active.set(operation.operationId, controller);
    try {
      return await synthesize(request, operation.operationId, controller.signal);
    } finally {
      if (this.active.get(operation.operationId) === controller) {
        this.active.delete(operation.operationId);
      }
    }
  }
}

interface LocalMacOSCaptureSession {
  maximumTranscriptCharacters: number;
}

class LocalMacOSCaptureSessions {
  private readonly active = new Map<string, LocalMacOSCaptureSession>();

  hasActive(): boolean {
    return this.active.size > 0;
  }

  has(captureSessionId: string): boolean {
    return this.active.has(captureSessionId);
  }

  read(captureSessionId: string): LocalMacOSCaptureSession | null {
    return this.active.get(captureSessionId) ?? null;
  }

  start(request: LocalMacOSVoiceStartCaptureRequest): void {
    this.active.set(request.captureSessionId, {
      maximumTranscriptCharacters: request.maximumTranscriptCharacters,
    });
  }

  finish(captureSessionId: string): void {
    this.active.delete(captureSessionId);
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
