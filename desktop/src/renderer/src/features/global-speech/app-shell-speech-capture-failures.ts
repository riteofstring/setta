import type {
  SpeechCaptureFailureCode,
  SpeechCaptureSupport,
} from "./app-shell-speech-capture-controller";
import type { BufferedMicrophoneCaptureError } from "./buffered-microphone-capture";
import type { RealtimeTranscriptionErrorCode } from "./realtime-transcription-error";
import type { SpeechCaptureAvailability } from "./speech-capture-availability";

type Failure = { code: SpeechCaptureFailureCode; message: string };

const requiredBrowserSpeechCaptureSupport: Array<() => boolean> = [
  () => typeof navigator.mediaDevices?.getUserMedia === "function",
  () => typeof globalThis.RTCPeerConnection === "function",
  () => typeof globalThis.AudioContext === "function",
  () => typeof globalThis.AudioWorkletNode === "function",
  () => typeof globalThis.AudioContext.prototype.createMediaStreamDestination === "function",
  () => typeof globalThis.AudioContext.prototype.createMediaStreamSource === "function",
  () => typeof globalThis.crypto?.randomUUID === "function",
];

export function browserSpeechCaptureSupport(): SpeechCaptureSupport {
  if (!globalThis.isSecureContext) {
    return {
      code: "insecure_context",
      message: "Voice capture requires a secure HTTPS connection or localhost.",
      supported: false,
    };
  }
  if (!requiredBrowserSpeechCaptureSupport.every((isSupported) => isSupported())) {
    return {
      code: "unsupported_browser",
      message: "This browser does not support secure microphone transcription.",
      supported: false,
    };
  }
  return { supported: true };
}

export function captureAvailabilityFailure(
  availability: SpeechCaptureAvailability,
  runtimeId: string | null,
): Failure | null {
  if (!runtimeId || availability.type === "disconnected") {
    return {
      code: "runtime_disconnected",
      message: "Connect to a Setta runtime before starting voice capture.",
    };
  }
  switch (availability.type) {
    case "configured":
      return null;
    case "failed":
      return { code: "capabilities_unavailable", message: availability.message };
    case "loading":
      return {
        code: "capabilities_unavailable",
        message: "Voice capabilities are still loading.",
      };
    case "not_configured":
      return { code: "not_configured", message: availability.message };
    case "unsupported":
      return { code: availability.code, message: availability.message };
    default:
      return assertNever(availability);
  }
}

export function microphoneFailure(error: unknown): Failure {
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

export function failureForBufferedCaptureError(
  code: Exclude<BufferedMicrophoneCaptureError["code"], "aborted">,
): Failure {
  return (
    {
      capture_buffer_overflow: {
        code,
        message: "The microphone buffer could not preserve the recording. Please try again.",
      },
      capture_pipeline_failed: {
        code,
        message: "The browser could not prepare local microphone capture. Please try again.",
      },
      invalid_media: {
        code,
        message: "Voice capture requires one live audio-only microphone track.",
      },
    } satisfies Record<Exclude<BufferedMicrophoneCaptureError["code"], "aborted">, Failure>
  )[code];
}

export function failureForRealtimeError(
  code: Exclude<RealtimeTranscriptionErrorCode, "aborted">,
): Failure {
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
    } satisfies Record<Exclude<RealtimeTranscriptionErrorCode, "aborted">, Failure>
  )[code];
}

export function safeSessionErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim() !== ""
    ? error.message
    : "The runtime could not create a transcription session.";
}

function errorName(error: unknown): string {
  return typeof error === "object" && error !== null && "name" in error ? String(error.name) : "";
}

function assertNever(value: never): never {
  throw new Error(`Unhandled speech capture failure value: ${JSON.stringify(value)}`);
}
