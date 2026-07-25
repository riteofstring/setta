import type { SpeechCapabilities, SpeechTranscriptionSession } from "@generated/backend";

import {
  BufferedMicrophoneCaptureError,
  type BufferedMicrophoneCapture,
  type CreateBufferedMicrophoneCaptureOptions,
} from "./buffered-microphone-capture";
import {
  browserSpeechCaptureSupport,
  failureForBufferedCaptureError,
  microphoneFailure,
  safeSessionErrorMessage,
} from "./app-shell-speech-capture-failures";
import { failureForOpenAIRealtimeError } from "./openai-speech-capture-failures";
import { RealtimeTranscriptionError } from "./realtime-transcription-error";
import type { RealtimeTranscriptionUpdate } from "./realtime-transcription-session";
import type {
  createRealtimeTranscriptionTransport,
  RealtimeTranscriptionTransport,
} from "./realtime-transcription-transport";
import { openAISpeechProviderID } from "./openai-speech-provider-id";
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

export interface OpenAIBrowserSpeechCaptureProviderDependencies {
  createBufferedCapture: (
    options: CreateBufferedMicrophoneCaptureOptions,
  ) => Promise<BufferedMicrophoneCapture>;
  createTranscriptionSession: () => Promise<SpeechTranscriptionSession>;
  createTransport: typeof createRealtimeTranscriptionTransport;
  deferProviderConnection: (handler: () => void) => void;
  getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  readCapabilities: () => Promise<SpeechCapabilities>;
  readSupport?: () => SpeechCaptureSupport;
}

interface OpenAIBrowserVoiceCaptureSessionOptions {
  capabilities: SpeechCapabilities;
  capture: BufferedMicrophoneCapture;
  captureSessionId: string;
  createTransport: typeof createRealtimeTranscriptionTransport;
  deferProviderConnection: (handler: () => void) => void;
  sessionPromise: Promise<SpeechTranscriptionSession>;
}

export function createOpenAIBrowserSpeechCaptureProvider(
  dependencies: OpenAIBrowserSpeechCaptureProviderDependencies,
): VoiceInputProvider {
  return new OpenAIBrowserSpeechCaptureProvider(dependencies);
}

class OpenAIBrowserSpeechCaptureProvider implements VoiceInputProvider {
  readonly id = openAISpeechProviderID();

  constructor(private readonly dependencies: OpenAIBrowserSpeechCaptureProviderDependencies) {}

  readCapabilities = (): Promise<SpeechCapabilities> => this.dependencies.readCapabilities();

  readSupport = (): SpeechCaptureSupport =>
    this.dependencies.readSupport ? this.dependencies.readSupport() : browserSpeechCaptureSupport();

  startCapture = async (request: VoiceCaptureStartRequest): Promise<VoiceCaptureSession> => {
    const resources = new OpenAIBrowserCaptureStartResources(request.signal);
    let providerSession: OpenAIBrowserVoiceCaptureSession | null = null;
    try {
      await resources.openInput(this.dependencies.getUserMedia);
      const sessionPromise = this.dependencies.createTranscriptionSession();
      void sessionPromise.catch(() => {});
      const capture = await resources.createReadyCapture({
        createBufferedCapture: this.dependencies.createBufferedCapture,
        maximumRecordingSeconds: request.capabilities.maximumRecordingSeconds,
        onError: (error) => providerSession?.handleBufferedCaptureError(error),
      });
      providerSession = new OpenAIBrowserVoiceCaptureSession({
        capabilities: request.capabilities,
        capture,
        captureSessionId: request.captureSessionId,
        createTransport: this.dependencies.createTransport,
        deferProviderConnection: this.dependencies.deferProviderConnection,
        sessionPromise,
      });
      resources.release();
      return providerSession;
    } catch (error) {
      resources.close();
      throw startCaptureError(error, request.signal);
    }
  };
}

class OpenAIBrowserCaptureStartResources {
  private capture: BufferedMicrophoneCapture | null = null;
  private closeCaptureOnAbort: (() => void) | null = null;
  private inputStream: MediaStream | null = null;
  private released = false;
  private stopInputOnAbort: (() => void) | null = null;

  constructor(private readonly signal: AbortSignal | undefined) {}

  openInput = async (
    getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>,
  ): Promise<MediaStream> => {
    assertNotAborted(this.signal);
    this.inputStream = await getUserMedia({ audio: true, video: false });
    assertNotAborted(this.signal);
    this.stopInputOnAbort = () => stopMediaStream(this.inputStream);
    this.signal?.addEventListener("abort", this.stopInputOnAbort, { once: true });
    return this.inputStream;
  };

