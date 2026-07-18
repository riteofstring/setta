import type { SpeechCapabilities } from "@generated/backend";

import type {
  SpeechCaptureFailureCode,
  SpeechCaptureSupport,
} from "./app-shell-speech-capture-controller";

export type SpeechCaptureAvailability =
  | { type: "disconnected" }
  | { type: "loading" }
  | { capabilities: SpeechCapabilities; type: "configured" }
  | { message: string; type: "not_configured" }
  | {
      capabilities: SpeechCapabilities;
      code: Extract<SpeechCaptureFailureCode, "insecure_context" | "unsupported_browser">;
      message: string;
      type: "unsupported";
    }
  | { message: string; type: "failed" };

export function speechAvailabilityForCapabilities(
  capabilities: SpeechCapabilities,
  support: SpeechCaptureSupport,
): SpeechCaptureAvailability {
  if (!support.supported) {
    return { ...support, capabilities, type: "unsupported" };
  }
  if (capabilities.providerStatus === "not_configured") {
    return {
      message: "Voice is not connected. Configure OpenAI voice for the active runtime.",
      type: "not_configured",
    };
  }
  if (
    !Number.isInteger(capabilities.maximumRecordingSeconds) ||
    capabilities.maximumRecordingSeconds < 1 ||
    !Number.isInteger(capabilities.maximumTranscriptCharacters) ||
    capabilities.maximumTranscriptCharacters < 1
  ) {
    return { message: "The runtime returned invalid voice-capture limits.", type: "failed" };
  }
  return { capabilities, type: "configured" };
}
