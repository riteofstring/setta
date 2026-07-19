import type {
  AcceptedMasterInput,
  PresentationIntent,
  RouteDecision,
  RouteDecisionKind,
  ShellInteractionState,
  SubmitMasterInputRequest,
  Transcript,
} from "@generated/backend";
import { describe, expect, test, vi } from "vitest";

import {
  AppShellMasterController,
  type AppShellMasterControllerDependencies,
} from "./app-shell-master-controller";

describe("app-shell master controller", () => {
  test("submits shell text and finalized voice through one active interaction", async () => {
    const harness = createHarness();
    harness.controller.synchronizeRuntime("runtime_alpha");
    await flushPromises();

    expect(harness.controller.submitText("  Route this typed request.  ")).toBe("master_input_1");
    await waitForInteraction(harness.controller, "decided");
    harness.controller.clearAccepted();
    harness.controller.submitVoiceTranscript(
      "capture_alpha",
      "runtime_alpha",
      "  Exact final voice text.  ",
    );
    await waitForInteraction(harness.controller, "decided");

    expect(harness.requests.map((request) => request.input)).toEqual([
      shellInput("master_input_1", "text", "  Route this typed request.  "),
      shellInput("capture_alpha", "voice", "  Exact final voice text.  "),
    ]);
    expect(harness.controller.getSnapshot()).toMatchObject({
      completedTranscript: null,
      interaction: {
        state: { input: { id: "capture_alpha", modality: "voice" }, status: "decided" },
        type: "active",
      },
      overlayOpen: true,
      runtimeId: "runtime_alpha",
      submission: { accepted: { sequence: 2 }, type: "accepted" },
    });
  });

  test("shares a persistent overlay draft across shell entry points", async () => {
    const harness = createHarness();
    harness.controller.synchronizeRuntime("runtime_alpha");
    await flushPromises();

    harness.controller.openOverlay();
    harness.controller.setDraft("Bring back the speech routing topic");
    harness.controller.closeOverlay();
    harness.controller.openOverlay();

    expect(harness.controller.getSnapshot()).toMatchObject({
      draft: "Bring back the speech routing topic",
      interaction: { type: "idle" },
      overlayOpen: true,
    });
  });

  test("retains a failed voice transcript and retries the exact idempotent input", async () => {
    const retry = deferred<AcceptedMasterInput>();
    const submit = vi
      .fn<(request: SubmitMasterInputRequest) => Promise<AcceptedMasterInput>>()
      .mockRejectedValueOnce(new Error("private backend failure"))
      .mockImplementationOnce(() => retry.promise);
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const harness = createHarness({ submitMasterInput: submit });
    harness.controller.synchronizeRuntime("runtime_alpha");
    await flushPromises();

    harness.controller.submitVoiceTranscript("capture_retry", "runtime_alpha", "Retry this");
    await waitForSubmission(harness.controller, "failed");
    expect(harness.controller.getSnapshot()).toMatchObject({
      completedTranscript: { captureSessionId: "capture_retry", transcript: "Retry this" },
      submission: {
        message: "Setta could not accept the voice request. Retry without recording it again.",
        type: "failed",
      },
    });

    harness.controller.retry();
    expect(harness.requests[1]!.input).toBe(harness.requests[0]!.input);
    retry.resolve(acceptedFor(harness.requests[1]!, 1));
    await waitForInteraction(harness.controller, "decided");
    expect(info).toHaveBeenCalledWith(
      "Shell master input submission failed: inputId=capture_retry",
    );
    info.mockRestore();
  });

  test("invalidates late submission and interaction results on runtime change", async () => {
    const pending = deferred<AcceptedMasterInput>();
    const harness = createHarness({
      readTranscript: async () => emptyTranscript(),
      submitMasterInput: () => pending.promise,
    });
    harness.controller.synchronizeRuntime("runtime_old");
    await flushPromises();
    harness.controller.submitText("Old runtime request");
    const request = harness.requests[0]!;

    harness.controller.synchronizeRuntime("runtime_new");
    pending.resolve(acceptedFor(request, 1));
    await flushPromises();

    expect(harness.controller.getSnapshot()).toEqual({
      cancellation: { type: "idle" },
      completedTranscript: null,
      draft: "",
      interaction: { type: "idle" },
      overlayOpen: true,
      runtimeId: "runtime_new",
      submission: { type: "idle" },
      transcript: { transcript: emptyTranscript(), type: "ready" },
    });
    expect(() =>
      harness.controller.submitVoiceTranscript("capture_old", "runtime_old", "Stale"),
    ).toThrow("stale runtime");
  });

  test("restores only an unresolved shell clarification and preserves it while closed", async () => {
    const request = { input: shellInput("input_clarify", "text", "Bring up that topic") };
    const clarification = decidedState(acceptedFor(request, 3), "clarify");
    const harness = createHarness({
      readActiveInteraction: async () => ({ state: clarification }),
    });

    harness.controller.synchronizeRuntime("runtime_alpha");
    await flushPromises();
    harness.controller.openOverlay();
    harness.controller.closeOverlay();

    expect(harness.controller.getSnapshot()).toMatchObject({
      interaction: {
        state: {
          decision: { clarify: { question: "Which topic did you mean?" } },
          status: "decided",
        },
        type: "active",
      },
      overlayOpen: false,
    });
    harness.controller.openOverlay();
    harness.controller.submitText("The speech routing topic");
    await waitForInteraction(harness.controller, "decided");
    expect(harness.requests).toHaveLength(1);
  });

  test("dismisses a completed immediate result while preserving durable transcript", async () => {
    const harness = createHarness();
    harness.controller.synchronizeRuntime("runtime_alpha");
    await flushPromises();
    harness.controller.submitText("What can you do globally?");
    await waitForInteraction(harness.controller, "decided");
    await flushPromises();

    harness.controller.closeOverlay();
    harness.controller.openOverlay();

    expect(harness.controller.getSnapshot()).toMatchObject({
      interaction: { type: "idle" },
      overlayOpen: true,
      transcript: {
        transcript: {
          entries: [
            { payload: { kind: "user_input", inputId: "master_input_1" } },
            { payload: { kind: "assistant_reply", inputId: "master_input_1" } },
          ],
        },
        type: "ready",
      },
    });
    expect(harness.controller.getSnapshot()).not.toHaveProperty("recentInputs");
  });

  test("applies a completed navigation intent before dismissing the shell overlay", async () => {
    const applied = deferred<{ paneId: string }>();
    const resolved = deferred<{
      inputId: string;
      intentId: string;
      paneId: string;
      resolvedAt: string;
    }>();
    const present = vi.fn(() => applied.promise);
    const resolve = vi.fn(() => resolved.promise);
    const harness = createHarness({
      presentPresentationIntent: present,
      resolvePresentationIntent: resolve,
      waitPresentationIntent: async ({ inputId }) => focusPresentation(inputId),
      waitShellInteraction: async ({ inputId }) =>
        decidedState(
          acceptedFor({ input: shellInput(inputId, "text", "Focus alpha") }, 1),
          "focus_conversation",
        ),
    });
    harness.controller.synchronizeRuntime("runtime_alpha");
    await flushPromises();

    harness.controller.submitText("Focus alpha");
    await waitForInteraction(harness.controller, "decided");
    expect(present).toHaveBeenCalledWith(focusPresentation("master_input_1"));
    expect(harness.controller.getSnapshot().overlayOpen).toBe(true);
    expect(harness.controller.canSubmitInput()).toBe(false);
    harness.controller.closeOverlay();
    expect(harness.controller.getSnapshot()).toMatchObject({
      interaction: { type: "active" },
      overlayOpen: false,
    });

    applied.resolve({ paneId: "pane_alpha" });
    await flushPromises();
    expect(resolve).toHaveBeenCalledWith({
      inputId: "master_input_1",
      intentId: "master-presentation:master_input_1",
      paneId: "pane_alpha",
    });
    expect(harness.controller.getSnapshot().overlayOpen).toBe(false);

    resolved.resolve({
      inputId: "master_input_1",
      intentId: "master-presentation:master_input_1",
      paneId: "pane_alpha",
      resolvedAt: "2026-07-12T18:00:01Z",
    });
    await flushPromises();
    expect(harness.controller.getSnapshot()).toMatchObject({
      interaction: { type: "idle" },
      overlayOpen: false,
      submission: { type: "idle" },
    });
  });

  test("resumes an unresolved navigation intent restored after restart", async () => {
    const accepted = acceptedFor(
      { input: shellInput("master_input_restored", "text", "Focus alpha") },
      1,
    );
    const restored = decidedState(accepted, "focus_conversation");
    const present = vi.fn(async () => ({ paneId: "pane_restored" }));
    const resolve = vi.fn(async (request) => ({
      ...request,
      resolvedAt: "2026-07-12T18:00:02Z",
    }));
    const harness = createHarness({
      presentPresentationIntent: present,
      readActiveInteraction: async () => ({ state: restored }),
      resolvePresentationIntent: resolve,
      waitPresentationIntent: async ({ inputId }) => focusPresentation(inputId),
    });

    harness.controller.synchronizeRuntime("runtime_alpha");
    await flushPromises();
    await flushPromises();

    expect(present).toHaveBeenCalledWith(focusPresentation("master_input_restored"));
    expect(resolve).toHaveBeenCalledWith({
      inputId: "master_input_restored",
      intentId: "master-presentation:master_input_restored",
      paneId: "pane_restored",
    });
    expect(harness.controller.getSnapshot()).toMatchObject({
      interaction: { type: "idle" },
      overlayOpen: false,
    });
  });

  test("reports active-interaction restore failure and retries explicitly", async () => {
    const readActiveInteraction = vi
      .fn<AppShellMasterControllerDependencies["readActiveInteraction"]>()
      .mockRejectedValueOnce(new Error("private backend failure"))
      .mockResolvedValueOnce({ state: null });
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const harness = createHarness({ readActiveInteraction });
    harness.controller.synchronizeRuntime("runtime_alpha");
    await flushPromises();

    expect(harness.controller.getSnapshot().interaction).toMatchObject({ type: "load_failed" });
    expect(harness.controller.canSubmitInput()).toBe(false);
    harness.controller.retryInteraction();
    await flushPromises();
    expect(harness.controller.getSnapshot().interaction).toEqual({ type: "idle" });
    expect(readActiveInteraction).toHaveBeenCalledTimes(2);
    expect(info).toHaveBeenCalledWith(
      "Active master shell interaction load failed: runtimeId=runtime_alpha",
    );
    info.mockRestore();
  });

  test("reconnects a failed routing-state wait without resubmitting the input", async () => {
    const retriedObservation = deferred<ShellInteractionState>();
    const wait = vi
      .fn<AppShellMasterControllerDependencies["waitShellInteraction"]>()
      .mockRejectedValueOnce(new Error("connection lost"))
      .mockImplementationOnce(() => retriedObservation.promise);
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const harness = createHarness({ waitShellInteraction: wait });
    harness.controller.synchronizeRuntime("runtime_alpha");
    await flushPromises();
    harness.controller.submitText("Observe this once");
    await waitForInteractionType(harness.controller, "observation_failed");

    harness.controller.retryInteraction();
    expect(harness.controller.getSnapshot().interaction).toMatchObject({
      state: { status: "accepted" },
      type: "active",
    });
    harness.controller.retryInteraction();
    expect(wait).toHaveBeenCalledTimes(2);
    retriedObservation.resolve(decidedState(acceptedFor(harness.requests[0]!, 1), "answer_global"));
    await waitForInteraction(harness.controller, "decided");
    expect(harness.requests).toHaveLength(1);
    expect(wait).toHaveBeenCalledTimes(2);
    expect(info).toHaveBeenCalledWith(
      "Active master routing observation failed: inputId=master_input_1",
    );
    info.mockRestore();
  });

  test("restores durable clarification state after discarding an uncertain reply failure", async () => {
    const request = { input: shellInput("input_clarify", "text", "Bring up that topic") };
    const clarification = decidedState(acceptedFor(request, 3), "clarify");
    const readActiveInteraction = vi
      .fn<AppShellMasterControllerDependencies["readActiveInteraction"]>()
      .mockResolvedValue({ state: clarification });
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const harness = createHarness({
      readActiveInteraction,
      submitMasterInput: async () => {
        throw new Error("connection lost before the receipt arrived");
      },
    });
    harness.controller.synchronizeRuntime("runtime_alpha");
    await flushPromises();
    harness.controller.submitText("The speech routing topic");
    await waitForSubmission(harness.controller, "failed");

    harness.controller.discard();
    expect(harness.controller.getSnapshot().interaction).toEqual({ type: "loading" });
    await flushPromises();

    expect(harness.controller.getSnapshot()).toMatchObject({
      interaction: {
        state: {
          decision: { clarify: { question: "Which topic did you mean?" } },
          input: { id: "input_clarify" },
          status: "decided",
        },
        type: "active",
      },
      submission: { type: "idle" },
    });
    expect(readActiveInteraction).toHaveBeenCalledTimes(2);
    info.mockRestore();
  });

  test("blocks concurrent root requests until the active route settles", async () => {
    const pending = deferred<ShellInteractionState>();
    const harness = createHarness({ waitShellInteraction: () => pending.promise });
    harness.controller.synchronizeRuntime("runtime_alpha");
    await flushPromises();
    harness.controller.submitText("First request");
    await waitForSubmission(harness.controller, "accepted");

    expect(harness.controller.canSubmitInput()).toBe(false);
    expect(() => harness.controller.submitText("Concurrent request")).toThrow("must settle");
    pending.resolve(decidedState(acceptedFor(harness.requests[0]!, 1), "answer_global"));
    await waitForInteraction(harness.controller, "decided");
    expect(harness.controller.canSubmitInput()).toBe(true);
  });

  test("cancels the exact active durable input and ignores its late route result", async () => {
    const route = deferred<ShellInteractionState>();
    const cancellation = deferred<ShellInteractionState>();
    const cancelMasterInput = vi.fn(() => cancellation.promise);
    const harness = createHarness({
      cancelMasterInput,
      waitShellInteraction: () => route.promise,
    });
    harness.controller.synchronizeRuntime("runtime_alpha");
    await flushPromises();
    harness.controller.submitText("Cancel this global route");
    await waitForSubmission(harness.controller, "accepted");

    expect(harness.controller.canCancelActiveInput()).toBe(true);
    harness.controller.cancelActiveInput();
    expect(cancelMasterInput).toHaveBeenCalledWith({ inputId: "master_input_1" });
    expect(harness.controller.getSnapshot().cancellation).toEqual({
      inputId: "master_input_1",
      type: "cancelling",
    });
    cancellation.resolve(cancelledState(harness.requests[0]!));
    await waitForInteraction(harness.controller, "cancelled");

    route.resolve(decidedState(acceptedFor(harness.requests[0]!, 1), "answer_global"));
    await flushPromises();
    expect(harness.controller.getSnapshot()).toMatchObject({
      cancellation: { type: "idle" },
      interaction: {
        state: { input: { id: "master_input_1" }, status: "cancelled" },
        type: "active",
      },
      submission: { type: "idle" },
    });
    expect(harness.controller.canCancelActiveInput()).toBe(false);
    expect(harness.controller.canSubmitInput()).toBe(true);
  });

  test("rejects a mismatched durable receipt and requires explicit discard", async () => {
    const pending = deferred<AcceptedMasterInput>();
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const harness = createHarness({ submitMasterInput: () => pending.promise });
    harness.controller.synchronizeRuntime("runtime_alpha");
    await flushPromises();
    harness.controller.submitText("Original request");

    expect(() => harness.controller.discard()).toThrow("cannot be discarded");
    const receipt = acceptedFor(harness.requests[0]!, 1);
    receipt.input = { ...receipt.input, text: "Different request" };
    pending.resolve(receipt);
    await waitForSubmission(harness.controller, "failed");
    harness.controller.discard();
    await flushPromises();

    expect(harness.controller.getSnapshot()).toMatchObject({
      interaction: { type: "idle" },
      submission: { type: "idle" },
    });
    info.mockRestore();
  });
});

