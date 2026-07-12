import type { AcceptedConversationInput, SubmitConversationInputRequest } from "@generated/backend";
import { describe, expect, test, vi } from "vitest";

import {
  GlobalSpeechConversationSubmissionController,
  type GlobalSpeechConversationSubmissionDependencies,
} from "./global-speech-conversation-submission";
import { conversationSpeechCaptureRequest } from "./speech-capture-destination";

describe("global speech conversation submission", () => {
  test("delivers one finalized pane transcript to its frozen conversation", async () => {
    const pending = deferred<AcceptedConversationInput>();
    const harness = createHarness({ submitConversationInput: vi.fn(() => pending.promise) });

    harness.controller.submitTranscript({
      captureSessionId: "capture_alpha",
      request: conversationSpeechCaptureRequest("conversation_alpha", "pane_alpha"),
      runtimeId: "runtime_alpha",
      transcript: "  Exact pane transcript.  ",
    });

    const submitting = harness.controller.getSnapshot();
    expect(submitting.completedTranscript).toMatchObject({
      captureSessionId: "capture_alpha",
      runtimeId: "runtime_alpha",
      transcript: "  Exact pane transcript.  ",
    });
    expect(Object.isFrozen(submitting.completedTranscript)).toBe(true);
    expect(Object.isFrozen(submitting.completedTranscript?.input)).toBe(true);
    expect(submitting.submission).toMatchObject({ type: "submitting" });
    expect(harness.requests).toEqual([
      {
        input: {
          conversationId: "conversation_alpha",
          id: "capture_alpha",
          modality: "voice",
          replyToInputId: null,
          sourcePaneId: "pane_alpha",
          submittedAt: "2026-07-12T18:00:00.12Z",
          text: "  Exact pane transcript.  ",
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
    expect(harness.requests).toHaveLength(1);
  });

  test("retries the exact frozen input and accepts its advanced durable status", async () => {
    const retry = deferred<AcceptedConversationInput>();
    const submit = vi
      .fn<(request: SubmitConversationInputRequest) => Promise<AcceptedConversationInput>>()
      .mockRejectedValueOnce(new Error("private backend failure"))
      .mockImplementationOnce(() => retry.promise);
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const harness = createHarness({ submitConversationInput: submit });

    harness.controller.submitTranscript({
      captureSessionId: "capture_retry",
      request: conversationSpeechCaptureRequest("conversation_alpha", "pane_alpha"),
      runtimeId: "runtime_alpha",
      transcript: "Retry this pane request",
    });
    await waitForSubmission(harness.controller, "failed");

    const failed = harness.controller.getSnapshot();
    expect(failed.completedTranscript).not.toBeNull();
    expect(failed.submission).toEqual({
      input: harness.requests[0]!.input,
      message:
        "Setta could not accept the conversation voice request. Retry without recording it again.",
      type: "failed",
    });
    expect(JSON.stringify(failed)).not.toContain("private backend");

    harness.controller.retry();
    expect(harness.requests).toHaveLength(2);
    expect(harness.requests[1]!.input).toBe(harness.requests[0]!.input);
    retry.resolve({ ...acceptedFor(harness.requests[1]!), status: "routing" });
    await flushPromises();

    expect(harness.controller.getSnapshot().submission).toMatchObject({
      accepted: { status: "routing" },
      type: "accepted",
    });
    expect(info).toHaveBeenCalledWith(
      "Conversation voice input submission failed: inputId=capture_retry",
    );
    info.mockRestore();
  });

  test("runtime reset invalidates a late submission result", async () => {
    const pending = deferred<AcceptedConversationInput>();
    const harness = createHarness({ submitConversationInput: () => pending.promise });
    harness.controller.submitTranscript({
      captureSessionId: "capture_old",
      request: conversationSpeechCaptureRequest("conversation_old", "pane_old"),
      runtimeId: "runtime_old",
      transcript: "Old runtime request",
    });
    const request = harness.requests[0]!;

    harness.controller.reset();
    pending.resolve(acceptedFor(request));
    await flushPromises();

    expect(harness.controller.getSnapshot()).toEqual({
      completedTranscript: null,
      submission: { type: "idle" },
    });
  });

  test("rejects a mismatched receipt and permits explicit discard only after failure", async () => {
    const pending = deferred<AcceptedConversationInput>();
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const harness = createHarness({ submitConversationInput: () => pending.promise });
    harness.controller.submitTranscript({
      captureSessionId: "capture_mismatch",
      request: conversationSpeechCaptureRequest("conversation_alpha", "pane_alpha"),
      runtimeId: "runtime_alpha",
      transcript: "Original pane request",
    });
    expect(() => harness.controller.discard()).toThrow("cannot be discarded");

    const receipt = acceptedFor(harness.requests[0]!);
    receipt.input = { ...receipt.input, sourcePaneId: "pane_other" };
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

function createHarness(overrides: Partial<GlobalSpeechConversationSubmissionDependencies> = {}) {
  const requests: SubmitConversationInputRequest[] = [];
  const submitConversationInput =
    overrides.submitConversationInput ??
    (async (request: SubmitConversationInputRequest) => acceptedFor(request));
  const dependencies: GlobalSpeechConversationSubmissionDependencies = {
    now: () => new Date("2026-07-12T18:00:00.120Z"),
    submitConversationInput: async (request) => {
      requests.push(request);
      return submitConversationInput(request);
    },
    ...overrides,
  };
  if (overrides.submitConversationInput) {
    dependencies.submitConversationInput = async (request) => {
      requests.push(request);
      return overrides.submitConversationInput!(request);
    };
  }
  return {
    controller: new GlobalSpeechConversationSubmissionController(dependencies),
    requests,
  };
}

function acceptedFor(request: SubmitConversationInputRequest): AcceptedConversationInput {
  return {
    acceptedAt: "2026-07-12T18:00:01Z",
    input: request.input,
    sequence: 1,
    status: "accepted",
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
  controller: GlobalSpeechConversationSubmissionController,
  type: ReturnType<
    GlobalSpeechConversationSubmissionController["getSnapshot"]
  >["submission"]["type"],
): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (controller.getSnapshot().submission.type === type) {
      return;
    }
    await flushPromises();
  }
  throw new Error(`conversation submission did not reach ${type}`);
}
