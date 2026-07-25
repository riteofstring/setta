import type { IpcMain, IpcMainInvokeEvent } from "electron";
import type {
  BackendClient,
  ReadMasterInputRoutingStateRequest,
  ReadMasterTranscriptRequest,
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
    const cancelled = { ...state, status: "cancelled" as const };
    const presentation = {
      focusExistingConversationPane: null,
      id: `master-presentation:${request.input.id}`,
      inputId: request.input.id,
      kind: "show_master_reply" as const,
      openConversationPane: null,
      openSideConversation: null,
      originatingConversationId: null,
      originatingConversationInputId: null,
      originatingPaneId: null,
      originatingWorkspaceId: null,
      showMasterReply: { replyKind: "answer" as const, text: "Done." },
      source: "shell" as const,
    };
    const resolutionRequest = {
      inputId: request.input.id,
      intentId: presentation.id,
      paneId: "pane_alpha",
    };
    const resolution = { ...resolutionRequest, resolvedAt: "2026-07-12T18:00:02Z" };
    const transcriptRequest = { limit: 20 };
    const transcript = {
      entries: [
        {
          payload: {
            actionReceipt: null,
            assistantReply: null,
            cancellation: null,
            createdAt: "2026-07-12T18:00:01Z",
            failure: null,
            id: `master-transcript:user:${request.input.id}`,
            inputId: request.input.id,
            kind: "user_input" as const,
            userInput: { modality: "voice" as const, text: request.input.text },
          },
          sequence: 1,
        },
      ],
      lastSequence: 1,
    };
    const backend = {
      cancelMasterInput: vi.fn(async () => cancelled),
      readActiveMasterShellInteraction: vi.fn(async () => interaction),
      readMasterTranscript: vi.fn(async () => transcript),
      resolveMasterPresentationIntent: vi.fn(async () => resolution),
      submitMasterInput: vi.fn(async () => accepted),
      waitMasterShellInteraction: vi.fn(async () => state),
      waitMasterPresentationIntent: vi.fn(async () => presentation),
    } as unknown as BackendClient;
    const observer = observerSpies();
    registerMasterIpcHandlers({
      ipcMain,
      ipcObserver: observer,
      requireBackendClient: () => backend,
    });

    const loaded = await invoke(handlers, ipcChannels.masterReadActiveInteraction);
    const transcriptRead = await invoke(
      handlers,
      ipcChannels.masterReadTranscript,
      transcriptRequest,
    );
    const resolved = await invoke(
      handlers,
      ipcChannels.masterResolvePresentation,
      resolutionRequest,
    );
    const submitted = await invoke(handlers, ipcChannels.masterSubmitInput, request);
    const waitRequest = { inputId: request.input.id };
    const waited = await invoke(handlers, ipcChannels.masterWaitInteraction, waitRequest);
    const presented = await invoke(handlers, ipcChannels.masterWaitPresentation, waitRequest);
    const cancellation = await invoke(handlers, ipcChannels.masterCancelInput, waitRequest);

    expect(backend.readActiveMasterShellInteraction).toHaveBeenCalledOnce();
    expect(loaded).toEqual(interaction);
    expect(backend.readMasterTranscript).toHaveBeenCalledWith(transcriptRequest);
    expect(transcriptRead).toEqual(transcript);
    expect(backend.resolveMasterPresentationIntent).toHaveBeenCalledWith(resolutionRequest);
    expect(resolved).toEqual(resolution);
    expect(backend.submitMasterInput).toHaveBeenCalledWith(request);
    expect(submitted).toEqual(accepted);
    expect(backend.waitMasterShellInteraction).toHaveBeenCalledWith(waitRequest);
    expect(waited).toEqual(state);
    expect(backend.waitMasterPresentationIntent).toHaveBeenCalledWith(waitRequest);
    expect(presented).toEqual(presentation);
    expect(backend.cancelMasterInput).toHaveBeenCalledWith(waitRequest);
    expect(cancellation).toEqual(cancelled);
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
  request?:
    | SubmitMasterInputRequest
    | ReadMasterInputRoutingStateRequest
    | ReadMasterTranscriptRequest,
) {
  const handler = handlers.get(channel);
  if (!handler) {
    throw new Error(`handler ${channel} was not registered`);
  }
  return handler({} as IpcMainInvokeEvent, request);
}
