import type { IpcMain, IpcMainInvokeEvent } from "electron";
import type {
  BackendClient,
  ReadMasterInputRoutingStateRequest,
  SubmitMasterInputRequest,
} from "@generated/backend";
import { ipcChannels, type IpcObserver } from "@shared/ipc";
import { describe, expect, test, vi } from "vitest";

import { registerMasterIpcHandlers } from "./master-ipc";

describe("master IPC handlers", () => {
  test("forwards active interaction, submission, and push-based route settlement", async () => {
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
      },
      sequence: 7,
    };
    const state = {
      decision: null,
      failure: null,
      input: request.input,
      status: "accepted" as const,
    };
    const interaction = { state };
    const backend = {
      readActiveMasterShellInteraction: vi.fn(async () => interaction),
      submitMasterInput: vi.fn(async () => accepted),
      waitMasterShellInteraction: vi.fn(async () => state),
    } as unknown as BackendClient;
    const observer = observerSpies();
    registerMasterIpcHandlers({
      ipcMain,
      ipcObserver: observer,
      requireBackendClient: () => backend,
    });

    const loaded = await invoke(handlers, ipcChannels.masterReadActiveInteraction);
    const submitted = await invoke(handlers, ipcChannels.masterSubmitInput, request);
    const waitRequest = { inputId: request.input.id };
    const waited = await invoke(handlers, ipcChannels.masterWaitInteraction, waitRequest);

    expect(backend.readActiveMasterShellInteraction).toHaveBeenCalledOnce();
    expect(loaded).toEqual(interaction);
    expect(backend.submitMasterInput).toHaveBeenCalledWith(request);
    expect(submitted).toEqual(accepted);
    expect(backend.waitMasterShellInteraction).toHaveBeenCalledWith(waitRequest);
    expect(waited).toEqual(state);
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
  request?: SubmitMasterInputRequest | ReadMasterInputRoutingStateRequest,
) {
  const handler = handlers.get(channel);
  if (!handler) {
    throw new Error(`handler ${channel} was not registered`);
  }
  return handler({} as IpcMainInvokeEvent, request);
}
