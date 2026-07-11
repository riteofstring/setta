import type { SpeechCapabilities, SpeechTranscriptionSession } from "@generated/backend";

import {
  createRealtimeTranscriptionTransport,
  RealtimeTranscriptionError,
  type RealtimeTranscriptionErrorCode,
  type RealtimeTranscriptionTransport,
  type RealtimeTranscriptionUpdate,
} from "./realtime-transcription-transport";

export type SpeechCaptureIntent = "start" | "steer";

export type SpeechCaptureFailureCode =
  | "completion_failed"
  | "connection_failed"
  | "connection_lost"
  | "duration_limit"
  | "insecure_context"
  | "invalid_media"
  | "invalid_session"
  | "malformed_event"
  | "microphone_permission_denied"
  | "microphone_unavailable"
  | "no_speech"
  | "not_configured"
  | "provider_rate_limited"
  | "provider_rejected"
  | "provider_response_malformed"
  | "provider_unavailable"
  | "session_failed"
  | "stale_event"
  | "transcript_too_large"
  | "transcription_failed"
  | "unsupported_browser";

interface SpeechCaptureActiveState {
  captureSessionId: string;
  intent: SpeechCaptureIntent;
  transcript: string;
}

export type SpeechCaptureState =
  | { type: "idle" }
  | (SpeechCaptureActiveState & { type: "requesting_permission" })
  | (SpeechCaptureActiveState & { type: "connecting" })
  | (SpeechCaptureActiveState & { type: "listening" })
  | (SpeechCaptureActiveState & { type: "committing" })
  | {
      code: SpeechCaptureFailureCode;
      message: string;
      type: "failed";
    };

export type SpeechCaptureSupport =
  | { supported: true }
  | {
      code: "insecure_context" | "unsupported_browser";
      message: string;
      supported: false;
    };

export interface StartSpeechCaptureOptions {
  capabilities: SpeechCapabilities;
  intent: SpeechCaptureIntent;
  workspaceId: string;
}

export interface SpeechCaptureControllerDependencies {
  clearTimeout: (handle: unknown) => void;
  createCaptureSessionId: () => string;
  createTranscriptionSession: (workspaceId: string) => Promise<SpeechTranscriptionSession>;
  createTransport: typeof createRealtimeTranscriptionTransport;
  getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  setTimeout: (handler: () => void, delayMs: number) => unknown;
  support: () => SpeechCaptureSupport;
}

interface SpeechCaptureControllerOptions {
  dependencies?: SpeechCaptureControllerDependencies;
  onCompletedTranscript: (transcript: string, intent: SpeechCaptureIntent) => Promise<void> | void;
  onStateChange: (state: SpeechCaptureState) => void;
}

export class SpeechCaptureController {
  private readonly dependencies: SpeechCaptureControllerDependencies;
  private readonly onCompletedTranscript: SpeechCaptureControllerOptions["onCompletedTranscript"];
  private readonly onStateChange: SpeechCaptureControllerOptions["onStateChange"];

  private activeLifecycle: number | null = null;
  private durationTimer: unknown = null;
  private lifecycleSequence = 0;
  private stream: MediaStream | null = null;
  private transport: RealtimeTranscriptionTransport | null = null;

  state: SpeechCaptureState = { type: "idle" };

  constructor(options: SpeechCaptureControllerOptions) {
    this.dependencies = options.dependencies ?? browserSpeechCaptureDependencies;
    this.onCompletedTranscript = options.onCompletedTranscript;
    this.onStateChange = options.onStateChange;
  }

  start = async (options: StartSpeechCaptureOptions): Promise<void> => {
    this.closeActiveResources();
    const lifecycle = this.beginLifecycle();
    const support = this.dependencies.support();
    if (!support.supported) {
      this.fail(lifecycle, support.code, support.message);
      return;
    }
    const capabilitiesFailure = validateCaptureCapabilities(options.capabilities);
    if (capabilitiesFailure) {
      this.fail(lifecycle, capabilitiesFailure.code, capabilitiesFailure.message);
      return;
    }
    const activeState = {
      captureSessionId: this.dependencies.createCaptureSessionId(),
      intent: options.intent,
      transcript: "",
    } satisfies SpeechCaptureActiveState;
    this.transition({ ...activeState, type: "requesting_permission" });

    try {
      const stream = await this.dependencies.getUserMedia({ audio: true, video: false });
      if (!this.isCurrent(lifecycle)) {
        stopMediaStream(stream);
        return;
      }
      this.stream = stream;
      this.startDurationTimer(lifecycle, options.capabilities.maximumRecordingSeconds);
      this.transition({ ...activeState, type: "connecting" });
      const session = await this.dependencies.createTranscriptionSession(options.workspaceId);
      if (!this.isCurrent(lifecycle)) {
        return;
      }
      this.assertSessionLimits(session, options.capabilities);
      const transport = this.dependencies.createTransport({
        captureSessionId: activeState.captureSessionId,
        onError: (error) => this.handleTransportError(lifecycle, error),
        onTranscript: (update) => this.handleTranscript(lifecycle, update),
        session,
        stream,
      });
      this.transport = transport;
      await transport.ready;
      if (!this.isCurrent(lifecycle)) {
        return;
      }
      this.transition({ ...activeState, type: "listening" });
    } catch (error) {
      this.handleStartError(lifecycle, error);
    }
  };

