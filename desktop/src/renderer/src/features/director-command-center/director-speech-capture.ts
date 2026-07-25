import type { DirectorIntent, DirectorReceipt } from "@generated/backend";

import {
  captureAvailabilityFailure,
  safeSessionErrorMessage,
} from "../global-speech/app-shell-speech-capture-failures";
import {
  speechAvailabilityForCapabilities,
  type SpeechCaptureAvailability,
} from "../global-speech/speech-capture-availability";
import {
  VoiceCaptureProviderAbortedError,
  VoiceCaptureProviderError,
  type SpeechCaptureFailureCode,
  type VoiceCaptureSession,
  type VoiceCaptureSessionEvent,
  type VoiceInputProvider,
} from "../global-speech/voice-provider-boundary";

export type DirectorSpeechCaptureFailureCode =
  | SpeechCaptureFailureCode
  | "director_submission_failed"
  | "director_submission_pending";

interface DirectorSpeechActiveState {
  captureSessionId: string;
  transcript: string;
}

export interface CompletedDirectorSpeechTranscript {
  captureSessionId: string;
  runtimeId: string;
  transcript: string;
}

export type DirectorSpeechCaptureState =
  | { type: "idle" }
  | (DirectorSpeechActiveState & { type: "requesting_permission" })
  | (DirectorSpeechActiveState & {
      connection: "connecting" | "ready";
      type: "recording";
    })
  | (DirectorSpeechActiveState & {
      connection: "connecting" | "ready";
      type: "draining";
    })
  | (DirectorSpeechActiveState & { type: "committing" })
  | (CompletedDirectorSpeechTranscript & { type: "submitting" })
  | (CompletedDirectorSpeechTranscript & {
      receiptText: string | null;
      type: "submitted";
    })
  | {
      code: DirectorSpeechCaptureFailureCode;
      message: string;
      retryTranscript: CompletedDirectorSpeechTranscript | null;
      type: "failed";
    };

export interface DirectorSpeechCaptureSnapshot {
  availability: SpeechCaptureAvailability;
  capture: DirectorSpeechCaptureState;
  runtimeId: string | null;
}

export interface DirectorSpeechCaptureControllerDependencies {
  captureProvider: VoiceInputProvider;
  clearTimeout: (handle: unknown) => void;
  createCaptureSessionId: () => string;
  dispatchDirectorIntent: (intent: DirectorIntent) => Promise<DirectorReceipt>;
  onCaptureEnd: () => void;
  onCaptureStart: () => void;
  setTimeout: (handler: () => void, delayMs: number) => unknown;
}

interface FinishRecordingContext {
  activeState: Extract<DirectorSpeechCaptureState, { type: "recording" }>;
  lifecycle: number;
  providerSession: VoiceCaptureSession;
  runtimeId: string;
}

export class DirectorSpeechCaptureController {
  private readonly dependencies: DirectorSpeechCaptureControllerDependencies;
  private readonly listeners = new Set<() => void>();

  private activeLifecycle: number | null = null;
  private capabilityGeneration = 0;
  private disposed = false;
  private durationTimer: unknown = null;
  private lifecycleSequence = 0;
  private providerSession: VoiceCaptureSession | null = null;
  private providerStartAbortController: AbortController | null = null;
  private snapshotValue: DirectorSpeechCaptureSnapshot = {
    availability: { type: "disconnected" },
    capture: { type: "idle" },
    runtimeId: null,
  };
  private submissionGeneration = 0;
  private unsubscribeProviderSession: (() => void) | null = null;

  constructor(dependencies: DirectorSpeechCaptureControllerDependencies) {
    this.dependencies = dependencies;
  }

  getSnapshot = (): DirectorSpeechCaptureSnapshot => this.snapshotValue;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  synchronizeRuntime = async (runtimeId: string | null): Promise<void> => {
    this.assertUsable();
    if (runtimeId === this.snapshotValue.runtimeId) {
      return;
    }
    this.capabilityGeneration += 1;
    this.submissionGeneration += 1;
    const generation = this.capabilityGeneration;
    this.resetCapture(false);
    this.updateSnapshot({
      availability: runtimeId ? { type: "loading" } : { type: "disconnected" },
      capture: { type: "idle" },
      runtimeId,
    });
    if (!runtimeId) {
      return;
    }
    await this.loadCapabilities(generation, runtimeId);
  };

