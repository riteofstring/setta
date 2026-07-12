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
      runtimeId: "runtime_alpha",
      submission: { accepted: { sequence: 2 }, type: "accepted" },
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
      runtimeId: "runtime_new",
      submission: { type: "idle" },
    });
    expect(() =>
      harness.controller.submitVoiceTranscript("capture_old", "runtime_old", "Stale"),
    ).toThrow("stale runtime");
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
    expect(harness.controller.getSnapshot().submission).toEqual({ type: "idle" });
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

function shellInput(id: string, modality: "text" | "voice", text: string) {
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