function createHarness(overrides: Partial<AppShellMasterControllerDependencies> = {}) {
  const requests: SubmitMasterInputRequest[] = [];
  const settledStates = new Map<string, ShellInteractionState>();
  const selected = {
    ...defaultHarnessDependencies(requests, settledStates),
    ...overrides,
  };
  const dependencies: AppShellMasterControllerDependencies = {
    ...selected,
    cancelMasterInput: async (request) => {
      const state = await selected.cancelMasterInput(request);
      settledStates.set(request.inputId, state);
      return state;
    },
    submitMasterInput: async (request) => {
      requests.push(request);
      return selected.submitMasterInput(request);
    },
    waitShellInteraction: async (request) => {
      const state = await selected.waitShellInteraction(request);
      settledStates.set(request.inputId, state);
      return state;
    },
  };
  return { controller: new AppShellMasterController(dependencies), requests };
}

function defaultHarnessDependencies(
  requests: SubmitMasterInputRequest[],
  settledStates: Map<string, ShellInteractionState>,
): AppShellMasterControllerDependencies {
  let inputOrdinal = 0;
  return {
    cancelMasterInput: async ({ inputId }) => {
      const request = requests.find((candidate) => candidate.input.id === inputId);
      if (!request) throw new Error(`master input ${inputId} was not submitted`);
      return cancelledState(request);
    },
    createInputId: () => {
      inputOrdinal += 1;
      return `master_input_${inputOrdinal}`;
    },
    now: () => new Date("2026-07-12T18:00:00.120Z"),
    presentPresentationIntent: async () => ({ paneId: "pane_alpha" }),
    readActiveInteraction: async () => ({ state: null }),
    readFocusHints: () => ({
      focusedConversationId: "conversation_alpha",
      focusedPaneId: "pane_alpha",
      focusedWorkspaceId: "workspace_alpha",
    }),
    readTranscript: async () => transcriptForRequests(requests, settledStates),
    resolvePresentationIntent: async (request) => ({
      ...request,
      resolvedAt: "2026-07-12T18:00:01Z",
    }),
    submitMasterInput: async (request) => acceptedFor(request, requests.length),
    waitShellInteraction: async ({ inputId }) => {
      const request = requests.find((candidate) => candidate.input.id === inputId);
      if (!request) throw new Error(`master input ${inputId} was not submitted`);
      return decidedState(acceptedFor(request, requests.indexOf(request) + 1), "answer_global");
    },
    waitPresentationIntent: async ({ inputId }) => {
      const state = settledStates.get(inputId);
      if (!state) throw new Error(`master input ${inputId} has not settled`);
      return presentationFor(state);
    },
  };
}

