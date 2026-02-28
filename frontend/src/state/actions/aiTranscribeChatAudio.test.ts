import {
  route_append_transcription_audio,
  route_cancel_transcription_session,
  route_start_transcription_session,
  route_stop_transcription_session,
} from "utils/generatedEndpoints";
import { SettaNotificationTypeEnum } from "utils/generatedTypes";
import { ProviderTranscriptionError } from "utils/transcriptionErrors";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  appendTranscriptionAudio,
  cancelTranscriptionSession,
  resampleMonoPcm16ToSampleRate,
  resolveProviderTranscriptionChunkSampleCount,
  startTranscriptionSession,
  stopTranscriptionSession,
  transcribeChatAudioWithProfile,
} from "./ai";
import { addTemporaryNotification } from "./notifications";

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

vi.mock("./notifications", () => ({
  addTemporaryNotification: vi.fn(),
}));

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
const mockedAddTemporaryNotification = vi.mocked(addTemporaryNotification);

describe("transcription session actions", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("starts a transcription session", async () => {
    mockedRouteStartTranscriptionSession.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: {
        sessionId: "session-1",
        resolvedTransportMode: "file",
        chunkMs: 1200,
      },
    });

    const response = await startTranscriptionSession("transcription-1", "en");

    expect(response).toEqual({
      sessionId: "session-1",
      resolvedTransportMode: "file",
      chunkMs: 1200,
    });
    expect(mockedRouteStartTranscriptionSession).toHaveBeenCalledWith({
      transcriptionProfileId: "transcription-1",
      language: "en",
    });
  });

  it("encodes PCM16 chunks as base64 for append calls", async () => {
    mockedRouteAppendTranscriptionAudio.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: {
        appendText: "hello",
        fullText: "hello",
        isFinal: false,
      },
    });

    const sampleBytes = new Uint8Array([1, 2, 3, 4]).buffer;
    const response = await appendTranscriptionAudio(
      "session-1",
      sampleBytes,
      24_000,
      1,
    );

    expect(response).toEqual({
      appendText: "hello",
      fullText: "hello",
      isFinal: false,
    });
    expect(mockedRouteAppendTranscriptionAudio).toHaveBeenCalledTimes(1);
    const [payload] = mockedRouteAppendTranscriptionAudio.mock.calls[0] ?? [];
    expect(payload.sessionId).toBe("session-1");
    expect(payload.sampleRateHz).toBe(24_000);
    expect(payload.channels).toBe(1);
    expect(payload.audioPcm16Base64).toBe("AQIDBA==");
  });

  it("returns a final delta when stopping session", async () => {
    mockedRouteStopTranscriptionSession.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: {
        appendText: " world",
        fullText: "hello world",
        isFinal: true,
      },
    });

    const response = await stopTranscriptionSession("session-1");

    expect(response).toEqual({
      appendText: " world",
      fullText: "hello world",
      isFinal: true,
    });
    expect(mockedRouteStopTranscriptionSession).toHaveBeenCalledWith({
      sessionId: "session-1",
    });
  });

  it("returns true for successful cancellation", async () => {
    mockedRouteCancelTranscriptionSession.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: { ok: true },
    });

    const success = await cancelTranscriptionSession("session-1");

    expect(success).toBe(true);
    expect(mockedRouteCancelTranscriptionSession).toHaveBeenCalledWith({
      sessionId: "session-1",
    });
  });

  it("surfaces append errors", async () => {
    mockedRouteAppendTranscriptionAudio.mockResolvedValue({
      status: 502,
      hasResponse: true,
      data: { detail: "Provider transcription failed." },
    });

    const response = await appendTranscriptionAudio(
      "session-1",
      new Uint8Array([1, 2]).buffer,
      24_000,
      1,
    );

    expect(response).toBeNull();
    expect(mockedAddTemporaryNotification).toHaveBeenCalledWith(
      "Provider transcription failed.",
      SettaNotificationTypeEnum.warning,
    );
  });

  it("suppresses start-session warnings when requested", async () => {
    mockedRouteStartTranscriptionSession.mockResolvedValue({
      status: 400,
      hasResponse: true,
      data: { detail: "Missing API key for OPENAI_API_KEY." },
    });

    const response = await startTranscriptionSession("transcription-1", null, {
      suppressNotification: true,
    });

    expect(response).toBeNull();
    expect(mockedAddTemporaryNotification).not.toHaveBeenCalled();
  });

  it("throws a structured error when requested", async () => {
    mockedRouteStartTranscriptionSession.mockResolvedValue({
      status: 400,
      hasResponse: true,
      data: {
        detail: {
          message:
            "Realtime transcription is unavailable for this provider/model.",
          errorCode: "unsupported_model",
        },
      },
    });

    await expect(
      startTranscriptionSession("transcription-1", null, {
        suppressNotification: true,
        throwOnError: true,
      }),
    ).rejects.toMatchObject<ProviderTranscriptionError>({
      name: "ProviderTranscriptionError",
      message: "Realtime transcription is unavailable for this provider/model.",
      code: "unsupported_model",
      status: 400,
    });
    expect(mockedAddTemporaryNotification).not.toHaveBeenCalled();
  });

  it("resamples realtime dictation to 24kHz and appends bounded chunks", async () => {
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

      expect(transcript).toBe("ready");
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

  it("resolves realtime chunk sample count from chunkMs and payload cap", () => {
    const chunkSamples = resolveProviderTranscriptionChunkSampleCount({
      session: {
        sessionId: "session-1",
        resolvedTransportMode: "realtime",
        chunkMs: 125,
      },
      sampleRateHz: 24_000,
      channels: 1,
    });

    expect(chunkSamples).toBe(3_000);
  });

  it("resamples mono PCM16 payload length by sample-rate ratio", () => {
    const input = new Int16Array(48_000);
    input.fill(1_000);

    const output = resampleMonoPcm16ToSampleRate(input, 48_000, 24_000);

    expect(output.length).toBe(24_000);
    expect(output[0]).toBe(1_000);
  });
});
