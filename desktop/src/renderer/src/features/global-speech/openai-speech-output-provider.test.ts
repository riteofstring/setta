import { describe, expect, test, vi } from "vitest";
import type { SettaAPI } from "@shared/types";

import { createOpenAIBackendSpeechOutputProvider } from "./openai-speech-output-provider";

describe("OpenAI speech output provider", () => {
  test("adds the OpenAI provider to backend synthesis requests", async () => {
    const source = {
      conversationId: "conversation-speech",
      eventId: "status-reply-speech",
      speaker: "narrator" as const,
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
    const provider = createOpenAIBackendSpeechOutputProvider({
      speech: {
        readCapabilities: vi.fn(),
        synthesize,
      },
    } as unknown as Pick<SettaAPI, "speech">);

    await provider.synthesize({ resolvedVoiceId: "cedar", source }, "speech-operation");

    expect(synthesize).toHaveBeenCalledWith(
      {
        provider: "openai",
        resolvedVoiceId: "cedar",
        source,
      },
      "speech-operation",
    );
  });
});