  refreshCapabilities = async (): Promise<void> => {
    this.assertUsable();
    const runtimeId = this.snapshotValue.runtimeId;
    if (!runtimeId) {
      return;
    }
    this.capabilityGeneration += 1;
    const generation = this.capabilityGeneration;
    this.updateSnapshot({ availability: { type: "loading" } });
    await this.loadCapabilities(generation, runtimeId);
  };

  start = async (): Promise<void> => {
    this.assertUsable();
    if (this.activeCaptureBlocksStart()) {
      return;
    }
    const submissionFailure = this.submissionCaptureFailure();
    if (submissionFailure) {
      this.updateSnapshot({ capture: { ...submissionFailure, type: "failed" } });
      return;
    }
    const startFailure = captureAvailabilityFailure(
      this.snapshotValue.availability,
      this.snapshotValue.runtimeId,
    );
    if (startFailure) {
      this.updateSnapshot({
        capture: { ...startFailure, retryTranscript: null, type: "failed" },
      });
      return;
    }
    const runtimeId = this.snapshotValue.runtimeId;
    const availability = this.snapshotValue.availability;
    if (!runtimeId || availability.type !== "configured") {
      throw new Error("Director speech capture start validation returned inconsistent state");
    }
    this.dependencies.onCaptureStart();
    const lifecycle = this.beginLifecycle();
    const activeState = {
      captureSessionId: this.dependencies.createCaptureSessionId(),
      transcript: "",
    } satisfies DirectorSpeechActiveState;
    this.transitionCapture({ ...activeState, type: "requesting_permission" });

    try {
      const abortController = new AbortController();
      this.providerStartAbortController = abortController;
      const providerSession = await this.dependencies.captureProvider.startCapture({
        capabilities: availability.capabilities,
        captureSessionId: activeState.captureSessionId,
        signal: abortController.signal,
      });
      if (!this.isCurrentCapture(lifecycle, runtimeId)) {
        providerSession.cancel();
        return;
      }
      this.providerStartAbortController = null;
      this.providerSession = providerSession;
      this.unsubscribeProviderSession = providerSession.subscribe((event) =>
        this.handleProviderSessionEvent(lifecycle, runtimeId, event),
      );
      this.startDurationTimer(
        lifecycle,
        runtimeId,
        availability.capabilities.maximumRecordingSeconds,
      );
      const providerReady = this.watchProviderReady(lifecycle, runtimeId, providerSession);
      void providerReady.catch(() => {});
      this.transitionCapture({ ...activeState, connection: "connecting", type: "recording" });
    } catch (error) {
      this.handleProviderError(lifecycle, runtimeId, error);
    }
  };

  commit = (): void => {
    this.assertUsable();
    if (this.snapshotValue.capture.type !== "recording" || this.activeLifecycle === null) {
      return;
    }
    void this.finishRecording();
  };

  cancel = (): void => {
    this.assertUsable();
    this.resetCapture();
    if (this.snapshotValue.capture.type !== "idle") {
      this.updateSnapshot({ capture: { type: "idle" } });
    }
  };

  retrySubmission = (): void => {
    this.assertUsable();
    const capture = this.snapshotValue.capture;
    if (capture.type !== "failed" || capture.retryTranscript === null) {
      return;
    }
    this.submitCompletedTranscript(capture.retryTranscript);
  };

  discardSubmission = (): void => {
    this.assertUsable();
    const capture = this.snapshotValue.capture;
    if (capture.type === "failed" && capture.retryTranscript !== null) {
      this.submissionGeneration += 1;
      this.updateSnapshot({ capture: { type: "idle" } });
    }
  };

  dispose = (): void => {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.capabilityGeneration += 1;
    this.submissionGeneration += 1;
    this.resetCapture(false);
    this.listeners.clear();
  };

