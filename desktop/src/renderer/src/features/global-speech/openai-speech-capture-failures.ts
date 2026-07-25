import type { RealtimeTranscriptionErrorCode } from "./realtime-transcription-error";
import type { SpeechCaptureFailure } from "./voice-provider-boundary";

export function failureForOpenAIRealtimeError(
  code: Exclude<RealtimeTranscriptionErrorCode, "aborted">,
): SpeechCaptureFailure {
  return (
    {
      connection_failed: {
        code,
        message: "The browser could not connect to OpenAI transcription.",
      },
      connection_lost: {
        code,
        message: "The OpenAI transcription connection was lost. Please try again.",
      },
      invalid_media: {
        code,
        message: "OpenAI voice capture requires one live audio-only microphone track.",
      },
      invalid_session: {
        code,
        message: "The OpenAI transcription session expired or was invalid. Please try again.",
      },
      malformed_event: {
        code,
        message: "OpenAI sent an invalid transcription event. Please try again.",
      },
      protocol_violation: {
        code,
        message: "OpenAI sent an invalid transcription sequence. Please try again.",
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
      transcript_too_large: {
        code,
        message: "The transcript exceeded the runtime limit. Please try a shorter request.",
      },
      transcription_failed: {
        code,
        message: "OpenAI could not transcribe the recorded audio. Please try again.",
      },
    } satisfies Record<Exclude<RealtimeTranscriptionErrorCode, "aborted">, SpeechCaptureFailure>
  )[code];
}
