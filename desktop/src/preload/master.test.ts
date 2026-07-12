import type { SettaAPI } from "@shared/types";
import { ipcChannels } from "@shared/ipc";
import { beforeEach, describe, expect, test, vi } from "vitest";

describe("preload master API", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock("electron");
  });

  test("exposes active shell interaction and generated master routing through typed IPC", async () => {
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
    const waitRequest = { inputId: request.input.id };
    const resolutionRequest = {
      inputId: request.input.id,
      intentId: `master-presentation:${request.input.id}`,
      paneId: "pane_alpha",
    };

    await api.master!.readActiveInteraction();
    await api.master!.resolvePresentation(resolutionRequest);
    await api.master!.submitInput(request);
    await api.master!.waitInteraction(waitRequest);
    await api.master!.waitPresentation(waitRequest);

    expect(invoke).toHaveBeenCalledWith(ipcChannels.masterReadActiveInteraction);
    expect(invoke).toHaveBeenCalledWith(ipcChannels.masterResolvePresentation, resolutionRequest);
    expect(invoke).toHaveBeenCalledWith(ipcChannels.masterSubmitInput, request);
    expect(invoke).toHaveBeenCalledWith(ipcChannels.masterWaitInteraction, waitRequest);
    expect(invoke).toHaveBeenCalledWith(ipcChannels.masterWaitPresentation, waitRequest);
  });
});
