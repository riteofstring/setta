import { access, constants } from "node:fs/promises";

import type {
  LocalMacOSVoiceHealth,
  LocalMacOSVoiceListenerAvailability,
  LocalMacOSVoiceListenerEvent,
  LocalMacOSVoiceListenerSettings,
} from "@shared/speech-ipc";
import {
  LocalMacOSVoiceHelperCommandError,
  LocalMacOSVoiceHelperProtocolError,
  LocalMacOSVoiceHelperUnavailableError,
  type LocalMacOSVoiceHelper,
} from "./local-macos-voice-helper";
import {
  initialLocalMacOSVoiceListenerState,
  reduceLocalMacOSVoiceListenerState,
  type LocalMacOSVoiceListenerEffect,
  type LocalMacOSVoiceListenerEngineEvent,
  type LocalMacOSVoiceListenerRuntime,
  type LocalMacOSVoiceListenerState,
  type LocalMacOSVoiceListenerTransitionEvent,
  type LocalMacOSVoiceWakeCaptureStatus,
} from "./local-macos-voice-listener";
import type { LocalMacOSVoiceListenerStoredSettings } from "./local-macos-voice-listener-store";
import type { LocalMacOSVoiceResolvedConfiguration } from "./local-macos-voice-resources";

interface LocalMacOSVoiceListenerSettingsRepository {
  read(): Promise<LocalMacOSVoiceListenerStoredSettings>;
  update(settings: LocalMacOSVoiceListenerStoredSettings): Promise<void>;
}

export interface LocalMacOSVoiceListenerServiceOptions {
  configuration: Pick<
    LocalMacOSVoiceResolvedConfiguration,
    "wakeModelPath" | "wakeModelSHA256" | "wakeRuntime"
  >;
  helper: LocalMacOSVoiceHelper;
  onEvent?: (event: LocalMacOSVoiceListenerEvent) => void;
  platform: NodeJS.Platform;
  store: LocalMacOSVoiceListenerSettingsRepository;
}

interface WakeModelReadiness {
  modelPath: string;
  modelSHA256: string;
  runtime: LocalMacOSVoiceListenerRuntime;
}

type ManualCaptureStartResult =
  | {
      status: "ready";
    }
  | {
      status: "blocked_by_wake_capture";
      wakeStatus: LocalMacOSVoiceWakeCaptureStatus;
    };

const listenerTiming = {
  audioCopiedBeforeWakeMs: 400,
  hardTrailingSilenceLimitMs: 2_200,
  maximumUtteranceMs: 45_000,
  noMessageTimeoutMs: 4_000,
  preWakeRingBufferMs: 1_000,
  rearmCooldownMs: 350,
  speechStartDebounceMs: 160,
  threshold: 0.65,
  trailingAudioPaddingMs: 400,
  vadFrameMs: 20,
  wakeFrameMs: 80,
} as const;

export class LocalMacOSVoiceListenerService {
  private enabled = false;
  private initialized = false;
  private operation: Promise<void> = Promise.resolve();
  private state: LocalMacOSVoiceListenerState = initialLocalMacOSVoiceListenerState();
  private wakeTranscriptSequence = 0;

  constructor(private readonly options: LocalMacOSVoiceListenerServiceOptions) {}

  async readSettings(): Promise<LocalMacOSVoiceListenerSettings> {
    await this.initialize();
    return this.snapshot();
  }

  async updateSettings(enabled: boolean): Promise<LocalMacOSVoiceListenerSettings> {
    await this.initialize();
    await this.options.store.update({ enabled });
    this.enabled = enabled;
    await this.enqueue(async () => {
      await this.applyTransition(
        enabled
          ? {
              localVoiceReady: await this.isReady(),
              type: "setting_enabled",
            }
          : { type: "setting_disabled" },
      );
    });
    return this.snapshot();
  }

  async prepareManualCaptureStart(captureSessionId: string): Promise<ManualCaptureStartResult> {
    await this.initialize();
    const requested = this.reduceOnly({ type: "manual_capture_requested" });
    const reflected = requested.effects.find((effect) => effect.type === "reflect_wake_capture");
    if (reflected) {
      return {
        status: "blocked_by_wake_capture",
        wakeStatus: reflected.status,
      };
    }
    await this.enqueue(async () => {
      await this.applyTransition({ captureSessionId, type: "manual_capture_started" });
    });
    return { status: "ready" };
  }

  async finishManualCapture(captureSessionId: string): Promise<void> {
    await this.initialize();
    await this.enqueue(async () => {
      await this.applyTransition({ captureSessionId, type: "manual_capture_finished" });
    });
  }

  async completeSubmission(captureSessionId: string): Promise<LocalMacOSVoiceListenerSettings> {
    await this.initialize();
    await this.enqueue(async () => {
      if (!captureSessionId.startsWith("wake_")) {
        throw new Error("Local macOS voice listener submission ID is invalid.");
      }
      await this.applyTransition({ type: "submission_completed" });
    });
    return this.snapshot();
  }

