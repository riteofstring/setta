import type { SpeechCapabilities, SpeechTranscriptionSession } from "@generated/backend";
import { describe, expect, test, vi } from "vitest";

import {
  RealtimeTranscriptionError,
  type CreateRealtimeTranscriptionTransportOptions,
  type RealtimeTranscriptionErrorCode,
  type RealtimeTranscriptionTransport,
} from "./realtime-transcription-transport";
import {
  SpeechCaptureController,
  type SpeechCaptureControllerDependencies,
  type SpeechCaptureFailureCode,
  type SpeechCaptureState,
} from "./speech-capture-controller";

describe("Easy Button speech capture controller", () => {
  test("runs permission, connection, listening, commit, delta, and exact completion in order", async () => {
    const harness = createHarness();

    const start = harness.controller.start(startOptions());
    expect(harness.stateTypes()).toEqual(["requesting_permission"]);
    await harness.waitForTransport();
    expect(harness.mediaConstraints).toEqual([{ audio: true, video: false }]);
    expect(harness.sessionWorkspaceIds).toEqual(["workspace_capture"]);
    expect(harness.stateTypes()).toEqual(["requesting_permission", "connecting"]);
    expect(harness.timerDelayMs).toBe(120_000);

    harness.transport.resolveReady();
    await start;
    expect(harness.currentState()).toMatchObject({
      captureSessionId: "capture_1",
      intent: "start",
      transcript: "",
      type: "listening",
    });

    harness.controller.commit();
    expect(harness.transport.commit).toHaveBeenCalledOnce();
    harness.transport.delta("partial words");
    expect(harness.currentState()).toMatchObject({
      transcript: "partial words",
      type: "committing",
    });
    harness.transport.complete("  Provider final, unchanged.  ");
    await flushPromises();

    expect(harness.completions).toEqual([
      {
        context: { runtimeId: "runtime_capture", workspaceId: "workspace_capture" },
        intent: "start",
        transcript: "  Provider final, unchanged.  ",
      },
    ]);
    expect(harness.currentState()).toEqual({ type: "idle" });
    expect(harness.transport.close).toHaveBeenCalledOnce();
    expect(harness.track.stop).toHaveBeenCalledOnce();
    expect(harness.clearTimer).toHaveBeenCalledOnce();
  });

  test("keeps committing until the completed-transcript consumer finishes", async () => {
    const completion = deferred<void>();
    const harness = createHarness({
      onCompletedTranscript: () => completion.promise,
    });
    const start = harness.controller.start(startOptions({ intent: "steer" }));
    await harness.waitForTransport();
    harness.transport.resolveReady();
    await start;

    harness.controller.commit();
    harness.transport.complete("Steer exactly this.");
    await flushPromises();
    expect(harness.currentState()).toMatchObject({
      intent: "steer",
      transcript: "Steer exactly this.",
      type: "committing",
    });

    completion.resolve();
    await flushPromises();
    expect(harness.currentState()).toEqual({ type: "idle" });
  });

  test("rejects an empty authoritative completion without handing off partial text", async () => {
    const harness = createHarness();
    const start = harness.controller.start(startOptions());
    await harness.waitForTransport();
    harness.transport.resolveReady();
    await start;

    harness.controller.commit();
    harness.transport.delta("non-authoritative partial");
    harness.transport.complete("  \n  ");
    await flushPromises();

    expect(harness.completions).toEqual([]);
    expect(harness.currentState()).toEqual({
      code: "no_speech",
      message: "No speech was detected. Please try again.",
      type: "failed",
    });
  });

  test("Escape-style cancellation during permission ignores the late stream and preserves no state", async () => {
    const media = deferred<MediaStream>();
    const harness = createHarness({ getUserMedia: () => media.promise });

    const start = harness.controller.start(startOptions());
    harness.controller.cancel();
    expect(harness.currentState()).toEqual({ type: "idle" });

    media.resolve(harness.stream);
    await start;
    expect(harness.track.stop).toHaveBeenCalledOnce();
    expect(harness.sessionWorkspaceIds).toEqual([]);
    expect(harness.transports).toEqual([]);
  });

  test("cancellation while connected closes transport, timer, and every media track", async () => {
    const harness = createHarness();
    const start = harness.controller.start(startOptions());
    await harness.waitForTransport();

    harness.controller.cancel();
    harness.transport.rejectReady("aborted");
    await start;

    expect(harness.currentState()).toEqual({ type: "idle" });
    expect(harness.transport.close).toHaveBeenCalledOnce();
    expect(harness.track.stop).toHaveBeenCalledOnce();
    expect(harness.clearTimer).toHaveBeenCalledOnce();
  });

  test("the backend recording-duration limit visibly fails and tears down capture", async () => {
    const session = deferred<SpeechTranscriptionSession>();
    const harness = createHarness({ createTranscriptionSession: () => session.promise });
    const start = harness.controller.start(startOptions());
    await harness.waitForState("connecting");

    harness.fireTimer();
    expect(harness.currentState()).toEqual({
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

      await harness.controller.start(startOptions());

      expect(harness.currentState()).toMatchObject({ code, type: "failed" });
      expect(failedMessage(harness.currentState())).not.toContain("private");
      expect(harness.sessionWorkspaceIds).toEqual([]);
    },
  );

  test.each([
    "connection_failed",
    "connection_lost",
    "invalid_media",
    "invalid_session",
    "malformed_event",
    "provider_rate_limited",
    "provider_rejected",
    "provider_response_malformed",
    "provider_unavailable",
    "stale_event",
    "transcript_too_large",
    "transcription_failed",
  ] satisfies Exclude<RealtimeTranscriptionErrorCode, "aborted">[])(
    "maps Realtime %s to a typed visible failure and rejects late completion",
    async (code) => {
      const harness = createHarness();
      const start = harness.controller.start(startOptions());
      await harness.waitForTransport();

      harness.transport.fail(code);
      await start;
      harness.transport.complete("late transcript");
      await flushPromises();

      expect(harness.currentState()).toMatchObject({ code, type: "failed" });
      expect(harness.completions).toEqual([]);
      expect(harness.track.stop).toHaveBeenCalledOnce();
    },
  );

  test("keeps the runtime's safe session error and stops the already-open microphone", async () => {
    const harness = createHarness({
      createTranscriptionSession: async () => {
        throw new Error("OpenAI speech rate limit or quota was reached.");
      },
    });

    await harness.controller.start(startOptions());

    expect(harness.currentState()).toEqual({
      code: "session_failed",
      message: "OpenAI speech rate limit or quota was reached.",
      type: "failed",
    });
    expect(harness.track.stop).toHaveBeenCalledOnce();
  });

  test("fails before microphone access when configuration or browser support is invalid", async () => {
    const notConfigured = createHarness();
    await notConfigured.controller.start(
      startOptions({ capabilities: capabilities({ providerStatus: "not_configured" }) }),
    );
    expect(notConfigured.currentState()).toMatchObject({
      code: "not_configured",
      type: "failed",
    });

    const insecure = createHarness({
      support: () => ({
        code: "insecure_context",
        message: "Voice capture requires HTTPS.",
        supported: false,
      }),
    });
    await insecure.controller.start(startOptions());
    expect(insecure.currentState()).toEqual({
      code: "insecure_context",
      message: "Voice capture requires HTTPS.",
      type: "failed",
    });

    const invalidLimits = createHarness();
    await invalidLimits.controller.start(
      startOptions({ capabilities: capabilities({ maximumRecordingSeconds: 0 }) }),
    );
    expect(invalidLimits.currentState()).toMatchObject({
      code: "session_failed",
      type: "failed",
    });

    expect(notConfigured.mediaConstraints).toEqual([]);
    expect(insecure.mediaConstraints).toEqual([]);
    expect(invalidLimits.mediaConstraints).toEqual([]);
  });

  test("rejects changed backend limits and allows a failed capture to retry cleanly", async () => {
    const sessions = [
      transcriptionSession({ maximumTranscriptCharacters: 7999 }),
      transcriptionSession(),
    ];
    const harness = createHarness({
      createTranscriptionSession: async () => sessions.shift()!,
    });

    await harness.controller.start(startOptions());
    expect(harness.currentState()).toMatchObject({ code: "invalid_session", type: "failed" });

    const retry = harness.controller.start(startOptions({ intent: "steer" }));
    await harness.waitForTransport();
    harness.transport.resolveReady();
    await retry;
    expect(harness.currentState()).toMatchObject({ intent: "steer", type: "listening" });
  });

  test("dispose is idempotent and prevents late provider callbacks", async () => {
    const harness = createHarness();
    const start = harness.controller.start(startOptions());
    await harness.waitForTransport();

    harness.controller.dispose();
    harness.controller.dispose();
    harness.transport.rejectReady("aborted");
    await start;
    harness.transport.delta("late");

    expect(harness.currentState()).toEqual({ type: "idle" });
    expect(harness.completions).toEqual([]);
    expect(harness.track.stop).toHaveBeenCalledOnce();
  });
});

interface HarnessOverrides {
  createTranscriptionSession?: (workspaceId: string) => Promise<SpeechTranscriptionSession>;
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  onCompletedTranscript?: (
    transcript: string,
    intent: "start" | "steer",
    context: { runtimeId: string; workspaceId: string },
  ) => Promise<void> | void;
  support?: SpeechCaptureControllerDependencies["support"];
}

function createHarness(overrides: HarnessOverrides = {}) {
  const states: SpeechCaptureState[] = [];
  const completions: Array<{
    context: { runtimeId: string; workspaceId: string };
    intent: "start" | "steer";
    transcript: string;
  }> = [];
  const track = fakeAudioTrack();
  const stream = fakeMediaStream(track);
  const transports: FakeTransport[] = [];
  const mediaConstraints: MediaStreamConstraints[] = [];
  const sessionWorkspaceIds: string[] = [];
  let timerHandler: (() => void) | null = null;
  let timerDelayMs = 0;
  let captureOrdinal = 0;
  const clearTimer = vi.fn();
  const dependencies: SpeechCaptureControllerDependencies = {
    clearTimeout: clearTimer,
    createCaptureSessionId: () => {
      captureOrdinal += 1;
      return `capture_${captureOrdinal}`;
    },
    createTranscriptionSession: async (workspaceId) => {
      sessionWorkspaceIds.push(workspaceId);
      return overrides.createTranscriptionSession
        ? overrides.createTranscriptionSession(workspaceId)
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
    setTimeout: (handler, delayMs) => {
      timerHandler = handler;
      timerDelayMs = delayMs;
      return Symbol("timer");
    },
    support: overrides.support ?? (() => ({ supported: true })),
  };
  const controller = new SpeechCaptureController({
    dependencies,
    onCompletedTranscript: async (transcript, intent, context) => {
      completions.push({ context, intent, transcript });
      await overrides.onCompletedTranscript?.(transcript, intent, context);
    },
    onStateChange: (state) => states.push(state),
  });
  return {
    clearTimer,
    completions,
    controller,
    currentState: () => controller.state,
    fireTimer: () => {
      if (!timerHandler) {
        throw new Error("capture duration timer was not installed");
      }
      timerHandler();
    },
    mediaConstraints,
    sessionWorkspaceIds,
    stateTypes: () => states.map((state) => state.type),
    states,
    stream,
    get timerDelayMs() {
      return timerDelayMs;
    },
    track,
    get transport() {
      const transport = transports.at(-1);
      if (!transport) {
        throw new Error("Realtime transport was not created");
      }
      return transport;
    },
    transports,
    waitForState: async (type: SpeechCaptureState["type"]) => {
      for (let attempt = 0; attempt < 20; attempt += 1) {
        if (controller.state.type === type) {
          return;
        }
        await flushPromises();
      }
      throw new Error(`speech capture did not reach ${type}`);
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
    this.options.onTranscript({
      captureSessionId: this.options.captureSessionId,
      itemId: "item_current",
      providerSessionId: "session_current",
      transcript,
      type: "completed",
    });
  }

  delta(transcript: string): void {
    this.options.onTranscript({
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
}

function startOptions(
  overrides: {
    capabilities?: SpeechCapabilities;
    intent?: "start" | "steer";
  } = {},
) {
  return {
    capabilities: overrides.capabilities ?? capabilities(),
    intent: overrides.intent ?? ("start" as const),
    runtimeId: "runtime_capture",
    workspaceId: "workspace_capture",
  };
}

function capabilities(overrides: Partial<SpeechCapabilities> = {}): SpeechCapabilities {
  return {
    aiVoiceDisclosure: "Voice is AI-generated.",
    maximumRecordingSeconds: 120,
    maximumSynthesisCharacters: 4096,
    maximumTranscriptCharacters: 8000,
    providerStatus: "configured",
    synthesisModel: "gpt-4o-mini-tts",
    synthesisVoice: "marin",
    transcriptionModel: "gpt-realtime-whisper",
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

function failedMessage(state: SpeechCaptureState): string {
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
