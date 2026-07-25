import type { SettaAPI } from "@shared/types";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { ipcChannels, ipcEvents } from "@shared/ipc";
import { conversationEvent } from "./index.test.fixtures";

beforeEach(() => {
  vi.resetModules();
  vi.doUnmock("electron");
});

describe("preload topic conversation API", () => {
  test("exposes typed commands and events through IPC", async () => {
    const { api, invoke, on, removeListener } = await exposeConversationAPI();
    expect(Object.keys(api.conversations).sort()).toEqual([
      "archive",
      "bindFolder",
      "create",
      "discardInput",
      "disposeSide",
      "list",
      "onEvent",
      "read",
      "readArtifact",
      "readInputState",
      "release",
      "retryInput",
      "sendSide",
      "stop",
      "submitApproval",
      "submitInput",
      "subscribe",
      "updatePresentation",
      "waitInputState",
    ]);
    const listRequest = {
      cursor: null,
      limit: 80,
      query: "status",
      workspaceId: "workspace_api",
    };
    const target = { conversationId: "conversation_api", workspaceId: "workspace_api" };
    const folderBindingRequest = target;
    const artifactRequest = {
      ...target,
      artifactId: "artifact_api",
    };
    const sideTurnRequest = {
      parentConversationId: target.conversationId,
      sideConversationId: "side_api",
      text: "Ask the side",
      workspaceId: target.workspaceId,
    };
    const sideDisposeRequest = {
      parentConversationId: target.conversationId,
      parentPaneId: "pane_api",
      sideConversationId: sideTurnRequest.sideConversationId,
      workspaceId: target.workspaceId,
    };
    const subscription = {
      ...target,
      cursor: { sequence: 3, streamId: "conversation_stream_test" },
    };
    const release = { ...target, keepAlive: true };
    const approval = {
      ...target,
      response: {
        answers: [],
        approvalId: "approval_api",
        decision: "approved" as const,
        response: "",
      },
    };
    const inputRequest = {
      input: {
        conversationId: "conversation_api",
        id: "input_api",
        modality: "voice" as const,
        replyToInputId: null,
        submittedAt: "2026-07-12T18:00:00Z",
        text: "Route this conversation input",
      },
    };
    const inputStateRequest = {
      ...target,
      inputId: inputRequest.input.id,
    };
    const presentationRequest = {
      ...target,
      settings: {
        narratorSpeechEnabled: false,
        narratorVoiceSelection: {
          requestedVoiceId: "cedar" as const,
          selection: "exact" as const,
        },
        paletteSelection: {
          requestedPaletteId: "violet" as const,
          selection: "exact" as const,
        },
      },
    };
    await invokeConversationCommands(api, {
      approval,
      folderBindingRequest,
      inputRequest,
      inputStateRequest,
      listRequest,
      release,
      sideDisposeRequest,
      sideTurnRequest,
      subscription,
      target,
      artifactRequest,
      presentationRequest,
    });
    const listener = vi.fn();
    const unsubscribe = api.conversations.onEvent(listener);
    const handler = requiredConversationEventHandler(on);
    const event = conversationEvent();
    handler({}, event);
    unsubscribe();

    expectInvokeCalls(invoke, [
      [ipcChannels.conversationSendSideTurn, sideTurnRequest],
      [ipcChannels.conversationDisposeSide, sideDisposeRequest],
      [ipcChannels.conversationCreateTopic, { title: "API topic", workspaceId: "workspace_api" }],
      [ipcChannels.conversationArchiveTopic, target],
      [ipcChannels.conversationBindFolder, folderBindingRequest],
      [ipcChannels.conversationListTopicConversations, listRequest],
      [ipcChannels.conversationReadSnapshot, target],
      [ipcChannels.conversationReadArtifact, artifactRequest],
      [ipcChannels.conversationStopTurn, target],
      [ipcChannels.conversationSubmitInput, inputRequest],
      [ipcChannels.conversationReadInputState, inputStateRequest],
      [ipcChannels.conversationWaitInputState, inputStateRequest],
      [ipcChannels.conversationRetryInput, inputStateRequest],
      [ipcChannels.conversationDiscardInput, inputStateRequest],
      [ipcChannels.conversationSubmitApproval, approval],
      [ipcChannels.conversationSubscribeEvents, subscription],
      [ipcChannels.conversationReleaseEvents, release],
      [ipcChannels.conversationUpdatePresentation, presentationRequest],
    ]);
    expect(listener).toHaveBeenCalledWith(event);
    expect(removeListener).toHaveBeenCalledWith(ipcEvents.conversationEvent, handler);
  });
});

