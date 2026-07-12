import type { SpeechCapabilities, SpeechTranscriptionSession } from "@generated/backend";

import type { GlobalMicrophonePreference } from "./global-microphone-preference";
import {
  RealtimeTranscriptionError,
  type RealtimeTranscriptionErrorCode,
} from "./realtime-transcription-error";
import type { RealtimeTranscriptionUpdate } from "./realtime-transcription-session";
import type {
  createRealtimeTranscriptionTransport,
  RealtimeTranscriptionTransport,
} from "./realtime-transcription-transport";
import {
  type ConversationInputSubmissionState,
  GlobalSpeechConversationSubmissionController,
  type GlobalSpeechConversationSubmissionDependencies,
} from "./global-speech-conversation-submission";
import {
  type CompletedGlobalSpeechTranscript,
  GlobalSpeechMasterSubmissionController,
  type GlobalSpeechMasterSubmissionDependencies,
  type MasterInputSubmissionState,
} from "./global-speech-master-submission";
import {
  speechAvailabilityForCapabilities,
  type SpeechCaptureAvailability,
} from "./speech-capture-availability";
import {
  type CompletedConversationSpeechTranscript,
  conversationSpeechCaptureRequest,
  freezeSpeechCaptureRequest,
  type SpeechCaptureRequest,
} from "./speech-capture-destination";

export type SpeechCaptureFailureCode =
  | "capabilities_unavailable"
  | "connection_failed"
  | "connection_lost"
  | "conversation_submission_failed"
  | "conversation_submission_pending"
  | "duration_limit"
  | "insecure_context"
  | "invalid_media"
  | "invalid_session"
  | "malformed_event"
  | "master_submission_failed"
  | "master_submission_pending"
  | "microphone_disabled"
  | "microphone_permission_denied"
  | "microphone_unavailable"
  | "no_speech"
  | "not_configured"
  | "preference_unavailable"
  | "protocol_violation"
  | "provider_rate_limited"
  | "provider_rejected"
  | "provider_response_malformed"
  | "provider_unavailable"
  | "runtime_disconnected"
  | "session_failed"
  | "transcript_too_large"
  | "transcription_failed"
  | "unsupported_browser";

interface SpeechCaptureActiveState {
  captureSessionId: string;
  request: SpeechCaptureRequest;
  transcript: string;
}

export type SpeechCaptureState =
  | { type: "idle" }
  | (SpeechCaptureActiveState & { type: "requesting_permission" })
  | (SpeechCaptureActiveState & { type: "connecting" })
  | (SpeechCaptureActiveState & { type: "listening" })
  | (SpeechCaptureActiveState & { type: "committing" })
  | {
      code: SpeechCaptureFailureCode;
      message: string;
      type: "failed";
    };

export type SpeechCaptureSupport =
  | { supported: true }
  | {
      code: "insecure_context" | "unsupported_browser";
      message: string;
      supported: false;
    };

export interface AppShellSpeechCaptureSnapshot {
  availability: SpeechCaptureAvailability;
  capture: SpeechCaptureState;
  completedConversationTranscript: CompletedConversationSpeechTranscript | null;
  completedTranscript: CompletedGlobalSpeechTranscript | null;
  conversationSubmission: ConversationInputSubmissionState;
  masterSubmission: MasterInputSubmissionState;
  preference: GlobalMicrophonePreference;
  runtimeId: string | null;
}

