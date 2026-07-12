import {
  speechVoiceIDValues,
  type AcceptedMasterInput,
  type ConversationInputMode,
  type SpeechCapabilities,
  type SpeechTranscriptionSession,
  type SubmitMasterInputRequest,
} from "@generated/backend";
import { describe, expect, test, vi } from "vitest";

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
          submittedAt: "2026-07-12T18:00:00Z",
          text: "  Provider final, unchanged.  ",
        },
      },
    ]);
    expect(harness.transport.close).toHaveBeenCalledOnce();
    expect(harness.track.stop).toHaveBeenCalledOnce();
    expect(harness.clearTimer).toHaveBeenCalledOnce();
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
      sequence: 1,
    });
    await flushPromises();

    expect(harness.controller.getSnapshot()).toMatchObject({
      completedTranscript: null,
      masterSubmission: { type: "accepted" },
    });
    info.mockRestore();
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
  readCapabilities?: () => Promise<SpeechCapabilities>;
  readPreference?: AppShellSpeechCaptureControllerDependencies["readPreference"];
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
  let timerHandler: (() => void) | null = null;
  let timerDelayMs = 0;
  let captureOrdinal = 0;
  let transcriptionSessionCalls = 0;
  const masterInputRequests: SubmitMasterInputRequest[] = [];
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
    readCapabilities: overrides.readCapabilities ?? (async () => capabilities()),
    readFocusHints: () => ({
      focusedConversationId: null,
      focusedPaneId: null,
      focusedWorkspaceId: "workspace_capture",
    }),
    readPreference:
      overrides.readPreference ?? (() => ({ enabled: false, type: "ready" as const })),
    setTimeout: (handler, delayMs) => {
      timerHandler = handler;
      timerDelayMs = delayMs;
      return Symbol("timer");
    },
    support: overrides.support ?? (() => ({ supported: true })),
    submitMasterInput: async (request) => {
      masterInputRequests.push(request);
      if (overrides.submitMasterInput) {
        return overrides.submitMasterInput(request);
      }
      return {
        acceptedAt: "2026-07-12T18:00:01Z",
        input: request.input,
        sequence: 1,
      };
    },
    writePreference:
      overrides.writePreference ??
      ((enabled) => {
        preferenceWrites.push(enabled);
        return { enabled, type: "ready" };
      }),
  };
  const controller = new AppShellSpeechCaptureController(dependencies);
  return {
    clearTimer,
    connectAndEnable: async () => {
      await controller.synchronizeRuntime("runtime_capture");
      controller.setEnabled(true);
    },
    controller,
    currentCapture: () => controller.getSnapshot().capture,
    fireTimer: () => {
      if (!timerHandler) {
        throw new Error("capture duration timer was not installed");
      }
      timerHandler();
    },
    mediaConstraints,
    masterInputRequests,
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
