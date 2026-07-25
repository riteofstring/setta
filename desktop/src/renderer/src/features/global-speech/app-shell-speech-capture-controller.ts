import type { MasterInputModality } from "@generated/backend";

import type {
  AppShellMasterController,
  CompletedGlobalSpeechTranscript,
  MasterInputSubmissionState,
} from "../global-master/app-shell-master-controller";
import { requestMasterPaneFocus } from "../../workspace-layout/master-pane-focus";
import {
  type ConversationInputSubmissionState,
  GlobalSpeechConversationSubmissionController,
  type GlobalSpeechConversationSubmissionDependencies,
} from "./global-speech-conversation-submission";
import {
  speechAvailabilityForCapabilities,
  type SpeechCaptureAvailability,
} from "./speech-capture-availability";
import {
  captureAvailabilityFailure,
  safeSessionErrorMessage,
} from "./app-shell-speech-capture-failures";
import {
  type CompletedConversationSpeechTranscript,
  conversationSpeechCaptureRequest,
  freezeSpeechCaptureRequest,
  masterSpeechCaptureRequest,
  type SpeechCaptureRequest,
} from "./speech-capture-destination";
import {
  VoiceCaptureProviderAbortedError,
  VoiceCaptureProviderError,
  type SpeechCaptureFailureCode,
  type VoiceCaptureSession,
  type VoiceCaptureSessionEvent,
  type VoiceInputProvider,
} from "./voice-provider-boundary";

export type { SpeechCaptureFailureCode } from "./voice-provider-boundary";

interface SpeechCaptureActiveState {
  captureSessionId: string;
  request: SpeechCaptureRequest;
  transcript: string;
}

export type SpeechCaptureState =
  | { type: "idle" }
  | (SpeechCaptureActiveState & { type: "requesting_permission" })
  | (SpeechCaptureActiveState & {
      connection: "connecting" | "ready";
      type: "recording";
    })
  | (SpeechCaptureActiveState & {
      connection: "connecting" | "ready";
      type: "draining";
    })
  | (SpeechCaptureActiveState & { type: "committing" })
  | {
      code: SpeechCaptureFailureCode;
      message: string;
      type: "failed";
    };

export interface AppShellSpeechCaptureSnapshot {
  availability: SpeechCaptureAvailability;
  capture: SpeechCaptureState;
  completedConversationTranscript: CompletedConversationSpeechTranscript | null;
  completedTranscript: CompletedGlobalSpeechTranscript | null;
  conversationSubmission: ConversationInputSubmissionState;
  masterSubmission: MasterInputSubmissionState;
  runtimeId: string | null;
}

export interface AppShellSpeechCaptureControllerDependencies extends GlobalSpeechConversationSubmissionDependencies {
  captureProvider: VoiceInputProvider;
  clearTimeout: (handle: unknown) => void;
  createCaptureSessionId: () => string;
  onCaptureEnd: () => void;
  onCaptureStart: () => void;
  setTimeout: (handler: () => void, delayMs: number) => unknown;
}

interface FinishRecordingContext {
  activeState: Extract<SpeechCaptureState, { type: "recording" }>;
  lifecycle: number;
  providerSession: VoiceCaptureSession;
  runtimeId: string;
}

export class AppShellSpeechCaptureController {
  private readonly dependencies: AppShellSpeechCaptureControllerDependencies;
  private readonly listeners = new Set<() => void>();

  private activeLifecycle: number | null = null;
  private capabilityGeneration = 0;
  private readonly conversationSubmission: GlobalSpeechConversationSubmissionController;
  private disposed = false;
  private durationTimer: unknown = null;
  private lifecycleSequence = 0;
  private readonly masterSubmission: AppShellMasterController;
  private readonly unsubscribeMasterSubmission: () => void;
  private snapshotValue: AppShellSpeechCaptureSnapshot;
  private providerSession: VoiceCaptureSession | null = null;
  private providerStartAbortController: AbortController | null = null;
  private unsubscribeProviderSession: (() => void) | null = null;

