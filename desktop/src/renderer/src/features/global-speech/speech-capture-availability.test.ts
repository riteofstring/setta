import { speechVoiceIDValues, type SpeechCapabilities } from "@generated/backend";
import { describe, expect, test } from "vitest";

import { speechAvailabilityForCapabilities } from "./speech-capture-availability";

describe("global speech capture availability", () => {
  test("reports secure-context support before runtime configuration", () => {
    const insecureSupport = {
      code: "insecure_context",
      message: "Voice capture requires a secure HTTPS connection or localhost.",
      supported: false,
    } as const;

    expect(
      speechAvailabilityForCapabilities(capabilities("not_configured"), insecureSupport),
    ).toEqual({
      ...insecureSupport,
      capabilities: capabilities("not_configured"),
      type: "unsupported",
    });
    expect(
      speechAvailabilityForCapabilities(capabilities("not_configured"), { supported: true }),
    ).toEqual({
      message: "OpenAI voice is not connected. Add an OpenAI API key in Settings -> Voices.",
      provider: "openai",
      setupAction: "open_voice_credential_settings",
      type: "not_configured",
    });
  });

  test("rejects invalid runtime limits before microphone access", () => {
    expect(
      speechAvailabilityForCapabilities(
        { ...capabilities("configured"), maximumRecordingSeconds: 0 },
        { supported: true },
      ),
    ).toEqual({ message: "The runtime returned invalid voice-capture limits.", type: "failed" });
  });
});

function capabilities(providerStatus: SpeechCapabilities["providerStatus"]): SpeechCapabilities {
  return {
    aiVoiceDisclosure: "AI-generated voice",
    maximumRecordingSeconds: 120,
    maximumSynthesisCharacters: 4096,
    maximumTranscriptCharacters: 8000,
    providerStatus,
    synthesisModel: "gpt-4o-mini-tts",
    transcriptionModel: "gpt-realtime-whisper",
    voiceCatalog: {
      provider: "openai",
      version: "test",
      voiceIds: [...speechVoiceIDValues],
    },
  };
}
