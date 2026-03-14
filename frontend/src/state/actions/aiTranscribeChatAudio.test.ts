import {
  route_append_transcription_audio,
  route_cancel_transcription_session,
  route_start_transcription_session,
  route_stop_transcription_session,
} from "utils/generatedEndpoints";
import { ProviderTranscriptionError } from "utils/transcriptionErrors";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  resampleMonoPcm16ToSampleRate,
  transcribeChatAudioWithProfile,
} from "./aiTranscription";

vi.mock("utils/generatedEndpoints", async () => {
  const actual = await vi.importActual<
    typeof import("utils/generatedEndpoints")
  >("utils/generatedEndpoints");
  return {
    ...actual,
    route_start_transcription_session: vi.fn(),
    route_append_transcription_audio: vi.fn(),
    route_stop_transcription_session: vi.fn(),
    route_cancel_transcription_session: vi.fn(),
  };
});

const mockedRouteStartTranscriptionSession = vi.mocked(
  route_start_transcription_session,
);
const mockedRouteAppendTranscriptionAudio = vi.mocked(
  route_append_transcription_audio,
);
const mockedRouteStopTranscriptionSession = vi.mocked(
  route_stop_transcription_session,
);
const mockedRouteCancelTranscriptionSession = vi.mocked(
  route_cancel_transcription_session,
);

