import {
  type AcceptedConversationInput,
  type AcceptedMasterInput,
  type SpeechCapabilities,
  type SpeechTranscriptionSession,
  type SubmitMasterInputRequest,
  type SubmitConversationInputRequest,
} from "@generated/backend";
import { describe, expect, test, vi } from "vitest";

import { AppShellMasterController } from "../global-master/app-shell-master-controller";
import {
  AppShellSpeechCaptureController,
  type AppShellSpeechCaptureControllerDependencies,
  type SpeechCaptureFailureCode,
} from "./app-shell-speech-capture-controller";
import {
  BufferedMicrophoneCaptureError,
  type BufferedMicrophoneCapture,
  type CreateBufferedMicrophoneCaptureOptions,
} from "./buffered-microphone-capture";
import {
  createOpenAIBrowserSpeechCaptureProvider,
  type OpenAIBrowserSpeechCaptureProviderDependencies,
} from "./openai-speech-capture-provider";
import {
  RealtimeTranscriptionError,
  type RealtimeTranscriptionErrorCode,
} from "./realtime-transcription-error";
import { conversationSpeechCaptureRequest } from "./speech-capture-destination";
import type { RealtimeTranscriptionUpdate } from "./realtime-transcription-session";
import type {
  CreateRealtimeTranscriptionTransportOptions,
  RealtimeTranscriptionTransport,
} from "./realtime-transcription-transport";

