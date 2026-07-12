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
      "askStatus",
      "create",
      "createSide",
      "discardInput",
      "disposeSide",
      "fork",
      "list",
      "onEvent",
      "queue",
      "read",
      "readInputState",
      "release",
      "retryInput",
      "send",
      "sendSide",
      "steer",
      "stop",
      "submitApproval",
      "submitInput",
      "subscribe",
      "updateNarratorVoice",
    ]);
    const listRequest = {
      cursor: null,
      limit: 80,
      query: "status",
      workspaceId: "workspace_api",
    };
    const target = { conversationId: "conversation_api", workspaceId: "workspace_api" };
    const forkRequest = {
      forkedAtTurnId: "turn_api",
      parentConversationId: target.conversationId,
      title: "Forked API topic",
      workspaceId: target.workspaceId,
    };
    const sideRequest = {
      parentConversationId: target.conversationId,
      parentPaneId: "pane_api",
      workspaceId: target.workspaceId,
    };
    const sideTurnRequest = {
      parentConversationId: target.conversationId,
      sideConversationId: "side_api",
      text: "Ask the side",
      workspaceId: target.workspaceId,
    };
    const sideDisposeRequest = {
      parentConversationId: target.conversationId,
      parentPaneId: sideRequest.parentPaneId,
      sideConversationId: sideTurnRequest.sideConversationId,
      workspaceId: target.workspaceId,
    };
    const turn = { ...target, text: "Continue the topic" };
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
        requestedMode: "route" as const,
        sourcePaneId: "pane_api",
        submittedAt: "2026-07-12T18:00:00Z",
        text: "Route this pane input",
      },
    };
    const inputStateRequest = {
      ...target,
      inputId: inputRequest.input.id,
    };
    const voiceRequest = {
      ...target,
      selection: { requestedVoiceId: "cedar" as const, selection: "exact" as const },
    };
    await invokeConversationCommands(api, {
      approval,
      forkRequest,
      inputRequest,
      inputStateRequest,
      listRequest,
      release,
      sideRequest,
      sideDisposeRequest,
      sideTurnRequest,
      subscription,
      target,
      turn,
      voiceRequest,
    });
    const listener = vi.fn();
    const unsubscribe = api.conversations.onEvent(listener);
    const handler = requiredConversationEventHandler(on);
    const event = conversationEvent();
    handler({}, event);
    unsubscribe();

    expectInvokeCalls(invoke, [
      [ipcChannels.conversationAskNarratorStatus, { ...target, question: "What is happening?" }],
      [ipcChannels.conversationCreateSide, sideRequest],
      [ipcChannels.conversationSendSideTurn, sideTurnRequest],
      [ipcChannels.conversationDisposeSide, sideDisposeRequest],
      [ipcChannels.conversationCreateTopic, { title: "API topic", workspaceId: "workspace_api" }],
      [ipcChannels.conversationForkTopic, forkRequest],
      [ipcChannels.conversationListTopicConversations, listRequest],
      [ipcChannels.conversationReadSnapshot, target],
      [ipcChannels.conversationSendTurn, turn],
      [ipcChannels.conversationQueueTurn, turn],
      [ipcChannels.conversationSteerTurn, turn],
      [ipcChannels.conversationStopTurn, target],
      [ipcChannels.conversationSubmitInput, inputRequest],
      [ipcChannels.conversationReadInputState, inputStateRequest],
      [ipcChannels.conversationRetryInput, inputStateRequest],
      [ipcChannels.conversationDiscardInput, inputStateRequest],
      [ipcChannels.conversationSubmitApproval, approval],
      [ipcChannels.conversationSubscribeEvents, subscription],
      [ipcChannels.conversationReleaseEvents, release],
      [ipcChannels.conversationUpdateNarratorVoice, voiceRequest],
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
    forkRequest: Parameters<SettaAPI["conversations"]["fork"]>[0];
    inputRequest: Parameters<NonNullable<SettaAPI["conversations"]["submitInput"]>>[0];
    inputStateRequest: Parameters<NonNullable<SettaAPI["conversations"]["readInputState"]>>[0];
    listRequest: Parameters<SettaAPI["conversations"]["list"]>[0];
    release: Parameters<SettaAPI["conversations"]["release"]>[0];
    sideRequest: Parameters<NonNullable<SettaAPI["conversations"]["createSide"]>>[0];
    sideDisposeRequest: Parameters<NonNullable<SettaAPI["conversations"]["disposeSide"]>>[0];
    sideTurnRequest: Parameters<NonNullable<SettaAPI["conversations"]["sendSide"]>>[0];
    subscription: Parameters<SettaAPI["conversations"]["subscribe"]>[0];
    target: Parameters<SettaAPI["conversations"]["read"]>[0];
    turn: Parameters<SettaAPI["conversations"]["send"]>[0];
    voiceRequest: Parameters<NonNullable<SettaAPI["conversations"]["updateNarratorVoice"]>>[0];
  },
) {
  await api.conversations.askStatus({ ...requests.target, question: "What is happening?" });
  const createSide = api.conversations.createSide;
  if (!createSide) {
    throw new Error("side conversation creation is unavailable");
  }
  await createSide(requests.sideRequest);
  const sendSide = api.conversations.sendSide;
  const disposeSide = api.conversations.disposeSide;
  if (!sendSide || !disposeSide) {
    throw new Error("side conversation lifecycle is unavailable");
  }
  await sendSide(requests.sideTurnRequest);
  await disposeSide(requests.sideDisposeRequest);
  await api.conversations.create({ title: "API topic", workspaceId: "workspace_api" });
  await api.conversations.fork(requests.forkRequest);
  await api.conversations.list(requests.listRequest);
  await api.conversations.read(requests.target);
  await api.conversations.send(requests.turn);
  await api.conversations.queue(requests.turn);
  await api.conversations.steer(requests.turn);
  await api.conversations.stop(requests.target);
  const submitInput = api.conversations.submitInput;
  if (!submitInput) {
    throw new Error("conversation input intake is unavailable");
  }
  await submitInput(requests.inputRequest);
  const readInputState = api.conversations.readInputState;
  if (!readInputState) {
    throw new Error("conversation input routing state is unavailable");
  }
  await readInputState(requests.inputStateRequest);
  const retryInput = api.conversations.retryInput;
  const discardInput = api.conversations.discardInput;
  if (!retryInput || !discardInput) {
    throw new Error("conversation input routing lifecycle is unavailable");
  }
  await retryInput(requests.inputStateRequest);
  await discardInput(requests.inputStateRequest);
  await api.conversations.submitApproval(requests.approval);
  await api.conversations.subscribe(requests.subscription);
  await api.conversations.release(requests.release);
  await api.conversations.updateNarratorVoice?.(requests.voiceRequest);
}

function expectInvokeCalls(invoke: ReturnType<typeof vi.fn>, calls: unknown[][]) {
  expect(invoke).toHaveBeenCalledTimes(calls.length);
  for (const call of calls) {
    expect(invoke).toHaveBeenCalledWith(...call);
  }
}