  private async loadCapabilities(generation: number, runtimeId: string): Promise<void> {
    try {
      const capabilities = await this.dependencies.captureProvider.readCapabilities();
      if (!this.isCurrentCapabilityLoad(generation, runtimeId)) {
        return;
      }
      this.updateSnapshot({
        availability: speechAvailabilityForCapabilities(
          capabilities,
          this.dependencies.captureProvider.readSupport(),
        ),
      });
    } catch {
      if (!this.isCurrentCapabilityLoad(generation, runtimeId)) {
        return;
      }
      this.updateSnapshot({
        availability: {
          message: "Voice capabilities could not be read from the runtime.",
          type: "failed",
        },
      });
    }
  }

  private activeCaptureBlocksStart(): boolean {
    switch (this.snapshotValue.capture.type) {
      case "recording":
        this.commit();
        return true;
      case "requesting_permission":
      case "draining":
      case "committing":
        return true;
      case "failed":
      case "idle":
      case "submitted":
      case "submitting":
        return false;
      default:
        return assertNever(this.snapshotValue.capture);
    }
  }

  private submissionCaptureFailure(): {
    code: DirectorSpeechCaptureFailureCode;
    message: string;
    retryTranscript: CompletedDirectorSpeechTranscript | null;
  } | null {
    const capture = this.snapshotValue.capture;
    if (capture.type === "submitting") {
      return {
        code: "director_submission_pending",
        message: "The previous voice request is still being sent to the Director.",
        retryTranscript: capture,
      };
    }
    if (capture.type === "failed" && capture.retryTranscript !== null) {
      return {
        code: capture.code,
        message: capture.message,
        retryTranscript: capture.retryTranscript,
      };
    }
    return null;
  }

  private beginLifecycle(): number {
    this.lifecycleSequence += 1;
    this.activeLifecycle = this.lifecycleSequence;
    return this.lifecycleSequence;
  }

  private startDurationTimer(
    lifecycle: number,
    runtimeId: string,
    maximumRecordingSeconds: number,
  ): void {
    this.durationTimer = this.dependencies.setTimeout(() => {
      this.fail(
        lifecycle,
        runtimeId,
        "duration_limit",
        `Voice recording reached the ${maximumRecordingSeconds}-second limit. Please try again.`,
        null,
      );
    }, maximumRecordingSeconds * 1000);
  }

  private stopDurationTimer(): void {
    if (this.durationTimer === null) {
      return;
    }
    this.dependencies.clearTimeout(this.durationTimer);
    this.durationTimer = null;
  }

  private async watchProviderReady(
    lifecycle: number,
    runtimeId: string,
    providerSession: VoiceCaptureSession,
  ): Promise<void> {
    try {
      await providerSession.ready;
      if (
        !this.isCurrentCapture(lifecycle, runtimeId) ||
        this.providerSession !== providerSession
      ) {
        return;
      }
      this.markConnectionReady();
    } catch (error) {
      if (this.isCurrentCapture(lifecycle, runtimeId)) {
        this.handleProviderError(lifecycle, runtimeId, error);
      }
      throw error;
    }
  }

  private async finishRecording(): Promise<void> {
    const context = this.finishRecordingContext();
    if (!context) {
      return;
    }
    const { activeState, lifecycle, providerSession, runtimeId } = context;
    this.stopDurationTimer();
    this.transitionCapture({ ...activeState, type: "draining" });
    try {
      await providerSession.finish();
      const drainingCapture = this.currentDrainingCapture(context);
      if (!drainingCapture) {
        return;
      }
      const { captureSessionId, transcript } = drainingCapture;
      this.transitionCapture({ captureSessionId, transcript, type: "committing" });
    } catch (error) {
      if (this.isCurrentCapture(lifecycle, runtimeId)) {
        this.handleProviderError(lifecycle, runtimeId, error);
      }
    }
  }

  private finishRecordingContext(): FinishRecordingContext | null {
    const activeState = this.snapshotValue.capture;
    if (activeState.type !== "recording") {
      return null;
    }
    const lifecycle = this.activeLifecycle;
    const runtimeId = this.snapshotValue.runtimeId;
    const providerSession = this.providerSession;
    if (lifecycle === null || runtimeId === null || providerSession === null) {
      return null;
    }
    return { activeState, lifecycle, providerSession, runtimeId };
  }