describe("app-shell speech capture controller", () => {
  test("starts microphone capture directly without a separate enable preference", async () => {
    const harness = createHarness();
    await harness.controller.synchronizeRuntime("runtime_capture");

    expect(harness.controller.getSnapshot()).toMatchObject({
      availability: { type: "configured" },
      runtimeId: "runtime_capture",
    });
    const start = harness.startMaster();
    expect(harness.currentCapture()).toMatchObject({ type: "requesting_permission" });
    await harness.waitForCapture("recording");
    expect(harness.currentCapture()).toMatchObject({
      connection: "connecting",
      type: "recording",
    });
    await harness.waitForTransport();
    harness.transport.resolveReady();
    await flushPromises();
    await start;

    expect(harness.mediaConstraints).toEqual([{ audio: true, video: false }]);
    expect(harness.currentCapture()).toMatchObject({
      connection: "ready",
      type: "recording",
    });
    harness.controller.cancel();
  });

  test("publishes local recording before fast provider connection starts", async () => {
    const providerConnectionStarts: Array<() => void> = [];
    const harness = createHarness({
      deferProviderConnection: (handler) => providerConnectionStarts.push(handler),
    });
    await harness.connect();

    const start = harness.startMaster();
    await harness.waitForCapture("recording");

    expect(harness.currentCapture()).toMatchObject({
      connection: "connecting",
      type: "recording",
    });
    expect(harness.transports).toEqual([]);
    expect(providerConnectionStarts).toHaveLength(1);

    providerConnectionStarts.shift()?.();
    await harness.waitForTransport();
    harness.transport.resolveReady();
    await flushPromises();
    await start;

    expect(harness.currentCapture()).toMatchObject({ connection: "ready", type: "recording" });
  });

  test("runs one global permission, connection, preview, commit, and completion lifecycle", async () => {
    const harness = createHarness();
    await harness.connect();

    const start = harness.startMaster();
    expect(harness.masterController.getSnapshot().overlayOpen).toBe(true);
    expect(harness.currentCapture()).toMatchObject({
      captureSessionId: "capture_1",
      transcript: "",
      type: "requesting_permission",
    });
    await harness.waitForTransport();
    expect(harness.mediaConstraints).toEqual([{ audio: true, video: false }]);
    expect(harness.transcriptionSessionCalls).toBe(1);
    expect(harness.timerDelayMs).toBe(120_000);

    harness.transport.resolveReady();
    await flushPromises();
    await start;
    expect(harness.currentCapture()).toMatchObject({ connection: "ready", type: "recording" });

    harness.controller.commit();
    expect(harness.track.stop).toHaveBeenCalledOnce();
    expect(harness.currentCapture()).toMatchObject({ type: "draining" });
    await flushPromises();
    expect(harness.transport.commit).toHaveBeenCalledOnce();
    harness.transport.delta("partial words");
    expect(harness.currentCapture()).toMatchObject({
      transcript: "partial words",
      type: "committing",
    });
    harness.transport.complete("  Provider final, unchanged.  ");
    expect(harness.controller.getSnapshot()).toMatchObject({
      capture: { type: "idle" },
      completedTranscript: {
        captureSessionId: "capture_1",
        runtimeId: "runtime_capture",
        transcript: "  Provider final, unchanged.  ",
      },
      masterSubmission: { type: "submitting" },
    });
    await flushPromises();

    expect(harness.currentCapture()).toEqual({ type: "idle" });
    expect(harness.controller.getSnapshot().completedTranscript).toBeNull();
    expect(harness.controller.getSnapshot().masterSubmission).toMatchObject({
      accepted: { sequence: 1 },
      type: "accepted",
    });
    expect(harness.masterInputRequests).toEqual([
      {
        input: {
          focusedConversationId: null,
          focusedPaneId: null,
          focusedWorkspaceId: "workspace_capture",
          id: "capture_1",
          modality: "voice",
          originatingConversationId: null,
          originatingConversationInputId: null,
          originatingPaneId: null,
          originatingWorkspaceId: null,
          source: "shell",
          submittedAt: "2026-07-12T18:00:00Z",
          text: "  Provider final, unchanged.  ",
        },
      },
    ]);
    expect(harness.transport.close).toHaveBeenCalledOnce();
    expect(harness.track.stop).toHaveBeenCalledOnce();
    expect(harness.outboundTrack.stop).toHaveBeenCalledOnce();
    expect(harness.clearTimer).toHaveBeenCalledOnce();
  });

  test("finishes a locally captured request before provider setup is ready", async () => {
    const session = deferred<SpeechTranscriptionSession>();
    const harness = createHarness({ createTranscriptionSession: () => session.promise });
    await harness.connect();

    const start = harness.startMaster();
    await harness.waitForCapture("recording");
    await start;
    expect(harness.currentCapture()).toMatchObject({
      connection: "connecting",
      type: "recording",
    });
    expect(harness.transports).toEqual([]);

    harness.controller.commit();
    expect(harness.track.stop).toHaveBeenCalledOnce();
    expect(harness.currentCapture()).toMatchObject({
      connection: "connecting",
      type: "draining",
    });

    session.resolve(transcriptionSession());
    await harness.waitForTransport();
    expect(harness.transport.commit).not.toHaveBeenCalled();

    harness.transport.resolveReady();
    await flushPromises();
    await flushPromises();

    expect(harness.captures[0]?.releaseToTransport).toHaveBeenCalledOnce();
    expect(harness.currentCapture()).toMatchObject({ type: "committing" });
    expect(harness.transport.commit).toHaveBeenCalledOnce();
  });

  test("accepts a provider final transcript emitted while finish is draining", async () => {
    const harness = createHarness();
    await harness.connect();

    const start = harness.startMaster();
    await harness.waitForTransport();
    harness.transport.resolveReady();
    await flushPromises();
    await start;
    harness.transport.commit.mockImplementationOnce(() => {
      harness.transport.complete("Provider finished while draining.");
    });

    harness.controller.commit();
    await flushPromises();

    expect(harness.currentCapture()).toEqual({ type: "idle" });
    expect(harness.masterInputRequests).toEqual([
      {
        input: expect.objectContaining({
          id: "capture_1",
          modality: "voice",
          text: "Provider finished while draining.",
        }),
      },
    ]);
    expect(harness.transport.close).toHaveBeenCalledOnce();
  });

  test("preempts playback only when a new recording lifecycle begins", async () => {
    const onCaptureEnd = vi.fn();
    const onCaptureStart = vi.fn();
    const harness = createHarness({ onCaptureEnd, onCaptureStart });

    await harness.connect();
    const start = harness.startMaster();
    await harness.waitForTransport();
    harness.transport.resolveReady();
    await flushPromises();
    await start;
    expect(onCaptureStart).toHaveBeenCalledOnce();

    await harness.startMaster();
    await flushPromises();
    expect(harness.currentCapture().type).toBe("committing");
    expect(onCaptureStart).toHaveBeenCalledOnce();
    expect(onCaptureEnd).not.toHaveBeenCalled();

    harness.transport.complete("Finish the capture lifecycle.");
    expect(onCaptureEnd).toHaveBeenCalledOnce();
  });

  test("freezes a pane conversation destination for the full capture lifecycle", async () => {
    const harness = createHarness();
    await harness.connect();
    const requestedCapture = {
      destination: {
        conversationId: "conversation_original",
        type: "conversation" as const,
        workspaceId: "workspace_original",
      },
      sourcePaneId: "pane_original",
    };

    const start = harness.controller.start(requestedCapture);
    requestedCapture.destination.conversationId = "conversation_changed";
    requestedCapture.sourcePaneId = "pane_changed";

    expect(harness.currentCapture()).toMatchObject({
      request: {
        destination: {
          conversationId: "conversation_original",
          type: "conversation",
          workspaceId: "workspace_original",
        },
        sourcePaneId: "pane_original",
      },
      type: "requesting_permission",
    });
    const activeRequest = activeCaptureRequest(harness.currentCapture());
    expect(Object.isFrozen(activeRequest)).toBe(true);
    expect(Object.isFrozen(activeRequest.destination)).toBe(true);

    await harness.waitForTransport();
    harness.transport.resolveReady();
    await flushPromises();
    await start;
    harness.controller.commit();
    await flushPromises();
    harness.transport.complete("Keep this pane-local request frozen");

    expect(harness.masterInputRequests).toEqual([]);
    expect(harness.controller.getSnapshot().completedConversationTranscript).toEqual({
      captureSessionId: "capture_1",
      input: {
        conversationId: "conversation_original",
        id: "capture_1",
        modality: "voice",
        replyToInputId: null,
        sourcePaneId: "pane_original",
        submittedAt: "2026-07-12T18:00:00Z",
        text: "Keep this pane-local request frozen",
      },
      request: {
        destination: {
          conversationId: "conversation_original",
          type: "conversation",
          workspaceId: "workspace_original",
        },
        sourcePaneId: "pane_original",
      },
      runtimeId: "runtime_capture",
      transcript: "Keep this pane-local request frozen",
    });
    expect(harness.conversationInputRequests).toEqual([
      { input: harness.controller.getSnapshot().completedConversationTranscript!.input },
    ]);

    await harness.controller.start(
      conversationSpeechCaptureRequest("workspace_second", "conversation_second", "pane_second"),
    );
    expect(harness.currentCapture()).toMatchObject({
      code: "conversation_submission_pending",
      type: "failed",
    });
    expect(harness.mediaConstraints).toHaveLength(1);
  });

  test("cancels only the active conversation capture for a closing source pane", async () => {
    const harness = createHarness();
    await harness.connect();
    const request = conversationSpeechCaptureRequest(
      "workspace_close",
      "conversation_close",
      "pane_close",
    );

    const start = harness.controller.start(request);
    await harness.waitForCapture("recording");
    await start;

    expect(
      harness.controller.cancelActiveConversationCapture(
        conversationSpeechCaptureRequest("workspace_close", "conversation_other", "pane_close"),
      ),
    ).toBe(false);
    expect(harness.currentCapture()).toMatchObject({ type: "recording" });

    expect(harness.controller.cancelActiveConversationCapture(request)).toBe(true);
    expect(harness.currentCapture()).toEqual({ type: "idle" });
    expect(harness.captures[0]?.close).toHaveBeenCalledOnce();
    expect(harness.track.stop).toHaveBeenCalledOnce();
    expect(harness.outboundTrack.stop).toHaveBeenCalledOnce();
  });

  test("retains failed master submission for exact retry before another capture", async () => {
    const acceptedRetry = deferred<AcceptedMasterInput>();
    const submit = vi
      .fn<(request: SubmitMasterInputRequest) => Promise<AcceptedMasterInput>>()
      .mockRejectedValueOnce(new Error("private runtime failure"))
      .mockImplementationOnce(() => acceptedRetry.promise);
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const harness = createHarness({ submitMasterInput: submit });
    await harness.connect();
    const start = harness.startMaster();
    await harness.waitForTransport();
    harness.transport.resolveReady();
    await flushPromises();
    await start;
    harness.controller.commit();
    await flushPromises();
    harness.transport.complete("Retry this finalized request");
    await harness.waitForMasterSubmission("failed");

    expect(harness.controller.getSnapshot()).toMatchObject({
      completedTranscript: { transcript: "Retry this finalized request" },
      masterSubmission: {
        message: "Setta could not accept the voice request. Retry without recording it again.",
        type: "failed",
      },
    });
    await harness.startMaster();
    expect(harness.currentCapture()).toMatchObject({
      code: "master_submission_failed",
      type: "failed",
    });
    expect(harness.mediaConstraints).toHaveLength(1);

    harness.controller.retryMasterSubmission();
    expect(harness.masterInputRequests).toHaveLength(2);
    expect(harness.masterInputRequests[1]!.input).toBe(harness.masterInputRequests[0]!.input);
    acceptedRetry.resolve({
      acceptedAt: "2026-07-12T18:00:02Z",
      input: harness.masterInputRequests[1]!.input,
      replyDelivery: {
        originatingConversationId: null,
        originatingConversationInputId: null,
        originatingPaneId: null,
        originatingWorkspaceId: null,
      },
      sequence: 1,
    });
    await flushPromises();

    expect(harness.controller.getSnapshot()).toMatchObject({
      completedTranscript: null,
      masterSubmission: { type: "accepted" },
    });
    info.mockRestore();
  });

  test("blocks voice capture behind typed master work without presenting it as voice", async () => {
    const pendingText = deferred<AcceptedMasterInput>();
    const submit = vi
      .fn<(request: SubmitMasterInputRequest) => Promise<AcceptedMasterInput>>()
      .mockImplementationOnce(() => pendingText.promise)
      .mockRejectedValueOnce(new Error("private typed submission failure"));
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const harness = createHarness({ submitMasterInput: submit });
    await harness.connect();

    harness.masterController.submitText("Typed request still submitting");
    expect(harness.controller.getSnapshot().masterSubmission).toEqual({ type: "idle" });
    await harness.startMaster();
    expect(harness.currentCapture()).toEqual({
      code: "master_submission_pending",
      message: "The previous text request is still being submitted to Setta.",
      type: "failed",
    });
    expect(harness.mediaConstraints).toEqual([]);

    pendingText.reject(new Error("private typed submission failure"));
    await waitForMasterControllerSubmission(harness.masterController, "failed");
    expect(harness.controller.getSnapshot().masterSubmission).toEqual({ type: "idle" });
    await harness.startMaster();
    expect(harness.currentCapture()).toEqual({
      code: "master_submission_failed",
      message: "Retry or discard the failed text request before starting voice capture.",
      type: "failed",
    });
    expect(harness.mediaConstraints).toEqual([]);

    harness.masterController.retry();
    await waitForMasterControllerSubmission(harness.masterController, "failed");
    expect(harness.controller.getSnapshot().masterSubmission).toEqual({ type: "idle" });
    info.mockRestore();
  });

  test("retains failed conversation delivery for exact retry and explicit discard", async () => {
    const acceptedRetry = deferred<AcceptedConversationInput>();
    const submit = vi
      .fn<(request: SubmitConversationInputRequest) => Promise<AcceptedConversationInput>>()
      .mockRejectedValueOnce(new Error("private runtime failure"))
      .mockImplementationOnce(() => acceptedRetry.promise);
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const harness = createHarness({ submitConversationInput: submit });
    await harness.connect();
    const start = harness.controller.start(
      conversationSpeechCaptureRequest("workspace_retry", "conversation_retry", "pane_retry"),
    );
    await harness.waitForTransport();
    harness.transport.resolveReady();
    await flushPromises();
    await start;
    harness.controller.commit();
    await flushPromises();
    harness.transport.complete("Retry this pane transcript");
    await harness.waitForConversationSubmission("failed");

    expect(harness.controller.getSnapshot()).toMatchObject({
      completedConversationTranscript: {
        input: {
          conversationId: "conversation_retry",
          sourcePaneId: "pane_retry",
          text: "Retry this pane transcript",
        },
      },
      conversationSubmission: {
        message:
          "Setta could not finish the conversation voice request. Retry without recording it again.",
        type: "failed",
      },
    });
    await harness.controller.start(
      conversationSpeechCaptureRequest("workspace_other", "conversation_other", "pane_other"),
    );
    expect(harness.currentCapture()).toMatchObject({
      code: "conversation_submission_failed",
      type: "failed",
    });

    harness.controller.retryConversationSubmission();
    expect(harness.conversationInputRequests).toHaveLength(2);
    expect(harness.conversationInputRequests[1]!.input).toBe(
      harness.conversationInputRequests[0]!.input,
    );
    acceptedRetry.resolve({
      acceptedAt: "2026-07-12T18:00:02Z",
      input: harness.conversationInputRequests[1]!.input,
      sequence: 1,
      status: "accepted",
    });
    await harness.waitForConversationSubmission("accepted");
    expect(harness.controller.getSnapshot().conversationSubmission.type).toBe("accepted");

    const failedDiscard = createHarness({
      submitConversationInput: async () => {
        throw new Error("discard failure");
      },
    });
    await failedDiscard.connect();
    const discardStart = failedDiscard.controller.start(
      conversationSpeechCaptureRequest("workspace_discard", "conversation_discard", "pane_discard"),
    );
    await failedDiscard.waitForTransport();
    failedDiscard.transport.resolveReady();
    await flushPromises();
    await discardStart;
    failedDiscard.controller.commit();
    await flushPromises();
    failedDiscard.transport.complete("Discard this pane transcript");
    await failedDiscard.waitForConversationSubmission("failed");
    failedDiscard.controller.discardCompletedConversationTranscript();
    expect(failedDiscard.controller.getSnapshot()).toMatchObject({
      completedConversationTranscript: null,
      conversationSubmission: { type: "idle" },
    });
    info.mockRestore();
  });

  test("runtime switch clears pane delivery and rejects its late receipt", async () => {
    const pending = deferred<AcceptedConversationInput>();
    const harness = createHarness({ submitConversationInput: () => pending.promise });
    await harness.connect();
    const start = harness.controller.start(
      conversationSpeechCaptureRequest("workspace_old", "conversation_old", "pane_old"),
    );
    await harness.waitForTransport();
    harness.transport.resolveReady();
    await flushPromises();
    await start;
    harness.controller.commit();
    await flushPromises();
    harness.transport.complete("Do not cross runtimes");
    await harness.waitForConversationSubmission("submitting");
    const staleRequest = harness.conversationInputRequests[0]!;

    await harness.controller.synchronizeRuntime("runtime_second");
    pending.resolve({
      acceptedAt: "2026-07-12T18:00:02Z",
      input: staleRequest.input,
      sequence: 1,
      status: "accepted",
    });
    await flushPromises();

    expect(harness.controller.getSnapshot()).toMatchObject({
      availability: { type: "configured" },
      completedConversationTranscript: null,
      conversationSubmission: { type: "idle" },
      runtimeId: "runtime_second",
    });
  });

  test("a repeated pane capture request commits only its matching active capture", async () => {
    const harness = createHarness();
    await harness.connect();
    const request = conversationSpeechCaptureRequest(
      "workspace_toggle",
      "conversation_toggle",
      "pane_toggle",
    );
    const start = harness.controller.start(request);
    await harness.waitForTransport();
    harness.transport.resolveReady();
    await flushPromises();
    await start;

    await expect(
      harness.controller.start(
        conversationSpeechCaptureRequest("workspace_other", "conversation_other", "pane_other"),
      ),
    ).rejects.toThrow("another global speech capture is already active");
    expect(harness.currentCapture()).toMatchObject({
      request,
      type: "recording",
    });

    await harness.controller.start(request);
    await flushPromises();
    expect(harness.currentCapture()).toMatchObject({ type: "committing" });
    expect(harness.transport.commit).toHaveBeenCalledOnce();
  });

  test("master voice command preempts active topic capture without submitting topic speech", async () => {
    const onCaptureEnd = vi.fn();
    const onCaptureStart = vi.fn();
    const harness = createHarness({ onCaptureEnd, onCaptureStart });
    await harness.connect();
    const topicStart = harness.controller.start(
      conversationSpeechCaptureRequest("workspace_topic", "conversation_topic", "pane_topic"),
    );
    await harness.waitForTransport();
    harness.transport.resolveReady();
    await flushPromises();
    await topicStart;
    harness.transport.delta("topic words stay provisional");

    const masterStart = harness.controller.startMasterCapture();
    await harness.waitForTransportCount(2);
    harness.transport.resolveReady();
    await flushPromises();
    await masterStart;

    expect(harness.conversationInputRequests).toEqual([]);
    expect(harness.track.stop).toHaveBeenCalledOnce();
    expect(onCaptureEnd).toHaveBeenCalledOnce();
    expect(onCaptureStart).toHaveBeenCalledTimes(2);
    expect(harness.currentCapture()).toMatchObject({
      request: { destination: { type: "master" }, sourcePaneId: null },
      transcript: "",
      type: "recording",
    });
  });

  test("runtime disconnect cancels permission and rejects its late stream", async () => {
    const media = deferred<MediaStream>();
    const harness = createHarness({ getUserMedia: () => media.promise });
    await harness.connect();

    const start = harness.startMaster();
    await harness.controller.synchronizeRuntime(null);
    expect(harness.controller.getSnapshot()).toMatchObject({
      availability: { type: "disconnected" },
      capture: { type: "idle" },
      runtimeId: null,
    });

    media.resolve(harness.stream);
    await start;
    expect(harness.track.stop).toHaveBeenCalledOnce();
    expect(harness.transcriptionSessionCalls).toBe(0);
    expect(harness.transports).toEqual([]);
  });

  test("cancel stops the raw microphone while buffered capture setup is pending", async () => {
    const setupStarted = deferred<CreateBufferedMicrophoneCaptureOptions>();
    const setup = deferred<BufferedMicrophoneCapture>();
    const harness = createHarness({
      createBufferedCapture: async (options) => {
        setupStarted.resolve(options);
        return setup.promise;
      },
    });
    await harness.connect();

    const start = harness.startMaster();
    const options = await setupStarted.promise;
    expect(harness.currentCapture()).toMatchObject({ type: "requesting_permission" });
    expect(harness.track.stop).not.toHaveBeenCalled();

    harness.controller.cancel();
    expect(harness.currentCapture()).toEqual({ type: "idle" });
    expect(harness.track.stop).toHaveBeenCalledOnce();

    const lateCapture = new FakeBufferedCapture(options.inputStream, harness.outboundStream);
    setup.resolve(lateCapture);
    await start;

    expect(lateCapture.close).toHaveBeenCalledOnce();
    expect(harness.transports).toEqual([]);
  });

  test("runtime switch stops the raw microphone while buffered capture setup is pending", async () => {
    const setupStarted = deferred<CreateBufferedMicrophoneCaptureOptions>();
    const setup = deferred<BufferedMicrophoneCapture>();
    const harness = createHarness({
      createBufferedCapture: async (options) => {
        setupStarted.resolve(options);
        return setup.promise;
      },
    });
    await harness.connect();

    const start = harness.startMaster();
    const options = await setupStarted.promise;
    await harness.controller.synchronizeRuntime("runtime_second");

    expect(harness.controller.getSnapshot()).toMatchObject({
      availability: { type: "configured" },
      capture: { type: "idle" },
      runtimeId: "runtime_second",
    });
    expect(harness.track.stop).toHaveBeenCalledOnce();

    const lateCapture = new FakeBufferedCapture(options.inputStream, harness.outboundStream);
    setup.resolve(lateCapture);
    await start;

    expect(lateCapture.close).toHaveBeenCalledOnce();
    expect(harness.transports).toEqual([]);
  });

  test("dispose stops the raw microphone while buffered capture setup is pending", async () => {
    const setupStarted = deferred<CreateBufferedMicrophoneCaptureOptions>();
    const setup = deferred<BufferedMicrophoneCapture>();
    const harness = createHarness({
      createBufferedCapture: async (options) => {
        setupStarted.resolve(options);
        return setup.promise;
      },
    });
    await harness.connect();

    const start = harness.startMaster();
    const options = await setupStarted.promise;

    harness.controller.dispose();
    expect(harness.track.stop).toHaveBeenCalledOnce();

    const lateCapture = new FakeBufferedCapture(options.inputStream, harness.outboundStream);
    setup.resolve(lateCapture);
    await start;

    expect(lateCapture.close).toHaveBeenCalledOnce();
    expect(harness.transports).toEqual([]);
    expect(() => harness.controller.cancel()).toThrow("controller is disposed");
  });

  test("cancel tears down an active lease without changing runtime scope", async () => {
    const harness = createHarness();
    await harness.connect();
    const start = harness.startMaster();
    await harness.waitForTransport();
    harness.transport.resolveReady();
    await flushPromises();
    await start;

    harness.controller.cancel();

    expect(harness.currentCapture()).toEqual({ type: "idle" });
    expect(harness.controller.getSnapshot()).toMatchObject({
      runtimeId: "runtime_capture",
    });
    expect(harness.transport.close).toHaveBeenCalledOnce();
    expect(harness.track.stop).toHaveBeenCalledOnce();
  });

  test("ignores a late capability response from the previous runtime", async () => {
    const first = deferred<SpeechCapabilities>();
    const second = deferred<SpeechCapabilities>();
    const reads = [first.promise, second.promise];
    const harness = createHarness({ readCapabilities: () => reads.shift()! });

    const connectFirst = harness.controller.synchronizeRuntime("runtime_first");
    const connectSecond = harness.controller.synchronizeRuntime("runtime_second");
    second.resolve(capabilities());
    await connectSecond;
    first.resolve(capabilities({ providerStatus: "not_configured" }));
    await connectFirst;

    expect(harness.controller.getSnapshot()).toMatchObject({
      availability: { type: "configured" },
      runtimeId: "runtime_second",
    });
  });

  test("refreshes unavailable capture after provider setup becomes ready", async () => {
    const reads = [
      capabilities({ providerStatus: "not_configured" }),
      capabilities({ providerStatus: "configured" }),
    ];
    const harness = createHarness({ readCapabilities: async () => reads.shift()! });

    await harness.controller.synchronizeRuntime("runtime_capture");
    expect(harness.controller.getSnapshot()).toMatchObject({
      availability: { type: "not_configured" },
      runtimeId: "runtime_capture",
    });

    await harness.controller.refreshCapabilities();
    expect(harness.controller.getSnapshot()).toMatchObject({
      availability: { type: "configured" },
      runtimeId: "runtime_capture",
    });

    const start = harness.startMaster();
    await harness.waitForTransport();
    harness.transport.resolveReady();
    await flushPromises();
    await start;

    expect(harness.currentCapture()).toMatchObject({ connection: "ready", type: "recording" });
    expect(harness.mediaConstraints).toEqual([{ audio: true, video: false }]);
    harness.controller.cancel();
  });

  test("the recording-duration limit visibly fails and tears down capture", async () => {
    const session = deferred<SpeechTranscriptionSession>();
    const harness = createHarness({ createTranscriptionSession: () => session.promise });
    await harness.connect();
    const start = harness.startMaster();
    await harness.waitForCapture("recording");
    expect(harness.currentCapture()).toMatchObject({ connection: "connecting" });

    harness.fireTimer();
    expect(harness.currentCapture()).toEqual({
      code: "duration_limit",
      message: "Voice recording reached the 120-second limit. Please try again.",
      type: "failed",
    });
    expect(harness.track.stop).toHaveBeenCalledOnce();

    session.resolve(transcriptionSession());
    await start;
    expect(harness.transports).toEqual([]);
  });

  test.each([
    ["NotAllowedError", "microphone_permission_denied"],
    ["SecurityError", "microphone_permission_denied"],
    ["NotFoundError", "microphone_unavailable"],
    ["NotReadableError", "microphone_unavailable"],
  ] satisfies Array<[string, SpeechCaptureFailureCode]>)(
    "maps microphone failure %s to %s without opening a provider session",
    async (name, code) => {
      const harness = createHarness({
        getUserMedia: async () => {
          throw Object.assign(new Error("private device prose"), { name });
        },
      });
      await harness.connect();

      await harness.startMaster();

      expect(harness.currentCapture()).toMatchObject({ code, type: "failed" });
      expect(failedMessage(harness.currentCapture())).not.toContain("private");
      expect(harness.transcriptionSessionCalls).toBe(0);
    },
  );

  test("maps buffered microphone setup failures after permission succeeds", async () => {
    const harness = createHarness({
      createBufferedCapture: async () => {
        throw new BufferedMicrophoneCaptureError(
          "capture_pipeline_failed",
          "private audio graph prose",
        );
      },
    });
    await harness.connect();

    await harness.startMaster();

    expect(harness.currentCapture()).toEqual({
      code: "capture_pipeline_failed",
      message: "The browser could not prepare local microphone capture. Please try again.",
      type: "failed",
    });
    expect(harness.mediaConstraints).toEqual([{ audio: true, video: false }]);
    expect(harness.transcriptionSessionCalls).toBe(1);
  });

  test.each([
    "connection_failed",
    "connection_lost",
    "invalid_media",
    "invalid_session",
    "malformed_event",
    "protocol_violation",
    "provider_rate_limited",
    "provider_rejected",
    "provider_response_malformed",
    "provider_unavailable",
    "transcript_too_large",
    "transcription_failed",
  ] satisfies Exclude<RealtimeTranscriptionErrorCode, "aborted">[])(
    "maps Realtime %s to a typed failure and rejects late completion",
    async (code) => {
      const harness = createHarness();
      await harness.connect();
      const start = harness.startMaster();
      await harness.waitForTransport();

      harness.transport.fail(code);
      await start;
      harness.transport.complete("late transcript");

      expect(harness.currentCapture()).toMatchObject({ code, type: "failed" });
      expect(harness.controller.getSnapshot().completedTranscript).toBeNull();
      expect(harness.track.stop).toHaveBeenCalledOnce();
    },
  );

  test("reports capability, support, and configuration failures before microphone access", async () => {
    const capabilityFailure = createHarness({
      readCapabilities: async () => {
        throw new Error("private runtime failure");
      },
    });
    await capabilityFailure.controller.synchronizeRuntime("runtime_capture");
    await capabilityFailure.startMaster();
    expect(capabilityFailure.currentCapture()).toEqual({
      code: "capabilities_unavailable",
      message: "Voice capabilities could not be read from the runtime.",
      type: "failed",
    });

    const insecure = createHarness({
      support: () => ({
        code: "insecure_context",
        message: "Voice capture requires HTTPS.",
        supported: false,
      }),
    });
    await insecure.connect();
    await insecure.startMaster();
    expect(insecure.currentCapture()).toMatchObject({ code: "insecure_context", type: "failed" });

    const notConfigured = createHarness({
      readCapabilities: async () => capabilities({ providerStatus: "not_configured" }),
    });
    await notConfigured.connect();
    await notConfigured.startMaster();
    expect(notConfigured.currentCapture()).toMatchObject({
      code: "not_configured",
      type: "failed",
    });

    expect(capabilityFailure.mediaConstraints).toEqual([]);
    expect(insecure.mediaConstraints).toEqual([]);
    expect(notConfigured.mediaConstraints).toEqual([]);
  });

  test("rejects changed backend limits and allows a failed capture to retry cleanly", async () => {
    const sessions = [
      transcriptionSession({ maximumTranscriptCharacters: 7999 }),
      transcriptionSession(),
    ];
    const harness = createHarness({
      createTranscriptionSession: async () => sessions.shift()!,
    });
    await harness.connect();

    await harness.startMaster();
    await harness.waitForCapture("failed");
    expect(harness.currentCapture()).toMatchObject({ code: "invalid_session", type: "failed" });

    const retry = harness.startMaster();
    await harness.waitForTransport();
    harness.transport.resolveReady();
    await flushPromises();
    await retry;
    expect(harness.currentCapture()).toMatchObject({ connection: "ready", type: "recording" });
  });

  test("dispose is idempotent, closes resources, and prevents reuse or late provider callbacks", async () => {
    const harness = createHarness();
    await harness.connect();
    const start = harness.startMaster();
    await harness.waitForTransport();

    harness.controller.dispose();
    harness.controller.dispose();
    harness.transport.rejectReady("aborted");
    await start;
    harness.transport.delta("late");

    expect(harness.controller.getSnapshot().completedTranscript).toBeNull();
    expect(harness.transport.close).toHaveBeenCalledOnce();
    expect(harness.track.stop).toHaveBeenCalledOnce();
    expect(() => harness.controller.cancel()).toThrow("controller is disposed");
  });
});

