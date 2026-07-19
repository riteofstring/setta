import type { IpcMain, IpcMainInvokeEvent } from "electron";
import type { BackendClient } from "@generated/backend";
import { ipcChannels, type IpcObserver } from "@shared/ipc";
import type { SpeechProviderSelectionSettings } from "@shared/speech-ipc";
import { describe, expect, test, vi } from "vitest";

import { registerSpeechIpcHandlers } from "./speech-ipc";
import { LocalMacOSVoiceHelperCommandError } from "./local-macos-voice-helper";

const localWAVAudioBase64 = "UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQIAAAAAAA==";

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
          voiceIds: ["marin", "cedar"],
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
      requireLocalMacOSVoiceHelper: () => localMacOSVoiceHelper(),
      requireBackendClient: () => backend,
      requireSpeechCredentialCoordinator: () => credentialCoordinator(),
    });

    const capabilities = await invoke(handlers, ipcChannels.speechReadCapabilities);
    const localHealth = await invoke(handlers, ipcChannels.speechReadLocalMacOSVoiceHealth);
    const localVoices = await invoke(handlers, ipcChannels.speechListLocalMacOSVoices);
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

    expect(backend.createSpeechTranscriptionSession).toHaveBeenCalledWith({ provider: "openai" });
    expect(capabilities).toMatchObject({ providerStatus: "configured" });
    expect(localHealth).toEqual({
      helperPath: null,
      message: "The local macOS voice helper is not installed.",
      provider: "local_macos",
      status: "helper_unavailable",
    });
    expect(localVoices).toEqual({
      provider: "local_macos",
      version: "fixture-local-voices",
      voiceIds: ["com.apple.voice.compact.en-US.Samantha", "com.apple.voice.compact.en-US.Alex"],
    });
    expect(masterVoice).toMatchObject({ resolvedVoiceId: "marin", selection: "exact" });
    expect(updatedMasterVoice).toMatchObject({ resolvedVoiceId: "cedar", selection: "exact" });
    expect(narratorDefault).toMatchObject({ requestedVoiceId: null, selection: "auto_distinct" });
    expect(updatedNarratorDefault).toMatchObject({ requestedVoiceId: "ash", selection: "exact" });
    expect(session).toMatchObject({ clientSecret });
    expect(audio).toMatchObject({ audioBase64, resolvedVoiceId: "cedar" });
    expect(backend.synthesizeSpeech).toHaveBeenCalledWith(synthesisRequest, {
      signal: expect.any(AbortSignal),
    });
    expect(observer.finished).toHaveBeenCalledTimes(9);
    const observedResults = observer.finished.mock.calls.map(([event]) => event.result);
    expect(observedResults).toEqual([
      capabilities,
      localHealth,
      localVoices,
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

  test("routes provider selection through the desktop store and publishes changes", async () => {
    const handlers = new Map<string, Parameters<IpcMain["handle"]>[1]>();
    const store = providerSelectionStore();
    const changed = vi.fn();

    registerSpeechIpcHandlers({
      ipcMain: {
        handle: (channel, handler) => {
          handlers.set(channel, handler);
        },
      } as Pick<IpcMain, "handle">,
      onProviderSelectionChanged: changed,
      requireLocalMacOSVoiceHelper: () => localMacOSVoiceHelper(),
      requireBackendClient: () => ({}) as BackendClient,
      requireSpeechCredentialCoordinator: () => credentialCoordinator(),
      requireSpeechProviderSelectionStore: () => store,
    });

    const initial = await invoke(handlers, ipcChannels.speechReadProviderSelection);
    const updated = await invoke(handlers, ipcChannels.speechUpdateProviderSelection, {
      provider: "openai",
    });

    expect(initial).toEqual({
      defaultProvider: "local_macos",
      provider: "local_macos",
      supportedProviders: ["local_macos", "openai"],
    });
    expect(updated).toEqual({
      defaultProvider: "local_macos",
      provider: "openai",
      supportedProviders: ["local_macos", "openai"],
    });
    expect(store.update).toHaveBeenCalledWith("openai");
    expect(changed).toHaveBeenCalledWith(updated);
  });

  test("routes local macOS capture lifecycle through the helper", async () => {
    const handlers = new Map<string, Parameters<IpcMain["handle"]>[1]>();
    const helper = localMacOSVoiceHelper();
    registerSpeechIpcHandlers({
      ipcMain: {
        handle: (channel, handler) => {
          handlers.set(channel, handler);
        },
      } as Pick<IpcMain, "handle">,
      requireLocalMacOSVoiceHelper: () => helper,
      requireBackendClient: () => ({}) as BackendClient,
      requireSpeechCredentialCoordinator: () => credentialCoordinator(),
    });

    const started = await invoke(handlers, ipcChannels.speechStartLocalMacOSVoiceCapture, {
      captureSessionId: "capture_local",
      maximumRecordingSeconds: 120,
      maximumTranscriptCharacters: 8000,
    });
    const finished = await invoke(handlers, ipcChannels.speechFinishLocalMacOSVoiceCapture, {
      captureSessionId: "capture_local",
    });
    const canceled = await invoke(handlers, ipcChannels.speechCancelLocalMacOSVoiceCapture, {
      captureSessionId: "capture_local",
    });
    const secondStarted = await invoke(handlers, ipcChannels.speechStartLocalMacOSVoiceCapture, {
      captureSessionId: "capture_cancel",
      maximumRecordingSeconds: 120,
      maximumTranscriptCharacters: 8000,
    });
    const secondCanceled = await invoke(handlers, ipcChannels.speechCancelLocalMacOSVoiceCapture, {
      captureSessionId: "capture_cancel",
    });

    expect(started).toEqual({ captureSessionId: "capture_local", status: "started" });
    expect(finished).toEqual({
      captureSessionId: "capture_local",
      status: "completed",
      transcript: "Local helper transcript.",
    });
    expect(canceled).toEqual({
      failure: {
        code: "invalid_session",
        message: "Local macOS voice capture session is not active.",
      },
      status: "failed",
    });
    expect(secondStarted).toEqual({ captureSessionId: "capture_cancel", status: "started" });
    expect(secondCanceled).toEqual({ captureSessionId: "capture_cancel", status: "canceled" });
    expect(helper.startCapture).toHaveBeenNthCalledWith(1, {
      maximumRecordingSeconds: 120,
      maximumTranscriptCharacters: 8000,
      sessionId: "capture_local",
    });
    expect(helper.startCapture).toHaveBeenNthCalledWith(2, {
      maximumRecordingSeconds: 120,
      maximumTranscriptCharacters: 8000,
      sessionId: "capture_cancel",
    });
    expect(helper.finishCapture).toHaveBeenCalledWith({ sessionId: "capture_local" });
    expect(helper.cancelCapture).toHaveBeenCalledWith({ sessionId: "capture_cancel" });
  });

  test("rejects empty and oversized local macOS transcripts before routing", async () => {
    const handlers = new Map<string, Parameters<IpcMain["handle"]>[1]>();
    const helper = localMacOSVoiceHelper();
    helper.finishCapture
      .mockResolvedValueOnce({
        sessionId: "capture_empty",
        transcript: "   ",
      })
      .mockResolvedValueOnce({
        sessionId: "capture_large",
        transcript: "Local helper transcript.",
      });
    registerSpeechIpcHandlers({
      ipcMain: {
        handle: (channel, handler) => {
          handlers.set(channel, handler);
        },
      } as Pick<IpcMain, "handle">,
      requireLocalMacOSVoiceHelper: () => helper,
      requireBackendClient: () => ({}) as BackendClient,
      requireSpeechCredentialCoordinator: () => credentialCoordinator(),
    });

    await invoke(handlers, ipcChannels.speechStartLocalMacOSVoiceCapture, {
      captureSessionId: "capture_empty",
      maximumRecordingSeconds: 120,
      maximumTranscriptCharacters: 8000,
    });
    const empty = await invoke(handlers, ipcChannels.speechFinishLocalMacOSVoiceCapture, {
      captureSessionId: "capture_empty",
    });
    await invoke(handlers, ipcChannels.speechStartLocalMacOSVoiceCapture, {
      captureSessionId: "capture_large",
      maximumRecordingSeconds: 120,
      maximumTranscriptCharacters: 8,
    });
    const oversized = await invoke(handlers, ipcChannels.speechFinishLocalMacOSVoiceCapture, {
      captureSessionId: "capture_large",
    });

    expect(empty).toEqual({
      failure: {
        code: "no_speech",
        message: "No speech was detected. Please try again.",
      },
      status: "failed",
    });
    expect(oversized).toEqual({
      failure: {
        code: "transcript_too_large",
        message: "Local macOS voice transcript exceeded the maximum allowed length.",
      },
      status: "failed",
    });
  });

  test("maps local macOS helper duration-limit failures while clearing the capture session", async () => {
    const handlers = new Map<string, Parameters<IpcMain["handle"]>[1]>();
    const helper = localMacOSVoiceHelper();
    helper.finishCapture.mockRejectedValueOnce(
      new LocalMacOSVoiceHelperCommandError(
        "duration_limit",
        "Local macOS voice reached the recording limit.",
      ),
    );
    registerSpeechIpcHandlers({
      ipcMain: {
        handle: (channel, handler) => {
          handlers.set(channel, handler);
        },
      } as Pick<IpcMain, "handle">,
      requireLocalMacOSVoiceHelper: () => helper,
      requireBackendClient: () => ({}) as BackendClient,
      requireSpeechCredentialCoordinator: () => credentialCoordinator(),
    });

    await invoke(handlers, ipcChannels.speechStartLocalMacOSVoiceCapture, {
      captureSessionId: "capture_duration_limit",
      maximumRecordingSeconds: 120,
      maximumTranscriptCharacters: 8000,
    });
    const limited = await invoke(handlers, ipcChannels.speechFinishLocalMacOSVoiceCapture, {
      captureSessionId: "capture_duration_limit",
    });
    const stale = await invoke(handlers, ipcChannels.speechFinishLocalMacOSVoiceCapture, {
      captureSessionId: "capture_duration_limit",
    });

    expect(limited).toEqual({
      failure: {
        code: "duration_limit",
        message: "Local macOS voice reached the recording limit.",
      },
      status: "failed",
    });
    expect(stale).toEqual({
      failure: {
        code: "invalid_session",
        message: "Local macOS voice capture session is not active.",
      },
      status: "failed",
    });
  });

  test("maps local macOS microphone revocation while clearing the capture session", async () => {
    const handlers = new Map<string, Parameters<IpcMain["handle"]>[1]>();
    const helper = localMacOSVoiceHelper();
    helper.finishCapture.mockRejectedValueOnce(
      new LocalMacOSVoiceHelperCommandError(
        "microphone_denied",
        "Microphone access was revoked during capture.",
      ),
    );
    registerSpeechIpcHandlers({
      ipcMain: {
        handle: (channel, handler) => {
          handlers.set(channel, handler);
        },
      } as Pick<IpcMain, "handle">,
      requireLocalMacOSVoiceHelper: () => helper,
      requireBackendClient: () => ({}) as BackendClient,
      requireSpeechCredentialCoordinator: () => credentialCoordinator(),
    });

    await invoke(handlers, ipcChannels.speechStartLocalMacOSVoiceCapture, {
      captureSessionId: "capture_microphone_revoked",
      maximumRecordingSeconds: 120,
      maximumTranscriptCharacters: 8000,
    });
    const revoked = await invoke(handlers, ipcChannels.speechFinishLocalMacOSVoiceCapture, {
      captureSessionId: "capture_microphone_revoked",
    });
    const stale = await invoke(handlers, ipcChannels.speechFinishLocalMacOSVoiceCapture, {
      captureSessionId: "capture_microphone_revoked",
    });

    expect(revoked).toEqual({
      failure: {
        code: "microphone_permission_denied",
        message: "Microphone access was revoked during capture.",
      },
      status: "failed",
    });
    expect(stale).toEqual({
      failure: {
        code: "invalid_session",
        message: "Local macOS voice capture session is not active.",
      },
      status: "failed",
    });
  });

  test("routes local macOS synthesis through backend source resolution and helper", async () => {
    const handlers = new Map<string, Parameters<IpcMain["handle"]>[1]>();
    const source = {
      conversationId: null,
      eventId: "master-answer-speech",
      speaker: "master" as const,
    };
    const backend = {
      resolveSpeechSynthesisInput: vi.fn(async (request) => ({
        provider: "local_macos" as const,
        rate: 1.2,
        resolvedVoiceId: request.resolvedVoiceId,
        source: request.source,
        text: "Local helper speech.",
      })),
    } as unknown as BackendClient;
    const helper = localMacOSVoiceHelper();
    registerSpeechIpcHandlers({
      ipcMain: {
        handle: (channel, handler) => {
          handlers.set(channel, handler);
        },
      } as Pick<IpcMain, "handle">,
      requireLocalMacOSVoiceHelper: () => helper,
      requireBackendClient: () => backend,
      requireSpeechCredentialCoordinator: () => credentialCoordinator(),
    });
    const request = {
      provider: "local_macos" as const,
      resolvedVoiceId: "marin" as const,
      source,
    };

    const audio = await invoke(handlers, ipcChannels.speechSynthesize, {
      operationId: "speech-local",
      request,
    });

    expect(backend.resolveSpeechSynthesisInput).toHaveBeenCalledWith(request, {
      signal: expect.any(AbortSignal),
    });
    expect(helper.synthesizeSpeech).toHaveBeenCalledWith({
      operationId: "speech-local",
      rate: 1.2,
      text: "Local helper speech.",
      voiceId: "com.apple.voice.compact.en-US.Samantha",
    });
    expect(audio).toEqual({
      audioBase64: localWAVAudioBase64,
      format: "wav",
      mediaType: "audio/wav",
      resolvedVoiceId: "marin",
      source,
    });
  });

  test("rejects malformed local macOS synthesis audio before playback", async () => {
    const handlers = new Map<string, Parameters<IpcMain["handle"]>[1]>();
    const source = {
      conversationId: null,
      eventId: "master-answer-speech",
      speaker: "master" as const,
    };
    const backend = {
      resolveSpeechSynthesisInput: vi.fn(async (request) => ({
        provider: "local_macos" as const,
        rate: 1.2,
        resolvedVoiceId: request.resolvedVoiceId,
        source: request.source,
        text: "Local helper speech.",
      })),
    } as unknown as BackendClient;
    const helper = localMacOSVoiceHelper();
    helper.synthesizeSpeech.mockResolvedValueOnce({
      audioBase64: "bm90IHdhdmUgYXVkaW8=",
      format: "wav",
      mediaType: "audio/wav",
      operationId: "speech-local-malformed",
    });
    registerSpeechIpcHandlers({
      ipcMain: {
        handle: (channel, handler) => {
          handlers.set(channel, handler);
        },
      } as Pick<IpcMain, "handle">,
      requireLocalMacOSVoiceHelper: () => helper,
      requireBackendClient: () => backend,
      requireSpeechCredentialCoordinator: () => credentialCoordinator(),
    });

    await expect(
      invoke(handlers, ipcChannels.speechSynthesize, {
        operationId: "speech-local-malformed",
        request: {
          provider: "local_macos",
          resolvedVoiceId: "marin",
          source,
        },
      }),
    ).rejects.toThrow("Local macOS speech output returned invalid audio.");
  });

  test("returns product-level failures for invalid local capture requests", async () => {
    const handlers = new Map<string, Parameters<IpcMain["handle"]>[1]>();
    const helper = localMacOSVoiceHelper();
    registerSpeechIpcHandlers({
      ipcMain: {
        handle: (channel, handler) => {
          handlers.set(channel, handler);
        },
      } as Pick<IpcMain, "handle">,
      requireLocalMacOSVoiceHelper: () => helper,
      requireBackendClient: () => ({}) as BackendClient,
      requireSpeechCredentialCoordinator: () => credentialCoordinator(),
    });

    const result = await invoke(handlers, ipcChannels.speechStartLocalMacOSVoiceCapture, {
      captureSessionId: " capture_local ",
      maximumRecordingSeconds: 120,
      maximumTranscriptCharacters: 8000,
    });

    expect(result).toEqual({
      failure: {
        code: "session_failed",
        message: "Local macOS voice capture start request is invalid.",
      },
      status: "failed",
    });
    expect(helper.startCapture).not.toHaveBeenCalled();
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
      requireLocalMacOSVoiceHelper: () => localMacOSVoiceHelper(),
      requireBackendClient: () => backend,
      requireSpeechCredentialCoordinator: () => credentialCoordinator(),
    });
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

  test("cancels an active local macOS synthesis operation through the helper", async () => {
    const handlers = new Map<string, Parameters<IpcMain["handle"]>[1]>();
    const source = {
      conversationId: null,
      eventId: "master-answer-speech",
      speaker: "master" as const,
    };
    const backend = {
      resolveSpeechSynthesisInput: vi.fn(async (request) => ({
        provider: "local_macos" as const,
        rate: 1.2,
        resolvedVoiceId: request.resolvedVoiceId,
        source: request.source,
        text: "Local helper speech.",
      })),
    } as unknown as BackendClient;
    const helper = localMacOSVoiceHelper();
    helper.synthesizeSpeech.mockImplementation(async () => new Promise(() => {}));
    registerSpeechIpcHandlers({
      ipcMain: {
        handle: (channel, handler) => {
          handlers.set(channel, handler);
        },
      } as Pick<IpcMain, "handle">,
      requireLocalMacOSVoiceHelper: () => helper,
      requireBackendClient: () => backend,
      requireSpeechCredentialCoordinator: () => credentialCoordinator(),
    });
    const request = {
      operationId: "speech-local-cancel",
      request: {
        provider: "local_macos",
        resolvedVoiceId: "marin",
        source,
      },
    };

    const synthesis = invoke(handlers, ipcChannels.speechSynthesize, request);
    await vi.waitFor(() => expect(helper.synthesizeSpeech).toHaveBeenCalled());
    await invoke(handlers, ipcChannels.speechCancelSynthesis, request.operationId);

    await expect(synthesis).rejects.toMatchObject({ name: "AbortError" });
    expect(helper.cancelSynthesis).toHaveBeenCalledWith({ operationId: "speech-local-cancel" });
  });

  test("routes credential management through the local coordinator", async () => {
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

    registerSpeechIpcHandlers({
      ipcMain: {
        handle: (channel, handler) => {
          handlers.set(channel, handler);
        },
      } as Pick<IpcMain, "handle">,
      requireLocalMacOSVoiceHelper: () => localMacOSVoiceHelper(),
      requireBackendClient: () => activeRuntimeBackend,
      requireSpeechCredentialCoordinator: () => coordinator,
    });

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

  test("rejects malformed credential save requests before the coordinator", async () => {
    const handlers = new Map<string, Parameters<IpcMain["handle"]>[1]>();
    const coordinator = credentialCoordinator();

    registerSpeechIpcHandlers({
      ipcMain: {
        handle: (channel, handler) => {
          handlers.set(channel, handler);
        },
      } as Pick<IpcMain, "handle">,
      requireLocalMacOSVoiceHelper: () => localMacOSVoiceHelper(),
      requireBackendClient: () => ({}) as BackendClient,
      requireSpeechCredentialCoordinator: () => coordinator,
    });

    const settings = await invoke(handlers, ipcChannels.speechSaveCredential, {
      provider: "openai",
      apiKey: "sk-setta-ipc-credential",
      duplicateSecret: "sk-setta-ipc-duplicate",
    });

    expect(settings).toEqual({
      message: "Speech credential save request is invalid.",
      operation: "save",
      status: "failed",
    });
    expect(JSON.stringify(settings)).not.toContain("sk-setta-ipc");
    expect(coordinator.saveCredential).not.toHaveBeenCalled();
  });
});

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

function providerSelectionStore() {
  let settings: SpeechProviderSelectionSettings = {
    defaultProvider: "local_macos" as const,
    provider: "local_macos" as const,
    supportedProviders: ["local_macos" as const, "openai" as const],
  };
  return {
    read: vi.fn(async () => settings),
    update: vi.fn(async (provider: "local_macos" | "openai") => {
      settings = { ...settings, provider };
      return settings;
    }),
  };
}

function localMacOSVoiceHelper() {
  return {
    cancelCapture: vi.fn(async (request: { sessionId: string }) => ({
      sessionId: request.sessionId,
    })),
    cancelSynthesis: vi.fn(async (request: { operationId: string }) => ({
      operationId: request.operationId,
    })),
    finishCapture: vi.fn(async (request: { sessionId: string }) => ({
      sessionId: request.sessionId,
      transcript: "Local helper transcript.",
    })),
    listVoices: vi.fn(async () => ({
      provider: "local_macos" as const,
      version: "fixture-local-voices",
      voiceIds: ["com.apple.voice.compact.en-US.Samantha", "com.apple.voice.compact.en-US.Alex"],
    })),
    readHealth: vi.fn(async () => ({
      helperPath: null,
      message: "The local macOS voice helper is not installed.",
      provider: "local_macos" as const,
      status: "helper_unavailable" as const,
    })),
    shutdown: vi.fn(),
    startCapture: vi.fn(async (request: { sessionId: string }) => ({
      sessionId: request.sessionId,
    })),
    synthesizeSpeech: vi.fn(async (request: { operationId: string }) => ({
      audioBase64: localWAVAudioBase64,
      format: "wav",
      mediaType: "audio/wav",
      operationId: request.operationId,
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