describe("aiTranscription dictation orchestration", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("resamples realtime dictation to 24kHz and appends bounded chunks", async () => {
    // Dictation upload should normalize realtime payloads before transport sends.
    const channels = 1;
    const sourceSampleRate = 48_000;
    const sourceSampleCount = 9_600;
    const channelData = new Float32Array(sourceSampleCount);
    channelData.fill(0.5);
    const closeMock = vi.fn().mockResolvedValue(undefined);
    const decodeAudioDataMock = vi.fn().mockResolvedValue({
      numberOfChannels: channels,
      sampleRate: sourceSampleRate,
      length: sourceSampleCount,
      getChannelData: () => channelData,
    });
    const AudioContextMock = vi.fn(() => ({
      decodeAudioData: decodeAudioDataMock,
      close: closeMock,
    }));
    const withAudioContext = globalThis as typeof globalThis & {
      window?: typeof window & { AudioContext?: typeof AudioContext };
    };
    const hadWindow = typeof withAudioContext.window !== "undefined";
    const originalWindow = withAudioContext.window;
    const testWindow =
      originalWindow ??
      ({} as unknown as typeof window & { AudioContext?: typeof AudioContext });
    withAudioContext.window = testWindow;
    const originalAudioContext = testWindow.AudioContext;
    testWindow.AudioContext =
      AudioContextMock as unknown as typeof AudioContext;
    mockedRouteStartTranscriptionSession.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: {
        sessionId: "session-rt",
        resolvedTransportMode: "realtime",
        chunkMs: 100,
      },
    });
    mockedRouteAppendTranscriptionAudio.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: {
        appendText: "",
        fullText: "",
        isFinal: false,
      },
    });
    mockedRouteStopTranscriptionSession.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: {
        appendText: "",
        fullText: "ready",
        isFinal: true,
      },
    });
    try {
      const transcript = await transcribeChatAudioWithProfile(
        "profile-1",
        new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm" }),
      );

      expect(transcript).toEqual({
        kind: "ok",
        transcript: "ready",
      });
      expect(mockedRouteAppendTranscriptionAudio).toHaveBeenCalledTimes(2);
      for (const [payload] of mockedRouteAppendTranscriptionAudio.mock.calls) {
        expect(payload.sampleRateHz).toBe(24_000);
        expect(payload.channels).toBe(1);
      }
      expect(closeMock).toHaveBeenCalledTimes(1);
    } finally {
      testWindow.AudioContext = originalAudioContext;
      if (!hadWindow) {
        delete withAudioContext.window;
      }
    }
  });

  it("returns no_speech when provider audio payload is empty", async () => {
    // Empty recordings should short-circuit before any provider session work starts.
    await expect(
      transcribeChatAudioWithProfile("profile-1", new Blob()),
    ).resolves.toEqual({ kind: "no_speech" });
    expect(mockedRouteStartTranscriptionSession).not.toHaveBeenCalled();
    expect(mockedRouteAppendTranscriptionAudio).not.toHaveBeenCalled();
    expect(mockedRouteStopTranscriptionSession).not.toHaveBeenCalled();
  });

  it("throws a profile_not_found error when profile id is missing", async () => {
    // The dictation entrypoint should fail loudly when no profile is configured.
    await expect(
      transcribeChatAudioWithProfile(
        "",
        new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm" }),
      ),
    ).rejects.toMatchObject<ProviderTranscriptionError>({
      name: "ProviderTranscriptionError",
      code: "profile_not_found",
    });
  });

  it("throws a typed provider failure when browser decode support is unavailable", async () => {
    // Browser decode support is the hard prerequisite for local dictation preprocessing.
    const withAudioContext = globalThis as typeof globalThis & {
      window?: typeof window & {
        AudioContext?: typeof AudioContext;
        webkitAudioContext?: typeof AudioContext;
      };
    };
    const hadWindow = typeof withAudioContext.window !== "undefined";
    const originalWindow = withAudioContext.window;
    const testWindow =
      originalWindow ??
      ({} as unknown as typeof window & {
        AudioContext?: typeof AudioContext;
        webkitAudioContext?: typeof AudioContext;
      });
    withAudioContext.window = testWindow;
    const originalAudioContext = testWindow.AudioContext;
    const originalWebkitAudioContext = testWindow.webkitAudioContext;
    testWindow.AudioContext = undefined;
    testWindow.webkitAudioContext = undefined;
    try {
      await expect(
        transcribeChatAudioWithProfile(
          "profile-1",
          new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm" }),
        ),
      ).rejects.toMatchObject<ProviderTranscriptionError>({
        name: "ProviderTranscriptionError",
        code: "provider_failure",
        message: "Provider dictation is not available in this browser.",
      });
      expect(mockedRouteStartTranscriptionSession).not.toHaveBeenCalled();
    } finally {
      testWindow.AudioContext = originalAudioContext;
      testWindow.webkitAudioContext = originalWebkitAudioContext;
      if (!hadWindow) {
        delete withAudioContext.window;
      }
    }
  });

  it("throws when provider append returns no transcription delta", async () => {
    // Missing append deltas should cancel the provider session instead of continuing.
    const channels = 1;
    const sourceSampleRate = 24_000;
    const sourceSampleCount = 2_400;
    const channelData = new Float32Array(sourceSampleCount);
    channelData.fill(0.5);
    const closeMock = vi.fn().mockResolvedValue(undefined);
    const decodeAudioDataMock = vi.fn().mockResolvedValue({
      numberOfChannels: channels,
      sampleRate: sourceSampleRate,
      length: sourceSampleCount,
      getChannelData: () => channelData,
    });
    const AudioContextMock = vi.fn(() => ({
      decodeAudioData: decodeAudioDataMock,
      close: closeMock,
    }));
    const withAudioContext = globalThis as typeof globalThis & {
      window?: typeof window & { AudioContext?: typeof AudioContext };
    };
    const hadWindow = typeof withAudioContext.window !== "undefined";
    const originalWindow = withAudioContext.window;
    const testWindow =
      originalWindow ??
      ({} as unknown as typeof window & { AudioContext?: typeof AudioContext });
    withAudioContext.window = testWindow;
    const originalAudioContext = testWindow.AudioContext;
    testWindow.AudioContext =
      AudioContextMock as unknown as typeof AudioContext;
    mockedRouteStartTranscriptionSession.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: {
        sessionId: "session-append-null",
        resolvedTransportMode: "file",
        chunkMs: 1_200,
      },
    });
    mockedRouteAppendTranscriptionAudio.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: null,
    });
    mockedRouteCancelTranscriptionSession.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: { ok: true },
    });
    try {
      await expect(
        transcribeChatAudioWithProfile(
          "profile-1",
          new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm" }),
        ),
      ).rejects.toMatchObject<ProviderTranscriptionError>({
        name: "ProviderTranscriptionError",
        code: "provider_failure",
        message: "Provider transcription append returned no result.",
      });
      expect(mockedRouteStopTranscriptionSession).not.toHaveBeenCalled();
      expect(
        mockedRouteCancelTranscriptionSession.mock.calls.length,
      ).toBeGreaterThanOrEqual(1);
    } finally {
      testWindow.AudioContext = originalAudioContext;
      if (!hadWindow) {
        delete withAudioContext.window;
      }
    }
  });

  it("throws when provider stop returns no transcription delta", async () => {
    // Missing stop deltas should also cancel the provider session and surface a typed error.
    const channels = 1;
    const sourceSampleRate = 24_000;
    const sourceSampleCount = 2_400;
    const channelData = new Float32Array(sourceSampleCount);
    channelData.fill(0.5);
    const closeMock = vi.fn().mockResolvedValue(undefined);
    const decodeAudioDataMock = vi.fn().mockResolvedValue({
      numberOfChannels: channels,
      sampleRate: sourceSampleRate,
      length: sourceSampleCount,
      getChannelData: () => channelData,
    });
    const AudioContextMock = vi.fn(() => ({
      decodeAudioData: decodeAudioDataMock,
      close: closeMock,
    }));
    const withAudioContext = globalThis as typeof globalThis & {
      window?: typeof window & { AudioContext?: typeof AudioContext };
    };
    const hadWindow = typeof withAudioContext.window !== "undefined";
    const originalWindow = withAudioContext.window;
    const testWindow =
      originalWindow ??
      ({} as unknown as typeof window & { AudioContext?: typeof AudioContext });
    withAudioContext.window = testWindow;
    const originalAudioContext = testWindow.AudioContext;
    testWindow.AudioContext =
      AudioContextMock as unknown as typeof AudioContext;
    mockedRouteStartTranscriptionSession.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: {
        sessionId: "session-stop-null",
        resolvedTransportMode: "file",
        chunkMs: 1_200,
      },
    });
    mockedRouteAppendTranscriptionAudio.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: {
        appendText: "partial",
        fullText: "partial",
        isFinal: false,
      },
    });
    mockedRouteStopTranscriptionSession.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: null,
    });
    mockedRouteCancelTranscriptionSession.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: { ok: true },
    });
    try {
      await expect(
        transcribeChatAudioWithProfile(
          "profile-1",
          new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm" }),
        ),
      ).rejects.toMatchObject<ProviderTranscriptionError>({
        name: "ProviderTranscriptionError",
        code: "provider_failure",
        message: "Provider transcription stop returned no result.",
      });
      expect(mockedRouteAppendTranscriptionAudio).toHaveBeenCalledTimes(1);
      expect(mockedRouteCancelTranscriptionSession).toHaveBeenCalledTimes(1);
    } finally {
      testWindow.AudioContext = originalAudioContext;
      if (!hadWindow) {
        delete withAudioContext.window;
      }
    }
  });

  it("resamples mono PCM16 payload length by sample-rate ratio", () => {
    // The dictation helper should preserve waveform magnitude while normalizing sample rate.
    const input = new Int16Array(48_000);
    input.fill(1_000);

    const output = resampleMonoPcm16ToSampleRate(input, 48_000, 24_000);

    expect(output.length).toBe(24_000);
    expect(output[0]).toBe(1_000);
  });
});