interface HarnessOverrides {
  createBufferedCapture?: (
    options: CreateBufferedMicrophoneCaptureOptions,
  ) => Promise<BufferedMicrophoneCapture>;
  createTranscriptionSession?: () => Promise<SpeechTranscriptionSession>;
  deferProviderConnection?: OpenAIBrowserSpeechCaptureProviderDependencies["deferProviderConnection"];
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  onCaptureEnd?: () => void;
  onCaptureStart?: () => void;
  readCapabilities?: () => Promise<SpeechCapabilities>;
  settleConversationInput?: AppShellSpeechCaptureControllerDependencies["settleConversationInput"];
  submitConversationInput?: (
    request: SubmitConversationInputRequest,
  ) => Promise<AcceptedConversationInput>;
  submitMasterInput?: (request: SubmitMasterInputRequest) => Promise<AcceptedMasterInput>;
  support?: OpenAIBrowserSpeechCaptureProviderDependencies["readSupport"];
}

function createHarness(overrides: HarnessOverrides = {}) {
  const track = fakeAudioTrack();
  const stream = fakeMediaStream(track);
  const outboundTrack = fakeAudioTrack();
  const outboundStream = fakeMediaStream(outboundTrack);
  const captures: FakeBufferedCapture[] = [];
  const transports: FakeTransport[] = [];
  const mediaConstraints: MediaStreamConstraints[] = [];
  const conversationInputRequests: SubmitConversationInputRequest[] = [];
  let timerHandler: (() => void) | null = null;
  let timerDelayMs = 0;
  let captureOrdinal = 0;
  let transcriptionSessionCalls = 0;
  const masterInputRequests: SubmitMasterInputRequest[] = [];
  const acceptedMasterInputs = new Map<string, AcceptedMasterInput>();
  const clearTimer = vi.fn();
  const captureProvider = createOpenAIBrowserSpeechCaptureProvider({
    createBufferedCapture: async (options) => {
      if (overrides.createBufferedCapture) {
        return overrides.createBufferedCapture(options);
      }
      const capture = new FakeBufferedCapture(options.inputStream, outboundStream);
      captures.push(capture);
      capture.resolveReady();
      return capture;
    },
    createTranscriptionSession: async () => {
      transcriptionSessionCalls += 1;
      return overrides.createTranscriptionSession
        ? overrides.createTranscriptionSession()
        : transcriptionSession();
    },
    createTransport: (options) => {
      const transport = new FakeTransport(options);
      transports.push(transport);
      return transport;
    },
    deferProviderConnection:
      overrides.deferProviderConnection ?? ((handler) => queueMicrotask(handler)),
    getUserMedia: async (constraints) => {
      mediaConstraints.push(constraints);
      return overrides.getUserMedia ? overrides.getUserMedia(constraints) : stream;
    },
    readCapabilities: overrides.readCapabilities ?? (async () => capabilities()),
    readSupport: overrides.support ?? (() => ({ supported: true })),
  });
  const dependencies: AppShellSpeechCaptureControllerDependencies = {
    captureProvider,
    clearTimeout: clearTimer,
    createCaptureSessionId: () => {
      captureOrdinal += 1;
      return `capture_${captureOrdinal}`;
    },
    now: () => new Date("2026-07-12T18:00:00Z"),
    onCaptureEnd: overrides.onCaptureEnd ?? (() => {}),
    onCaptureStart: overrides.onCaptureStart ?? (() => {}),
    setTimeout: (handler, delayMs) => {
      timerHandler = handler;
      timerDelayMs = delayMs;
      return Symbol("timer");
    },
    settleConversationInput: overrides.settleConversationInput ?? (async () => {}),
    submitConversationInput: async (request) => {
      conversationInputRequests.push(request);
      if (overrides.submitConversationInput) {
        return overrides.submitConversationInput(request);
      }
      return {
        acceptedAt: "2026-07-12T18:00:01Z",
        input: request.input,
        sequence: 1,
        status: "accepted",
      };
    },
  };
  const masterController = new AppShellMasterController({
    cancelMasterInput: async () => {
      throw new Error("the test master route is not cancellable");
    },
    createInputId: () => "unused_text_input",
    now: dependencies.now,
    presentPresentationIntent: async () => ({ paneId: "pane_capture" }),
    readActiveInteraction: async () => ({ state: null }),
    readFocusHints: () => ({
      focusedConversationId: null,
      focusedPaneId: null,
      focusedWorkspaceId: "workspace_capture",
    }),
    resolvePresentationIntent: async (request) => ({
      ...request,
      resolvedAt: "2026-07-12T18:00:02Z",
    }),
    submitMasterInput: async (request) => {
      masterInputRequests.push(request);
      if (overrides.submitMasterInput) {
        const accepted = await overrides.submitMasterInput(request);
        acceptedMasterInputs.set(request.input.id, accepted);
        return accepted;
      }
      const accepted = {
        acceptedAt: "2026-07-12T18:00:01Z",
        input: request.input,
        replyDelivery: {
          originatingConversationId: null,
          originatingConversationInputId: null,
          originatingPaneId: null,
          originatingWorkspaceId: null,
        },
        sequence: 1,
      };
      acceptedMasterInputs.set(request.input.id, accepted);
      return accepted;
    },
    waitShellInteraction: async ({ inputId }) => {
      const accepted = acceptedMasterInputs.get(inputId);
      if (!accepted) {
        throw new Error(`accepted master input ${inputId} is unavailable`);
      }
      return {
        decision: null,
        failure: {
          code: "test_terminal",
          message: "Test route settled.",
          retryable: false,
        },
        input: accepted.input,
        status: "failed",
      };
    },
    waitPresentationIntent: async () => {
      throw new Error("failed master inputs do not produce presentation intents");
    },
  });
  const controller = new AppShellSpeechCaptureController(dependencies, masterController);
  return {
    clearTimer,
    connect: () => controller.synchronizeRuntime("runtime_capture"),
    controller,
    conversationInputRequests,
    captures,
    currentCapture: () => controller.getSnapshot().capture,
    fireTimer: () => {
      if (!timerHandler) {
        throw new Error("capture duration timer was not installed");
      }
      timerHandler();
    },
    mediaConstraints,
    masterInputRequests,
    masterController,
    outboundStream,
    outboundTrack,
    startMaster: () => controller.startMasterCapture(),
    stream,
    get timerDelayMs() {
      return timerDelayMs;
    },
    track,
    get transcriptionSessionCalls() {
      return transcriptionSessionCalls;
    },
    get transport() {
      const transport = transports.at(-1);
      if (!transport) {
        throw new Error("Realtime transport was not created");
      }
      return transport;
    },
    transports,
    waitForCapture: async (type: ReturnType<typeof controller.getSnapshot>["capture"]["type"]) => {
      for (let attempt = 0; attempt < 20; attempt += 1) {
        if (controller.getSnapshot().capture.type === type) {
          return;
        }
        await flushPromises();
      }
      throw new Error(`speech capture did not reach ${type}`);
    },
    waitForMasterSubmission: async (
      type: ReturnType<typeof controller.getSnapshot>["masterSubmission"]["type"],
    ) => {
      for (let attempt = 0; attempt < 20; attempt += 1) {
        if (controller.getSnapshot().masterSubmission.type === type) {
          return;
        }
        await flushPromises();
      }
      throw new Error(`master submission did not reach ${type}`);
    },
    waitForConversationSubmission: async (
      type: ReturnType<typeof controller.getSnapshot>["conversationSubmission"]["type"],
    ) => {
      for (let attempt = 0; attempt < 20; attempt += 1) {
        if (controller.getSnapshot().conversationSubmission.type === type) {
          return;
        }
        await flushPromises();
      }
      throw new Error(`conversation submission did not reach ${type}`);
    },
    waitForTransport: async () => {
      for (let attempt = 0; attempt < 20; attempt += 1) {
        if (transports.length > 0) {
          return;
        }
        await flushPromises();
      }
      throw new Error("Realtime transport was not created");
    },
    waitForTransportCount: async (count: number) => {
      for (let attempt = 0; attempt < 20; attempt += 1) {
        if (transports.length >= count) {
          return;
        }
        await flushPromises();
      }
      throw new Error(`Realtime transport count did not reach ${count}`);
    },
  };
}