  constructor(
    dependencies: AppShellSpeechCaptureControllerDependencies,
    masterSubmission: AppShellMasterController,
  ) {
    this.dependencies = dependencies;
    this.conversationSubmission = new GlobalSpeechConversationSubmissionController(dependencies);
    this.masterSubmission = masterSubmission;
    const masterSnapshot = masterSubmission.getSnapshot();
    this.snapshotValue = {
      availability: { type: "disconnected" },
      capture: { type: "idle" },
      completedConversationTranscript: null,
      completedTranscript: masterSnapshot.completedTranscript,
      conversationSubmission: { type: "idle" },
      masterSubmission: voiceMasterSubmission(masterSnapshot.submission),
      runtimeId: null,
    };
    this.unsubscribeMasterSubmission = this.masterSubmission.subscribe(() => {
      const snapshot = this.masterSubmission.getSnapshot();
      this.updateSnapshot({
        completedTranscript: snapshot.completedTranscript,
        masterSubmission: voiceMasterSubmission(snapshot.submission),
      });
    });
    this.conversationSubmission.subscribe(() => {
      const snapshot = this.conversationSubmission.getSnapshot();
      this.updateSnapshot({
        completedConversationTranscript: snapshot.completedTranscript,
        conversationSubmission: snapshot.submission,
      });
    });
  }