  createReadyCapture = async ({
    createBufferedCapture,
    maximumRecordingSeconds,
    onError,
  }: {
    createBufferedCapture: OpenAIBrowserSpeechCaptureProviderDependencies["createBufferedCapture"];
    maximumRecordingSeconds: number;
    onError: (error: BufferedMicrophoneCaptureError) => void;
  }): Promise<BufferedMicrophoneCapture> => {
    if (!this.inputStream) {
      throw new Error("OpenAI speech capture input stream is unavailable");
    }
    this.capture = await createBufferedCapture({
      inputStream: this.inputStream,
      maximumRecordingSeconds,
      onError,
    });
    this.detachInputAbort();
    this.closeCaptureOnAbort = () => this.capture?.close();
    this.signal?.addEventListener("abort", this.closeCaptureOnAbort, { once: true });
    assertNotAborted(this.signal);
    await this.capture.ready;
    assertNotAborted(this.signal);
    this.detachCaptureAbort();
    return this.capture;
  };

  release(): void {
    this.released = true;
    this.detachInputAbort();
    this.detachCaptureAbort();
  }

  close(): void {
    this.detachInputAbort();
    this.detachCaptureAbort();
    if (this.released) {
      return;
    }
    if (this.capture) {
      this.capture.close();
      return;
    }
    stopMediaStream(this.inputStream);
  }

  private detachInputAbort(): void {
    if (!this.stopInputOnAbort) {
      return;
    }
    this.signal?.removeEventListener("abort", this.stopInputOnAbort);
    this.stopInputOnAbort = null;
  }

  private detachCaptureAbort(): void {
    if (!this.closeCaptureOnAbort) {
      return;
    }
    this.signal?.removeEventListener("abort", this.closeCaptureOnAbort);
    this.closeCaptureOnAbort = null;
  }
}

class OpenAIBrowserVoiceCaptureSession implements VoiceCaptureSession {
  readonly ready: Promise<void>;

  private readonly capabilities: SpeechCapabilities;
  private readonly capture: BufferedMicrophoneCapture;
  private readonly captureSessionId: string;
  private readonly createTransport: typeof createRealtimeTranscriptionTransport;
  private readonly deferProviderConnection: (handler: () => void) => void;
  private readonly listeners = new Set<(event: VoiceCaptureSessionEvent) => void>();
  private readonly rejectReady: (
    error: VoiceCaptureProviderError | VoiceCaptureProviderAbortedError,
  ) => void;
  private readonly resolveReady: () => void;
  private readonly sessionPromise: Promise<SpeechTranscriptionSession>;

  private closed = false;
  private readySettled = false;
  private transport: RealtimeTranscriptionTransport | null = null;

  constructor(options: OpenAIBrowserVoiceCaptureSessionOptions) {
    this.capabilities = options.capabilities;
    this.capture = options.capture;
    this.captureSessionId = options.captureSessionId;
    this.createTransport = options.createTransport;
    this.deferProviderConnection = options.deferProviderConnection;
    this.sessionPromise = options.sessionPromise;
    let rejectReady!: (error: VoiceCaptureProviderError | VoiceCaptureProviderAbortedError) => void;
    let resolveReady!: () => void;
    this.ready = new Promise<void>((resolve, reject) => {
      rejectReady = reject;
      resolveReady = resolve;
    });
    this.rejectReady = rejectReady;
    this.resolveReady = resolveReady;
    this.startProviderConnection();
  }

  subscribe = (listener: (event: VoiceCaptureSessionEvent) => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  finish = async (): Promise<void> => {
    if (this.closed) {
      throw new VoiceCaptureProviderAbortedError();
    }
    try {
      const drain = this.capture.stopInputAndDrain();
      await Promise.all([this.ready, drain]);
      if (this.closed) {
        throw new VoiceCaptureProviderAbortedError();
      }
      const transport = this.transport;
      if (!transport) {
        throw new RealtimeTranscriptionError(
          "connection_failed",
          "Realtime transcription transport was unavailable at commit.",
        );
      }
      transport.commit();
    } catch (error) {
      const providerError = sessionCaptureError(error);
      if (!(providerError instanceof VoiceCaptureProviderAbortedError)) {
        this.fail(providerError);
      }
      throw providerError;
    }
  };

  cancel = (): void => {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.rejectPendingReady(new VoiceCaptureProviderAbortedError());
    this.closeResources();
  };

  handleBufferedCaptureError = (error: BufferedMicrophoneCaptureError): void => {
    if (error.code === "aborted") {
      this.cancel();
      return;
    }
    this.fail(
      new VoiceCaptureProviderError(failureForBufferedCaptureError(error.code), error.message, {
        cause: error,
      }),
    );
  };

  private startProviderConnection(): void {
    this.deferProviderConnection(() => {
      void this.connectProviderWhenReady();
    });
  }

  private async connectProviderWhenReady(): Promise<void> {
    try {
      const session = await this.sessionPromise;
      if (this.closed) {
        return;
      }
      assertSessionLimits(session, this.capabilities);
      const transport = this.createTransport({
        captureSessionId: this.captureSessionId,
        onError: this.handleTransportError,
        onTranscript: this.handleTranscript,
        session,
        stream: this.capture.outboundStream,
      });
      if (this.closed) {
        void transport.ready.catch(() => {});
        transport.close();
        return;
      }
      this.transport = transport;
      await transport.ready;
      if (this.closed || this.transport !== transport) {
        return;
      }
      this.capture.releaseToTransport();
      this.resolvePendingReady();
    } catch (error) {
      const providerError = sessionCaptureError(error);
      if (!(providerError instanceof VoiceCaptureProviderAbortedError)) {
        this.fail(providerError);
      }
    }
  }

  private handleTransportError = (error: RealtimeTranscriptionError): void => {
    if (error.code === "aborted") {
      this.cancel();
      return;
    }
    console.info(`OpenAI Realtime transcription failed: code=${error.code}`);
    this.fail(
      new VoiceCaptureProviderError(failureForOpenAIRealtimeError(error.code), error.message, {
        cause: error,
      }),
    );
  };

  private handleTranscript = (update: RealtimeTranscriptionUpdate): void => {
    if (this.closed || update.captureSessionId !== this.captureSessionId) {
      return;
    }
    switch (update.type) {
      case "delta":
        this.emit({
          captureSessionId: update.captureSessionId,
          delta: update.delta,
          transcript: update.transcript,
          type: "transcript_delta",
        });
        return;
      case "completed":
        this.emit({
          captureSessionId: update.captureSessionId,
          transcript: update.transcript,
          type: "transcript_completed",
        });
        this.closed = true;
        this.closeResources();
        return;
      default:
        assertNever(update);
    }
  };

  private fail(error: VoiceCaptureProviderError): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.rejectPendingReady(error);
    this.closeResources();
    this.emit({ failure: error.failure, type: "failed" });
  }

