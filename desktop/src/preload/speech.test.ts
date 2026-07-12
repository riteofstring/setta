import type { SettaAPI } from "@shared/types";
import { ipcChannels } from "@shared/ipc";
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
    await api.speech.readMasterVoiceSelection?.();
    await api.speech.updateMasterVoiceSelection?.({
      requestedVoiceId: "cedar",
      selection: "exact",
    });
    await api.speech.createTranscriptionSession();

    expect(invoke.mock.calls).toEqual([
      [ipcChannels.speechReadCapabilities],
      [ipcChannels.speechReadMasterVoiceSelection],
      [
        ipcChannels.speechUpdateMasterVoiceSelection,
        { requestedVoiceId: "cedar", selection: "exact" },
      ],
      [ipcChannels.speechCreateTranscriptionSession],
    ]);
  });
});