  private currentDrainingCapture(
    context: FinishRecordingContext,
  ): Extract<DirectorSpeechCaptureState, { type: "draining" }> | null {
    if (
      !this.isCurrentCapture(context.lifecycle, context.runtimeId) ||
      this.providerSession !== context.providerSession
    ) {
      return null;
    }
    const capture = this.snapshotValue.capture;
    return capture.type === "draining" ? capture : null;
  }

  private markConnectionReady(): void {
    const capture = this.snapshotValue.capture;
    if (capture.type !== "recording" && capture.type !== "draining") {
      return;
    }
    this.transitionCapture({ ...capture, connection: "ready" });
  }

  private handleTranscript(
    lifecycle: number,
    runtimeId: string,
    update: Extract<
      VoiceCaptureSessionEvent,
      { type: "transcript_delta" | "transcript_completed" }
    >,
  ): void {
    if (
      !this.isCurrentCapture(lifecycle, runtimeId) ||
      update.captureSessionId !== captureSessionId(this.snapshotValue.capture)
    ) {
      return;
    }
    if (update.type === "transcript_delta") {
      if (
        this.snapshotValue.capture.type !== "recording" &&
        this.snapshotValue.capture.type !== "draining" &&
        this.snapshotValue.capture.type !== "committing"
      ) {
        return;
      }
      this.transitionCapture({ ...this.snapshotValue.capture, transcript: update.transcript });
      return;
    }
    this.completeTranscript(lifecycle, runtimeId, update.transcript);
  }

  private completeTranscript(lifecycle: number, runtimeId: string, transcript: string): void {
    if (
      !this.isCurrentCapture(lifecycle, runtimeId) ||
      (this.snapshotValue.capture.type !== "draining" &&
        this.snapshotValue.capture.type !== "committing")
    ) {
      return;
    }
    if (transcript.trim() === "") {
      this.fail(
        lifecycle,
        runtimeId,
        "no_speech",
        "No speech was detected. Please try again.",
        null,
      );
      return;
    }
    const completed = {
      captureSessionId: this.snapshotValue.capture.captureSessionId,
      runtimeId,
      transcript,
    } satisfies CompletedDirectorSpeechTranscript;
    this.resetCapture();
    this.submitCompletedTranscript(completed);
  }

  private submitCompletedTranscript(completed: CompletedDirectorSpeechTranscript): void {
    this.submissionGeneration += 1;
    const generation = this.submissionGeneration;
    this.updateSnapshot({ capture: { ...completed, type: "submitting" } });
    let pending: Promise<DirectorReceipt>;
    try {
      pending = this.dependencies.dispatchDirectorIntent(
        directorVoiceSubmitIntent(completed.transcript),
      );
    } catch {
      this.handleSubmissionFailure(generation, completed);
      return;
    }
    void pending.then(
      (receipt) => this.handleSubmissionSuccess(generation, completed, receipt),
      () => this.handleSubmissionFailure(generation, completed),
    );
  }

  private handleSubmissionSuccess(
    generation: number,
    completed: CompletedDirectorSpeechTranscript,
    receipt: DirectorReceipt,
  ): void {
    if (!this.isCurrentSubmission(generation, completed)) {
      return;
    }
    this.updateSnapshot({
      capture: {
        ...completed,
        receiptText: receipt.submit?.replyText.trim() || null,
        type: "submitted",
      },
    });
  }

  private handleSubmissionFailure(
    generation: number,
    completed: CompletedDirectorSpeechTranscript,
  ): void {
    if (!this.isCurrentSubmission(generation, completed)) {
      return;
    }
    this.updateSnapshot({
      capture: {
        code: "director_submission_failed",
        message: "Setta could not send the voice request. Retry without recording it again.",
        retryTranscript: completed,
        type: "failed",
      },
    });
  }

  private handleProviderSessionEvent(
    lifecycle: number,
    runtimeId: string,
    event: VoiceCaptureSessionEvent,
  ): void {
    switch (event.type) {
      case "failed":
        this.fail(lifecycle, runtimeId, event.failure.code, event.failure.message, null);
        return;
      case "transcript_delta":
      case "transcript_completed":
        this.handleTranscript(lifecycle, runtimeId, event);
        return;
      default:
        assertNever(event);
    }
  }

