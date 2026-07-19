import type {
  SpeechAudio,
  SpeechCapabilities,
  SpeechProvider,
  SpeechSynthesisRequest,
  SpeechVoiceCatalog,
} from "@generated/backend";

export type SpeechCaptureFailureCode =
  | "capture_buffer_overflow"
  | "capture_pipeline_failed"
  | "capabilities_unavailable"
  | "connection_failed"
  | "connection_lost"
  | "conversation_submission_failed"
  | "conversation_submission_pending"
  | "duration_limit"
  | "insecure_context"
  | "invalid_media"
  | "invalid_session"
  | "malformed_event"
  | "master_submission_failed"
  | "master_submission_pending"
  | "microphone_permission_denied"
  | "microphone_unavailable"
  | "no_speech"
  | "not_configured"
  | "protocol_violation"
  | "provider_rate_limited"
  | "provider_rejected"
  | "provider_response_malformed"
  | "provider_unavailable"
  | "runtime_disconnected"
  | "session_failed"
  | "transcript_too_large"
  | "transcription_failed"
  | "unsupported_browser";

export interface SpeechCaptureFailure {
  code: SpeechCaptureFailureCode;
  message: string;
}

export type SpeechCaptureSupport =
  | { supported: true }
  | {
      code: "insecure_context" | "unsupported_browser";
      message: string;
      supported: false;
    };

export type VoiceCaptureSessionEvent =
  | {
      captureSessionId: string;
      delta: string;
      transcript: string;
      type: "transcript_delta";
    }
  | {
      captureSessionId: string;
      transcript: string;
      type: "transcript_completed";
    }
  | {
      failure: SpeechCaptureFailure;
      type: "failed";
    };

export interface VoiceCaptureStartRequest {
  capabilities: SpeechCapabilities;
  captureSessionId: string;
  signal?: AbortSignal;
}

export interface VoiceCaptureSession {
  readonly ready: Promise<void>;
  cancel: () => void;
  finish: () => Promise<void>;
  subscribe: (listener: (event: VoiceCaptureSessionEvent) => void) => () => void;
}

export interface VoiceInputProvider {
  readonly id: SpeechProvider;
  readCapabilities: () => Promise<SpeechCapabilities>;
  readSupport: () => SpeechCaptureSupport;
  startCapture: (request: VoiceCaptureStartRequest) => Promise<VoiceCaptureSession>;
}

export interface VoiceOutputProvider {
  readonly id: SpeechProvider;
  cancel: (operationId: string) => Promise<void>;
  listVoices: () => Promise<SpeechVoiceCatalog>;
  synthesize: (request: SpeechSynthesisRequest, operationId: string) => Promise<SpeechAudio>;
}

export class VoiceCaptureProviderError extends Error {
  readonly failure: SpeechCaptureFailure;

  constructor(
    failure: SpeechCaptureFailure,
    message: string = failure.message,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "VoiceCaptureProviderError";
    this.failure = failure;
  }
}

export class VoiceCaptureProviderAbortedError extends Error {
  constructor(message = "Voice capture was canceled.", options?: ErrorOptions) {
    super(message, options);
    this.name = "VoiceCaptureProviderAbortedError";
  }
}
