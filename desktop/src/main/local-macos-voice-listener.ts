export type LocalMacOSVoiceListenerStatus =
  | "disabled"
  | "arming"
  | "armed"
  | "wake_detected"
  | "waiting_for_message_speech"
  | "capturing"
  | "candidate_end"
  | "finalizing"
  | "submitting"
  | "paused_for_playback"
  | "paused_for_manual_capture"
  | "microphone_denied"
  | "local_voice_not_ready"
  | "engine_failed";

export type LocalMacOSVoiceListenerRuntime = "onnx" | "tflite";

export interface LocalMacOSVoiceListenerStartCommand {
  audioCopiedBeforeWakeMs: number;
  hardTrailingSilenceLimitMs: number;
  maximumUtteranceMs: number;
  noMessageTimeoutMs: number;
  preWakeRingBufferMs: number;
  rearmCooldownMs: number;
  runtime: LocalMacOSVoiceListenerRuntime;
  speechStartDebounceMs: number;
  threshold: number;
  trailingAudioPaddingMs: number;
  type: "start_listener";
  vadFrameMs: number;
  wakeFrameMs: number;
  wakeModelPath: string;
  wakeModelSHA256: string;
}

export type LocalMacOSVoiceListenerEngineCommand =
  | LocalMacOSVoiceListenerStartCommand
  | {
      reason: "setting_disabled" | "shutdown";
      type: "stop_listener";
    }
  | {
      reason: LocalMacOSVoiceListenerPauseReason;
      type: "pause_listener";
    }
  | {
      reason: LocalMacOSVoiceListenerPauseReason;
      type: "resume_listener";
    };

export type LocalMacOSVoiceListenerEngineEvent =
  | {
      type: "listener_armed";
    }
  | {
      score: number;
      timeMs: number;
      type: "wake_detected";
    }
  | {
      timeMs: number;
      type: "message_speech_started";
    }
  | {
      timeMs: number;
      type: "candidate_endpoint_detected";
    }
  | {
      transcript: string;
      type: "utterance_finalized";
    }
  | {
      message: string;
      type: "microphone_denied";
    }
  | {
      message: string;
      type: "local_voice_not_ready";
    }
  | {
      message: string;
      type: "engine_failed";
    };

export type LocalMacOSVoiceListenerState =
  | {
      status: "disabled";
    }
  | {
      status: "arming";
    }
  | {
      status: "armed";
    }
  | {
      score: number;
      status: "wake_detected";
      wakeDetectedAtMs: number;
    }
  | {
      score: number;
      status: "waiting_for_message_speech";
      wakeDetectedAtMs: number;
    }
  | {
      captureStartedAtMs: number;
      score: number;
      status: "capturing";
      wakeDetectedAtMs: number;
    }
  | {
      candidateEndAtMs: number;
      captureStartedAtMs: number;
      score: number;
      status: "candidate_end";
      wakeDetectedAtMs: number;
    }
  | {
      captureStartedAtMs: number;
      score: number;
      status: "finalizing";
      wakeDetectedAtMs: number;
    }
  | {
      status: "submitting";
      transcript: string;
    }
  | {
      operationId: string;
      resumeState: LocalMacOSVoiceListenerPausableState;
      status: "paused_for_playback";
    }
  | {
      captureSessionId: string;
      playbackOperationId: string | null;
      resumeState: LocalMacOSVoiceListenerPausableState;
      status: "paused_for_manual_capture";
    }
  | {
      message: string;
      status: "microphone_denied";
    }
  | {
      message: string;
      status: "local_voice_not_ready";
    }
  | {
      message: string;
      status: "engine_failed";
    };

export type LocalMacOSVoiceListenerPausableState =
  | {
      status: "arming";
    }
  | {
      status: "armed";
    };

export type LocalMacOSVoiceListenerPauseReason = "manual_capture" | "playback";

export type LocalMacOSVoiceListenerTransitionEvent =
  | {
      localVoiceReady: boolean;
      type: "setting_enabled";
    }
  | {
      type: "setting_disabled";
    }
  | {
      type: "local_voice_ready";
    }
  | {
      message: string;
      type: "local_voice_not_ready";
    }
  | {
      type: "engine_armed";
    }
  | {
      score: number;
      timeMs: number;
      type: "wake_detected";
    }
  | {
      type: "pre_wake_audio_buffered";
    }
  | {
      timeMs: number;
      type: "message_speech_started";
    }
  | {
      timeMs: number;
      type: "candidate_endpoint_detected";
    }
  | {
      timeMs: number;
      type: "speech_resumed";
    }
  | {
      type: "endpoint_accepted";
    }
  | {
      transcript: string;
      type: "transcription_finalized";
    }
  | {
      type: "submission_completed";
    }
  | {
      type: "manual_capture_requested";
    }
  | {
      captureSessionId: string;
      type: "manual_capture_started";
    }
  | {
      captureSessionId: string;
      type: "manual_capture_finished";
    }
  | {
      operationId: string;
      type: "playback_started";
    }
  | {
      operationId: string;
      type: "playback_finished";
    }
  | {
      message: string;
      type: "microphone_denied";
    }
  | {
      message: string;
      type: "engine_failed";
    };

