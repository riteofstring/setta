import type { SpeechCapabilities, SpeechProvider } from "@generated/backend";

import type { SpeechCaptureFailureCode, SpeechCaptureSupport } from "./voice-provider-boundary";

export type SpeechCaptureAvailability =
  | { type: "disconnected" }
  | { type: "loading" }
  | { capabilities: SpeechCapabilities; type: "configured" }
  | {
      message: string;
      provider: SpeechProvider;
      setupAction: VoiceProviderSetupAction;
      type: "not_configured";
    }
  | {
      capabilities: SpeechCapabilities;
      code: Extract<SpeechCaptureFailureCode, "insecure_context" | "unsupported_browser">;
      message: string;
      type: "unsupported";
    }
  | { message: string; type: "failed" };

export type VoiceProviderSetupAction = "open_voice_credential_settings";

export function speechAvailabilityForCapabilities(
  capabilities: SpeechCapabilities,
  support: SpeechCaptureSupport,
): SpeechCaptureAvailability {
  if (!support.supported) {
    return { ...support, capabilities, type: "unsupported" };
  }
  if (capabilities.providerStatus === "not_configured") {
    const provider = capabilities.voiceCatalog.provider;
    return {
      message: "OpenAI voice is not connected. Add an OpenAI API key in Settings -> Voices.",
      provider,
      setupAction: "open_voice_credential_settings",
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

export function voiceProviderSetupActionLabel(action: VoiceProviderSetupAction): string {
  switch (action) {
    case "open_voice_credential_settings":
      return "Open voice settings";
    default:
      return assertNever(action);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unsupported voice provider setup action: ${JSON.stringify(value)}`);
}
