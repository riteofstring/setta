import { describe, expect, test } from "vitest";

import type { SpeechCapabilities } from "@generated/backend";

import { sameCaptureContext, speechAvailabilityForCapabilities } from "./use-speech-capture";

describe("Easy Button speech capture scope", () => {
  test("accepts completion only in the runtime and workspace where capture began", () => {
    const captureContext = {
      runtimeId: "runtime_capture",
      workspaceId: "workspace_capture",
    };

    expect(sameCaptureContext(captureContext, captureContext)).toBe(true);
    expect(
      sameCaptureContext(captureContext, {
        runtimeId: "runtime_other",
        workspaceId: "workspace_capture",
      }),
    ).toBe(false);
    expect(
      sameCaptureContext(captureContext, {
        runtimeId: "runtime_capture",
        workspaceId: "workspace_other",
      }),
    ).toBe(false);
    expect(sameCaptureContext(captureContext, null)).toBe(false);
  });

  test("reports the remote secure-context boundary before runtime configuration", () => {
    const insecureSupport = {
      code: "insecure_context",
      message: "Voice capture requires a secure HTTPS connection or localhost.",
      supported: false,
    } as const;

    expect(
      speechAvailabilityForCapabilities(capabilities("not_configured"), insecureSupport),
    ).toEqual({ ...insecureSupport, type: "unsupported" });
    expect(speechAvailabilityForCapabilities(capabilities("configured"), insecureSupport)).toEqual({
      ...insecureSupport,
      type: "unsupported",
    });
    expect(
      speechAvailabilityForCapabilities(capabilities("not_configured"), { supported: true }),
    ).toEqual({
      message: "Voice needs OPENAI_API_KEY on the runtime. Typed requests still work.",
      type: "not_configured",
    });
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
    synthesisVoice: "marin",
    transcriptionModel: "gpt-realtime-whisper",
  };
}
