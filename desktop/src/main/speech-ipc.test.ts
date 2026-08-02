import type { IpcMain, IpcMainInvokeEvent } from "electron";
import type { BackendClient, SpeechSynthesisRequest } from "@generated/backend";
import { ipcChannels, type IpcObserver } from "@shared/ipc";
import { describe, expect, test, vi } from "vitest";

import { registerSpeechIpcHandlers } from "./speech-ipc";

describe("speech IPC handlers", () => {
  test("forwards OpenAI speech operations and redacts sensitive observer results", async () => {
    const handlers = new Map<string, Parameters<IpcMain["handle"]>[1]>();
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
          voiceIds: ["marin", "cedar"],
        },
      })),
      readDirectorVoiceSelection: vi.fn(async () => ({
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
      synthesizeSpeech: vi.fn(async (request: SpeechSynthesisRequest) => ({
        audioBase64,
        format: "wav",
        mediaType: "audio/wav",
        resolvedVoiceId: request.resolvedVoiceId,
        source: request.source,
      })),
      updateDirectorVoiceSelection: vi.fn(async () => ({
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
    registerHandlers(handlers, backend, credentialCoordinator(), observer);

    const capabilities = await invoke(handlers, ipcChannels.speechReadCapabilities);
    const directorVoice = await invoke(handlers, ipcChannels.speechReadDirectorVoiceSelection);
    const narratorDefault = await invoke(handlers, ipcChannels.speechReadNarratorVoiceDefault);
    const updatedDirectorVoice = await invoke(
      handlers,
      ipcChannels.speechUpdateDirectorVoiceSelection,
      { requestedVoiceId: "cedar", selection: "exact" },
    );
    const updatedNarratorDefault = await invoke(
      handlers,
      ipcChannels.speechUpdateNarratorVoiceDefault,
      { requestedVoiceId: "ash", selection: "exact" },
    );
    const session = await invoke(handlers, ipcChannels.speechCreateTranscriptionSession, {
      provider: "openai",
    });
    const synthesisRequest = {
      provider: "openai" as const,
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

    expect(capabilities).toMatchObject({ providerStatus: "configured" });
    expect(directorVoice).toMatchObject({ resolvedVoiceId: "marin", selection: "exact" });
    expect(updatedDirectorVoice).toMatchObject({ resolvedVoiceId: "cedar", selection: "exact" });
    expect(narratorDefault).toMatchObject({ requestedVoiceId: null, selection: "auto_distinct" });
    expect(updatedNarratorDefault).toMatchObject({ requestedVoiceId: "ash", selection: "exact" });
    expect(session).toMatchObject({ clientSecret });
    expect(audio).toMatchObject({ audioBase64, resolvedVoiceId: "cedar" });
    expect(backend.createSpeechTranscriptionSession).toHaveBeenCalledWith({ provider: "openai" });
    expect(backend.synthesizeSpeech).toHaveBeenCalledWith(synthesisRequest, {
      signal: expect.any(AbortSignal),
    });
    const observedResults = observer.finished.mock.calls.map(([event]) => event.result);
    expect(JSON.stringify(observedResults)).not.toContain(clientSecret);
    expect(JSON.stringify(observedResults)).not.toContain(audioBase64);
    expect(observedResults).toContainEqual({
      redacted: true,
      type: "speech_transcription_session",
    });
    expect(observedResults).toContainEqual(
      expect.objectContaining({ resolvedVoiceId: "cedar", type: "speech_audio" }),
    );
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
    registerHandlers(handlers, backend, credentialCoordinator());
    const request = {
      operationId: "speech-cancel",
      request: {
        provider: "openai",
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

  test("routes credential management through the desktop coordinator", async () => {
    const handlers = new Map<string, Parameters<IpcMain["handle"]>[1]>();
    const activeRuntimeBackend = {
      clearDesktopSpeechCredential: vi.fn(() => {
        throw new Error("active runtime credential clear must not be called");
      }),
      loadDesktopSpeechCredential: vi.fn(() => {
        throw new Error("active runtime credential load must not be called");
      }),
      validateDesktopSpeechCredential: vi.fn(() => {
        throw new Error("active runtime credential validation must not be called");
      }),
    } as unknown as BackendClient;
    const coordinator = credentialCoordinator();
    registerHandlers(handlers, activeRuntimeBackend, coordinator);

    const read = await invoke(handlers, ipcChannels.speechReadCredentialSettings, {
      provider: "openai",
    });
    const saved = await invoke(handlers, ipcChannels.speechSaveCredential, {
      provider: "openai",
      apiKey: " ipc-whitespace-candidate ",
    });
    const removed = await invoke(handlers, ipcChannels.speechRemoveCredential, {
      provider: "openai",
    });

    expect(read).toEqual({ provider: "openai", status: "not_configured" });
    expect(saved).toEqual({ provider: "openai", status: "configured" });
    expect(removed).toEqual({ provider: "openai", status: "not_configured" });
    expect(coordinator.saveCredential).toHaveBeenCalledWith({
      provider: "openai",
      apiKey: " ipc-whitespace-candidate ",
    });
    expect(activeRuntimeBackend.validateDesktopSpeechCredential).not.toHaveBeenCalled();
    expect(activeRuntimeBackend.loadDesktopSpeechCredential).not.toHaveBeenCalled();
    expect(activeRuntimeBackend.clearDesktopSpeechCredential).not.toHaveBeenCalled();
  });

  test("rejects removed and malformed provider requests before reaching dependencies", async () => {
    const handlers = new Map<string, Parameters<IpcMain["handle"]>[1]>();
    const coordinator = credentialCoordinator();
    const backend = { synthesizeSpeech: vi.fn() } as unknown as BackendClient;
    registerHandlers(handlers, backend, coordinator);

    const settings = await invoke(handlers, ipcChannels.speechSaveCredential, {
      provider: "unsupported",
      apiKey: "sk-setta-ipc-credential",
    });
    const synthesis = invoke(handlers, ipcChannels.speechSynthesize, {
      operationId: "removed-provider",
      request: {
        provider: "unsupported",
        resolvedVoiceId: "marin",
        source: { conversationId: null, eventId: "answer", speaker: "director" },
      },
    });

    expect(settings).toEqual({
      message: "Speech credential save request is invalid.",
      operation: "save",
      status: "failed",
    });
    await expect(synthesis).rejects.toThrow("SpeechSynthesisRequest.provider");
    expect(coordinator.saveCredential).not.toHaveBeenCalled();
    expect(backend.synthesizeSpeech).not.toHaveBeenCalled();
  });
});

function registerHandlers(
  handlers: Map<string, Parameters<IpcMain["handle"]>[1]>,
  backend: BackendClient,
  coordinator: ReturnType<typeof credentialCoordinator>,
  ipcObserver?: IpcObserver,
): void {
  registerSpeechIpcHandlers({
    ipcMain: {
      handle: (channel, handler) => {
        handlers.set(channel, handler);
      },
    } as Pick<IpcMain, "handle">,
    ipcObserver,
    requireBackendClient: () => backend,
    requireSpeechCredentialCoordinator: () => coordinator,
  });
}

function observerSpies() {
  return {
    failed: vi.fn<IpcObserver["failed"]>(),
    finished: vi.fn<IpcObserver["finished"]>(),
    started: vi.fn<IpcObserver["started"]>(),
  };
}

function credentialCoordinator() {
  return {
    readCredentialSettings: vi.fn(async (request: { provider: unknown }) => {
      expect(request).toEqual({ provider: "openai" });
      return {
        provider: "openai" as const,
        status: "not_configured" as const,
      };
    }),
    removeCredential: vi.fn(async (request: { provider: unknown }) => {
      expect(request).toEqual({ provider: "openai" });
      return {
        provider: "openai" as const,
        status: "not_configured" as const,
      };
    }),
    saveCredential: vi.fn(async () => ({
      provider: "openai" as const,
      status: "configured" as const,
    })),
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
