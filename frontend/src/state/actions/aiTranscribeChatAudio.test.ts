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

  it("prefers authoritative stop fullText over stale appendText segments", async () => {
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
        sessionId: "session-rt-order",
        resolvedTransportMode: "realtime",
        chunkMs: 100,
      },
    });
    mockedRouteAppendTranscriptionAudio.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: {
        appendText: "world hello",
        fullText: "hello world",
        isFinal: false,
      },
    });
    mockedRouteStopTranscriptionSession.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: {
        appendText: "",
        fullText: "hello world",
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
        transcript: "hello world",
      });
      expect(mockedRouteAppendTranscriptionAudio).toHaveBeenCalledTimes(1);
      expect(mockedRouteStopTranscriptionSession).toHaveBeenCalledTimes(1);
      expect(closeMock).toHaveBeenCalledTimes(1);
    } finally {
      testWindow.AudioContext = originalAudioContext;
      if (!hadWindow) {
        delete withAudioContext.window;
      }
    }
  });

  it("returns no_speech when provider audio payload is empty", async () => {
    const transcript = await transcribeChatAudioWithProfile(
      "profile-1",
      new Blob(),
    );

    expect(transcript).toEqual({ kind: "no_speech" });
    expect(mockedRouteStartTranscriptionSession).not.toHaveBeenCalled();
    expect(mockedRouteAppendTranscriptionAudio).not.toHaveBeenCalled();
    expect(mockedRouteStopTranscriptionSession).not.toHaveBeenCalled();
  });

  it("throws a profile_not_found error when profile id is missing", async () => {
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

  it("preserves typed missing_api_key errors from provider start failures", async () => {
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
      status: 400,
      hasResponse: true,
      data: {
        detail: {
          message:
            "Missing API key for 'OPENAI_API_KEY'. Configure it in LLM API Keys.",
          errorCode: "missing_api_key",
        },
      },
    });
    try {
      await expect(
        transcribeChatAudioWithProfile(
          "profile-1",
          new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm" }),
        ),
      ).rejects.toMatchObject<ProviderTranscriptionError>({
        name: "ProviderTranscriptionError",
        code: "missing_api_key",
        message:
          "Missing API key for 'OPENAI_API_KEY'. Configure it in LLM API Keys.",
      });
      expect(mockedRouteStartTranscriptionSession).toHaveBeenCalledTimes(1);
      expect(mockedRouteAppendTranscriptionAudio).not.toHaveBeenCalled();
      expect(mockedRouteStopTranscriptionSession).not.toHaveBeenCalled();
      expect(mockedRouteCancelTranscriptionSession).not.toHaveBeenCalled();
      expect(mockedAddTemporaryNotification).not.toHaveBeenCalled();
      expect(closeMock).toHaveBeenCalledTimes(1);
    } finally {
      testWindow.AudioContext = originalAudioContext;
      if (!hadWindow) {
        delete withAudioContext.window;
      }
    }
  });

  it("preserves typed provider_failure errors from provider start failures", async () => {
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
      status: 502,
      hasResponse: true,
      data: {
        detail: {
          message: "Realtime setup forbidden by provider.",
          errorCode: "provider_failure",
        },
      },
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
        message: "Realtime setup forbidden by provider.",
      });
      expect(mockedRouteStartTranscriptionSession).toHaveBeenCalledTimes(1);
      expect(mockedRouteAppendTranscriptionAudio).not.toHaveBeenCalled();
      expect(mockedRouteStopTranscriptionSession).not.toHaveBeenCalled();
      expect(mockedRouteCancelTranscriptionSession).not.toHaveBeenCalled();
      expect(mockedAddTemporaryNotification).not.toHaveBeenCalled();
      expect(closeMock).toHaveBeenCalledTimes(1);
    } finally {
      testWindow.AudioContext = originalAudioContext;
      if (!hadWindow) {
        delete withAudioContext.window;
      }
    }
  });

  it("preserves typed unsupported_model errors from provider start failures", async () => {
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
    try {
      await expect(
        transcribeChatAudioWithProfile(
          "profile-1",
          new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm" }),
        ),
      ).rejects.toMatchObject<ProviderTranscriptionError>({
        name: "ProviderTranscriptionError",
        code: "unsupported_model",
        message:
          "Realtime transcription is unavailable for this provider/model.",
      });
      expect(mockedRouteStartTranscriptionSession).toHaveBeenCalledTimes(1);
      expect(mockedRouteAppendTranscriptionAudio).not.toHaveBeenCalled();
      expect(mockedRouteStopTranscriptionSession).not.toHaveBeenCalled();
      expect(mockedRouteCancelTranscriptionSession).not.toHaveBeenCalled();
      expect(mockedAddTemporaryNotification).not.toHaveBeenCalled();
      expect(closeMock).toHaveBeenCalledTimes(1);
    } finally {
      testWindow.AudioContext = originalAudioContext;
      if (!hadWindow) {
        delete withAudioContext.window;
      }
    }
  });

  it("preserves typed profile_not_found errors from provider start failures", async () => {
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
      status: 404,
      hasResponse: true,
      data: {
        detail: {
          message: "Transcription profile missing-profile not found.",
          errorCode: "profile_not_found",
        },
      },
    });
    try {
      await expect(
        transcribeChatAudioWithProfile(
          "missing-profile",
          new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm" }),
        ),
      ).rejects.toMatchObject<ProviderTranscriptionError>({
        name: "ProviderTranscriptionError",
        code: "profile_not_found",
        message: "Transcription profile missing-profile not found.",
      });
      expect(mockedRouteStartTranscriptionSession).toHaveBeenCalledTimes(1);
      expect(mockedRouteAppendTranscriptionAudio).not.toHaveBeenCalled();
      expect(mockedRouteStopTranscriptionSession).not.toHaveBeenCalled();
      expect(mockedRouteCancelTranscriptionSession).not.toHaveBeenCalled();
      expect(mockedAddTemporaryNotification).not.toHaveBeenCalled();
      expect(closeMock).toHaveBeenCalledTimes(1);
    } finally {
      testWindow.AudioContext = originalAudioContext;
      if (!hadWindow) {
        delete withAudioContext.window;
      }
    }
  });

  it("throws when provider append returns no transcription delta", async () => {
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

  it("preserves typed invalid_request errors from provider append failures", async () => {
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
        sessionId: "session-append-invalid",
        resolvedTransportMode: "file",
        chunkMs: 1_200,
      },
    });
    mockedRouteAppendTranscriptionAudio.mockResolvedValue({
      status: 400,
      hasResponse: true,
      data: {
        detail: {
          message: "sampleRateHz cannot change within a transcription session.",
          errorCode: "invalid_request",
        },
      },
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
        code: "invalid_request",
        message: "sampleRateHz cannot change within a transcription session.",
      });
      expect(mockedRouteStopTranscriptionSession).not.toHaveBeenCalled();
      expect(mockedRouteCancelTranscriptionSession).toHaveBeenCalledTimes(1);
      expect(mockedAddTemporaryNotification).not.toHaveBeenCalled();
    } finally {
      testWindow.AudioContext = originalAudioContext;
      if (!hadWindow) {
        delete withAudioContext.window;
      }
    }
  });

  it("preserves typed invalid_request errors from provider stop failures", async () => {
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
        sessionId: "session-stop-invalid",
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
      status: 400,
      hasResponse: true,
      data: {
        detail: {
          message: "Realtime transcription requires mono PCM16 audio.",
          errorCode: "invalid_request",
        },
      },
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
        code: "invalid_request",
        message: "Realtime transcription requires mono PCM16 audio.",
      });
      expect(mockedRouteAppendTranscriptionAudio).toHaveBeenCalledTimes(1);
      expect(mockedRouteCancelTranscriptionSession).toHaveBeenCalledTimes(1);
      expect(mockedAddTemporaryNotification).not.toHaveBeenCalled();
    } finally {
      testWindow.AudioContext = originalAudioContext;
      if (!hadWindow) {
        delete withAudioContext.window;
      }
    }
  });

  it("preserves typed session_not_found errors from provider append failures", async () => {
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
        sessionId: "session-append-missing",
        resolvedTransportMode: "file",
        chunkMs: 1_200,
      },
    });
    mockedRouteAppendTranscriptionAudio.mockResolvedValue({
      status: 404,
      hasResponse: true,
      data: {
        detail: {
          message: "Transcription session session-append-missing not found.",
          errorCode: "session_not_found",
        },
      },
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
        code: "session_not_found",
        message: "Transcription session session-append-missing not found.",
      });
      expect(mockedRouteStopTranscriptionSession).not.toHaveBeenCalled();
      expect(mockedRouteCancelTranscriptionSession).toHaveBeenCalledTimes(1);
      expect(mockedAddTemporaryNotification).not.toHaveBeenCalled();
    } finally {
      testWindow.AudioContext = originalAudioContext;
      if (!hadWindow) {
        delete withAudioContext.window;
      }
    }
  });

  it("preserves typed session_not_found errors from provider stop failures", async () => {
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
        sessionId: "session-stop-missing",
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
      status: 404,
      hasResponse: true,
      data: {
        detail: {
          message: "Transcription session session-stop-missing not found.",
          errorCode: "session_not_found",
        },
      },
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
        code: "session_not_found",
        message: "Transcription session session-stop-missing not found.",
      });
      expect(mockedRouteAppendTranscriptionAudio).toHaveBeenCalledTimes(1);
      expect(mockedRouteCancelTranscriptionSession).toHaveBeenCalledTimes(1);
      expect(mockedAddTemporaryNotification).not.toHaveBeenCalled();
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