  private handleProviderError(lifecycle: number, runtimeId: string, error: unknown): void {
    if (!this.isCurrentCapture(lifecycle, runtimeId)) {
      return;
    }
    if (error instanceof VoiceCaptureProviderAbortedError) {
      this.resetCapture();
      this.updateSnapshot({ capture: { type: "idle" } });
      return;
    }
    if (error instanceof VoiceCaptureProviderError) {
      this.fail(lifecycle, runtimeId, error.failure.code, error.failure.message, null);
      return;
    }
    this.fail(lifecycle, runtimeId, "session_failed", safeSessionErrorMessage(error), null);
  }

  private fail(
    lifecycle: number,
    runtimeId: string,
    code: DirectorSpeechCaptureFailureCode,
    message: string,
    retryTranscript: CompletedDirectorSpeechTranscript | null,
  ): void {
    if (!this.isCurrentCapture(lifecycle, runtimeId)) {
      return;
    }
    this.resetCapture();
    this.updateSnapshot({ capture: { code, message, retryTranscript, type: "failed" } });
  }

  private isCurrentCapture(lifecycle: number, runtimeId: string): boolean {
    return this.activeLifecycle === lifecycle && this.snapshotValue.runtimeId === runtimeId;
  }

  private isCurrentCapabilityLoad(generation: number, runtimeId: string): boolean {
    return (
      !this.disposed &&
      this.capabilityGeneration === generation &&
      this.snapshotValue.runtimeId === runtimeId
    );
  }

  private isCurrentSubmission(
    generation: number,
    completed: CompletedDirectorSpeechTranscript,
  ): boolean {
    return (
      !this.disposed &&
      this.submissionGeneration === generation &&
      this.snapshotValue.runtimeId === completed.runtimeId &&
      submissionCaptureMatches(this.snapshotValue.capture, completed)
    );
  }

  private resetCapture(notifyCaptureEnd = true): void {
    const captureEnded = this.activeLifecycle !== null;
    this.activeLifecycle = null;
    this.providerStartAbortController?.abort();
    this.providerStartAbortController = null;
    this.stopDurationTimer();
    this.unsubscribeProviderSession?.();
    this.unsubscribeProviderSession = null;
    this.providerSession?.cancel();
    this.providerSession = null;
    if (captureEnded && notifyCaptureEnd) {
      this.dependencies.onCaptureEnd();
    }
  }

  private transitionCapture(capture: DirectorSpeechCaptureState): void {
    this.updateSnapshot({ capture });
  }

  private updateSnapshot(update: Partial<DirectorSpeechCaptureSnapshot>): void {
    this.snapshotValue = { ...this.snapshotValue, ...update };
    for (const listener of this.listeners) {
      listener();
    }
  }

  private assertUsable(): void {
    if (this.disposed) {
      throw new Error("Director speech capture controller is disposed");
    }
  }
}

function captureSessionId(state: DirectorSpeechCaptureState): string | null {
  switch (state.type) {
    case "committing":
    case "draining":
    case "recording":
    case "requesting_permission":
      return state.captureSessionId;
    case "failed":
    case "idle":
    case "submitted":
    case "submitting":
      return null;
    default:
      return assertNever(state);
  }
}

function submissionCaptureMatches(
  state: DirectorSpeechCaptureState,
  completed: CompletedDirectorSpeechTranscript,
): boolean {
  return (
    state.type === "submitting" &&
    state.captureSessionId === completed.captureSessionId &&
    state.runtimeId === completed.runtimeId &&
    state.transcript === completed.transcript
  );
}

function directorVoiceSubmitIntent(text: string): DirectorIntent {
  return {
    cancelRun: null,
    createWorkstream: null,
    kind: "submit",
    moveSelection: null,
    resolveApproval: null,
    resolveResourceRequest: null,
    selectWorkstream: null,
    submit: { modality: "voice", text },
  };
}

function assertNever(value: never): never {
  throw new Error(`Unhandled Director speech capture value: ${JSON.stringify(value)}`);
}