async function waitForMasterControllerSubmission(
  controller: AppShellMasterController,
  type: ReturnType<AppShellMasterController["getSnapshot"]>["submission"]["type"],
): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (controller.getSnapshot().submission.type === type) {
      return;
    }
    await flushPromises();
  }
  throw new Error(`master controller submission did not reach ${type}`);
}

function activeCaptureRequest(
  state: ReturnType<AppShellSpeechCaptureController["getSnapshot"]>["capture"],
) {
  switch (state.type) {
    case "requesting_permission":
    case "recording":
    case "draining":
    case "committing":
      return state.request;
    case "idle":
    case "failed":
      throw new Error("speech capture is not active");
  }
}

class FakeBufferedCapture implements BufferedMicrophoneCapture {
  private closed = false;
  private drained = false;
  private inputStopped = false;
  private readonly readyDeferred = deferred<void>();
  private readonly drainDeferred = deferred<void>();
  readonly ready = this.readyDeferred.promise;

  close = vi.fn(() => {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.stopInput();
    stopMediaStream(this.outboundStream);
    const error = new BufferedMicrophoneCaptureError(
      "aborted",
      "Buffered microphone capture was canceled.",
    );
    this.readyDeferred.reject(error);
    this.drainDeferred.reject(error);
  });

  releaseToTransport = vi.fn();

