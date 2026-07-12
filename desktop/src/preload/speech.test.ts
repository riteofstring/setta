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
    const sessionRequest = { workspaceId: "workspace_api" };

    await api.speech.readCapabilities();
    await api.speech.createTranscriptionSession(sessionRequest);

    expect(invoke.mock.calls).toEqual([
      [ipcChannels.speechReadCapabilities],
      [ipcChannels.speechCreateTranscriptionSession, sessionRequest],
    ]);
  });
});