function transcriptForRequests(
  requests: SubmitMasterInputRequest[],
  settledStates: Map<string, ShellInteractionState>,
): Transcript {
  let sequence = 0;
  const entries: Transcript["entries"] = [];
  for (const request of requests) {
    sequence += 1;
    entries.push({
      payload: {
        actionReceipt: null,
        assistantReply: null,
        cancellation: null,
        createdAt: "2026-07-12T18:00:01Z",
        failure: null,
        id: `master-transcript:user:${request.input.id}`,
        inputId: request.input.id,
        kind: "user_input",
        userInput: { modality: request.input.modality, text: request.input.text },
      },
      sequence,
    });
    const settled = settledStates.get(request.input.id);
    const payload = settled ? transcriptPayloadForSettledState(settled) : null;
    if (payload) {
      sequence += 1;
      entries.push({ payload, sequence });
    }
  }
  return { entries, lastSequence: sequence };
}

type TranscriptPayload = Transcript["entries"][number]["payload"];

function transcriptPayloadForSettledState(state: ShellInteractionState): TranscriptPayload | null {
  switch (state.status) {
    case "decided":
      return transcriptPayloadForDecisionState(state);
    case "cancelled":
      return cancellationTranscriptPayload(state);
    case "failed":
      return failureTranscriptPayload(state);
    case "accepted":
    case "routing":
      return null;
    default:
      return assertNever(state.status);
  }
}

