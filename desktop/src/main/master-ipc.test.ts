import type { IpcMain, IpcMainInvokeEvent } from "electron";
import type { BackendClient, SubmitMasterInputRequest } from "@generated/backend";
import { ipcChannels, type IpcObserver } from "@shared/ipc";
import { describe, expect, test, vi } from "vitest";

import { registerMasterIpcHandlers } from "./master-ipc";

describe("master IPC handlers", () => {
  test("forwards the generated master input contract to the active runtime", async () => {
    const handlers = new Map<string, Parameters<IpcMain["handle"]>[1]>();
    const ipcMain = {
      handle: (channel, handler) => handlers.set(channel, handler),
    } as Pick<IpcMain, "handle">;
    const request = masterInputRequest();
    const accepted = {
      acceptedAt: "2026-07-12T18:00:01Z",
      input: request.input,
      replyDelivery: {
        originatingConversationId: null,
        originatingConversationInputId: null,
        originatingPaneId: null,
        originatingWorkspaceId: null,
        showInMasterOverlay: true,
      },
      sequence: 7,
    };
    const history = { capacity: 40, inputs: [accepted] };
    const backend = {
      readRecentMasterInputs: vi.fn(async () => history),
      submitMasterInput: vi.fn(async () => accepted),
    } as unknown as BackendClient;
    const observer = observerSpies();
    registerMasterIpcHandlers({
      ipcMain,
      ipcObserver: observer,
      requireBackendClient: () => backend,
    });

    const loaded = await invoke(handlers, ipcChannels.masterReadRecentInputs);
    const result = await invoke(handlers, ipcChannels.masterSubmitInput, request);

    expect(backend.readRecentMasterInputs).toHaveBeenCalledOnce();
    expect(loaded).toEqual(history);
    expect(backend.submitMasterInput).toHaveBeenCalledWith(request);
    expect(result).toEqual(accepted);
    expect(observer.finished).toHaveBeenCalledWith(expect.objectContaining({ result: accepted }));
  });
});

function masterInputRequest(): SubmitMasterInputRequest {
  return {
    input: {
      focusedConversationId: "conversation_alpha",
      focusedPaneId: "pane_alpha",
      focusedWorkspaceId: "workspace_alpha",
      id: "input_alpha",
      modality: "voice",
      originatingConversationId: null,
      originatingConversationInputId: null,
      originatingPaneId: null,
      originatingWorkspaceId: null,
      source: "shell",
      submittedAt: "2026-07-12T18:00:00Z",
      text: "Route this voice request",
    },
  };
}

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
  request?: SubmitMasterInputRequest,
) {
  const handler = handlers.get(channel);
  if (!handler) {
    throw new Error(`handler ${channel} was not registered`);
  }
  return handler({} as IpcMainInvokeEvent, request);
}