  private resolvePendingReady(): void {
    if (this.readySettled) {
      return;
    }
    this.readySettled = true;
    this.resolveReady();
  }

  private rejectPendingReady(
    error: VoiceCaptureProviderError | VoiceCaptureProviderAbortedError,
  ): void {
    if (this.readySettled) {
      return;
    }
    this.readySettled = true;
    this.rejectReady(error);
  }

  private closeResources(): void {
    this.transport?.close();
    this.transport = null;
    this.capture.close();
  }

  private emit(event: VoiceCaptureSessionEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}

function assertNotAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new VoiceCaptureProviderAbortedError();
  }
}

function startCaptureError(
  error: unknown,
  signal: AbortSignal | undefined,
): VoiceCaptureProviderError | VoiceCaptureProviderAbortedError {
  if (signal?.aborted || error instanceof VoiceCaptureProviderAbortedError) {
    return new VoiceCaptureProviderAbortedError("Voice capture was canceled.", { cause: error });
  }
  if (error instanceof VoiceCaptureProviderError) {
    return error;
  }
  if (error instanceof BufferedMicrophoneCaptureError) {
    if (error.code === "aborted") {
      return new VoiceCaptureProviderAbortedError("Voice capture was canceled.", { cause: error });
    }
    return new VoiceCaptureProviderError(
      failureForBufferedCaptureError(error.code),
      error.message,
      {
        cause: error,
      },
    );
  }
  if (error instanceof RealtimeTranscriptionError) {
    return sessionCaptureError(error);
  }
  return new VoiceCaptureProviderError(microphoneFailure(error), "Microphone capture failed.", {
    cause: error,
  });
}

function sessionCaptureError(
  error: unknown,
): VoiceCaptureProviderError | VoiceCaptureProviderAbortedError {
  if (error instanceof VoiceCaptureProviderAbortedError) {
    return error;
  }
  if (error instanceof VoiceCaptureProviderError) {
    return error;
  }
  if (error instanceof RealtimeTranscriptionError) {
    if (error.code === "aborted") {
      return new VoiceCaptureProviderAbortedError("Voice capture was canceled.", { cause: error });
    }
    return new VoiceCaptureProviderError(failureForOpenAIRealtimeError(error.code), error.message, {
      cause: error,
    });
  }
  if (error instanceof BufferedMicrophoneCaptureError) {
    if (error.code === "aborted") {
      return new VoiceCaptureProviderAbortedError("Voice capture was canceled.", { cause: error });
    }
    return new VoiceCaptureProviderError(
      failureForBufferedCaptureError(error.code),
      error.message,
      {
        cause: error,
      },
    );
  }
  return new VoiceCaptureProviderError(sessionFailure(error), "Voice capture session failed.", {
    cause: error,
  });
}

function sessionFailure(error: unknown): SpeechCaptureFailure {
  return { code: "session_failed", message: safeSessionErrorMessage(error) };
}

function assertSessionLimits(
  session: SpeechTranscriptionSession,
  capabilities: SpeechCapabilities,
): void {
  if (
    session.maximumRecordingSeconds !== capabilities.maximumRecordingSeconds ||
    session.maximumTranscriptCharacters !== capabilities.maximumTranscriptCharacters
  ) {
    throw new RealtimeTranscriptionError(
      "invalid_session",
      "Realtime transcription limits changed while voice capture was starting.",
    );
  }
}

function stopMediaStream(stream: MediaStream | null): void {
  if (!stream) {
    return;
  }
  for (const track of stream.getTracks()) {
    track.stop();
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled OpenAI speech capture value: ${JSON.stringify(value)}`);
}