function transcriptPayloadForDecisionState(state: ShellInteractionState): TranscriptPayload {
  const assistantReply = assistantTranscriptReply(state);
  return assistantReply
    ? assistantReplyTranscriptPayload(state, assistantReply)
    : actionReceiptTranscriptPayload(state);
}

function assistantTranscriptReply(
  state: ShellInteractionState,
): TranscriptPayload["assistantReply"] {
  if (state.decision?.kind === "answer_global" && state.decision.answerGlobal) {
    return { replyKind: "answer", text: state.decision.answerGlobal.text };
  }
  if (state.decision?.kind === "clarify" && state.decision.clarify) {
    return { replyKind: "clarification", text: state.decision.clarify.question };
  }
  return null;
}

function assistantReplyTranscriptPayload(
  state: ShellInteractionState,
  assistantReply: NonNullable<TranscriptPayload["assistantReply"]>,
): TranscriptPayload {
  return {
    actionReceipt: null,
    assistantReply,
    cancellation: null,
    createdAt: "2026-07-12T18:00:02Z",
    failure: null,
    id: `master-transcript:decision:${state.input.id}`,
    inputId: state.input.id,
    kind: "assistant_reply",
    userInput: null,
  };
}

function actionReceiptTranscriptPayload(state: ShellInteractionState): TranscriptPayload {
  return {
    actionReceipt: {
      decisionKind: state.decision?.kind ?? "focus_conversation",
      text: 'Setta focused "Alpha topic".',
    },
    assistantReply: null,
    cancellation: null,
    createdAt: "2026-07-12T18:00:02Z",
    failure: null,
    id: `master-transcript:decision:${state.input.id}`,
    inputId: state.input.id,
    kind: "action_receipt",
    userInput: null,
  };
}