  async shutdown(): Promise<void> {
    await this.enqueue(async () => {
      if (this.state.status !== "disabled") {
        this.state = { status: "disabled" };
        await this.runEffect({ reason: "setting_disabled", type: "stop_listener" });
        this.publishState();
      }
    });
  }

  private async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }
    const stored = await this.readStoredSettings();
    this.enabled = stored.enabled;
    this.initialized = true;
    if (this.enabled) {
      await this.enqueue(async () => {
        await this.applyTransition({
          localVoiceReady: await this.isReady(),
          type: "setting_enabled",
        });
      });
    }
  }

  private async readStoredSettings(): Promise<LocalMacOSVoiceListenerStoredSettings> {
    return this.options.store.read();
  }

  private async applyTransition(event: LocalMacOSVoiceListenerTransitionEvent): Promise<void> {
    const result = reduceLocalMacOSVoiceListenerState(this.state, event);
    this.state = result.state;
    this.publishState();
    for (const effect of result.effects) {
      await this.runEffect(effect);
    }
  }

  private reduceOnly(
    event: LocalMacOSVoiceListenerTransitionEvent,
  ): ReturnType<typeof reduceLocalMacOSVoiceListenerState> {
    return reduceLocalMacOSVoiceListenerState(this.state, event);
  }

  private async runEffect(effect: LocalMacOSVoiceListenerEffect): Promise<void> {
    switch (effect.type) {
      case "start_listener":
        await this.startListener();
        return;
      case "stop_listener":
        await this.stopListener(effect.reason);
        return;
      case "pause_listener":
        await this.pauseListener(effect.reason);
        return;
      case "resume_listener":
        await this.resumeListener(effect.reason);
        return;
      case "reflect_wake_capture":
        this.publishState();
        return;
      case "submit_transcript":
        this.publishWakeTranscript(effect.transcript);
        return;
      default:
        return assertNever(effect);
    }
  }

  private async startListener(): Promise<void> {
    const readiness = await this.readWakeModelReadiness();
    if (readiness === null) {
      await this.applyTransition({
        message: this.listenerAvailabilityMessage(),
        type: "local_voice_not_ready",
      });
      return;
    }
    try {
      await this.options.helper.startListener(
        {
          ...listenerTiming,
          runtime: readiness.runtime,
          wakeModelPath: readiness.modelPath,
          wakeModelSHA256: readiness.modelSHA256,
        },
        (event) => this.handleEngineEvent(event),
      );
    } catch (error) {
      await this.applyTransition(helperErrorTransition(error));
    }
  }

  private async stopListener(reason: "setting_disabled"): Promise<void> {
    try {
      await this.options.helper.stopListener({ reason });
    } catch (error) {
      if (!listenerAlreadyStopped(error)) {
        await this.applyTransition(helperErrorTransition(error));
      }
    }
  }

  private async pauseListener(reason: "manual_capture" | "playback"): Promise<void> {
    try {
      await this.options.helper.pauseListener({ reason });
    } catch (error) {
      await this.applyTransition(helperErrorTransition(error));
    }
  }

  private async resumeListener(reason: "manual_capture" | "playback"): Promise<void> {
    try {
      await this.options.helper.resumeListener({ reason });
    } catch (error) {
      await this.applyTransition(helperErrorTransition(error));
    }
  }

  private handleEngineEvent(event: LocalMacOSVoiceListenerEngineEvent): void {
    void this.enqueue(async () => {
      for (const transition of transitionsForEngineEvent(event)) {
        await this.applyTransition(transition);
      }
    });
  }

  private publishWakeTranscript(transcript: string): void {
    const normalized = transcript.trim();
    if (normalized === "") {
      void this.enqueue(async () => {
        await this.applyTransition({
          message: "Always listening did not detect speech to submit.",
          type: "engine_failed",
        });
      });
      return;
    }
    this.wakeTranscriptSequence += 1;
    this.options.onEvent?.({
      captureSessionId: `wake_${this.wakeTranscriptSequence}`,
      settings: this.snapshot(),
      transcript: normalized,
      type: "wake_transcript",
    });
  }

  private publishState(): void {
    this.options.onEvent?.({
      settings: this.snapshot(),
      type: "state_changed",
    });
  }

  private snapshot(): LocalMacOSVoiceListenerSettings {
    return {
      availability: this.listenerAvailability(),
      enabled: this.enabled,
      state: this.state,
    };
  }

  private listenerAvailability(): LocalMacOSVoiceListenerAvailability {
    if (this.options.platform !== "darwin") {
      return {
        message: "Always listening is available only on macOS.",
        setupAction: null,
        status: "unavailable",
      };
    }
    const wakeConfigured =
      this.options.configuration.wakeModelPath !== null &&
      this.options.configuration.wakeModelSHA256 !== null &&
      this.options.configuration.wakeRuntime !== null;
    if (!wakeConfigured) {
      return {
        message: "Always listening needs a packaged Hey Setta wake model before it can be enabled.",
        setupAction: null,
        status: "unavailable",
      };
    }
    if (this.state.status === "local_voice_not_ready") {
      return {
        message: this.state.message,
        setupAction: "download_local_macos_voice_model",
        status: "unavailable",
      };
    }
    return { status: "ready" };
  }

  private listenerAvailabilityMessage(): string {
    const availability = this.listenerAvailability();
    return availability.status === "ready"
      ? "Local macOS voice is not ready for always listening."
      : availability.message;
  }

  private async isReady(): Promise<boolean> {
    return (await this.readWakeModelReadiness()) !== null;
  }

  private async readWakeModelReadiness(): Promise<WakeModelReadiness | null> {
    if (this.options.platform !== "darwin") {
      return null;
    }
    const { wakeModelPath, wakeModelSHA256, wakeRuntime } = this.options.configuration;
    if (wakeModelPath === null || wakeModelSHA256 === null || wakeRuntime === null) {
      return null;
    }
    if (!(await fileReadable(wakeModelPath))) {
      return null;
    }
    const health = await this.options.helper.readHealth();
    if (health.status !== "ready") {
      return null;
    }
    return {
      modelPath: wakeModelPath,
      modelSHA256: wakeModelSHA256,
      runtime: wakeRuntime,
    };
  }

  private enqueue(task: () => Promise<void>): Promise<void> {
    const next = this.operation.then(task, task);
    this.operation = next.catch(() => undefined);
    return next;
  }
}