export type LocalMacOSVoiceWakeCaptureStatus = Extract<
  LocalMacOSVoiceListenerStatus,
  | "wake_detected"
  | "waiting_for_message_speech"
  | "capturing"
  | "candidate_end"
  | "finalizing"
  | "submitting"
>;

export type LocalMacOSVoiceListenerEffect =
  | {
      type: "start_listener";
    }
  | {
      reason: "setting_disabled";
      type: "stop_listener";
    }
  | {
      reason: LocalMacOSVoiceListenerPauseReason;
      type: "pause_listener";
    }
  | {
      reason: LocalMacOSVoiceListenerPauseReason;
      type: "resume_listener";
    }
  | {
      status: LocalMacOSVoiceWakeCaptureStatus;
      type: "reflect_wake_capture";
    }
  | {
      transcript: string;
      type: "submit_transcript";
    };

export interface LocalMacOSVoiceListenerTransitionResult {
  effects: LocalMacOSVoiceListenerEffect[];
  state: LocalMacOSVoiceListenerState;
}

type LocalMacOSVoiceListenerEventByType = {
  [Event in LocalMacOSVoiceListenerTransitionEvent as Event["type"]]: Event;
};

type LocalMacOSVoiceListenerReducerMap = {
  [Type in keyof LocalMacOSVoiceListenerEventByType]: (
    state: LocalMacOSVoiceListenerState,
    event: LocalMacOSVoiceListenerEventByType[Type],
  ) => LocalMacOSVoiceListenerTransitionResult;
};

const wakeCaptureStatuses = new Set<LocalMacOSVoiceWakeCaptureStatus>([
  "wake_detected",
  "waiting_for_message_speech",
  "capturing",
  "candidate_end",
  "finalizing",
  "submitting",
]);

const transitionReducers = {
  candidate_endpoint_detected: reduceCandidateEndpointDetected,
  endpoint_accepted: reduceEndpointAccepted,
  engine_armed: reduceEngineArmed,
  engine_failed: reduceEngineFailed,
  local_voice_not_ready: reduceLocalVoiceNotReady,
  local_voice_ready: reduceLocalVoiceReady,
  manual_capture_finished: reduceManualCaptureFinished,
  manual_capture_requested: reduceManualCaptureRequested,
  manual_capture_started: reduceManualCaptureStarted,
  message_speech_started: reduceMessageSpeechStarted,
  microphone_denied: reduceMicrophoneDenied,
  playback_finished: reducePlaybackFinished,
  playback_started: reducePlaybackStarted,
  pre_wake_audio_buffered: reducePreWakeAudioBuffered,
  setting_disabled: reduceSettingDisabled,
  setting_enabled: reduceSettingEnabled,
  speech_resumed: reduceSpeechResumed,
  submission_completed: reduceSubmissionCompleted,
  transcription_finalized: reduceTranscriptionFinalized,
  wake_detected: reduceWakeDetected,
} satisfies LocalMacOSVoiceListenerReducerMap;

export function initialLocalMacOSVoiceListenerState(): LocalMacOSVoiceListenerState {
  return { status: "disabled" };
}

export function reduceLocalMacOSVoiceListenerState(
  state: LocalMacOSVoiceListenerState,
  event: LocalMacOSVoiceListenerTransitionEvent,
): LocalMacOSVoiceListenerTransitionResult {
  const reducer = transitionReducers[event.type] as (
    state: LocalMacOSVoiceListenerState,
    event: LocalMacOSVoiceListenerTransitionEvent,
  ) => LocalMacOSVoiceListenerTransitionResult;
  return reducer(state, event);
}

function reduceSettingEnabled(
  _state: LocalMacOSVoiceListenerState,
  event: LocalMacOSVoiceListenerEventByType["setting_enabled"],
): LocalMacOSVoiceListenerTransitionResult {
  return event.localVoiceReady
    ? transition({ status: "arming" }, { type: "start_listener" })
    : transition({
        message: "Local macOS voice is not ready for always listening.",
        status: "local_voice_not_ready",
      });
}

function reduceSettingDisabled(
  state: LocalMacOSVoiceListenerState,
): LocalMacOSVoiceListenerTransitionResult {
  return state.status === "disabled"
    ? transition(state)
    : transition({ status: "disabled" }, { reason: "setting_disabled", type: "stop_listener" });
}

