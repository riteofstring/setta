import type { SettaAPI } from "@shared/types";
import { ipcChannels } from "@shared/ipc";
import { beforeEach, describe, expect, test, vi } from "vitest";

describe("preload speech API", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock("electron");
  });

  test("exposes every generated speech operation through typed IPC", async () => {
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
    const summaryRequest = { easyRunId: "easy_run_api", workspaceId: "workspace_api" };
    const highlightRequest = {
      easyRunId: "easy_run_api",
      highlightId: "highlight_api",
      workspaceId: "workspace_api",
    };

    await api.speech.readCapabilities();
    await api.speech.createTranscriptionSession(sessionRequest);
    await api.speech.synthesizeEasyRunSummary(summaryRequest);
    await api.speech.synthesizeEasyRunHighlight(highlightRequest);

    expect(invoke.mock.calls).toEqual([
      [ipcChannels.speechReadCapabilities],
      [ipcChannels.speechCreateTranscriptionSession, sessionRequest],
      [ipcChannels.speechSynthesizeEasyRunSummary, summaryRequest],
      [ipcChannels.speechSynthesizeEasyRunHighlight, highlightRequest],
    ]);
  });
});
