import { describe, expect, test } from "vitest";

import {
  initialLocalMacOSVoiceListenerState,
  reduceLocalMacOSVoiceListenerState,
  type LocalMacOSVoiceListenerEffect,
  type LocalMacOSVoiceListenerEngineCommand,
  type LocalMacOSVoiceListenerEngineEvent,
  type LocalMacOSVoiceListenerPausableState,
  type LocalMacOSVoiceListenerPauseReason,
  type LocalMacOSVoiceListenerRuntime,
  type LocalMacOSVoiceListenerState,
  type LocalMacOSVoiceListenerStartCommand,
  type LocalMacOSVoiceListenerStatus,
  type LocalMacOSVoiceListenerTransitionEvent,
  type LocalMacOSVoiceWakeCaptureStatus,
} from "./local-macos-voice-listener";

describe("local macOS voice always-listening state machine", () => {
  test("defines the main-owned engine command and event protocol shape", () => {
    const runtime = "onnx" satisfies LocalMacOSVoiceListenerRuntime;
    const startCommand = {
      audioCopiedBeforeWakeMs: 400,
      hardTrailingSilenceLimitMs: 2_200,
      maximumUtteranceMs: 45_000,
      noMessageTimeoutMs: 4_000,
      preWakeRingBufferMs: 1_000,
      rearmCooldownMs: 300,
      runtime,
      speechStartDebounceMs: 160,
      threshold: 0.6,
      trailingAudioPaddingMs: 400,
      type: "start_listener",
      vadFrameMs: 20,
      wakeFrameMs: 80,
      wakeModelPath: "/Applications/Setta.app/Contents/Resources/hey-setta.onnx",
      wakeModelSHA256: "0".repeat(64),
    } satisfies LocalMacOSVoiceListenerStartCommand;
    const pauseCommand = {
      reason: "manual_capture" satisfies LocalMacOSVoiceListenerPauseReason,
      type: "pause_listener",
    } satisfies LocalMacOSVoiceListenerEngineCommand;
    const event = {
      score: 0.71,
      timeMs: 480,
      type: "wake_detected",
    } satisfies LocalMacOSVoiceListenerEngineEvent;
    const pausableState = {
      status: "armed",
    } satisfies LocalMacOSVoiceListenerPausableState;
    const listenerStatus = "capturing" satisfies LocalMacOSVoiceListenerStatus;
    const wakeCaptureStatus = "capturing" satisfies LocalMacOSVoiceWakeCaptureStatus;

    expect(startCommand.runtime).toBe("onnx");
    expect(pauseCommand.reason).toBe("manual_capture");
    expect(event.type).toBe("wake_detected");
    expect(pausableState.status).toBe("armed");
    expect(listenerStatus).toBe(wakeCaptureStatus);
  });

  test("arms the listener only after always listening is enabled with local voice ready", () => {
    const enabled = reduceLocalMacOSVoiceListenerState(initialLocalMacOSVoiceListenerState(), {
      localVoiceReady: true,
      type: "setting_enabled",
    });

    expect(enabled).toEqual({
      effects: [{ type: "start_listener" }],
      state: { status: "arming" },
    });

    expect(reduceLocalMacOSVoiceListenerState(enabled.state, { type: "engine_armed" })).toEqual({
      effects: [],
      state: { status: "armed" },
    });
  });

  test("does not restart an already active listener after duplicate setting-enabled events", () => {
    const armed = { status: "armed" } satisfies LocalMacOSVoiceListenerState;

    expect(
      reduceLocalMacOSVoiceListenerState(armed, {
        localVoiceReady: true,
        type: "setting_enabled",
      }),
    ).toEqual({
      effects: [],
      state: armed,
    });
  });

  test("walks wake capture through endpointing and transcript submission", () => {
    const result = reduceEvents({ status: "armed" }, [
      { score: 0.72, timeMs: 1_000, type: "wake_detected" },
      { type: "pre_wake_audio_buffered" },
      { timeMs: 1_180, type: "message_speech_started" },
      { timeMs: 2_400, type: "candidate_endpoint_detected" },
      { type: "endpoint_accepted" },
      { transcript: "open the current workspace", type: "transcription_finalized" },
    ]);

    expect(result.state).toEqual({
      status: "submitting",
      transcript: "open the current workspace",
    });
    expect(result.effects).toEqual([
      {
        transcript: "open the current workspace",
        type: "submit_transcript",
      },
    ]);

    expect(
      reduceLocalMacOSVoiceListenerState(result.state, { type: "submission_completed" }),
    ).toEqual({
      effects: [],
      state: { status: "armed" },
    });
  });

  test("returns to capture if speech resumes during a candidate endpoint", () => {
    const candidate = reduceEvents({ status: "armed" }, [
      { score: 0.8, timeMs: 100, type: "wake_detected" },
      { type: "pre_wake_audio_buffered" },
      { timeMs: 220, type: "message_speech_started" },
      { timeMs: 1_200, type: "candidate_endpoint_detected" },
    ]);

    expect(candidate.state.status).toBe("candidate_end");

    expect(
      reduceLocalMacOSVoiceListenerState(candidate.state, {
        timeMs: 1_300,
        type: "speech_resumed",
      }).state,
    ).toEqual({
      captureStartedAtMs: 220,
      score: 0.8,
      status: "capturing",
      wakeDetectedAtMs: 100,
    });
  });

  test("pauses wake detection while manual click-to-talk owns the microphone", () => {
    const paused = reduceLocalMacOSVoiceListenerState(
      { status: "armed" },
      {
        captureSessionId: "manual-one",
        type: "manual_capture_started",
      },
    );

    expect(paused).toEqual({
      effects: [{ reason: "manual_capture", type: "pause_listener" }],
      state: {
        captureSessionId: "manual-one",
        playbackOperationId: null,
        resumeState: { status: "armed" },
        status: "paused_for_manual_capture",
      },
    });

    expect(
      reduceLocalMacOSVoiceListenerState(paused.state, {
        score: 0.95,
        timeMs: 400,
        type: "wake_detected",
      }),
    ).toEqual({ effects: [], state: paused.state });

    expect(
      reduceLocalMacOSVoiceListenerState(paused.state, {
        captureSessionId: "manual-one",
        type: "manual_capture_finished",
      }),
    ).toEqual({
      effects: [{ reason: "manual_capture", type: "resume_listener" }],
      state: { status: "armed" },
    });
  });

  test("keeps the listener paused until nested manual capture and playback blockers clear", () => {
    const pausedForPlayback = reduceLocalMacOSVoiceListenerState(
      { status: "armed" },
      {
        operationId: "speech-one",
        type: "playback_started",
      },
    );
    const pausedForManual = reduceLocalMacOSVoiceListenerState(pausedForPlayback.state, {
      captureSessionId: "manual-one",
      type: "manual_capture_started",
    });

    expect(pausedForManual).toEqual({
      effects: [{ reason: "manual_capture", type: "pause_listener" }],
      state: {
        captureSessionId: "manual-one",
        playbackOperationId: "speech-one",
        resumeState: { status: "armed" },
        status: "paused_for_manual_capture",
      },
    });

    const manualFinished = reduceLocalMacOSVoiceListenerState(pausedForManual.state, {
      captureSessionId: "manual-one",
      type: "manual_capture_finished",
    });
    expect(manualFinished).toEqual({
      effects: [],
      state: {
        operationId: "speech-one",
        resumeState: { status: "armed" },
        status: "paused_for_playback",
      },
    });

    expect(
      reduceLocalMacOSVoiceListenerState(manualFinished.state, {
        operationId: "speech-one",
        type: "playback_finished",
      }),
    ).toEqual({
      effects: [{ reason: "playback", type: "resume_listener" }],
      state: { status: "armed" },
    });
  });

  test("reflects an active wake capture instead of starting competing manual capture", () => {
    const activeCapture = reduceEvents({ status: "armed" }, [
      { score: 0.75, timeMs: 100, type: "wake_detected" },
      { type: "pre_wake_audio_buffered" },
      { timeMs: 260, type: "message_speech_started" },
    ]).state;

    const requested = reduceLocalMacOSVoiceListenerState(activeCapture, {
      type: "manual_capture_requested",
    });

    expect(requested).toEqual({
      effects: [{ status: "capturing", type: "reflect_wake_capture" }],
      state: activeCapture,
    });

    expect(
      reduceLocalMacOSVoiceListenerState(activeCapture, {
        captureSessionId: "manual-one",
        type: "manual_capture_started",
      }),
    ).toEqual({ effects: [], state: activeCapture });
  });

  test("records listener failures as recoverable states", () => {
    const unavailable = reduceLocalMacOSVoiceListenerState(initialLocalMacOSVoiceListenerState(), {
      localVoiceReady: false,
      type: "setting_enabled",
    });

    expect(unavailable).toEqual({
      effects: [],
      state: {
        message: "Local macOS voice is not ready for always listening.",
        status: "local_voice_not_ready",
      },
    });

    expect(
      reduceLocalMacOSVoiceListenerState(unavailable.state, { type: "local_voice_ready" }),
    ).toEqual({
      effects: [{ type: "start_listener" }],
      state: { status: "arming" },
    });

    for (const state of [
      { message: "Microphone access is denied.", status: "microphone_denied" },
      { message: "Always listening helper exited.", status: "engine_failed" },
    ] satisfies LocalMacOSVoiceListenerState[]) {
      expect(reduceLocalMacOSVoiceListenerState(state, { type: "local_voice_ready" })).toEqual({
        effects: [{ type: "start_listener" }],
        state: { status: "arming" },
      });
    }
  });
});

function reduceEvents(
  initialState: LocalMacOSVoiceListenerState,
  events: LocalMacOSVoiceListenerTransitionEvent[],
): { effects: LocalMacOSVoiceListenerEffect[]; state: LocalMacOSVoiceListenerState } {
  let result = {
    effects: [] as LocalMacOSVoiceListenerEffect[],
    state: initialState,
  };
  for (const event of events) {
    result = reduceLocalMacOSVoiceListenerState(result.state, event);
  }
  return result;
}
