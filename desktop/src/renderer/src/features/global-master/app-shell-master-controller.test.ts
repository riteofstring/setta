import type {
  AcceptedMasterInput,
  RouteDecision,
  RouteDecisionKind,
  ShellInteractionState,
  SubmitMasterInputRequest,
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
    const harness = createHarness({ submitMasterInput: () => pending.promise });
    harness.controller.synchronizeRuntime("runtime_old");
    await flushPromises();
    harness.controller.submitText("Old runtime request");
    const request = harness.requests[0]!;

    harness.controller.synchronizeRuntime("runtime_new");
    pending.resolve(acceptedFor(request, 1));
    await flushPromises();

    expect(harness.controller.getSnapshot()).toEqual({
      completedTranscript: null,
      draft: "",
      interaction: { type: "idle" },
      overlayOpen: true,
      runtimeId: "runtime_new",
      submission: { type: "idle" },
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

  test("dismisses a completed immediate result instead of retaining scrollback", async () => {
    const harness = createHarness();
    harness.controller.synchronizeRuntime("runtime_alpha");
    await flushPromises();
    harness.controller.submitText("What can you do globally?");
    await waitForInteraction(harness.controller, "decided");

    harness.controller.closeOverlay();
    harness.controller.openOverlay();

    expect(harness.controller.getSnapshot()).toMatchObject({
      interaction: { type: "idle" },
      overlayOpen: true,
    });
    expect(harness.controller.getSnapshot()).not.toHaveProperty("recentInputs");
    expect(harness.controller.getSnapshot()).not.toHaveProperty("history");
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
  let inputOrdinal = 0;
  const submitMasterInput =
    overrides.submitMasterInput ??
    (async (request: SubmitMasterInputRequest) => acceptedFor(request, requests.length));
  const waitShellInteraction =
    overrides.waitShellInteraction ??
    (async ({ inputId }) => {
      const request = requests.find((candidate) => candidate.input.id === inputId);
      if (!request) throw new Error(`master input ${inputId} was not submitted`);
      return decidedState(acceptedFor(request, requests.indexOf(request) + 1), "answer_global");
    });
  const dependencies: AppShellMasterControllerDependencies = {
    createInputId: () => {
      inputOrdinal += 1;
      return `master_input_${inputOrdinal}`;
    },
    now: () => new Date("2026-07-12T18:00:00.120Z"),
    readActiveInteraction: async () => ({ state: null }),
    readFocusHints: () => ({
      focusedConversationId: "conversation_alpha",
      focusedPaneId: "pane_alpha",
      focusedWorkspaceId: "workspace_alpha",
    }),
    submitMasterInput: async (request) => {
      requests.push(request);
      return submitMasterInput(request);
    },
    waitShellInteraction,
    ...overrides,
  };
  if (overrides.submitMasterInput) {
    dependencies.submitMasterInput = async (request) => {
      requests.push(request);
      return overrides.submitMasterInput!(request);
    };
  }
  return { controller: new AppShellMasterController(dependencies), requests };
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