function reduceLocalVoiceReady(
  state: LocalMacOSVoiceListenerState,
): LocalMacOSVoiceListenerTransitionResult {
  return state.status === "local_voice_not_ready"
    ? transition({ status: "arming" }, { type: "start_listener" })
    : transition(state);
}

function reduceLocalVoiceNotReady(
  state: LocalMacOSVoiceListenerState,
  event: LocalMacOSVoiceListenerEventByType["local_voice_not_ready"],
): LocalMacOSVoiceListenerTransitionResult {
  return state.status === "disabled"
    ? transition(state)
    : transition({ message: event.message, status: "local_voice_not_ready" });
}

function reduceEngineArmed(
  state: LocalMacOSVoiceListenerState,
): LocalMacOSVoiceListenerTransitionResult {
  return state.status === "arming" ? transition({ status: "armed" }) : transition(state);
}

function reduceWakeDetected(
  state: LocalMacOSVoiceListenerState,
  event: LocalMacOSVoiceListenerEventByType["wake_detected"],
): LocalMacOSVoiceListenerTransitionResult {
  return state.status === "armed"
    ? transition({
        score: event.score,
        status: "wake_detected",
        wakeDetectedAtMs: event.timeMs,
      })
    : transition(state);
}

function reducePreWakeAudioBuffered(
  state: LocalMacOSVoiceListenerState,
): LocalMacOSVoiceListenerTransitionResult {
  return state.status === "wake_detected"
    ? transition({
        score: state.score,
        status: "waiting_for_message_speech",
        wakeDetectedAtMs: state.wakeDetectedAtMs,
      })
    : transition(state);
}

function reduceMessageSpeechStarted(
  state: LocalMacOSVoiceListenerState,
  event: LocalMacOSVoiceListenerEventByType["message_speech_started"],
): LocalMacOSVoiceListenerTransitionResult {
  return state.status === "waiting_for_message_speech"
    ? transition({
        captureStartedAtMs: event.timeMs,
        score: state.score,
        status: "capturing",
        wakeDetectedAtMs: state.wakeDetectedAtMs,
      })
    : transition(state);
}

function reduceCandidateEndpointDetected(
  state: LocalMacOSVoiceListenerState,
  event: LocalMacOSVoiceListenerEventByType["candidate_endpoint_detected"],
): LocalMacOSVoiceListenerTransitionResult {
  return state.status === "capturing"
    ? transition({
        candidateEndAtMs: event.timeMs,
        captureStartedAtMs: state.captureStartedAtMs,
        score: state.score,
        status: "candidate_end",
        wakeDetectedAtMs: state.wakeDetectedAtMs,
      })
    : transition(state);
}

function reduceSpeechResumed(
  state: LocalMacOSVoiceListenerState,
): LocalMacOSVoiceListenerTransitionResult {
  return state.status === "candidate_end"
    ? transition({
        captureStartedAtMs: state.captureStartedAtMs,
        score: state.score,
        status: "capturing",
        wakeDetectedAtMs: state.wakeDetectedAtMs,
      })
    : transition(state);
}

function reduceEndpointAccepted(
  state: LocalMacOSVoiceListenerState,
): LocalMacOSVoiceListenerTransitionResult {
  return state.status === "capturing" || state.status === "candidate_end"
    ? transition({
        captureStartedAtMs: state.captureStartedAtMs,
        score: state.score,
        status: "finalizing",
        wakeDetectedAtMs: state.wakeDetectedAtMs,
      })
    : transition(state);
}

function reduceTranscriptionFinalized(
  state: LocalMacOSVoiceListenerState,
  event: LocalMacOSVoiceListenerEventByType["transcription_finalized"],
): LocalMacOSVoiceListenerTransitionResult {
  return state.status === "finalizing"
    ? transition(
        { status: "submitting", transcript: event.transcript },
        { transcript: event.transcript, type: "submit_transcript" },
      )
    : transition(state);
}

function reduceSubmissionCompleted(
  state: LocalMacOSVoiceListenerState,
): LocalMacOSVoiceListenerTransitionResult {
  return state.status === "submitting" ? transition({ status: "armed" }) : transition(state);
}

function reduceManualCaptureRequested(
  state: LocalMacOSVoiceListenerState,
): LocalMacOSVoiceListenerTransitionResult {
  return reflectWakeCaptureIfActive(state);
}

function reduceManualCaptureStarted(
  state: LocalMacOSVoiceListenerState,
  event: LocalMacOSVoiceListenerEventByType["manual_capture_started"],
): LocalMacOSVoiceListenerTransitionResult {
  return pauseForManualCapture(state, event.captureSessionId);
}

function reduceManualCaptureFinished(
  state: LocalMacOSVoiceListenerState,
  event: LocalMacOSVoiceListenerEventByType["manual_capture_finished"],
): LocalMacOSVoiceListenerTransitionResult {
  return resumeFromManualCapture(state, event.captureSessionId);
}