  getSnapshot = (): AppShellSpeechCaptureSnapshot => this.snapshotValue;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  synchronizeRuntime = async (runtimeId: string | null): Promise<void> => {
    this.assertUsable();
    this.masterSubmission.synchronizeRuntime(runtimeId);
    if (runtimeId === this.snapshotValue.runtimeId) {
      return;
    }
    this.capabilityGeneration += 1;
    const generation = this.capabilityGeneration;
    this.resetCapture(false);
    this.conversationSubmission.reset();
    this.updateSnapshot({
      availability: runtimeId ? { type: "loading" } : { type: "disconnected" },
      capture: { type: "idle" },
      completedTranscript: null,
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

  start = async (requestedCapture: SpeechCaptureRequest): Promise<void> => {
    this.assertUsable();
    const request = freezeSpeechCaptureRequest(requestedCapture);
    focusMasterPaneForCapture(request);
    if (this.captureRequestBlocked(request)) {
      return;
    }
    this.conversationSubmission.clearAccepted();
    this.masterSubmission.clearAccepted();
    this.resetCapture(false);
    this.updateSnapshot({ capture: { type: "idle" } });
    const startFailure = this.captureStartFailure();
    if (startFailure) {
      this.updateSnapshot({ capture: { ...startFailure, type: "failed" } });
      return;
    }
    const runtimeId = this.snapshotValue.runtimeId;
    const availability = this.snapshotValue.availability;
    if (!runtimeId || availability.type !== "configured") {
      throw new Error("global speech capture start validation returned inconsistent state");
    }
    this.dependencies.onCaptureStart();
    const lifecycle = this.beginLifecycle();
    const activeState = {
      captureSessionId: this.dependencies.createCaptureSessionId(),
      request,
      transcript: "",
    } satisfies SpeechCaptureActiveState;
    this.transitionCapture({ ...activeState, type: "requesting_permission" });

    try {
      const abortController = new AbortController();
      this.providerStartAbortController = abortController;
      const providerSession = await this.dependencies.captureProvider.startCapture({
        capabilities: availability.capabilities,
        captureSessionId: activeState.captureSessionId,
        signal: abortController.signal,
      });
      if (!this.isCurrent(lifecycle, runtimeId)) {
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

  startMasterCapture = async (): Promise<void> => {
    this.assertUsable();
    const request = masterSpeechCaptureRequest();
    if (this.shouldPreemptActiveCaptureForMaster()) {
      this.resetCapture();
      this.updateSnapshot({ capture: { type: "idle" } });
    }
    await this.start(request);
  };

  commit = (): void => {
    this.assertUsable();
    if (this.snapshotValue.capture.type !== "recording" || this.activeLifecycle === null) {
      return;
    }
    void this.finishRecording();
  };

  cancelActiveConversationCapture = (requestedCapture: SpeechCaptureRequest): boolean => {
    this.assertUsable();
    const request = freezeSpeechCaptureRequest(requestedCapture);
    if (request.destination.type !== "conversation") {
      return false;
    }
    const activeRequest = activeCaptureRequest(this.snapshotValue.capture);
    if (!activeRequest || !speechCaptureRequestsEqual(activeRequest, request)) {
      return false;
    }
    this.resetCapture();
    if (this.snapshotValue.capture.type !== "idle") {
      this.updateSnapshot({ capture: { type: "idle" } });
    }
    return true;
  };

  cancel = (): void => {
    this.assertUsable();
    this.resetCapture();
    if (this.snapshotValue.capture.type !== "idle") {
      this.updateSnapshot({ capture: { type: "idle" } });
    }
  };

  retryMasterSubmission = (): void => {
    this.assertUsable();
    this.updateSnapshot({ capture: { type: "idle" } });
    this.masterSubmission.retry();
  };

  retryConversationSubmission = (): void => {
    this.assertUsable();
    this.updateSnapshot({ capture: { type: "idle" } });
    this.conversationSubmission.retry();
  };

  discardCompletedTranscript = (): void => {
    this.assertUsable();
    this.masterSubmission.discard();
    this.updateSnapshot({ capture: { type: "idle" } });
  };

  discardCompletedConversationTranscript = (): void => {
    this.assertUsable();
    this.conversationSubmission.discard();
    this.updateSnapshot({ capture: { type: "idle" } });
  };

  dispose = (): void => {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.capabilityGeneration += 1;
    this.resetCapture(false);
    this.conversationSubmission.dispose();
    this.unsubscribeMasterSubmission();
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

  private handleActiveCaptureRequest(request: SpeechCaptureRequest): boolean {
    const activeRequest = activeCaptureRequest(this.snapshotValue.capture);
    if (!activeRequest) {
      return false;
    }
    if (!speechCaptureRequestsEqual(activeRequest, request)) {
      throw new Error("another global speech capture is already active");
    }
    if (this.snapshotValue.capture.type === "recording") {
      this.commit();
    }
    return true;
  }

  private captureRequestBlocked(request: SpeechCaptureRequest): boolean {
    if (this.handleActiveCaptureRequest(request)) {
      return true;
    }
    const failure = submissionCaptureFailure(
      this.snapshotValue.completedConversationTranscript,
      this.snapshotValue.completedTranscript,
      this.snapshotValue.conversationSubmission,
      this.masterSubmission.getSnapshot().submission,
    );
    if (!failure) {
      if (request.destination.type !== "master" || this.masterSubmission.canSubmitInput()) {
        return false;
      }
      this.updateSnapshot({
        capture: {
          code: "master_submission_pending",
          message: "The active master request must settle before another voice request can start.",
          type: "failed",
        },
      });
      return true;
    }
    this.updateSnapshot({ capture: { ...failure, type: "failed" } });
    return true;
  }

  private captureStartFailure(): { code: SpeechCaptureFailureCode; message: string } | null {
    return captureAvailabilityFailure(
      this.snapshotValue.availability,
      this.snapshotValue.runtimeId,
    );
  }

  private shouldPreemptActiveCaptureForMaster(): boolean {
    const request = activeCaptureRequest(this.snapshotValue.capture);
    return request !== null && request.destination.type === "conversation";
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
      if (!this.isCurrent(lifecycle, runtimeId) || this.providerSession !== providerSession) {
        return;
      }
      this.markConnectionReady();
    } catch (error) {
      if (this.isCurrent(lifecycle, runtimeId)) {
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
      const { captureSessionId, request, transcript } = drainingCapture;
      this.transitionCapture({ captureSessionId, request, transcript, type: "committing" });
    } catch (error) {
      if (this.isCurrent(lifecycle, runtimeId)) {
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
  ): Extract<SpeechCaptureState, { type: "draining" }> | null {
    if (
      !this.isCurrent(context.lifecycle, context.runtimeId) ||
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
      !this.isCurrent(lifecycle, runtimeId) ||
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
      !this.isCurrent(lifecycle, runtimeId) ||
      (this.snapshotValue.capture.type !== "draining" &&
        this.snapshotValue.capture.type !== "committing")
    ) {
      return;
    }
    if (transcript.trim() === "") {
      this.fail(lifecycle, runtimeId, "no_speech", "No speech was detected. Please try again.");
      return;
    }
    const captureSessionId = this.snapshotValue.capture.captureSessionId;
    const request = this.snapshotValue.capture.request;
    this.resetCapture();
    this.updateSnapshot({ capture: { type: "idle" } });
    switch (request.destination.type) {
      case "master":
        this.masterSubmission.submitVoiceTranscript(captureSessionId, runtimeId, transcript);
        return;
      case "conversation":
        this.conversationSubmission.submitTranscript({
          captureSessionId,
          request: conversationSpeechCaptureRequest(
            request.destination.workspaceId,
            request.destination.conversationId,
            requiredConversationSourcePane(request.sourcePaneId),
          ),
          runtimeId,
          transcript,
        });
        return;
      default:
        assertNever(request.destination);
    }
  }

  private handleProviderSessionEvent(
    lifecycle: number,
    runtimeId: string,
    event: VoiceCaptureSessionEvent,
  ): void {
    switch (event.type) {
      case "failed":
        this.fail(lifecycle, runtimeId, event.failure.code, event.failure.message);
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
    if (!this.isCurrent(lifecycle, runtimeId)) {
      return;
    }
    if (error instanceof VoiceCaptureProviderAbortedError) {
      if (this.isCurrent(lifecycle, runtimeId)) {
        this.resetCapture();
        this.updateSnapshot({ capture: { type: "idle" } });
      }
      return;
    }
    if (error instanceof VoiceCaptureProviderError) {
      this.fail(lifecycle, runtimeId, error.failure.code, error.failure.message);
      return;
    }
    this.fail(lifecycle, runtimeId, "session_failed", safeSessionErrorMessage(error));
  }

  private fail(
    lifecycle: number,
    runtimeId: string,
    code: SpeechCaptureFailureCode,
    message: string,
  ): void {
    if (!this.isCurrent(lifecycle, runtimeId)) {
      return;
    }
    this.resetCapture();
    this.updateSnapshot({ capture: { code, message, type: "failed" } });
  }

  private isCurrent(lifecycle: number, runtimeId: string): boolean {
    return this.activeLifecycle === lifecycle && this.snapshotValue.runtimeId === runtimeId;
  }

  private isCurrentCapabilityLoad(generation: number, runtimeId: string): boolean {
    return (
      !this.disposed &&
      this.capabilityGeneration === generation &&
      this.snapshotValue.runtimeId === runtimeId
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

  private transitionCapture(capture: SpeechCaptureState): void {
    this.updateSnapshot({ capture });
  }

  private updateSnapshot(update: Partial<AppShellSpeechCaptureSnapshot>): void {
    this.snapshotValue = { ...this.snapshotValue, ...update };
    for (const listener of this.listeners) {
      listener();
    }
  }

  private assertUsable(): void {
    if (this.disposed) {
      throw new Error("app-shell speech capture controller is disposed");
    }
  }
}

function focusMasterPaneForCapture(request: SpeechCaptureRequest): void {
  if (request.destination.type === "master") {
    requestMasterPaneFocus("chrome");
  }
}

function requiredConversationSourcePane(sourcePaneId: string | null): string {
  if (sourcePaneId === null) {
    throw new Error("conversation speech capture lost its frozen source pane");
  }
  return sourcePaneId;
}

function submissionCaptureFailure(
  completedConversationTranscript: CompletedConversationSpeechTranscript | null,
  completedMasterTranscript: CompletedGlobalSpeechTranscript | null,
  conversationSubmission: ConversationInputSubmissionState,
  masterSubmission: MasterInputSubmissionState,
): { code: SpeechCaptureFailureCode; message: string } | null {
  const conversationFailure = conversationSubmissionCaptureFailure(
    completedConversationTranscript,
    conversationSubmission,
  );
  if (conversationFailure) {
    return conversationFailure;
  }
  return masterSubmissionCaptureFailure(completedMasterTranscript, masterSubmission);
}

function conversationSubmissionCaptureFailure(
  completedTranscript: CompletedConversationSpeechTranscript | null,
  submission: ConversationInputSubmissionState,
): { code: SpeechCaptureFailureCode; message: string } | null {
  if (!completedTranscript) {
    if (submission.type === "submitting" || submission.type === "failed") {
      throw new Error("conversation submission state is missing its completed transcript");
    }
    return null;
  }
  switch (submission.type) {
    case "submitting":
      return {
        code: "conversation_submission_pending",
        message: "The previous conversation voice request is awaiting durable delivery.",
      };
    case "failed":
      return { code: "conversation_submission_failed", message: submission.message };
    case "accepted":
    case "idle":
      throw new Error("completed transcript has an invalid conversation submission state");
    default:
      return assertNever(submission);
  }
}

function masterSubmissionCaptureFailure(
  completedTranscript: CompletedGlobalSpeechTranscript | null,
  submission: MasterInputSubmissionState,
): { code: SpeechCaptureFailureCode; message: string } | null {
  switch (submission.type) {
    case "submitting": {
      validateMasterSubmissionTranscript(completedTranscript, submission.input.modality);
      return {
        code: "master_submission_pending",
        message:
          submission.input.modality === "voice"
            ? "The previous voice request is still being submitted to Setta."
            : "The previous text request is still being submitted to Setta.",
      };
    }
    case "failed":
      validateMasterSubmissionTranscript(completedTranscript, submission.input.modality);
      return {
        code: "master_submission_failed",
        message:
          submission.input.modality === "voice"
            ? submission.message
            : "Retry or discard the failed text request before starting voice capture.",
      };
    case "accepted":
      if (completedTranscript) {
        throw new Error("completed transcript has an invalid accepted master submission state");
      }
      return null;
    case "idle":
      if (completedTranscript) {
        throw new Error("completed transcript has an invalid idle master submission state");
      }
      return null;
    default:
      return assertNever(submission);
  }
}

function validateMasterSubmissionTranscript(
  completedTranscript: CompletedGlobalSpeechTranscript | null,
  modality: MasterInputModality,
): void {
  if (modality === "voice" && !completedTranscript) {
    throw new Error("voice master submission state is missing its completed transcript");
  }
  if (modality === "text" && completedTranscript) {
    throw new Error("text master submission state has an unrelated completed voice transcript");
  }
}

function voiceMasterSubmission(submission: MasterInputSubmissionState): MasterInputSubmissionState {
  switch (submission.type) {
    case "submitting":
    case "failed":
      return submission.input.modality === "voice" ? submission : { type: "idle" };
    case "accepted":
      return submission.accepted.input.modality === "voice" ? submission : { type: "idle" };
    case "idle":
      return submission;
    default:
      return assertNever(submission);
  }
}

function captureSessionId(state: SpeechCaptureState): string | null {
  switch (state.type) {
    case "requesting_permission":
    case "recording":
    case "draining":
    case "committing":
      return state.captureSessionId;
    case "idle":
    case "failed":
      return null;
  }
}

function activeCaptureRequest(state: SpeechCaptureState): SpeechCaptureRequest | null {
  switch (state.type) {
    case "requesting_permission":
    case "recording":
    case "draining":
    case "committing":
      return state.request;
    case "idle":
    case "failed":
      return null;
  }
}

function speechCaptureRequestsEqual(
  left: SpeechCaptureRequest,
  right: SpeechCaptureRequest,
): boolean {
  if (left.destination.type !== right.destination.type) {
    return false;
  }
  switch (left.destination.type) {
    case "master":
      return right.destination.type === "master" && left.sourcePaneId === right.sourcePaneId;
    case "conversation":
      return (
        right.destination.type === "conversation" &&
        left.destination.workspaceId === right.destination.workspaceId &&
        left.destination.conversationId === right.destination.conversationId &&
        left.sourcePaneId === right.sourcePaneId
      );
    default:
      return assertNever(left.destination);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled speech capture value: ${JSON.stringify(value)}`);
}