function cancellationTranscriptPayload(state: ShellInteractionState): TranscriptPayload {
  return {
    actionReceipt: null,
    assistantReply: null,
    cancellation: { message: "Setta cancelled this request before routing completed." },
    createdAt: "2026-07-12T18:00:02Z",
    failure: null,
    id: `master-transcript:cancel:${state.input.id}`,
    inputId: state.input.id,
    kind: "cancellation",
    userInput: null,
  };
}

function failureTranscriptPayload(state: ShellInteractionState): TranscriptPayload | null {
  if (!state.failure) {
    return null;
  }
  return {
    actionReceipt: null,
    assistantReply: null,
    cancellation: null,
    createdAt: "2026-07-12T18:00:02Z",
    failure: {
      code: state.failure.code,
      message: state.failure.message,
      retryable: state.failure.retryable,
    },
    id: `master-transcript:failure:${state.input.id}`,
    inputId: state.input.id,
    kind: "failure",
    userInput: null,
  };
}

function emptyTranscript(): Transcript {
  return { entries: [], lastSequence: 0 };
}

function cancelledState(request: SubmitMasterInputRequest): ShellInteractionState {
  return {
    decision: null,
    failure: null,
    input: request.input,
    status: "cancelled",
  };
}

function presentationFor(state: ShellInteractionState): PresentationIntent {
  const decision = state.decision;
  if (decision === null) {
    throw new Error("master reply presentation requires a decision");
  }
  if (decision.kind === "clarify") {
    return masterReplyPresentation(state.input.id, "clarification", decision.clarify?.question);
  }
  if (decision.kind === "answer_global") {
    return masterReplyPresentation(state.input.id, "answer", decision.answerGlobal?.text);
  }
  throw new Error(`master reply presentation does not support ${decision.kind}`);
}

