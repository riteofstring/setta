import {
  speechVoiceIDValues,
  type AcceptedConversationInput,
  type AcceptedMasterInput,
  type ConversationInputMode,
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
  RealtimeTranscriptionError,
  type RealtimeTranscriptionErrorCode,
} from "./realtime-transcription-error";
import {
  conversationSpeechCaptureRequest,
  masterSpeechCaptureRequest,
} from "./speech-capture-destination";
import type { RealtimeTranscriptionUpdate } from "./realtime-transcription-session";
import type {
  CreateRealtimeTranscriptionTransportOptions,
  RealtimeTranscriptionTransport,
} from "./realtime-transcription-transport";

describe("app-shell speech capture controller", () => {
  test("keeps the default global preference disabled without requesting the microphone", async () => {
    const harness = createHarness();
    await harness.controller.synchronizeRuntime("runtime_capture");

    expect(harness.controller.getSnapshot()).toMatchObject({
      availability: { type: "configured" },
      preference: { enabled: false, type: "ready" },
      runtimeId: "runtime_capture",
    });
    await harness.startMaster();

    expect(harness.currentCapture()).toEqual({
      code: "microphone_disabled",
      message: "Global microphone capture is disabled.",
      type: "failed",
    });
    expect(harness.mediaConstraints).toEqual([]);
    expect(harness.controller.setEnabled(true)).toEqual({ enabled: true, type: "ready" });
    expect(harness.preferenceWrites).toEqual([true]);
  });

  test("runs one global permission, connection, preview, commit, and completion lifecycle", async () => {
    const harness = createHarness();
    await harness.connectAndEnable();

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
    await start;
    expect(harness.currentCapture()).toMatchObject({ type: "listening" });

    harness.controller.commit();
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
    expect(harness.clearTimer).toHaveBeenCalledOnce();
  });

  test("preempts playback only when a new recording lifecycle begins", async () => {
    const onCaptureEnd = vi.fn();
    const onCaptureStart = vi.fn();
    const harness = createHarness({ onCaptureEnd, onCaptureStart });

    await harness.controller.synchronizeRuntime("runtime_capture");
    await harness.startMaster();
    expect(onCaptureStart).not.toHaveBeenCalled();

    harness.controller.setEnabled(true);
    const start = harness.startMaster();
    await harness.waitForTransport();
    harness.transport.resolveReady();
    await start;
    expect(onCaptureStart).toHaveBeenCalledOnce();

    await harness.startMaster();
    expect(harness.currentCapture().type).toBe("committing");
    expect(onCaptureStart).toHaveBeenCalledOnce();
    expect(onCaptureEnd).not.toHaveBeenCalled();

    harness.transport.complete("Finish the capture lifecycle.");
    expect(onCaptureEnd).toHaveBeenCalledOnce();
  });

  test("freezes a pane conversation destination and mode for the full capture lifecycle", async () => {
    const harness = createHarness();
    await harness.connectAndEnable();
    const requestedCapture = {
      destination: {
        conversationId: "conversation_original",
        inputMode: "route" as ConversationInputMode,
        type: "conversation" as const,
      },
      sourcePaneId: "pane_original",
    };

    const start = harness.controller.start(requestedCapture);
    requestedCapture.destination.conversationId = "conversation_changed";
    requestedCapture.destination.inputMode = "steer";
    requestedCapture.sourcePaneId = "pane_changed";

    expect(harness.currentCapture()).toMatchObject({
      request: {
        destination: {
          conversationId: "conversation_original",
          inputMode: "route",
          type: "conversation",
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
    await start;
    harness.controller.commit();
    harness.transport.complete("Keep this pane-local request frozen");

    expect(harness.masterInputRequests).toEqual([]);
    expect(harness.controller.getSnapshot().completedConversationTranscript).toEqual({
      captureSessionId: "capture_1",
      input: {
        conversationId: "conversation_original",
        id: "capture_1",
        modality: "voice",
        replyToInputId: null,
        requestedMode: "route",
        sourcePaneId: "pane_original",
        submittedAt: "2026-07-12T18:00:00Z",
        text: "Keep this pane-local request frozen",
      },
      request: {
        destination: {
          conversationId: "conversation_original",
          inputMode: "route",
          type: "conversation",
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
      conversationSpeechCaptureRequest("conversation_second", "pane_second", "queue"),
    );
    expect(harness.currentCapture()).toMatchObject({
      code: "conversation_submission_pending",
      type: "failed",
    });
    expect(harness.mediaConstraints).toHaveLength(1);
  });

  test("retains failed master submission for exact retry before another capture", async () => {
    const acceptedRetry = deferred<AcceptedMasterInput>();
    const submit = vi
      .fn<(request: SubmitMasterInputRequest) => Promise<AcceptedMasterInput>>()
      .mockRejectedValueOnce(new Error("private runtime failure"))
      .mockImplementationOnce(() => acceptedRetry.promise);
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const harness = createHarness({ submitMasterInput: submit });
    await harness.connectAndEnable();
    const start = harness.startMaster();
    await harness.waitForTransport();
    harness.transport.resolveReady();
    await start;
    harness.controller.commit();
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
    await harness.connectAndEnable();

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
    await harness.connectAndEnable();
    const start = harness.controller.start(
      conversationSpeechCaptureRequest("conversation_retry", "pane_retry", "fork"),
    );
    await harness.waitForTransport();
    harness.transport.resolveReady();
    await start;
    harness.controller.commit();
    harness.transport.complete("Retry this pane transcript");
    await harness.waitForConversationSubmission("failed");

    expect(harness.controller.getSnapshot()).toMatchObject({
      completedConversationTranscript: {
        input: {
          conversationId: "conversation_retry",
          requestedMode: "fork",
          sourcePaneId: "pane_retry",
          text: "Retry this pane transcript",
        },
      },
      conversationSubmission: {
        message:
          "Setta could not accept the conversation voice request. Retry without recording it again.",
        type: "failed",
      },
    });
    await harness.controller.start(
      conversationSpeechCaptureRequest("conversation_other", "pane_other", "route"),
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
    await flushPromises();
    expect(harness.controller.getSnapshot().conversationSubmission.type).toBe("accepted");

    const failedDiscard = createHarness({
      submitConversationInput: async () => {
        throw new Error("discard failure");
      },
    });
    await failedDiscard.connectAndEnable();
    const discardStart = failedDiscard.controller.start(
      conversationSpeechCaptureRequest("conversation_discard", "pane_discard", "route"),
    );
    await failedDiscard.waitForTransport();
    failedDiscard.transport.resolveReady();
    await discardStart;
    failedDiscard.controller.commit();
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
    await harness.connectAndEnable();
    const start = harness.controller.start(
      conversationSpeechCaptureRequest("conversation_old", "pane_old", "route"),
    );
    await harness.waitForTransport();
    harness.transport.resolveReady();
    await start;
    harness.controller.commit();
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
    await harness.connectAndEnable();
    const request = conversationSpeechCaptureRequest("conversation_toggle", "pane_toggle", "route");
    const start = harness.controller.start(request);
    await harness.waitForTransport();
    harness.transport.resolveReady();
    await start;

    await expect(
      harness.controller.start(
        conversationSpeechCaptureRequest("conversation_other", "pane_other", "route"),
      ),
    ).rejects.toThrow("another global speech capture is already active");
    expect(harness.currentCapture()).toMatchObject({
      request,
      type: "listening",
    });

    await harness.controller.start(request);
    expect(harness.currentCapture()).toMatchObject({ type: "committing" });
    expect(harness.transport.commit).toHaveBeenCalledOnce();
  });

  test("runtime disconnect cancels permission and rejects its late stream", async () => {
    const media = deferred<MediaStream>();
    const harness = createHarness({ getUserMedia: () => media.promise });
    await harness.connectAndEnable();

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

  test("disabling the global preference tears down an active lease without changing runtime scope", async () => {
    const harness = createHarness();
    await harness.connectAndEnable();
    const start = harness.startMaster();
    await harness.waitForTransport();
    harness.transport.resolveReady();
    await start;

    harness.controller.setEnabled(false);

    expect(harness.currentCapture()).toEqual({ type: "idle" });
    expect(harness.controller.getSnapshot()).toMatchObject({
      preference: { enabled: false, type: "ready" },
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

  test("the recording-duration limit visibly fails and tears down capture", async () => {
    const session = deferred<SpeechTranscriptionSession>();
    const harness = createHarness({ createTranscriptionSession: () => session.promise });
    await harness.connectAndEnable();
    const start = harness.startMaster();
    await harness.waitForCapture("connecting");

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
      await harness.connectAndEnable();

      await harness.startMaster();

      expect(harness.currentCapture()).toMatchObject({ code, type: "failed" });
      expect(failedMessage(harness.currentCapture())).not.toContain("private");
      expect(harness.transcriptionSessionCalls).toBe(0);
    },
  );

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
      await harness.connectAndEnable();
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

  test("reports capability, preference, support, and configuration failures before microphone access", async () => {
    const capabilityFailure = createHarness({
      readCapabilities: async () => {
        throw new Error("private runtime failure");
      },
    });
    await capabilityFailure.controller.synchronizeRuntime("runtime_capture");
    capabilityFailure.controller.setEnabled(true);
    await capabilityFailure.startMaster();
    expect(capabilityFailure.currentCapture()).toEqual({
      code: "capabilities_unavailable",
      message: "Voice capabilities could not be read from the runtime.",
      type: "failed",
    });

    const preferenceFailure = createHarness({
      readPreference: () => ({ message: "Preference is corrupt.", type: "failed" }),
    });
    await preferenceFailure.controller.synchronizeRuntime("runtime_capture");
    await preferenceFailure.startMaster();
    expect(preferenceFailure.currentCapture()).toEqual({
      code: "preference_unavailable",
      message: "Preference is corrupt.",
      type: "failed",
    });

    const insecure = createHarness({
      support: () => ({
        code: "insecure_context",
        message: "Voice capture requires HTTPS.",
        supported: false,
      }),
    });
    await insecure.connectAndEnable();
    await insecure.startMaster();
    expect(insecure.currentCapture()).toMatchObject({ code: "insecure_context", type: "failed" });

    const notConfigured = createHarness({
      readCapabilities: async () => capabilities({ providerStatus: "not_configured" }),
    });
    await notConfigured.connectAndEnable();
    await notConfigured.startMaster();
    expect(notConfigured.currentCapture()).toMatchObject({
      code: "not_configured",
      type: "failed",
    });

    expect(capabilityFailure.mediaConstraints).toEqual([]);
    expect(preferenceFailure.mediaConstraints).toEqual([]);
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
    await harness.connectAndEnable();

    await harness.startMaster();
    expect(harness.currentCapture()).toMatchObject({ code: "invalid_session", type: "failed" });

    const retry = harness.startMaster();
    await harness.waitForTransport();
    harness.transport.resolveReady();
    await retry;
    expect(harness.currentCapture()).toMatchObject({ type: "listening" });
  });

  test("dispose is idempotent, closes resources, and prevents reuse or late provider callbacks", async () => {
    const harness = createHarness();
    await harness.connectAndEnable();
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
  createTranscriptionSession?: () => Promise<SpeechTranscriptionSession>;
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  onCaptureEnd?: () => void;
  onCaptureStart?: () => void;
  readCapabilities?: () => Promise<SpeechCapabilities>;
  readPreference?: AppShellSpeechCaptureControllerDependencies["readPreference"];
  submitConversationInput?: (
    request: SubmitConversationInputRequest,
  ) => Promise<AcceptedConversationInput>;
  submitMasterInput?: (request: SubmitMasterInputRequest) => Promise<AcceptedMasterInput>;
  support?: AppShellSpeechCaptureControllerDependencies["support"];
  writePreference?: AppShellSpeechCaptureControllerDependencies["writePreference"];
}

function createHarness(overrides: HarnessOverrides = {}) {
  const track = fakeAudioTrack();
  const stream = fakeMediaStream(track);
  const transports: FakeTransport[] = [];
  const mediaConstraints: MediaStreamConstraints[] = [];
  const preferenceWrites: boolean[] = [];
  const conversationInputRequests: SubmitConversationInputRequest[] = [];
  let timerHandler: (() => void) | null = null;
  let timerDelayMs = 0;
  let captureOrdinal = 0;
  let transcriptionSessionCalls = 0;
  const masterInputRequests: SubmitMasterInputRequest[] = [];
  const acceptedMasterInputs = new Map<string, AcceptedMasterInput>();
  const clearTimer = vi.fn();
  const dependencies: AppShellSpeechCaptureControllerDependencies = {
    clearTimeout: clearTimer,
    createCaptureSessionId: () => {
      captureOrdinal += 1;
      return `capture_${captureOrdinal}`;
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
    getUserMedia: async (constraints) => {
      mediaConstraints.push(constraints);
      return overrides.getUserMedia ? overrides.getUserMedia(constraints) : stream;
    },
    now: () => new Date("2026-07-12T18:00:00Z"),
    onCaptureEnd: overrides.onCaptureEnd ?? (() => {}),
    onCaptureStart: overrides.onCaptureStart ?? (() => {}),
    readCapabilities: overrides.readCapabilities ?? (async () => capabilities()),
    readPreference:
      overrides.readPreference ?? (() => ({ enabled: false, type: "ready" as const })),
    setTimeout: (handler, delayMs) => {
      timerHandler = handler;
      timerDelayMs = delayMs;
      return Symbol("timer");
    },
    support: overrides.support ?? (() => ({ supported: true })),
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
    writePreference:
      overrides.writePreference ??
      ((enabled) => {
        preferenceWrites.push(enabled);
        return { enabled, type: "ready" };
      }),
  };
  const masterController = new AppShellMasterController({
    createInputId: () => "unused_text_input",
    now: dependencies.now,
    readActiveInteraction: async () => ({ state: null }),
    readFocusHints: () => ({
      focusedConversationId: null,
      focusedPaneId: null,
      focusedWorkspaceId: "workspace_capture",
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
  });
  const controller = new AppShellSpeechCaptureController(dependencies, masterController);
  return {
    clearTimer,
    connectAndEnable: async () => {
      await controller.synchronizeRuntime("runtime_capture");
      controller.setEnabled(true);
    },
    controller,
    conversationInputRequests,
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
    preferenceWrites,
    startMaster: () => controller.start(masterSpeechCaptureRequest()),
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
    case "connecting":
    case "listening":
    case "committing":
      return state.request;
    case "idle":
    case "failed":
      throw new Error("speech capture is not active");
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
      voiceIds: [...speechVoiceIDValues],
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
  return { promise, reject, resolve };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