  stopInputAndDrain = vi.fn(() => {
    this.stopInput();
    if (!this.drained) {
      this.drained = true;
      this.drainDeferred.resolve();
    }
    return this.drainDeferred.promise;
  });

  constructor(
    private readonly inputStream: MediaStream,
    readonly outboundStream: MediaStream,
  ) {}

  resolveReady(): void {
    this.readyDeferred.resolve();
  }

  private stopInput(): void {
    if (this.inputStopped) {
      return;
    }
    this.inputStopped = true;
    stopMediaStream(this.inputStream);
  }
}

class FakeTransport implements RealtimeTranscriptionTransport {
  private readonly options: CreateRealtimeTranscriptionTransportOptions;
  private readonly readyDeferred = deferred<{
    captureSessionId: string;
    providerSessionId: string;
  }>();

  close = vi.fn();
  commit = vi.fn();
  ready = this.readyDeferred.promise;

  constructor(options: CreateRealtimeTranscriptionTransportOptions) {
    this.options = options;
  }

  complete(transcript: string): void {
    this.emit({
      captureSessionId: this.options.captureSessionId,
      itemId: "item_current",
      providerSessionId: "session_current",
      transcript,
      type: "completed",
    });
  }

  delta(transcript: string): void {
    this.emit({
      captureSessionId: this.options.captureSessionId,
      delta: transcript,
      itemId: "item_current",
      providerSessionId: "session_current",
      transcript,
      type: "delta",
    });
  }