function transitionsForEngineEvent(
  event: LocalMacOSVoiceListenerEngineEvent,
): LocalMacOSVoiceListenerTransitionEvent[] {
  switch (event.type) {
    case "listener_armed":
      return [{ type: "engine_armed" }];
    case "wake_detected":
      return [
        {
          score: event.score,
          timeMs: event.timeMs,
          type: "wake_detected",
        },
        { type: "pre_wake_audio_buffered" },
      ];
    case "message_speech_started":
      return [{ timeMs: event.timeMs, type: "message_speech_started" }];
    case "candidate_endpoint_detected":
      return [{ timeMs: event.timeMs, type: "candidate_endpoint_detected" }];
    case "utterance_finalized":
      return [
        { type: "endpoint_accepted" },
        { transcript: event.transcript, type: "transcription_finalized" },
      ];
    case "microphone_denied":
      return [{ message: event.message, type: "microphone_denied" }];
    case "local_voice_not_ready":
      return [{ message: event.message, type: "local_voice_not_ready" }];
    case "engine_failed":
      return [{ message: event.message, type: "engine_failed" }];
    default:
      return assertNever(event);
  }
}

function helperErrorTransition(error: unknown): LocalMacOSVoiceListenerTransitionEvent {
  if (error instanceof LocalMacOSVoiceHelperUnavailableError) {
    return unavailableHealthTransition(error.health);
  }
  if (error instanceof LocalMacOSVoiceHelperCommandError) {
    if (error.code === "microphone_denied") {
      return { message: error.message, type: "microphone_denied" };
    }
    if (
      error.code === "missing_model" ||
      error.code === "model_hash_mismatch" ||
      error.code === "helper_unavailable"
    ) {
      return { message: error.message, type: "local_voice_not_ready" };
    }
    return { message: error.message, type: "engine_failed" };
  }
  if (error instanceof LocalMacOSVoiceHelperProtocolError) {
    return {
      message: "Local macOS voice listener returned an invalid event.",
      type: "engine_failed",
    };
  }
  return {
    message: error instanceof Error ? error.message : "Local macOS voice listener failed.",
    type: "engine_failed",
  };
}

function unavailableHealthTransition(
  health: Exclude<LocalMacOSVoiceHealth, { status: "ready" }>,
): LocalMacOSVoiceListenerTransitionEvent {
  switch (health.status) {
    case "microphone_denied":
      return { message: health.message, type: "microphone_denied" };
    case "helper_unavailable":
    case "missing_model":
    case "model_hash_mismatch":
    case "synthesis_unavailable":
      return { message: health.message, type: "local_voice_not_ready" };
    default:
      return assertNever(health);
  }
}

function listenerAlreadyStopped(error: unknown): boolean {
  return error instanceof LocalMacOSVoiceHelperCommandError && error.code === "invalid_listener";
}

async function fileReadable(path: string): Promise<boolean> {
  try {
    await access(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function assertNever(value: never): never {
  throw new Error(`Unsupported local macOS voice listener value: ${JSON.stringify(value)}`);
}