  commit = (): void => {
    if (this.state.type !== "listening" || this.activeLifecycle === null) {
      return;
    }
    const activeState = this.state;
    this.transition({ ...activeState, type: "committing" });
    try {
      this.transport?.commit();
    } catch (error) {
      this.handleStartError(this.activeLifecycle, error);
    }
  };

  cancel = (): void => {
    this.activeLifecycle = null;
    this.closeActiveResources();
    if (this.state.type !== "idle") {
      this.transition({ type: "idle" });
    }
  };

  dispose = (): void => {
    this.cancel();
  };

  private beginLifecycle(): number {
    this.lifecycleSequence += 1;
    this.activeLifecycle = this.lifecycleSequence;
    return this.lifecycleSequence;
  }

  private startDurationTimer(lifecycle: number, maximumRecordingSeconds: number): void {
    this.durationTimer = this.dependencies.setTimeout(() => {
      this.fail(
        lifecycle,
        "duration_limit",
        `Voice recording reached the ${maximumRecordingSeconds}-second limit. Please try again.`,
      );
    }, maximumRecordingSeconds * 1000);
  }

  private assertSessionLimits(
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

  private handleTranscript(lifecycle: number, update: RealtimeTranscriptionUpdate): void {
    if (!this.isCurrent(lifecycle) || update.captureSessionId !== captureSessionId(this.state)) {
      return;
    }
    if (update.type === "delta") {
      if (this.state.type !== "listening" && this.state.type !== "committing") {
        return;
      }
      this.transition({ ...this.state, transcript: update.transcript });
      return;
    }
    void this.completeTranscript(lifecycle, update.transcript);
  }

  private async completeTranscript(lifecycle: number, transcript: string): Promise<void> {
    if (!this.isCurrent(lifecycle) || this.state.type !== "committing") {
      return;
    }
    if (transcript.trim() === "") {
      this.fail(lifecycle, "no_speech", "No speech was detected. Please try again.");
      return;
    }
    const intent = this.state.intent;
    this.transition({ ...this.state, transcript });
    this.closeActiveResources();
    try {
      await this.onCompletedTranscript(transcript, intent);
    } catch (error) {
      this.fail(lifecycle, "completion_failed", safeCompletionErrorMessage(error));
      return;
    }
    if (!this.isCurrent(lifecycle)) {
      return;
    }
    this.activeLifecycle = null;
    this.transition({ type: "idle" });
  }

  private handleTransportError(lifecycle: number, error: RealtimeTranscriptionError): void {
    if (error.code === "aborted") {
      if (this.isCurrent(lifecycle)) {
        this.cancel();
      }
      return;
    }
    const failure = failureForRealtimeError(error.code);
    this.fail(lifecycle, failure.code, failure.message);
  }

  private handleStartError(lifecycle: number, error: unknown): void {
    if (!this.isCurrent(lifecycle)) {
      return;
    }
    if (error instanceof RealtimeTranscriptionError) {
      this.handleTransportError(lifecycle, error);
      return;
    }
    if (this.state.type === "requesting_permission") {
      const failure = microphoneFailure(error);
      this.fail(lifecycle, failure.code, failure.message);
      return;
    }
    this.fail(lifecycle, "session_failed", safeSessionErrorMessage(error));
  }

  private fail(lifecycle: number, code: SpeechCaptureFailureCode, message: string): void {
    if (!this.isCurrent(lifecycle)) {
      return;
    }
    this.activeLifecycle = null;
    this.closeActiveResources();
    this.transition({ code, message, type: "failed" });
  }

  private isCurrent(lifecycle: number): boolean {
    return this.activeLifecycle === lifecycle;
  }

  private closeActiveResources(): void {
    if (this.durationTimer !== null) {
      this.dependencies.clearTimeout(this.durationTimer);
      this.durationTimer = null;
    }
    this.transport?.close();
    this.transport = null;
    if (this.stream) {
      stopMediaStream(this.stream);
      this.stream = null;
    }
  }

  private transition(state: SpeechCaptureState): void {
    this.state = state;
    this.onStateChange(state);
  }
}

export function speechCaptureIsActive(state: SpeechCaptureState): boolean {
  return (
    state.type === "requesting_permission" ||
    state.type === "connecting" ||
    state.type === "listening" ||
    state.type === "committing"
  );
}

export function browserSpeechCaptureSupport(): SpeechCaptureSupport {
  if (!globalThis.isSecureContext) {
    return {
      code: "insecure_context",
      message: "Voice capture requires a secure HTTPS connection or localhost.",
      supported: false,
    };
  }
  if (
    typeof navigator.mediaDevices?.getUserMedia !== "function" ||
    typeof globalThis.RTCPeerConnection !== "function" ||
    typeof globalThis.crypto?.randomUUID !== "function"
  ) {
    return {
      code: "unsupported_browser",
      message: "This browser does not support secure microphone transcription.",
      supported: false,
    };
  }
  return { supported: true };
}

const browserSpeechCaptureDependencies: SpeechCaptureControllerDependencies = {
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
  createCaptureSessionId: () => globalThis.crypto.randomUUID(),
  createTranscriptionSession: (workspaceId) =>
    window.setta.speech.createTranscriptionSession({ workspaceId }),
  createTransport: createRealtimeTranscriptionTransport,
  getUserMedia: (constraints) => navigator.mediaDevices.getUserMedia(constraints),
  setTimeout: (handler, delayMs) => globalThis.setTimeout(handler, delayMs),
  support: browserSpeechCaptureSupport,
};

function validateCaptureCapabilities(
  capabilities: SpeechCapabilities,
): { code: SpeechCaptureFailureCode; message: string } | null {
  if (capabilities.providerStatus !== "configured") {
    return {
      code: "not_configured",
      message: "Voice needs OPENAI_API_KEY on the runtime. Typed requests still work.",
    };
  }
  if (
    !Number.isInteger(capabilities.maximumRecordingSeconds) ||
    capabilities.maximumRecordingSeconds < 1 ||
    !Number.isInteger(capabilities.maximumTranscriptCharacters) ||
    capabilities.maximumTranscriptCharacters < 1
  ) {
    return {
      code: "session_failed",
      message: "The runtime returned invalid voice-capture limits.",
    };
  }
  return null;
}

function captureSessionId(state: SpeechCaptureState): string | null {
  switch (state.type) {
    case "requesting_permission":
    case "connecting":
    case "listening":
    case "committing":
      return state.captureSessionId;
    case "idle":
    case "failed":
      return null;
  }
}

function microphoneFailure(error: unknown): { code: SpeechCaptureFailureCode; message: string } {
  const name = errorName(error);
  if (name === "NotAllowedError" || name === "SecurityError") {
    return {
      code: "microphone_permission_denied",
      message: "Microphone access was denied. Allow access and try again.",
    };
  }
  return {
    code: "microphone_unavailable",
    message: "The microphone is unavailable. Check the device and try again.",
  };
}

function failureForRealtimeError(code: Exclude<RealtimeTranscriptionErrorCode, "aborted">): {
  code: SpeechCaptureFailureCode;
  message: string;
} {
  return (
    {
      connection_failed: {
        code,
        message: "The browser could not connect to OpenAI transcription.",
      },
      connection_lost: {
        code,
        message: "The transcription connection was lost. Please try again.",
      },
      invalid_media: {
        code,
        message: "Voice capture requires one live audio-only microphone track.",
      },
      invalid_session: {
        code,
        message: "The transcription session expired or was invalid. Please try again.",
      },
      malformed_event: {
        code,
        message: "OpenAI sent an invalid transcription event. Please try again.",
      },
      provider_rate_limited: {
        code,
        message: "OpenAI speech rate limit or quota was reached.",
      },
      provider_rejected: {
        code,
        message: "OpenAI rejected the speech credential or model access.",
      },
      provider_response_malformed: {
        code,
        message: "OpenAI returned an invalid transcription response.",
      },
      provider_unavailable: {
        code,
        message: "OpenAI transcription is unavailable. Please try again.",
      },
      stale_event: {
        code,
        message: "A stale transcription event was rejected. Please try again.",
      },
      transcript_too_large: {
        code,
        message: "The transcript exceeded the runtime limit. Please try a shorter request.",
      },
      transcription_failed: {
        code,
        message: "OpenAI could not transcribe the recorded audio. Please try again.",
      },
    } satisfies Record<
      Exclude<RealtimeTranscriptionErrorCode, "aborted">,
      { code: SpeechCaptureFailureCode; message: string }
    >
  )[code];
}

function safeSessionErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim() !== ""
    ? error.message
    : "The runtime could not create a transcription session.";
}

function safeCompletionErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim() !== ""
    ? error.message
    : "The completed transcript could not be handed off.";
}

function errorName(error: unknown): string {
  return typeof error === "object" && error !== null && "name" in error ? String(error.name) : "";
}

function stopMediaStream(stream: MediaStream): void {
  for (const track of stream.getTracks()) {
    track.stop();
  }
}
