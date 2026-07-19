import type { SpeechCapabilities, SpeechVoiceCatalog } from "@generated/backend";
import type {
  LocalMacOSVoiceCancelCaptureResult,
  LocalMacOSVoiceCaptureFailure,
  LocalMacOSVoiceFinishCaptureResult,
  LocalMacOSVoiceHealth,
  LocalMacOSVoiceStartCaptureResult,
} from "@shared/speech-ipc";
import { localMacOSSpeechProviderID } from "@shared/speech-providers";

import {
  VoiceCaptureProviderAbortedError,
  VoiceCaptureProviderError,
  type SpeechCaptureFailure,
  type SpeechCaptureSupport,
  type VoiceCaptureSession,
  type VoiceCaptureSessionEvent,
  type VoiceCaptureStartRequest,
  type VoiceInputProvider,
} from "./voice-provider-boundary";

export interface LocalMacOSSpeechCaptureProviderDependencies {
  cancelCapture: (request: {
    captureSessionId: string;
  }) => Promise<LocalMacOSVoiceCancelCaptureResult>;
  finishCapture: (request: {
    captureSessionId: string;
  }) => Promise<LocalMacOSVoiceFinishCaptureResult>;
  readCapabilities: () => Promise<SpeechCapabilities>;
  readHealth: () => Promise<LocalMacOSVoiceHealth>;
  listVoices: () => Promise<SpeechVoiceCatalog>;
  readSupport?: () => SpeechCaptureSupport;
  startCapture: (request: {
    captureSessionId: string;
    maximumRecordingSeconds: number;
    maximumTranscriptCharacters: number;
  }) => Promise<LocalMacOSVoiceStartCaptureResult>;
}

const localMacOSProvider = localMacOSSpeechProviderID();

export function createLocalMacOSSpeechCaptureProvider(
  dependencies: LocalMacOSSpeechCaptureProviderDependencies,
): VoiceInputProvider {
  return new LocalMacOSSpeechCaptureProvider(dependencies);
}

class LocalMacOSSpeechCaptureProvider implements VoiceInputProvider {
  readonly id = localMacOSProvider;

  constructor(private readonly dependencies: LocalMacOSSpeechCaptureProviderDependencies) {}

  readCapabilities = async (): Promise<SpeechCapabilities> => {
    const [capabilities, health] = await Promise.all([
      this.dependencies.readCapabilities(),
      this.dependencies.readHealth(),
    ]);
    const voiceCatalog =
      health.status === "ready"
        ? await this.dependencies.listVoices()
        : await readLocalVoiceCatalogForUnavailableProvider(this.dependencies.listVoices, health);
    return {
      ...capabilities,
      providerStatus: health.status === "ready" ? "configured" : "not_configured",
      voiceCatalog,
    };
  };

  readSupport = (): SpeechCaptureSupport =>
    this.dependencies.readSupport ? this.dependencies.readSupport() : { supported: true };

  startCapture = async (request: VoiceCaptureStartRequest): Promise<VoiceCaptureSession> => {
    if (request.signal?.aborted) {
      throw new VoiceCaptureProviderAbortedError();
    }
    const result = await this.dependencies.startCapture({
      captureSessionId: request.captureSessionId,
      maximumRecordingSeconds: request.capabilities.maximumRecordingSeconds,
      maximumTranscriptCharacters: request.capabilities.maximumTranscriptCharacters,
    });
    if (request.signal?.aborted) {
      void this.dependencies.cancelCapture({ captureSessionId: request.captureSessionId });
      throw new VoiceCaptureProviderAbortedError();
    }
    if (result.status === "failed") {
      throw providerError(result.failure);
    }
    return new LocalMacOSVoiceCaptureSession({
      cancelCapture: this.dependencies.cancelCapture,
      captureSessionId: result.captureSessionId,
      finishCapture: this.dependencies.finishCapture,
      signal: request.signal,
    });
  };
}

class LocalMacOSVoiceCaptureSession implements VoiceCaptureSession {
  readonly ready = Promise.resolve();

  private closed = false;
  private readonly listeners = new Set<(event: VoiceCaptureSessionEvent) => void>();
  private readonly removeAbortListener: (() => void) | null;

  constructor(
    private readonly options: {
      cancelCapture: LocalMacOSSpeechCaptureProviderDependencies["cancelCapture"];
      captureSessionId: string;
      finishCapture: LocalMacOSSpeechCaptureProviderDependencies["finishCapture"];
      signal: AbortSignal | undefined;
    },
  ) {
    if (options.signal) {
      const cancelOnAbort = () => this.cancel();
      options.signal.addEventListener("abort", cancelOnAbort, { once: true });
      this.removeAbortListener = () => options.signal?.removeEventListener("abort", cancelOnAbort);
    } else {
      this.removeAbortListener = null;
    }
  }

  subscribe = (listener: (event: VoiceCaptureSessionEvent) => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  finish = async (): Promise<void> => {
    if (this.closed) {
      throw new VoiceCaptureProviderAbortedError();
    }
    const result = await this.options.finishCapture({
      captureSessionId: this.options.captureSessionId,
    });
    if (this.closed) {
      throw new VoiceCaptureProviderAbortedError();
    }
    if (result.status === "failed") {
      const error = providerError(result.failure);
      this.fail(error);
      throw error;
    }
    if (result.captureSessionId !== this.options.captureSessionId) {
      const error = providerError({
        code: "invalid_session",
        message: "Local macOS voice helper returned a different capture session.",
      });
      this.fail(error);
      throw error;
    }
    this.closed = true;
    this.removeAbortListener?.();
    this.emit({
      captureSessionId: result.captureSessionId,
      transcript: result.transcript,
      type: "transcript_completed",
    });
  };

  cancel = (): void => {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.removeAbortListener?.();
    void this.options.cancelCapture({ captureSessionId: this.options.captureSessionId });
  };

  private fail(error: VoiceCaptureProviderError): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.removeAbortListener?.();
    this.emit({ failure: error.failure, type: "failed" });
  }

  private emit(event: VoiceCaptureSessionEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}

function providerError(failure: LocalMacOSVoiceCaptureFailure): VoiceCaptureProviderError {
  return new VoiceCaptureProviderError(providerFailure(failure));
}

function providerFailure(failure: LocalMacOSVoiceCaptureFailure): SpeechCaptureFailure {
  return { code: failure.code, message: failure.message };
}

async function readLocalVoiceCatalogForUnavailableProvider(
  listVoices: () => Promise<SpeechVoiceCatalog>,
  health: LocalMacOSVoiceHealth,
): Promise<SpeechVoiceCatalog> {
  try {
    return await listVoices();
  } catch {
    return {
      provider: localMacOSProvider,
      version: `unavailable:${health.status}`,
      voiceIds: [],
    };
  }
}
