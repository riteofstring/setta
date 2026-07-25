import type { SpeechAudio, SpeechCapabilities } from "@generated/backend";
import { describe, expect, test, vi } from "vitest";

import {
  createDesktopVoiceInputProvider,
  selectDesktopVoiceOutputProvider,
  selectDesktopVoiceProviderID,
} from "./desktop-speech-provider-coordinator";
import type {
  VoiceCaptureSession,
  VoiceInputProvider,
  VoiceOutputProvider,
} from "./voice-provider-boundary";

describe("desktop speech provider coordinator", () => {
  test("selects local macOS capture by default on macOS", async () => {
    const localSession = captureSession();
    const local = inputProvider("local_macos", {
      readCapabilities: vi.fn(async () => capabilities("local_macos")),
      readSupport: () => ({ supported: true as const }),
      startCapture: vi.fn(async () => localSession),
    });
    const openAI = inputProvider("openai", {
      readCapabilities: vi.fn(async () => capabilities("openai")),
    });
    const provider = createDesktopVoiceInputProvider({
      localMacOS: local,
      openAI,
      platform: "darwin",
    });

    const selectedCapabilities = await provider.readCapabilities();
    const support = provider.readSupport();
    const session = await provider.startCapture({
      capabilities: selectedCapabilities,
      captureSessionId: "capture_local",
    });

    expect(provider.id).toBe("local_macos");
    expect(selectedCapabilities.voiceCatalog.provider).toBe("local_macos");
    expect(support).toEqual({ supported: true });
    expect(session).toBe(localSession);
    expect(local.readCapabilities).toHaveBeenCalledOnce();
    expect(local.startCapture).toHaveBeenCalledOnce();
    expect(openAI.readCapabilities).not.toHaveBeenCalled();
  });

  test("keeps local macOS capture selected when local health is not ready", async () => {
    const provider = createDesktopVoiceInputProvider({
      localMacOS: inputProvider("local_macos", {
        readCapabilities: vi.fn(async () => ({
          ...capabilities("local_macos"),
          providerStatus: "not_configured" as const,
        })),
      }),
      openAI: inputProvider("openai", {
        readCapabilities: vi.fn(async () => capabilities("openai")),
      }),
      platform: "darwin",
    });

    await expect(provider.readCapabilities()).resolves.toMatchObject({
      providerStatus: "not_configured",
      voiceCatalog: { provider: "local_macos" },
    });
    expect(provider.id).toBe("local_macos");
  });

  test("uses explicit OpenAI selection on macOS", async () => {
    await expect(
      selectDesktopVoiceProviderID({
        platform: "darwin",
        readProviderSelection: async () => ({
          defaultProvider: "local_macos",
          provider: "openai",
          supportedProviders: ["local_macos", "openai"],
        }),
      }),
    ).resolves.toBe("openai");
  });

  test("defaults to OpenAI off macOS", async () => {
    await expect(
      selectDesktopVoiceProviderID({
        platform: "linux",
      }),
    ).resolves.toBe("openai");
  });

  test("selects output from the explicit provider selection", async () => {
    const local = outputProvider("local_macos");
    const openAI = outputProvider("openai");

    await expect(
      selectDesktopVoiceOutputProvider({
        localMacOS: local,
        openAI,
        platform: "darwin",
      }),
    ).resolves.toBe(local);
    await expect(
      selectDesktopVoiceOutputProvider({
        localMacOS: local,
        openAI,
        platform: "darwin",
        readProviderSelection: async () => ({
          defaultProvider: "local_macos",
          provider: "openai",
          supportedProviders: ["local_macos", "openai"],
        }),
      }),
    ).resolves.toBe(openAI);
  });
});

function inputProvider(
  id: VoiceInputProvider["id"],
  overrides: Partial<VoiceInputProvider> = {},
): VoiceInputProvider {
  return {
    id,
    readCapabilities: vi.fn(async () => capabilities(id)),
    readSupport: vi.fn(() => ({ supported: true as const })),
    startCapture: vi.fn(async () => captureSession()),
    ...overrides,
  };
}

function outputProvider(id: VoiceOutputProvider["id"]): VoiceOutputProvider {
  return {
    id,
    cancel: vi.fn(async () => {}),
    listVoices: vi.fn(async () => capabilities(id).voiceCatalog),
    synthesize: vi.fn(
      async (request): Promise<SpeechAudio> => ({
        audioBase64: "UklGRiQAAABXQVZF",
        format: "wav",
        mediaType: "audio/wav",
        resolvedVoiceId: request.resolvedVoiceId,
        source: request.source,
      }),
    ),
  };
}

function captureSession(): VoiceCaptureSession {
  return {
    cancel: vi.fn(),
    finish: vi.fn(async () => {}),
    ready: Promise.resolve(),
    subscribe: vi.fn(() => () => {}),
  };
}

function capabilities(
  provider: SpeechCapabilities["voiceCatalog"]["provider"],
): SpeechCapabilities {
  return {
    aiVoiceDisclosure: "This voice is AI-generated.",
    maximumRecordingSeconds: 120,
    maximumSynthesisCharacters: 4096,
    maximumTranscriptCharacters: 8000,
    providerStatus: "configured",
    synthesisModel: "test-synthesis",
    transcriptionModel: "test-transcription",
    voiceCatalog: {
      provider,
      version: "test",
      voiceIds: ["marin", "cedar"],
    },
  };
}
