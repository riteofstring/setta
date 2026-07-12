import type { AcceptedMasterInput, SubmitMasterInputRequest } from "@generated/backend";
import { describe, expect, test, vi } from "vitest";

import {
  AppShellMasterController,
  type AppShellMasterControllerDependencies,
} from "./app-shell-master-controller";

describe("app-shell master controller", () => {
  test("submits shell text and finalized voice through one source-normalizing controller", async () => {
    const harness = createHarness();
    harness.controller.synchronizeRuntime("runtime_alpha");

    expect(harness.controller.submitText("  Route this typed request.  ")).toBe("master_input_1");
    await flushPromises();
    harness.controller.clearAccepted();
    harness.controller.submitVoiceTranscript(
      "capture_alpha",
      "runtime_alpha",
      "  Exact final voice text.  ",
    );
    await flushPromises();

    expect(harness.requests.map((request) => request.input)).toEqual([
      shellInput("master_input_1", "text", "  Route this typed request.  "),
      shellInput("capture_alpha", "voice", "  Exact final voice text.  "),
    ]);
    expect(harness.controller.getSnapshot()).toMatchObject({
      completedTranscript: null,
      overlayOpen: true,
      recentInputs: [
        { input: { id: "master_input_1", modality: "text" } },
        { input: { id: "capture_alpha", modality: "voice" } },
      ],
      runtimeId: "runtime_alpha",
      submission: { accepted: { sequence: 2 }, type: "accepted" },
    });
  });

  test("shares a persistent overlay draft across shell entry points", () => {
    const harness = createHarness();
    harness.controller.synchronizeRuntime("runtime_alpha");

    harness.controller.openOverlay();
    harness.controller.setDraft("Bring back the speech routing topic");
    harness.controller.closeOverlay();

    expect(harness.controller.getSnapshot()).toMatchObject({
      draft: "Bring back the speech routing topic",
      overlayOpen: false,
    });

    harness.controller.openOverlay();
    expect(harness.controller.getSnapshot()).toMatchObject({
      draft: "Bring back the speech routing topic",
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

    harness.controller.submitVoiceTranscript("capture_retry", "runtime_alpha", "Retry this");
    await waitForSubmission(harness.controller, "failed");
    const failed = harness.controller.getSnapshot();
    expect(failed.completedTranscript).not.toBeNull();
    expect(failed.submission).toEqual({
      input: harness.requests[0]!.input,
      message: "Setta could not accept the voice request. Retry without recording it again.",
      type: "failed",
    });

    harness.controller.retry();
    expect(harness.requests[1]!.input).toBe(harness.requests[0]!.input);
    retry.resolve(acceptedFor(harness.requests[1]!, 1));
    await flushPromises();
    expect(harness.controller.getSnapshot().submission.type).toBe("accepted");
    expect(info).toHaveBeenCalledWith(
      "Shell master input submission failed: inputId=capture_retry",
    );
    info.mockRestore();
  });

  test("runtime changes invalidate late results and stale voice transcripts", async () => {
    const pending = deferred<AcceptedMasterInput>();
    const harness = createHarness({ submitMasterInput: () => pending.promise });
    harness.controller.synchronizeRuntime("runtime_old");
    harness.controller.submitText("Old runtime request");
    const request = harness.requests[0]!;

    harness.controller.synchronizeRuntime("runtime_new");
    pending.resolve(acceptedFor(request, 1));
    await flushPromises();

    expect(harness.controller.getSnapshot()).toEqual({
      completedTranscript: null,
      draft: "",
      history: { capacity: 40, type: "ready" },
      overlayOpen: true,
      recentInputs: [],
      runtimeId: "runtime_new",
      submission: { type: "idle" },
    });
    expect(() =>
      harness.controller.submitVoiceTranscript("capture_old", "runtime_old", "Stale"),
    ).toThrow("stale runtime");
  });

  test("keeps recent exchanges through reconnects and isolates them by runtime", async () => {
    const harness = createHarness();
    harness.controller.synchronizeRuntime("runtime_alpha");
    harness.controller.submitText("Alpha request");
    await flushPromises();

    harness.controller.synchronizeRuntime(null);
    expect(harness.controller.getSnapshot().recentInputs).toMatchObject([
      { input: { text: "Alpha request" } },
    ]);
    harness.controller.synchronizeRuntime("runtime_alpha");
    expect(harness.controller.getSnapshot().recentInputs).toMatchObject([
      { input: { text: "Alpha request" } },
    ]);

    harness.controller.synchronizeRuntime("runtime_beta");
    expect(harness.controller.getSnapshot().recentInputs).toEqual([]);
    harness.controller.submitText("Beta request");
    await flushPromises();
    harness.controller.synchronizeRuntime("runtime_alpha");
    expect(harness.controller.getSnapshot().recentInputs).toMatchObject([
      { input: { text: "Alpha request" } },
    ]);
  });

  test("hydrates durable shell and conversation-escalation history after renderer restart", async () => {
    const shellRequest: SubmitMasterInputRequest = {
      input: shellInput("input_shell", "text", "Persisted shell request"),
    };
    const escalationInput = {
      ...shellInput("input_escalation", "text", "Unrelated pane request"),
      originatingConversationId: "conversation_origin",
      originatingConversationInputId: "conversation_input_origin",
      originatingPaneId: "pane_origin",
      originatingWorkspaceId: "workspace_alpha",
      source: "conversation_escalation" as const,
    };
    const history = {
      capacity: 40,
      inputs: [
        acceptedFor(shellRequest, 3),
        {
          acceptedAt: "2026-07-12T18:00:02Z",
          input: escalationInput,
          replyDelivery: {
            originatingConversationId: escalationInput.originatingConversationId,
            originatingConversationInputId: escalationInput.originatingConversationInputId,
            originatingPaneId: escalationInput.originatingPaneId,
            originatingWorkspaceId: escalationInput.originatingWorkspaceId,
            showInMasterOverlay: true,
          },
          sequence: 4,
        },
      ],
    };
    const harness = createHarness({ readRecentMasterInputs: async () => history });

    harness.controller.synchronizeRuntime("runtime_alpha");
    await flushPromises();

    expect(harness.controller.getSnapshot()).toMatchObject({
      history: { capacity: 40, type: "ready" },
      recentInputs: [
        { input: { id: "input_shell", source: "shell" }, sequence: 3 },
        { input: { id: "input_escalation", source: "conversation_escalation" }, sequence: 4 },
      ],
    });
  });

  test("reports a durable history failure and retries it explicitly", async () => {
    const readRecentMasterInputs = vi
      .fn<AppShellMasterControllerDependencies["readRecentMasterInputs"]>()
      .mockRejectedValueOnce(new Error("private backend failure"))
      .mockResolvedValueOnce({ capacity: 40, inputs: [] });
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const harness = createHarness({ readRecentMasterInputs });
    harness.controller.synchronizeRuntime("runtime_alpha");
    await flushPromises();

    expect(harness.controller.getSnapshot().history).toMatchObject({ type: "failed" });
    harness.controller.retryHistory();
    await flushPromises();
    expect(harness.controller.getSnapshot().history).toEqual({ capacity: 40, type: "ready" });
    expect(readRecentMasterInputs).toHaveBeenCalledTimes(2);
    expect(info).toHaveBeenCalledWith(
      "Recent master input history load failed: runtimeId=runtime_alpha",
    );
    info.mockRestore();
  });

  test("rejects a mismatched receipt and blocks concurrent or active discard", async () => {
    const pending = deferred<AcceptedMasterInput>();
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const harness = createHarness({ submitMasterInput: () => pending.promise });
    harness.controller.synchronizeRuntime("runtime_alpha");
    harness.controller.submitText("Original request");

    expect(() => harness.controller.submitText("Concurrent request")).toThrow("already awaiting");
    expect(() => harness.controller.discard()).toThrow("cannot be discarded");
    const receipt = acceptedFor(harness.requests[0]!, 1);
    receipt.input = { ...receipt.input, text: "Different request" };
    pending.resolve(receipt);
    await flushPromises();

    expect(harness.controller.getSnapshot().submission.type).toBe("failed");
    harness.controller.discard();
    expect(harness.controller.getSnapshot()).toMatchObject({
      overlayOpen: true,
      recentInputs: [],
      submission: { type: "idle" },
    });
    info.mockRestore();
  });

  test("bounds recent accepted inputs without clearing them with speech status", async () => {
    const harness = createHarness();
    harness.controller.synchronizeRuntime("runtime_alpha");

    for (let index = 0; index < 45; index += 1) {
      harness.controller.submitText(`Request ${index}`);
      await flushPromises();
      harness.controller.clearAccepted();
    }

    const recentInputs = harness.controller.getSnapshot().recentInputs;
    expect(recentInputs).toHaveLength(40);
    expect(recentInputs[0]?.input.text).toBe("Request 5");
    expect(recentInputs.at(-1)?.input.text).toBe("Request 44");
    expect(Object.isFrozen(recentInputs)).toBe(true);
  });

  test("bounds local receipts while durable history is unavailable", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const harness = createHarness({
      readRecentMasterInputs: async () => Promise.reject(new Error("history unavailable")),
    });
    harness.controller.synchronizeRuntime("runtime_alpha");
    await flushPromises();

    for (let index = 0; index < 5; index += 1) {
      harness.controller.submitText(`Unhydrated request ${index}`);
      await flushPromises();
      harness.controller.clearAccepted();
    }

    expect(harness.controller.getSnapshot()).toMatchObject({
      history: { type: "failed" },
      recentInputs: [{ input: { text: "Unhydrated request 4" } }],
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
  const dependencies: AppShellMasterControllerDependencies = {
    createInputId: () => {
      inputOrdinal += 1;
      return `master_input_${inputOrdinal}`;
    },
    now: () => new Date("2026-07-12T18:00:00.120Z"),
    readRecentMasterInputs: async () => ({ capacity: 40, inputs: [] }),
    readFocusHints: () => ({
      focusedConversationId: "conversation_alpha",
      focusedPaneId: "pane_alpha",
      focusedWorkspaceId: "workspace_alpha",
    }),
    submitMasterInput: async (request) => {
      requests.push(request);
      return submitMasterInput(request);
    },
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
      showInMasterOverlay: true,
    },
    sequence,
  };
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
}

async function waitForSubmission(
  controller: AppShellMasterController,
  type: ReturnType<AppShellMasterController["getSnapshot"]>["submission"]["type"],
): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (controller.getSnapshot().submission.type === type) {
      return;
    }
    await flushPromises();
  }
  throw new Error(`master submission did not reach ${type}`);
}