  fail(code: Exclude<RealtimeTranscriptionErrorCode, "aborted">): void {
    const error = new RealtimeTranscriptionError(code, "private provider prose");
    this.options.onError(error);
    this.readyDeferred.reject(error);
  }

  rejectReady(code: RealtimeTranscriptionErrorCode): void {
    this.readyDeferred.reject(new RealtimeTranscriptionError(code, "capture stopped"));
  }

  resolveReady(): void {
    this.readyDeferred.resolve({
      captureSessionId: this.options.captureSessionId,
      providerSessionId: "session_current",
    });
  }

  private emit(update: RealtimeTranscriptionUpdate): void {
    this.options.onTranscript(update);
  }
}

function capabilities(overrides: Partial<SpeechCapabilities> = {}): SpeechCapabilities {
  return {
    aiVoiceDisclosure: "Voice is AI-generated.",
    maximumRecordingSeconds: 120,
    maximumSynthesisCharacters: 4096,
    maximumTranscriptCharacters: 8000,
    providerStatus: "configured",
    synthesisModel: "gpt-4o-mini-tts",
    transcriptionModel: "gpt-realtime-whisper",
    voiceCatalog: {
      provider: "openai",
      version: "test",
      voiceIds: ["marin", "cedar"],
    },
    ...overrides,
  };
}

