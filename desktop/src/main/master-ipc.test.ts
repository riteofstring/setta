import type { IpcMain, IpcMainInvokeEvent } from "electron";
import type {
  BackendClient,
  ReadMasterInputRoutingStateRequest,
  SubmitMasterInputRequest,
} from "@generated/backend";
import { ipcChannels, type IpcObserver } from "@shared/ipc";
import { describe, expect, test, vi } from "vitest";

import { registerMasterIpcHandlers } from "./master-ipc";
import type { RoutingObservationRecorder } from "./routing-observability";

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
    const durableState = { decision: { id: "master_route_alpha" } } as never;
    const backend = {
      readActiveMasterShellInteraction: vi.fn(async () => interaction),
      readMasterInputRoutingState: vi.fn(async () => durableState),
      resolveMasterPresentationIntent: vi.fn(async () => resolution),
      submitMasterInput: vi.fn(async () => accepted),
      waitMasterShellInteraction: vi.fn(async () => state),
      waitMasterPresentationIntent: vi.fn(async () => presentation),
    } as unknown as BackendClient;
    const observer = observerSpies();
    const routingObservability = routingObservabilitySpies();
    registerMasterIpcHandlers({
      ipcMain,
      ipcObserver: observer,
      requireBackendClient: () => backend,
      routingObservability,
    });

    const loaded = await invoke(handlers, ipcChannels.masterReadActiveInteraction);
    const resolved = await invoke(
      handlers,
      ipcChannels.masterResolvePresentation,
      resolutionRequest,
    );
    const submitted = await invoke(handlers, ipcChannels.masterSubmitInput, request);
    const waitRequest = { inputId: request.input.id };
    const waited = await invoke(handlers, ipcChannels.masterWaitInteraction, waitRequest);
    const presented = await invoke(handlers, ipcChannels.masterWaitPresentation, waitRequest);

    expect(backend.readActiveMasterShellInteraction).toHaveBeenCalledOnce();
    expect(loaded).toEqual(interaction);
    expect(backend.resolveMasterPresentationIntent).toHaveBeenCalledWith(resolutionRequest);
    expect(resolved).toEqual(resolution);
    expect(backend.submitMasterInput).toHaveBeenCalledWith(request);
    expect(submitted).toEqual(accepted);
    expect(backend.waitMasterShellInteraction).toHaveBeenCalledWith(waitRequest);
    expect(waited).toEqual(state);
    expect(backend.waitMasterPresentationIntent).toHaveBeenCalledWith(waitRequest);
    expect(presented).toEqual(presentation);
    expect(routingObservability.recordMasterPresentationIntent).toHaveBeenCalledWith(presentation);
    expect(routingObservability.recordMasterInputRoutingState).toHaveBeenCalledWith(durableState);
    expect(observer.finished).toHaveBeenCalledWith(expect.objectContaining({ result: accepted }));
  });

  test("records the durable audit behind a settled renderer-safe interaction", async () => {
    const handlers = new Map<string, Parameters<IpcMain["handle"]>[1]>();
    const ipcMain = {
      handle: (channel, handler) => handlers.set(channel, handler),
    } as Pick<IpcMain, "handle">;
    const input = masterInputRequest().input;
    const state = {
      decision: {
        answerGlobal: { text: "Done." },
        askNarrator: null,
        clarify: null,
        createConversation: null,
        createSideConversation: null,
        focusConversation: null,
        forkConversation: null,
        kind: "answer_global" as const,
        queueAgentTurn: null,
        sendToAgent: null,
        steerActiveTurn: null,
      },
      failure: null,
      input,
      status: "decided" as const,
    };
    const durableState = { decision: { id: "master_route_alpha" } } as never;
    const backend = {
      readMasterInputRoutingState: vi.fn(async () => durableState),
      waitMasterShellInteraction: vi.fn(async () => state),
    } as unknown as BackendClient;
    const routingObservability = routingObservabilitySpies();
    registerMasterIpcHandlers({
      ipcMain,
      requireBackendClient: () => backend,
      routingObservability,
    });

    await invoke(handlers, ipcChannels.masterWaitInteraction, { inputId: input.id });

    expect(backend.readMasterInputRoutingState).toHaveBeenCalledWith({ inputId: input.id });
    expect(routingObservability.recordMasterInputRoutingState).toHaveBeenCalledWith(durableState);
    expect(routingObservability.recordRoutingObservationFailure).not.toHaveBeenCalled();
  });

  test("records a diagnostic when a settled master audit cannot be read", async () => {
    const handlers = new Map<string, Parameters<IpcMain["handle"]>[1]>();
    const ipcMain = {
      handle: (channel, handler) => handlers.set(channel, handler),
    } as Pick<IpcMain, "handle">;
    const input = masterInputRequest().input;
    const state = {
      decision: null,
      failure: { code: "route_failed", message: "Routing failed", retryable: true },
      input,
      status: "failed" as const,
    };
    const auditError = new Error("audit connection unavailable");
    const backend = {
      readMasterInputRoutingState: vi.fn(async () => {
        throw auditError;
      }),
      waitMasterShellInteraction: vi.fn(async () => state),
    } as unknown as BackendClient;
    const routingObservability = routingObservabilitySpies();
    registerMasterIpcHandlers({
      ipcMain,
      requireBackendClient: () => backend,
      routingObservability,
    });

    await invoke(handlers, ipcChannels.masterWaitInteraction, { inputId: input.id });

    expect(routingObservability.recordRoutingObservationFailure).toHaveBeenCalledWith(
      "master",
      input.id,
      auditError,
    );
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

function routingObservabilitySpies(): RoutingObservationRecorder {
  return {
    recordConversationInputRoutingState: vi.fn(),
    recordMasterInputRoutingState: vi.fn(),
    recordMasterPresentationIntent: vi.fn(),
    recordRoutingObservationFailure: vi.fn(),
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
