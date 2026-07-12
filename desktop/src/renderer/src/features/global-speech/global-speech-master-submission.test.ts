import type { AcceptedMasterInput, SubmitMasterInputRequest } from "@generated/backend";
import { describe, expect, test, vi } from "vitest";

import {
  GlobalSpeechMasterSubmissionController,
  type GlobalSpeechMasterSubmissionDependencies,
} from "./global-speech-master-submission";

describe("global speech master submission", () => {
  test("normalizes one finalized voice transcript with current focus hints", async () => {
    const pending = deferred<AcceptedMasterInput>();
    const harness = createHarness({ submitMasterInput: vi.fn(() => pending.promise) });

    harness.controller.submitTranscript("capture_alpha", "runtime_alpha", "  Exact final text.  ");

    const submitting = harness.controller.getSnapshot();
    expect(submitting.completedTranscript).toMatchObject({
      captureSessionId: "capture_alpha",
      runtimeId: "runtime_alpha",
      transcript: "  Exact final text.  ",
    });
    expect(submitting.submission).toMatchObject({ type: "submitting" });
    expect(harness.requests).toEqual([
      {
        input: {
          focusedConversationId: "conversation_alpha",
          focusedPaneId: "pane_alpha",
          focusedWorkspaceId: "workspace_alpha",
          id: "capture_alpha",
          modality: "voice",
          submittedAt: "2026-07-12T18:00:00.12Z",
          text: "  Exact final text.  ",
        },
      },
    ]);

    pending.resolve(acceptedFor(harness.requests[0]!));
    await flushPromises();

    expect(harness.controller.getSnapshot()).toMatchObject({
      completedTranscript: null,
      submission: {
        accepted: { acceptedAt: "2026-07-12T18:00:01Z", sequence: 1 },
        type: "accepted",
      },
    });
  });

  test("retains a failed transcript and retries the exact idempotent input", async () => {
    const retry = deferred<AcceptedMasterInput>();
    const privateFailure = new Error("private backend failure");
    const submit = vi
      .fn<(request: SubmitMasterInputRequest) => Promise<AcceptedMasterInput>>()
      .mockRejectedValueOnce(privateFailure)
      .mockImplementationOnce(() => retry.promise);
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const harness = createHarness({ submitMasterInput: submit });

    harness.controller.submitTranscript("capture_retry", "runtime_alpha", "Retry this request");
    await waitForSubmission(harness.controller, "failed");

    const failed = harness.controller.getSnapshot();
    expect(failed.completedTranscript).not.toBeNull();
    expect(failed.submission).toEqual({
      input: harness.requests[0]!.input,
      message: "Setta could not accept the voice request. Retry without recording it again.",
      type: "failed",
    });
    expect(JSON.stringify(failed)).not.toContain("private backend");

    harness.controller.retry();
    expect(harness.requests).toHaveLength(2);
    expect(harness.requests[1]!.input).toBe(harness.requests[0]!.input);
    retry.resolve(acceptedFor(harness.requests[1]!));
    await flushPromises();

    expect(harness.controller.getSnapshot().submission.type).toBe("accepted");
    expect(info).toHaveBeenCalledWith(
      "Global master input submission failed: inputId=capture_retry",
    );
    info.mockRestore();
  });

  test("runtime reset invalidates a late submission result", async () => {
    const pending = deferred<AcceptedMasterInput>();
    const harness = createHarness({ submitMasterInput: () => pending.promise });
    harness.controller.submitTranscript("capture_old", "runtime_old", "Old runtime request");
    const request = harness.requests[0]!;

    harness.controller.reset();
    pending.resolve(acceptedFor(request));
    await flushPromises();

    expect(harness.controller.getSnapshot()).toEqual({
      completedTranscript: null,
      submission: { type: "idle" },
    });
  });

  test("rejects a mismatched receipt and blocks discard while submission is active", async () => {
    const pending = deferred<AcceptedMasterInput>();
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const harness = createHarness({ submitMasterInput: () => pending.promise });
    harness.controller.submitTranscript("capture_mismatch", "runtime_alpha", "Original request");
    expect(() => harness.controller.discard()).toThrow("cannot be discarded");

    const receipt = acceptedFor(harness.requests[0]!);
    receipt.input = { ...receipt.input, text: "Different request" };
    pending.resolve(receipt);
    await flushPromises();

    expect(harness.controller.getSnapshot().submission.type).toBe("failed");
    harness.controller.discard();
    expect(harness.controller.getSnapshot()).toEqual({
      completedTranscript: null,
      submission: { type: "idle" },
    });
    info.mockRestore();
  });
});

function createHarness(overrides: Partial<GlobalSpeechMasterSubmissionDependencies> = {}) {
  const requests: SubmitMasterInputRequest[] = [];
  const submitMasterInput =
    overrides.submitMasterInput ??
    (async (request: SubmitMasterInputRequest) => acceptedFor(request));
  const dependencies: GlobalSpeechMasterSubmissionDependencies = {
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
  return { controller: new GlobalSpeechMasterSubmissionController(dependencies), requests };
}

function acceptedFor(request: SubmitMasterInputRequest): AcceptedMasterInput {
  return {
    acceptedAt: "2026-07-12T18:00:01Z",
    input: request.input,
    sequence: 1,
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
  controller: GlobalSpeechMasterSubmissionController,
  type: ReturnType<GlobalSpeechMasterSubmissionController["getSnapshot"]>["submission"]["type"],
): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (controller.getSnapshot().submission.type === type) {
      return;
    }
    await flushPromises();
  }
  throw new Error(`master submission did not reach ${type}`);
}