function reducePlaybackStarted(
  state: LocalMacOSVoiceListenerState,
  event: LocalMacOSVoiceListenerEventByType["playback_started"],
): LocalMacOSVoiceListenerTransitionResult {
  return pauseForPlayback(state, event.operationId);
}

function reducePlaybackFinished(
  state: LocalMacOSVoiceListenerState,
  event: LocalMacOSVoiceListenerEventByType["playback_finished"],
): LocalMacOSVoiceListenerTransitionResult {
  return resumeFromPlayback(state, event.operationId);
}

function reduceMicrophoneDenied(
  state: LocalMacOSVoiceListenerState,
  event: LocalMacOSVoiceListenerEventByType["microphone_denied"],
): LocalMacOSVoiceListenerTransitionResult {
  return state.status === "disabled"
    ? transition(state)
    : transition({ message: event.message, status: "microphone_denied" });
}

function reduceEngineFailed(
  state: LocalMacOSVoiceListenerState,
  event: LocalMacOSVoiceListenerEventByType["engine_failed"],
): LocalMacOSVoiceListenerTransitionResult {
  return state.status === "disabled"
    ? transition(state)
    : transition({ message: event.message, status: "engine_failed" });
}

function pauseForManualCapture(
  state: LocalMacOSVoiceListenerState,
  captureSessionId: string,
): LocalMacOSVoiceListenerTransitionResult {
  if (isPausableListeningState(state)) {
    return transition(
      {
        captureSessionId,
        playbackOperationId: null,
        resumeState: state,
        status: "paused_for_manual_capture",
      },
      { reason: "manual_capture", type: "pause_listener" },
    );
  }
  if (state.status === "paused_for_playback") {
    return transition(
      {
        captureSessionId,
        playbackOperationId: state.operationId,
        resumeState: state.resumeState,
        status: "paused_for_manual_capture",
      },
      { reason: "manual_capture", type: "pause_listener" },
    );
  }
  return transition(state);
}

function resumeFromManualCapture(
  state: LocalMacOSVoiceListenerState,
  captureSessionId: string,
): LocalMacOSVoiceListenerTransitionResult {
  if (state.status !== "paused_for_manual_capture" || state.captureSessionId !== captureSessionId) {
    return transition(state);
  }
  if (state.playbackOperationId !== null) {
    return transition({
      operationId: state.playbackOperationId,
      resumeState: state.resumeState,
      status: "paused_for_playback",
    });
  }
  return transition(state.resumeState, { reason: "manual_capture", type: "resume_listener" });
}

function pauseForPlayback(
  state: LocalMacOSVoiceListenerState,
  operationId: string,
): LocalMacOSVoiceListenerTransitionResult {
  if (isPausableListeningState(state)) {
    return transition(
      {
        operationId,
        resumeState: state,
        status: "paused_for_playback",
      },
      { reason: "playback", type: "pause_listener" },
    );
  }
  if (state.status === "paused_for_manual_capture") {
    return transition({
      ...state,
      playbackOperationId: operationId,
    });
  }
  return transition(state);
}

function resumeFromPlayback(
  state: LocalMacOSVoiceListenerState,
  operationId: string,
): LocalMacOSVoiceListenerTransitionResult {
  if (state.status === "paused_for_playback" && state.operationId === operationId) {
    return transition(state.resumeState, { reason: "playback", type: "resume_listener" });
  }
  if (state.status === "paused_for_manual_capture" && state.playbackOperationId === operationId) {
    return transition({
      ...state,
      playbackOperationId: null,
    });
  }
  return transition(state);
}

function reflectWakeCaptureIfActive(
  state: LocalMacOSVoiceListenerState,
): LocalMacOSVoiceListenerTransitionResult {
  const wakeCaptureStatus = wakeCaptureStatusFromState(state);
  return wakeCaptureStatus === null
    ? transition(state)
    : transition(state, { status: wakeCaptureStatus, type: "reflect_wake_capture" });
}

function wakeCaptureStatusFromState(
  state: LocalMacOSVoiceListenerState,
): LocalMacOSVoiceWakeCaptureStatus | null {
  return wakeCaptureStatuses.has(state.status as LocalMacOSVoiceWakeCaptureStatus)
    ? (state.status as LocalMacOSVoiceWakeCaptureStatus)
    : null;
}

function isPausableListeningState(
  state: LocalMacOSVoiceListenerState,
): state is LocalMacOSVoiceListenerPausableState {
  return state.status === "arming" || state.status === "armed";
}

function transition(
  state: LocalMacOSVoiceListenerState,
  ...effects: LocalMacOSVoiceListenerEffect[]
): LocalMacOSVoiceListenerTransitionResult {
  return {
    effects,
    state,
  };
}