function masterReplyPresentation(
  inputId: string,
  replyKind: "answer" | "clarification",
  text: string | undefined,
): PresentationIntent {
  if (!text) {
    throw new Error(`master ${replyKind} presentation requires text`);
  }
  return {
    focusExistingConversationPane: null,
    id: `master-presentation:${inputId}`,
    inputId,
    kind: "show_master_reply",
    openConversationPane: null,
    openSideConversation: null,
    originatingConversationId: null,
    originatingConversationInputId: null,
    originatingPaneId: null,
    originatingWorkspaceId: null,
    showMasterReply: { replyKind, text },
    source: "shell",
  };
}

function focusPresentation(inputId: string): PresentationIntent {
  return {
    focusExistingConversationPane: {
      target: {
        conversationId: "conversation_alpha",
        preferredPaneId: "pane_alpha",
        title: "Alpha topic",
        workspaceId: "workspace_alpha",
      },
    },
    id: `master-presentation:${inputId}`,
    inputId,
    kind: "focus_existing_conversation_pane",
    openConversationPane: null,
    openSideConversation: null,
    originatingConversationId: null,
    originatingConversationInputId: null,
    originatingPaneId: null,
    originatingWorkspaceId: null,
    showMasterReply: null,
    source: "shell",
  };
}

function shellInput(
  id: string,
  modality: "text" | "voice",
  text: string,
): SubmitMasterInputRequest["input"] {
  return {
    focusedConversationId: "conversation_alpha",
    focusedPaneId: "pane_alpha",
    focusedWorkspaceId: "workspace_alpha",
    id,
    modality,
    originatingConversationId: null,
    originatingConversationInputId: null,
    originatingPaneId: null,
    originatingWorkspaceId: null,
    source: "shell",
    submittedAt: "2026-07-12T18:00:00.12Z",
    text,
  };
}

