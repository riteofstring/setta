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
  resolveProviderTranscriptionChunkSampleCount,
  startTranscriptionSession,
  stopTranscriptionSession,
} from "./aiTranscriptionSessions";
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

describe("aiTranscriptionSessions", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("starts a transcription session", async () => {
    // Session transport should pass through the selected profile and language.
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
    // Appends should send the PCM payload in the backend's base64 transport format.
    mockedRouteAppendTranscriptionAudio.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: {
        appendText: "hello",
        fullText: "hello",
        isFinal: false,
      },
    });

    const response = await appendTranscriptionAudio(
      "session-1",
      new Uint8Array([1, 2, 3, 4]).buffer,
      24_000,
      1,
    );

    expect(response).toEqual({
      appendText: "hello",
      fullText: "hello",
      isFinal: false,
    });
    const [payload] = mockedRouteAppendTranscriptionAudio.mock.calls[0] ?? [];
    expect(payload).toMatchObject({
      sessionId: "session-1",
      sampleRateHz: 24_000,
      channels: 1,
      audioPcm16Base64: "AQIDBA==",
    });
  });

  it("returns the final delta when stopping a session", async () => {
    // Stop should surface the provider's final transcript delta without reshaping it.
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
    // Cancellation is treated as best-effort transport cleanup.
    mockedRouteCancelTranscriptionSession.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: { ok: true },
    });

    expect(await cancelTranscriptionSession("session-1")).toBe(true);
    expect(mockedRouteCancelTranscriptionSession).toHaveBeenCalledWith({
      sessionId: "session-1",
    });
  });

  it("surfaces append errors through the notification path", async () => {
    // Non-throwing transport calls should still warn the user on provider failures.
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
    // Silent retries should opt out of warning toasts.
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

  it("throws a structured provider error when requested", async () => {
    // Dictation orchestration relies on the transport layer preserving provider error codes.
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

  it("derives realtime chunk sizes from chunkMs and payload caps", () => {
    // Realtime uploads should respect both provider chunk timing and the binary payload cap.
    expect(
      resolveProviderTranscriptionChunkSampleCount({
        session: {
          sessionId: "session-1",
          resolvedTransportMode: "realtime",
          chunkMs: 125,
        },
        sampleRateHz: 24_000,
        channels: 1,
      }),
    ).toBe(3_000);
  });
});