function transcriptionSession(
  overrides: Partial<SpeechTranscriptionSession> = {},
): SpeechTranscriptionSession {
  return {
    clientSecret: "ephemeral_secret",
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    maximumRecordingSeconds: 120,
    maximumTranscriptCharacters: 8000,
    transcriptionDelay: "medium",
    transcriptionModel: "gpt-realtime-whisper",
    webRTCURL: "https://api.openai.com/v1/realtime/calls",
    ...overrides,
  };
}

function fakeAudioTrack(): MediaStreamTrack {
  return {
    enabled: true,
    kind: "audio",
    readyState: "live",
    stop: vi.fn(),
  } as unknown as MediaStreamTrack;
}

function fakeMediaStream(track: MediaStreamTrack): MediaStream {
  return {
    getAudioTracks: () => [track],
    getTracks: () => [track],
  } as unknown as MediaStream;
}

function stopMediaStream(stream: MediaStream): void {
  for (const track of stream.getTracks()) {
    track.stop();
  }
}

function failedMessage(
  state: ReturnType<AppShellSpeechCaptureController["getSnapshot"]>["capture"],
): string {
  return state.type === "failed" ? state.message : "";
}

function deferred<T>() {
  let reject!: (error: unknown) => void;
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    reject = rejectPromise;
    resolve = resolvePromise;
  });
  promise.catch(() => {});
  return { promise, reject, resolve };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
