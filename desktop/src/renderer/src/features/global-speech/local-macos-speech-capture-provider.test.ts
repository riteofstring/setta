import type { SpeechCapabilities, SpeechVoiceCatalog } from "@generated/backend";
import { describe, expect, test, vi } from "vitest";

import { createLocalMacOSSpeechCaptureProvider } from "./local-macos-speech-capture-provider";
import type { VoiceCaptureProviderError } from "./voice-provider-boundary";

describe("local macOS speech capture provider", () => {
  test("maps helper readiness into local provider capabilities", async () => {
    const provider = createLocalMacOSSpeechCaptureProvider({
      cancelCapture: vi.fn(),
      finishCapture: vi.fn(),
      listVoices: vi.fn(async () => localVoiceCatalog()),
      readCapabilities: vi.fn(async () => openAICapabilities()),
      readHealth: vi.fn(async () => ({
        helperPath: "/tmp/setta-local-helper",
        modelPath: "/tmp/ggml-base.en.bin",
        modelSHA256: "model-sha",
        provider: "local_macos" as const,
        status: "ready" as const,
      })),
      startCapture: vi.fn(),
    });

    await expect(provider.readCapabilities()).resolves.toMatchObject({
      providerStatus: "configured",
      voiceCatalog: localVoiceCatalog(),
    });
  });

  test("returns setup-required capabilities when helper health is unavailable", async () => {
    const provider = createLocalMacOSSpeechCaptureProvider({
      cancelCapture: vi.fn(),
      finishCapture: vi.fn(),
      listVoices: vi.fn(async () => localVoiceCatalog()),
      readCapabilities: vi.fn(async () => openAICapabilities()),
      readHealth: vi.fn(async () => ({
        message: "The configured Whisper model file is missing.",
        modelPath: "/tmp/missing-model.bin",
        provider: "local_macos" as const,
        status: "missing_model" as const,
      })),
      startCapture: vi.fn(),
    });

    await expect(provider.readCapabilities()).resolves.toMatchObject({
      providerStatus: "not_configured",
      voiceCatalog: localVoiceCatalog(),
    });
  });

  test("starts, finishes, and publishes the final local transcript", async () => {
    const finishCapture = vi.fn(async () => ({
      captureSessionId: "capture_local",
      status: "completed" as const,
      transcript: "Local helper transcript.",
    }));
    const provider = createLocalMacOSSpeechCaptureProvider({
      cancelCapture: vi.fn(),
      finishCapture,
      listVoices: vi.fn(async () => localVoiceCatalog()),
      readCapabilities: vi.fn(async () => openAICapabilities()),
      readHealth: vi.fn(),
      startCapture: vi.fn(async () => ({
        captureSessionId: "capture_local",
        status: "started" as const,
      })),
    });

    const session = await provider.startCapture({
      capabilities: openAICapabilities(),
      captureSessionId: "capture_local",
    });
    const events: unknown[] = [];
    session.subscribe((event) => events.push(event));
    await session.ready;
    await session.finish();

    expect(finishCapture).toHaveBeenCalledWith({ captureSessionId: "capture_local" });
    expect(events).toEqual([
      {
        captureSessionId: "capture_local",
        transcript: "Local helper transcript.",
        type: "transcript_completed",
      },
    ]);
  });

  test("cancels the persistent helper session without browser microphone access", async () => {
    const cancelCapture = vi.fn(async () => ({
      captureSessionId: "capture_cancel",
      status: "canceled" as const,
    }));
    const provider = createLocalMacOSSpeechCaptureProvider({
      cancelCapture,
      finishCapture: vi.fn(),
      listVoices: vi.fn(async () => localVoiceCatalog()),
      readCapabilities: vi.fn(async () => openAICapabilities()),
      readHealth: vi.fn(),
      startCapture: vi.fn(async () => ({
        captureSessionId: "capture_cancel",
        status: "started" as const,
      })),
    });

    const session = await provider.startCapture({
      capabilities: openAICapabilities(),
      captureSessionId: "capture_cancel",
    });
    session.cancel();

    expect(cancelCapture).toHaveBeenCalledWith({ captureSessionId: "capture_cancel" });
  });

  test("converts helper capture failures to provider-neutral failures", async () => {
    const provider = createLocalMacOSSpeechCaptureProvider({
      cancelCapture: vi.fn(),
      finishCapture: vi.fn(),
      listVoices: vi.fn(async () => localVoiceCatalog()),
      readCapabilities: vi.fn(async () => openAICapabilities()),
      readHealth: vi.fn(),
      startCapture: vi.fn(async () => ({
        failure: {
          code: "microphone_permission_denied" as const,
          message: "Microphone access is denied for Setta.",
        },
        status: "failed" as const,
      })),
    });

    await expect(
      provider.startCapture({
        capabilities: openAICapabilities(),
        captureSessionId: "capture_denied",
      }),
    ).rejects.toMatchObject({
      failure: {
        code: "microphone_permission_denied",
        message: "Microphone access is denied for Setta.",
      },
      name: "VoiceCaptureProviderError",
    } satisfies Partial<VoiceCaptureProviderError>);
  });

  test("publishes local finish failures as provider-neutral session failures", async () => {
    const provider = createLocalMacOSSpeechCaptureProvider({
      cancelCapture: vi.fn(),
      finishCapture: vi.fn(async () => ({
        failure: {
          code: "no_speech" as const,
          message: "No speech was detected. Please try again.",
        },
        status: "failed" as const,
      })),
      listVoices: vi.fn(async () => localVoiceCatalog()),
      readCapabilities: vi.fn(async () => openAICapabilities()),
      readHealth: vi.fn(),
      startCapture: vi.fn(async () => ({
        captureSessionId: "capture_empty",
        status: "started" as const,
      })),
    });

    const session = await provider.startCapture({
      capabilities: openAICapabilities(),
      captureSessionId: "capture_empty",
    });
    const events: unknown[] = [];
    session.subscribe((event) => events.push(event));

    await expect(session.finish()).rejects.toMatchObject({
      failure: {
        code: "no_speech",
        message: "No speech was detected. Please try again.",
      },
      name: "VoiceCaptureProviderError",
    } satisfies Partial<VoiceCaptureProviderError>);
    expect(events).toEqual([
      {
        failure: {
          code: "no_speech",
          message: "No speech was detected. Please try again.",
        },
        type: "failed",
      },
    ]);
  });
});

function openAICapabilities(): SpeechCapabilities {
  return {
    aiVoiceDisclosure: "This voice is AI-generated.",
    maximumRecordingSeconds: 120,
    maximumSynthesisCharacters: 4096,
    maximumTranscriptCharacters: 8000,
    providerStatus: "configured",
    synthesisModel: "gpt-4o-mini-tts",
    transcriptionModel: "gpt-realtime-whisper",
    voiceCatalog: {
      provider: "openai",
      version: "test",
      voiceIds: ["marin", "cedar"],
    },
  };
}

function localVoiceCatalog(): SpeechVoiceCatalog {
  return {
    provider: "local_macos",
    version: "fixture-local-voices",
    voiceIds: ["com.apple.voice.compact.en-US.Samantha", "com.apple.voice.compact.en-US.Alex"],
  };
}
