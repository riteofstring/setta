import { describe, expect, test, vi } from "vitest";
import type { SettaAPI } from "@shared/types";

import { createLocalMacOSSpeechOutputProvider } from "./local-macos-speech-output-provider";

describe("local macOS speech output provider", () => {
  test("adds the local macOS provider to backend synthesis requests", async () => {
    const source = {
      conversationId: null,
      eventId: "master-answer-speech",
      speaker: "master" as const,
    };
    const synthesize = vi.fn(
      async (request: Parameters<NonNullable<SettaAPI["speech"]["synthesize"]>>[0]) => ({
        audioBase64: "UklGRiQAAABXQVZF",
        format: "wav",
        mediaType: "audio/wav",
        resolvedVoiceId: request.resolvedVoiceId,
        source: request.source,
      }),
    );
    const provider = createLocalMacOSSpeechOutputProvider({
      speech: {
        listLocalMacOSVoices: vi.fn(),
        synthesize,
      },
    } as unknown as Pick<SettaAPI, "speech">);

    await provider.synthesize({ resolvedVoiceId: "marin", source }, "speech-operation");

    expect(synthesize).toHaveBeenCalledWith(
      {
        provider: "local_macos",
        resolvedVoiceId: "marin",
        source,
      },
      "speech-operation",
    );
  });

  test("lists helper-installed local macOS voices", async () => {
    const listLocalMacOSVoices = vi.fn(async () => ({
      provider: "local_macos" as const,
      version: "fixture-local-voices",
      voiceIds: ["com.apple.voice.compact.en-US.Samantha", "com.apple.voice.compact.en-US.Alex"],
    }));
    const provider = createLocalMacOSSpeechOutputProvider({
      speech: {
        listLocalMacOSVoices,
      },
    } as unknown as Pick<SettaAPI, "speech">);

    await expect(provider.listVoices()).resolves.toEqual({
      provider: "local_macos",
      version: "fixture-local-voices",
      voiceIds: ["com.apple.voice.compact.en-US.Samantha", "com.apple.voice.compact.en-US.Alex"],
    });
    expect(listLocalMacOSVoices).toHaveBeenCalledWith();
  });
});
