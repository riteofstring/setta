import type { SettaAPI } from "@shared/types";
import { ipcChannels } from "@shared/ipc";
import { beforeEach, describe, expect, test, vi } from "vitest";

describe("preload master API", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock("electron");
  });

  test("exposes generated master input through typed IPC", async () => {
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
    const request = {
      input: {
        focusedConversationId: null,
        focusedPaneId: null,
        focusedWorkspaceId: "workspace_alpha",
        id: "input_alpha",
        modality: "voice" as const,
        originatingConversationId: null,
        originatingConversationInputId: null,
        originatingPaneId: null,
        originatingWorkspaceId: null,
        source: "shell" as const,
        submittedAt: "2026-07-12T18:00:00Z",
        text: "Route this voice request",
      },
    };

    await api.master!.readRecentInputs();
    await api.master!.submitInput(request);

    expect(invoke).toHaveBeenCalledWith(ipcChannels.masterReadRecentInputs);
    expect(invoke).toHaveBeenCalledWith(ipcChannels.masterSubmitInput, request);
  });
});