function acceptedFor(request: SubmitMasterInputRequest, sequence: number): AcceptedMasterInput {
  return {
    acceptedAt: "2026-07-12T18:00:01Z",
    input: request.input,
    replyDelivery: {
      originatingConversationId: null,
      originatingConversationInputId: null,
      originatingPaneId: null,
      originatingWorkspaceId: null,
    },
    sequence,
  };
}

function decidedState(
  accepted: AcceptedMasterInput,
  kind: Extract<RouteDecisionKind, "answer_global" | "clarify" | "focus_conversation">,
): ShellInteractionState {
  return {
    decision: routeDecision(kind),
    failure: null,
    input: accepted.input,
    status: "decided",
  };
}

function routeDecision(
  kind: Extract<RouteDecisionKind, "answer_global" | "clarify" | "focus_conversation">,
): RouteDecision {
  const decision: RouteDecision = {
    answerGlobal: null,
    askNarrator: null,
    clarify: null,
    createConversation: null,
    createSideConversation: null,
    focusConversation: null,
    forkConversation: null,
    kind,
    queueAgentTurn: null,
    sendToAgent: null,
    steerActiveTurn: null,
  };
  switch (kind) {
    case "answer_global":
      decision.answerGlobal = { text: "The global router is ready." };
      return decision;
    case "clarify":
      decision.clarify = { question: "Which topic did you mean?" };
      return decision;
    case "focus_conversation":
      decision.focusConversation = { conversationId: "conversation_alpha" };
      return decision;
    default:
      return assertNever(kind);
  }
}

function deferred<T>() {
  let reject!: (error: unknown) => void;
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    reject = rejectPromise;
    resolve = resolvePromise;
  });
  return { promise, reject, resolve };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

async function waitForSubmission(
  controller: AppShellMasterController,
  type: ReturnType<AppShellMasterController["getSnapshot"]>["submission"]["type"],
): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (controller.getSnapshot().submission.type === type) return;
    await flushPromises();
  }
  throw new Error(`master submission did not reach ${type}`);
}

async function waitForInteraction(
  controller: AppShellMasterController,
  status: ShellInteractionState["status"],
): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const interaction = controller.getSnapshot().interaction;
    if (interaction.type === "active" && interaction.state.status === status) return;
    await flushPromises();
  }
  throw new Error(`master interaction did not reach ${status}`);
}

async function waitForInteractionType(
  controller: AppShellMasterController,
  type: ReturnType<AppShellMasterController["getSnapshot"]>["interaction"]["type"],
): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (controller.getSnapshot().interaction.type === type) return;
    await flushPromises();
  }
  throw new Error(`master interaction did not reach ${type}`);
}

function assertNever(value: never): never {
  throw new Error(`Unhandled test route decision: ${String(value)}`);
}