export interface AppShellSpeechCaptureControllerDependencies
  extends GlobalSpeechConversationSubmissionDependencies, GlobalSpeechMasterSubmissionDependencies {
  clearTimeout: (handle: unknown) => void;
  createCaptureSessionId: () => string;
  createTranscriptionSession: () => Promise<SpeechTranscriptionSession>;
  createTransport: typeof createRealtimeTranscriptionTransport;
  getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  readCapabilities: () => Promise<SpeechCapabilities>;
  readPreference: () => GlobalMicrophonePreference;
  setTimeout: (handler: () => void, delayMs: number) => unknown;
  support: () => SpeechCaptureSupport;
  writePreference: (enabled: boolean) => GlobalMicrophonePreference;
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
  private readonly masterSubmission: GlobalSpeechMasterSubmissionController;
  private snapshotValue: AppShellSpeechCaptureSnapshot;
  private stream: MediaStream | null = null;
  private transport: RealtimeTranscriptionTransport | null = null;

  constructor(dependencies: AppShellSpeechCaptureControllerDependencies) {
    this.dependencies = dependencies;
    this.conversationSubmission = new GlobalSpeechConversationSubmissionController(dependencies);
    this.masterSubmission = new GlobalSpeechMasterSubmissionController(dependencies);
    this.snapshotValue = {
      availability: { type: "disconnected" },
      capture: { type: "idle" },
      completedConversationTranscript: null,
      completedTranscript: null,
      conversationSubmission: { type: "idle" },
      masterSubmission: { type: "idle" },
      preference: dependencies.readPreference(),
      runtimeId: null,
    };
    this.masterSubmission.subscribe(() => {
      const snapshot = this.masterSubmission.getSnapshot();
      this.updateSnapshot({
        completedTranscript: snapshot.completedTranscript,
        masterSubmission: snapshot.submission,
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
    if (runtimeId === this.snapshotValue.runtimeId) {
      return;
    }
    this.capabilityGeneration += 1;
    const generation = this.capabilityGeneration;
    this.resetCapture();
    this.conversationSubmission.reset();
    this.masterSubmission.reset();
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

  setEnabled = (enabled: boolean): GlobalMicrophonePreference => {
    this.assertUsable();
    const preference = this.dependencies.writePreference(enabled);
    if (preference.type === "failed" || !preference.enabled) {
      this.resetCapture();
      this.updateSnapshot({
        capture: { type: "idle" },
        preference,
      });
      return preference;
    }
    this.updateSnapshot({ preference });
    return preference;
  };

  start = async (requestedCapture: SpeechCaptureRequest): Promise<void> => {
    this.assertUsable();
    const request = freezeSpeechCaptureRequest(requestedCapture);
    if (this.captureRequestBlocked(request)) {
      return;
    }
    this.conversationSubmission.clearAccepted();
    this.masterSubmission.clearAccepted();
    this.resetCapture();
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
    const lifecycle = this.beginLifecycle();
    const activeState = {
      captureSessionId: this.dependencies.createCaptureSessionId(),
      request,
      transcript: "",
    } satisfies SpeechCaptureActiveState;
    this.transitionCapture({ ...activeState, type: "requesting_permission" });

    try {
      const stream = await this.dependencies.getUserMedia({ audio: true, video: false });
      if (!this.isCurrent(lifecycle, runtimeId)) {
        stopMediaStream(stream);
        return;
      }
      this.stream = stream;
      this.startDurationTimer(
        lifecycle,
        runtimeId,
        availability.capabilities.maximumRecordingSeconds,
      );
      this.transitionCapture({ ...activeState, type: "connecting" });
      const session = await this.dependencies.createTranscriptionSession();
      if (!this.isCurrent(lifecycle, runtimeId)) {
        return;
      }
      this.assertSessionLimits(session, availability.capabilities);
      const transport = this.dependencies.createTransport({
        captureSessionId: activeState.captureSessionId,
        onError: (error) => this.handleTransportError(lifecycle, runtimeId, error),
        onTranscript: (update) => this.handleTranscript(lifecycle, runtimeId, update),
        session,
        stream,
      });
      this.transport = transport;
      await transport.ready;
      if (!this.isCurrent(lifecycle, runtimeId)) {
        return;
      }
      this.transitionCapture({ ...activeState, type: "listening" });
    } catch (error) {
      this.handleStartError(lifecycle, runtimeId, error);
    }
  };

  commit = (): void => {
    this.assertUsable();
    if (this.snapshotValue.capture.type !== "listening" || this.activeLifecycle === null) {
      return;
    }
    const activeState = this.snapshotValue.capture;
    this.transitionCapture({ ...activeState, type: "committing" });
    try {
      this.transport?.commit();
    } catch (error) {
      const runtimeId = this.snapshotValue.runtimeId;
      if (runtimeId) {
        this.handleStartError(this.activeLifecycle, runtimeId, error);
      }
    }
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
    this.resetCapture();
    this.conversationSubmission.dispose();
    this.masterSubmission.dispose();
    this.listeners.clear();
  };

  private async loadCapabilities(generation: number, runtimeId: string): Promise<void> {
    try {
      const capabilities = await this.dependencies.readCapabilities();
      if (!this.isCurrentCapabilityLoad(generation, runtimeId)) {
        return;
      }
      this.updateSnapshot({
        availability: speechAvailabilityForCapabilities(capabilities, this.dependencies.support()),
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
    if (this.snapshotValue.capture.type === "listening") {
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
      this.snapshotValue.masterSubmission,
    );
    if (!failure) {
      return false;
    }
    this.updateSnapshot({ capture: { ...failure, type: "failed" } });
    return true;
  }

  private captureStartFailure(): { code: SpeechCaptureFailureCode; message: string } | null {
    const preferenceFailure = capturePreferenceFailure(this.snapshotValue.preference);
    if (preferenceFailure) {
      return preferenceFailure;
    }
    return captureAvailabilityFailure(
      this.snapshotValue.availability,
      this.snapshotValue.runtimeId,
    );
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

  private assertSessionLimits(
    session: SpeechTranscriptionSession,
    capabilities: SpeechCapabilities,
  ): void {
    if (
      session.maximumRecordingSeconds !== capabilities.maximumRecordingSeconds ||
      session.maximumTranscriptCharacters !== capabilities.maximumTranscriptCharacters
    ) {
      throw new RealtimeTranscriptionError(
        "invalid_session",
        "Realtime transcription limits changed while voice capture was starting.",
      );
    }
  }

  private handleTranscript(
    lifecycle: number,
    runtimeId: string,
    update: RealtimeTranscriptionUpdate,
  ): void {
    if (
      !this.isCurrent(lifecycle, runtimeId) ||
      update.captureSessionId !== captureSessionId(this.snapshotValue.capture)
    ) {
      return;
    }
    if (update.type === "delta") {
      if (
        this.snapshotValue.capture.type !== "listening" &&
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
    if (!this.isCurrent(lifecycle, runtimeId) || this.snapshotValue.capture.type !== "committing") {
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
        this.masterSubmission.submitTranscript(captureSessionId, runtimeId, transcript);
        return;
      case "conversation":
        this.conversationSubmission.submitTranscript({
          captureSessionId,
          request: conversationSpeechCaptureRequest(
            request.destination.conversationId,
            requiredConversationSourcePane(request.sourcePaneId),
            request.destination.inputMode,
          ),
          runtimeId,
          transcript,
        });
        return;
      default:
        assertNever(request.destination);
    }
  }

  private handleTransportError(
    lifecycle: number,
    runtimeId: string,
    error: RealtimeTranscriptionError,
  ): void {
    if (error.code === "aborted") {
      if (this.isCurrent(lifecycle, runtimeId)) {
        this.resetCapture();
        this.updateSnapshot({ capture: { type: "idle" } });
      }
      return;
    }
    console.info(`Realtime transcription transport failed: code=${error.code}`);
    const failure = failureForRealtimeError(error.code);
    this.fail(lifecycle, runtimeId, failure.code, failure.message);
  }

  private handleStartError(lifecycle: number, runtimeId: string, error: unknown): void {
    if (!this.isCurrent(lifecycle, runtimeId)) {
      return;
    }
    if (error instanceof RealtimeTranscriptionError) {
      this.handleTransportError(lifecycle, runtimeId, error);
      return;
    }
    if (this.snapshotValue.capture.type === "requesting_permission") {
      const failure = microphoneFailure(error);
      this.fail(lifecycle, runtimeId, failure.code, failure.message);
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

  private resetCapture(): void {
    this.activeLifecycle = null;
    if (this.durationTimer !== null) {
      this.dependencies.clearTimeout(this.durationTimer);
      this.durationTimer = null;
    }
    this.transport?.close();
    this.transport = null;
    if (this.stream) {
      stopMediaStream(this.stream);
      this.stream = null;
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
  if (!completedTranscript) {
    if (submission.type === "submitting" || submission.type === "failed") {
      throw new Error("global master submission state is missing its completed transcript");
    }
    return null;
  }
  switch (submission.type) {
    case "submitting":
      return {
        code: "master_submission_pending",
        message: "The previous voice request is still being submitted to Setta.",
      };
    case "failed":
      return { code: "master_submission_failed", message: submission.message };
    case "accepted":
    case "idle":
      throw new Error("completed transcript has an invalid global master submission state");
    default:
      return assertNever(submission);
  }
}

function capturePreferenceFailure(
  preference: GlobalMicrophonePreference,
): { code: SpeechCaptureFailureCode; message: string } | null {
  if (preference.type === "failed") {
    return { code: "preference_unavailable", message: preference.message };
  }
  if (!preference.enabled) {
    return {
      code: "microphone_disabled",
      message: "Global microphone capture is disabled.",
    };
  }
  return null;
}

function captureAvailabilityFailure(
  availability: SpeechCaptureAvailability,
  runtimeId: string | null,
): { code: SpeechCaptureFailureCode; message: string } | null {
  if (!runtimeId || availability.type === "disconnected") {
    return {
      code: "runtime_disconnected",
      message: "Connect to a Setta runtime before starting voice capture.",
    };
  }
  switch (availability.type) {
    case "configured":
      return null;
    case "failed":
      return { code: "capabilities_unavailable", message: availability.message };
    case "loading":
      return {
        code: "capabilities_unavailable",
        message: "Voice capabilities are still loading.",
      };
    case "not_configured":
      return { code: "not_configured", message: availability.message };
    case "unsupported":
      return { code: availability.code, message: availability.message };
    default:
      return assertNever(availability);
  }
}

export function browserSpeechCaptureSupport(): SpeechCaptureSupport {
  if (!globalThis.isSecureContext) {
    return {
      code: "insecure_context",
      message: "Voice capture requires a secure HTTPS connection or localhost.",
      supported: false,
    };
  }
  if (
    typeof navigator.mediaDevices?.getUserMedia !== "function" ||
    typeof globalThis.RTCPeerConnection !== "function" ||
    typeof globalThis.crypto?.randomUUID !== "function"
  ) {
    return {
      code: "unsupported_browser",
      message: "This browser does not support secure microphone transcription.",
      supported: false,
    };
  }
  return { supported: true };
}

function captureSessionId(state: SpeechCaptureState): string | null {
  switch (state.type) {
    case "requesting_permission":
    case "connecting":
    case "listening":
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
    case "connecting":
    case "listening":
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
        left.destination.conversationId === right.destination.conversationId &&
        left.destination.inputMode === right.destination.inputMode &&
        left.sourcePaneId === right.sourcePaneId
      );
    default:
      return assertNever(left.destination);
  }
}

function microphoneFailure(error: unknown): { code: SpeechCaptureFailureCode; message: string } {
  const name = errorName(error);
  if (name === "NotAllowedError" || name === "SecurityError") {
    return {
      code: "microphone_permission_denied",
      message: "Microphone access was denied. Allow access and try again.",
    };
  }
  return {
    code: "microphone_unavailable",
    message: "The microphone is unavailable. Check the device and try again.",
  };
}

function failureForRealtimeError(code: Exclude<RealtimeTranscriptionErrorCode, "aborted">): {
  code: SpeechCaptureFailureCode;
  message: string;
} {
  return (
    {
      connection_failed: {
        code,
        message: "The browser could not connect to OpenAI transcription.",
      },
      connection_lost: {
        code,
        message: "The transcription connection was lost. Please try again.",
      },
      invalid_media: {
        code,
        message: "Voice capture requires one live audio-only microphone track.",
      },
      invalid_session: {
        code,
        message: "The transcription session expired or was invalid. Please try again.",
      },
      malformed_event: {
        code,
        message: "OpenAI sent an invalid transcription event. Please try again.",
      },
      protocol_violation: {
        code,
        message: "OpenAI sent an invalid transcription sequence. Please try again.",
      },
      provider_rate_limited: {
        code,
        message: "OpenAI speech rate limit or quota was reached.",
      },
      provider_rejected: {
        code,
        message: "OpenAI rejected the speech credential or model access.",
      },
      provider_response_malformed: {
        code,
        message: "OpenAI returned an invalid transcription response.",
      },
      provider_unavailable: {
        code,
        message: "OpenAI transcription is unavailable. Please try again.",
      },
      transcript_too_large: {
        code,
        message: "The transcript exceeded the runtime limit. Please try a shorter request.",
      },
      transcription_failed: {
        code,
        message: "OpenAI could not transcribe the recorded audio. Please try again.",
      },
    } satisfies Record<
      Exclude<RealtimeTranscriptionErrorCode, "aborted">,
      { code: SpeechCaptureFailureCode; message: string }
    >
  )[code];
}

function safeSessionErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim() !== ""
    ? error.message
    : "The runtime could not create a transcription session.";
}

function errorName(error: unknown): string {
  return typeof error === "object" && error !== null && "name" in error ? String(error.name) : "";
}

function stopMediaStream(stream: MediaStream): void {
  for (const track of stream.getTracks()) {
    track.stop();
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled speech capture value: ${JSON.stringify(value)}`);
}