async function exposeConversationAPI() {
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
  return { api: exposed.setta as SettaAPI, invoke, on, removeListener };
}

function requiredConversationEventHandler(on: ReturnType<typeof vi.fn>) {
  const handler = on.mock.calls.find((call) => call[0] === ipcEvents.conversationEvent)?.[1];
  if (typeof handler !== "function") {
    throw new Error("conversation event handler was not registered");
  }
  return handler;
}

async function invokeConversationCommands(
  api: SettaAPI,
  requests: {
    approval: Parameters<SettaAPI["conversations"]["submitApproval"]>[0];
    folderBindingRequest: Parameters<SettaAPI["conversations"]["bindFolder"]>[0];
    inputRequest: Parameters<NonNullable<SettaAPI["conversations"]["submitInput"]>>[0];
    inputStateRequest: Parameters<NonNullable<SettaAPI["conversations"]["readInputState"]>>[0];
    listRequest: Parameters<SettaAPI["conversations"]["list"]>[0];
    release: Parameters<SettaAPI["conversations"]["release"]>[0];
    sideDisposeRequest: Parameters<NonNullable<SettaAPI["conversations"]["disposeSide"]>>[0];
    sideTurnRequest: Parameters<NonNullable<SettaAPI["conversations"]["sendSide"]>>[0];
    subscription: Parameters<SettaAPI["conversations"]["subscribe"]>[0];
    target: { conversationId: string; workspaceId: string };
    artifactRequest: Parameters<NonNullable<SettaAPI["conversations"]["readArtifact"]>>[0];
    presentationRequest: Parameters<SettaAPI["conversations"]["updatePresentation"]>[0];
  },
) {
  const sendSide = requireConversationCommand(api.conversations.sendSide, "side conversation send");
  const disposeSide = requireConversationCommand(
    api.conversations.disposeSide,
    "side conversation disposal",
  );
  await sendSide(requests.sideTurnRequest);
  await disposeSide(requests.sideDisposeRequest);
  await api.conversations.create({ title: "API topic", workspaceId: "workspace_api" });
  await api.conversations.archive(requests.target);
  await api.conversations.bindFolder(requests.folderBindingRequest);
  await api.conversations.list(requests.listRequest);
  await api.conversations.read(requests.target);
  const readArtifact = requireConversationCommand(
    api.conversations.readArtifact,
    "conversation artifact read",
  );
  await readArtifact(requests.artifactRequest);
  await api.conversations.stop(requests.target);
  const submitInput = requireConversationCommand(
    api.conversations.submitInput,
    "conversation input intake",
  );
  await submitInput(requests.inputRequest);
  const readInputState = requireConversationCommand(
    api.conversations.readInputState,
    "conversation input routing state",
  );
  await readInputState(requests.inputStateRequest);
  const waitInputState = requireConversationCommand(
    api.conversations.waitInputState,
    "conversation input routing settlement",
  );
  await waitInputState(requests.inputStateRequest);
  const retryInput = requireConversationCommand(
    api.conversations.retryInput,
    "conversation input routing retry",
  );
  const discardInput = requireConversationCommand(
    api.conversations.discardInput,
    "conversation input routing discard",
  );
  await retryInput(requests.inputStateRequest);
  await discardInput(requests.inputStateRequest);
  await api.conversations.submitApproval(requests.approval);
  await api.conversations.subscribe(requests.subscription);
  await api.conversations.release(requests.release);
  await api.conversations.updatePresentation(requests.presentationRequest);
}

function requireConversationCommand<Command>(command: Command | undefined, label: string): Command {
  if (!command) {
    throw new Error(`${label} is unavailable`);
  }
  return command;
}

function expectInvokeCalls(invoke: ReturnType<typeof vi.fn>, calls: unknown[][]) {
  expect(invoke).toHaveBeenCalledTimes(calls.length);
  for (const call of calls) {
    expect(invoke).toHaveBeenCalledWith(...call);
  }
}
