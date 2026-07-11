import type { IpcMain, IpcMainInvokeEvent } from "electron";
import type { BackendClient } from "@generated/backend";
import { ipcChannels, type IpcObserver } from "@shared/ipc";
import { describe, expect, test, vi } from "vitest";

import { registerSpeechIpcHandlers } from "./speech-ipc";

describe("speech IPC handlers", () => {
  test("forwards generated speech operations while redacting sensitive recorded results", async () => {
    const handlers = new Map<string, Parameters<IpcMain["handle"]>[1]>();
    const ipcMain = {
      handle: (channel, handler) => {
        handlers.set(channel, handler);
      },
    } as Pick<IpcMain, "handle">;
    const clientSecret = "ek_speech_ipc_secret";
    const audioBase64 = "UklGRiQAAABXQVZFZm10IA==";
    const backend = {
      createSpeechTranscriptionSession: vi.fn(async () => ({
        clientSecret,
        expiresAt: "2026-07-10T18:10:00Z",
        maximumRecordingSeconds: 120,
        maximumTranscriptCharacters: 8000,
        transcriptionDelay: "medium",
        transcriptionModel: "gpt-realtime-whisper",
        webRTCURL: "https://api.openai.com/v1/realtime/calls",
      })),
      readSpeechCapabilities: vi.fn(async () => ({
        aiVoiceDisclosure: "This voice is AI-generated.",
        maximumRecordingSeconds: 120,
        maximumSynthesisCharacters: 4096,
        maximumTranscriptCharacters: 8000,
        providerStatus: "configured",
        synthesisModel: "gpt-4o-mini-tts",
        synthesisVoice: "marin",
        transcriptionModel: "gpt-realtime-whisper",
      })),
      synthesizeEasyRunHighlight: vi.fn(async () => ({
        audioBase64,
        format: "wav",
        mediaType: "audio/wav",
        sourceId: "highlight_api",
      })),
      synthesizeEasyRunSummary: vi.fn(async () => ({
        audioBase64,
        format: "wav",
        mediaType: "audio/wav",
        sourceId: "easy_run_api:summary",
      })),
    } as unknown as BackendClient;
    const observer = observerSpies();

    registerSpeechIpcHandlers({
      ipcMain,
      ipcObserver: observer,
      requireBackendClient: () => backend,
    });

    const capabilities = await invoke(handlers, ipcChannels.speechReadCapabilities);
    const session = await invoke(handlers, ipcChannels.speechCreateTranscriptionSession, {
      workspaceId: "workspace_api",
    });
    const summary = await invoke(handlers, ipcChannels.speechSynthesizeEasyRunSummary, {
      easyRunId: "easy_run_api",
      workspaceId: "workspace_api",
    });
    const highlight = await invoke(handlers, ipcChannels.speechSynthesizeEasyRunHighlight, {
      easyRunId: "easy_run_api",
      highlightId: "highlight_api",
      workspaceId: "workspace_api",
    });

    expect(capabilities).toMatchObject({ providerStatus: "configured" });
    expect(session).toMatchObject({ clientSecret });
    expect(summary).toMatchObject({ audioBase64, sourceId: "easy_run_api:summary" });
    expect(highlight).toMatchObject({ audioBase64, sourceId: "highlight_api" });
    expect(observer.finished).toHaveBeenCalledTimes(4);
    const observedResults = observer.finished.mock.calls.map(([event]) => event.result);
    expect(observedResults).toEqual([
      capabilities,
      { redacted: true, type: "speech_transcription_session" },
      { redacted: true, type: "speech_audio" },
      { redacted: true, type: "speech_audio" },
    ]);
    expect(JSON.stringify(observer.finished.mock.calls)).not.toContain(clientSecret);
    expect(JSON.stringify(observer.finished.mock.calls)).not.toContain(audioBase64);
  });
});

function observerSpies() {
  return {
    failed: vi.fn<IpcObserver["failed"]>(),
    finished: vi.fn<IpcObserver["finished"]>(),
    started: vi.fn<IpcObserver["started"]>(),
  };
}

async function invoke(
  handlers: Map<string, Parameters<IpcMain["handle"]>[1]>,
  channel: string,
  request?: unknown,
) {
  const handler = handlers.get(channel);
  if (!handler) {
    throw new Error(`handler ${channel} was not registered`);
  }
  return request === undefined
    ? handler({} as IpcMainInvokeEvent)
    : handler({} as IpcMainInvokeEvent, request);
}
