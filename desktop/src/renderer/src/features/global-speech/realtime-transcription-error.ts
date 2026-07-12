export type RealtimeTranscriptionErrorCode =
  | "aborted"
  | "connection_failed"
  | "connection_lost"
  | "invalid_media"
  | "invalid_session"
  | "malformed_event"
  | "protocol_violation"
  | "provider_rate_limited"
  | "provider_rejected"
  | "provider_response_malformed"
  | "provider_unavailable"
  | "transcript_too_large"
  | "transcription_failed";

export class RealtimeTranscriptionError extends Error {
  readonly code: RealtimeTranscriptionErrorCode;

  constructor(code: RealtimeTranscriptionErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "RealtimeTranscriptionError";
    this.code = code;
  }
}
