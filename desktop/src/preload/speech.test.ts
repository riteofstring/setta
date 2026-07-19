import type { SettaAPI } from "@shared/types";
import { ipcChannels, ipcEvents } from "@shared/ipc";
import { beforeEach, describe, expect, test, vi } from "vitest";

describe("preload speech API", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock("electron");
  });

  test("exposes speech capabilities and transcription through typed IPC", async () => {
    const invoke = vi.fn();
    const exposed: Record<string, unknown> = {};
    vi.doMock("electron", () => ({
      contextBridge: {
        exposeInMainWorld: (name: string, api: unknown) => {
          exposed[name] = api;
        },
      },
      ipcRenderer: { invoke, on: vi.fn(), removeListener: vi.fn(), send: vi.fn() },
    }));
    await import("./index");
    const api = exposed.setta as SettaAPI;
    await api.speech.readCapabilities();
    await api.speech.readLocalMacOSVoiceHealth?.();
    await api.speech.readMasterVoiceSelection?.();
    await api.speech.readNarratorVoiceDefault?.();
    await api.speech.synthesize?.(
      {
        provider: "openai",
        resolvedVoiceId: "cedar",
        source: {
          conversationId: "conversation-speech",
          eventId: "status-reply-speech",
          speaker: "narrator",
        },
      },
      "speech-operation",
    );
    await api.speech.cancelSynthesis?.("speech-operation");
    await api.speech.updateMasterVoiceSelection?.({
      requestedVoiceId: "cedar",
      selection: "exact",
    });
    await api.speech.updateNarratorVoiceDefault?.({
      requestedVoiceId: "ash",
      selection: "exact",
    });
    await api.speech.createTranscriptionSession({ provider: "openai" });

    expect(invoke.mock.calls).toEqual([
      [ipcChannels.speechReadCapabilities],
      [ipcChannels.speechReadLocalMacOSVoiceHealth],
      [ipcChannels.speechReadMasterVoiceSelection],
      [ipcChannels.speechReadNarratorVoiceDefault],
      [
        ipcChannels.speechSynthesize,
        {
          operationId: "speech-operation",
          request: {
            provider: "openai",
            resolvedVoiceId: "cedar",
            source: {
              conversationId: "conversation-speech",
              eventId: "status-reply-speech",
              speaker: "narrator",
            },
          },
        },
      ],
      [ipcChannels.speechCancelSynthesis, "speech-operation"],
      [
        ipcChannels.speechUpdateMasterVoiceSelection,
        { requestedVoiceId: "cedar", selection: "exact" },
      ],
      [
        ipcChannels.speechUpdateNarratorVoiceDefault,
        { requestedVoiceId: "ash", selection: "exact" },
      ],
      [ipcChannels.speechCreateTranscriptionSession, { provider: "openai" }],
    ]);
  });

  test("exposes speech credential settings through typed IPC and events", async () => {
    const invoke = vi.fn();
    const on = vi.fn();
    const removeListener = vi.fn();
    const exposed: Record<string, unknown> = {};
    vi.doMock("electron", () => ({
      contextBridge: {
        exposeInMainWorld: (name: string, api: unknown) => {
          exposed[name] = api;
        },
      },
      ipcRenderer: { invoke, on, removeListener, send: vi.fn() },
    }));
    await import("./index");
    const api = exposed.setta as SettaAPI;

    await api.speech.readCredentialSettings?.({ provider: "openai" });
    await api.speech.saveCredential?.({
      provider: "openai",
      apiKey: "sk-setta-preload-speech",
    });
    await api.speech.removeCredential?.({ provider: "openai" });
    const listener = vi.fn();
    const unsubscribe = api.speech.onCredentialSettingsChanged?.(listener);
    const handler = eventHandler(on, ipcEvents.speechCredentialSettingsChanged);
    handler({}, { provider: "openai", status: "configured" });
    unsubscribe?.();

    expect(invoke.mock.calls).toEqual([
      [ipcChannels.speechReadCredentialSettings, { provider: "openai" }],
      [ipcChannels.speechSaveCredential, { provider: "openai", apiKey: "sk-setta-preload-speech" }],
      [ipcChannels.speechRemoveCredential, { provider: "openai" }],
    ]);
    expect(listener).toHaveBeenCalledWith({ provider: "openai", status: "configured" });
    expect(removeListener).toHaveBeenCalledWith(ipcEvents.speechCredentialSettingsChanged, handler);
  });
});

function eventHandler(on: ReturnType<typeof vi.fn>, channel: string) {
  const handler = on.mock.calls.find((call) => call[0] === channel)?.[1];
  if (typeof handler !== "function") {
    throw new Error(`event handler was not registered for ${channel}`);
  }
  return handler;
}
