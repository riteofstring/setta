import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { speechVoiceIDValues, type BackendClient } from "@generated/backend";
import { ipcChannels, type IpcObserver } from "@shared/ipc";
import { describe, expect, test, vi } from "vitest";

import { registerSpeechIpcHandlers } from "./speech-ipc";

describe("speech IPC handlers", () => {
  test("forwards speech capabilities and redacts transcription credentials", async () => {
    const handlers = new Map<string, Parameters<IpcMain["handle"]>[1]>();
    const ipcMain = {
      handle: (channel, handler) => {
        handlers.set(channel, handler);
      },
    } as Pick<IpcMain, "handle">;
    const clientSecret = "ek_speech_ipc_secret";
    const audioBase64 = "UklGRiQAAABXQVZF";
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
        transcriptionModel: "gpt-realtime-whisper",
        voiceCatalog: {
          provider: "openai",
          version: "test",
          voiceIds: [...speechVoiceIDValues],
        },
      })),
      readMasterVoiceSelection: vi.fn(async () => ({
        requestedVoiceId: "marin",
        resolvedVoiceId: "marin",
        selection: "exact",
        updatedAt: "2026-07-12T18:00:00Z",
      })),
      readNarratorVoiceDefault: vi.fn(async () => ({
        requestedVoiceId: null,
        selection: "auto_distinct" as const,
        updatedAt: "2026-07-12T18:00:00Z",
      })),
      synthesizeSpeech: vi.fn(async (request) => ({
        audioBase64,
        format: "wav",
        mediaType: "audio/wav",
        resolvedVoiceId: request.resolvedVoiceId,
        source: request.source,
      })),
      updateMasterVoiceSelection: vi.fn(async () => ({
        requestedVoiceId: "cedar",
        resolvedVoiceId: "cedar",
        selection: "exact",
        updatedAt: "2026-07-12T18:00:01Z",
      })),
      updateNarratorVoiceDefault: vi.fn(async () => ({
        requestedVoiceId: "ash" as const,
        selection: "exact" as const,
        updatedAt: "2026-07-12T18:00:01Z",
      })),
    } as unknown as BackendClient;
    const observer = observerSpies();

    registerSpeechIpcHandlers({
      ipcMain,
      ipcObserver: observer,
      requireBackendClient: () => backend,
    });

    const capabilities = await invoke(handlers, ipcChannels.speechReadCapabilities);
    const masterVoice = await invoke(handlers, ipcChannels.speechReadMasterVoiceSelection);
    const narratorDefault = await invoke(handlers, ipcChannels.speechReadNarratorVoiceDefault);
    const updatedMasterVoice = await invoke(
      handlers,
      ipcChannels.speechUpdateMasterVoiceSelection,
      { requestedVoiceId: "cedar", selection: "exact" },
    );
    const updatedNarratorDefault = await invoke(
      handlers,
      ipcChannels.speechUpdateNarratorVoiceDefault,
      { requestedVoiceId: "ash", selection: "exact" },
    );
    const session = await invoke(handlers, ipcChannels.speechCreateTranscriptionSession);
    const synthesisRequest = {
      resolvedVoiceId: "cedar" as const,
      source: {
        conversationId: "conversation-speech",
        eventId: "status-reply-speech",
        speaker: "narrator" as const,
      },
    };
    const audio = await invoke(handlers, ipcChannels.speechSynthesize, {
      operationId: "speech-operation",
      request: synthesisRequest,
    });

    expect(backend.createSpeechTranscriptionSession).toHaveBeenCalledWith({});
    expect(capabilities).toMatchObject({ providerStatus: "configured" });
    expect(masterVoice).toMatchObject({ resolvedVoiceId: "marin", selection: "exact" });
    expect(updatedMasterVoice).toMatchObject({ resolvedVoiceId: "cedar", selection: "exact" });
    expect(narratorDefault).toMatchObject({ requestedVoiceId: null, selection: "auto_distinct" });
    expect(updatedNarratorDefault).toMatchObject({ requestedVoiceId: "ash", selection: "exact" });
    expect(session).toMatchObject({ clientSecret });
    expect(audio).toMatchObject({ audioBase64, resolvedVoiceId: "cedar" });
    expect(backend.synthesizeSpeech).toHaveBeenCalledWith(synthesisRequest, {
      signal: expect.any(AbortSignal),
    });
    expect(observer.finished).toHaveBeenCalledTimes(7);
    const observedResults = observer.finished.mock.calls.map(([event]) => event.result);
    expect(observedResults).toEqual([
      capabilities,
      masterVoice,
      narratorDefault,
      updatedMasterVoice,
      updatedNarratorDefault,
      { redacted: true, type: "speech_transcription_session" },
      {
        format: "wav",
        mediaType: "audio/wav",
        resolvedVoiceId: "cedar",
        source: synthesisRequest.source,
        type: "speech_audio",
      },
    ]);
    expect(JSON.stringify(observer.finished.mock.calls)).not.toContain(clientSecret);
    expect(JSON.stringify(observer.finished.mock.calls)).not.toContain(audioBase64);
  });

  test("cancels an active synthesis operation through its backend abort signal", async () => {
    const handlers = new Map<string, Parameters<IpcMain["handle"]>[1]>();
    const backend = {
      synthesizeSpeech: vi.fn(
        async (_request: unknown, options: { signal?: AbortSignal } | undefined) =>
          new Promise((_resolve, reject) => {
            options?.signal?.addEventListener(
              "abort",
              () => reject(new DOMException("aborted", "AbortError")),
              { once: true },
            );
          }),
      ),
    } as unknown as BackendClient;
    registerSpeechIpcHandlers({
      ipcMain: {
        handle: (channel, handler) => {
          handlers.set(channel, handler);
        },
      } as Pick<IpcMain, "handle">,
      requireBackendClient: () => backend,
    });
    const request = {
      operationId: "speech-cancel",
      request: {
        resolvedVoiceId: "cedar",
        source: {
          conversationId: "conversation-speech",
          eventId: "status-reply-speech",
          speaker: "narrator",
        },
      },
    };

    const synthesis = invoke(handlers, ipcChannels.speechSynthesize, request);
    await invoke(handlers, ipcChannels.speechCancelSynthesis, request.operationId);

    await expect(synthesis).rejects.toMatchObject({ name: "AbortError" });
    expect(backend.synthesizeSpeech).toHaveBeenCalledWith(request.request, {
      signal: expect.objectContaining({ aborted: true }),
    });
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
