import { route_transcribe_chat_audio } from "utils/generatedEndpoints";
import { SettaNotificationTypeEnum } from "utils/generatedTypes";
import { afterEach, describe, expect, it, vi } from "vitest";
import { transcribeChatAudio } from "./ai";
import { addTemporaryNotification } from "./notifications";

vi.mock("utils/generatedEndpoints", async () => {
  const actual = await vi.importActual<
    typeof import("utils/generatedEndpoints")
  >("utils/generatedEndpoints");
  return {
    ...actual,
    route_transcribe_chat_audio: vi.fn(),
  };
});

vi.mock("./notifications", () => ({
  addTemporaryNotification: vi.fn(),
}));

const mockedRouteTranscribeChatAudio = vi.mocked(route_transcribe_chat_audio);
const mockedAddTemporaryNotification = vi.mocked(addTemporaryNotification);

describe("transcribeChatAudio", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("uploads dictation as multipart form-data", async () => {
    mockedRouteTranscribeChatAudio.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: { text: "  transcribed text  " },
    });

    const audioBlob = new Blob(["hello"], { type: "audio/webm" });
    const text = await transcribeChatAudio("transcription-1", audioBlob);

    expect(text).toBe("transcribed text");
    expect(mockedRouteTranscribeChatAudio).toHaveBeenCalledTimes(1);
    const [form] = mockedRouteTranscribeChatAudio.mock.calls[0] ?? [];
    expect(form).toBeInstanceOf(FormData);
    expect((form as FormData).get("transcriptionProfileId")).toBe(
      "transcription-1",
    );
    const uploadedFile = (form as FormData).get("file");
    expect(uploadedFile).toBeInstanceOf(File);
    expect((uploadedFile as File).name).toBe("dictation.webm");
    expect((uploadedFile as File).type).toBe("audio/webm");
  });

  it("derives upload filename extension from the recorded mime type", async () => {
    mockedRouteTranscribeChatAudio.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: { text: "transcribed text" },
    });

    const audioBlob = new Blob(["hello"], { type: "audio/mp4" });
    await transcribeChatAudio("transcription-1", audioBlob);

    expect(mockedRouteTranscribeChatAudio).toHaveBeenCalledTimes(1);
    const [form] = mockedRouteTranscribeChatAudio.mock.calls[0] ?? [];
    const uploadedFile = (form as FormData).get("file");
    expect(uploadedFile).toBeInstanceOf(File);
    expect((uploadedFile as File).name).toBe("dictation.m4a");
    expect((uploadedFile as File).type).toBe("audio/mp4");
  });

  it("does not enforce a stale client-side audio size cap", async () => {
    mockedRouteTranscribeChatAudio.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: { text: "oversized accepted by server policy" },
    });
    const oversizedBlob = new Blob([new Uint8Array(10 * 1024 * 1024 + 1)], {
      type: "audio/webm",
    });

    const text = await transcribeChatAudio("transcription-1", oversizedBlob);

    expect(text).toBe("oversized accepted by server policy");
    expect(mockedRouteTranscribeChatAudio).toHaveBeenCalledTimes(1);
    expect(mockedAddTemporaryNotification).not.toHaveBeenCalled();
  });

  it("shows backend transcription errors", async () => {
    mockedRouteTranscribeChatAudio.mockResolvedValue({
      status: 413,
      hasResponse: true,
      data: { detail: "Audio payload is too large." },
    });

    const text = await transcribeChatAudio(
      "transcription-1",
      new Blob(["hello"], { type: "audio/webm" }),
    );

    expect(text).toBeNull();
    expect(mockedAddTemporaryNotification).toHaveBeenCalledWith(
      "Audio payload is too large.",
      SettaNotificationTypeEnum.warning,
    );
  });
});
