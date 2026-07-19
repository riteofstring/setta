import type { ConversationInput } from "@generated/backend";

import type {
  AppShellSpeechCaptureController,
  AppShellSpeechCaptureSnapshot,
  SpeechCaptureState,
} from "./app-shell-speech-capture-controller";
import type {
  AppShellSpeechPlaybackController,
  SpeechPlaybackSnapshot,
  SpeechPlaybackState,
} from "./app-shell-speech-playback-controller";
import {
  type VoiceProviderSetupAction,
  voiceProviderSetupActionLabel,
} from "./speech-capture-availability";
import type { SpeechCaptureRequest } from "./speech-capture-destination";

type GlobalSpeechSource =
  | { conversationId: null; sourcePaneId: null; type: "master" }
  | {
      conversationId: string;
      sourcePaneId: string;
      type: "conversation";
    };

type GlobalSpeechCaptureActiveState = Exclude<SpeechCaptureState, { type: "failed" | "idle" }>;

export type GlobalSpeechCapturePresentation =
  | { source: null; state: "idle" }
  | {
      message: string;
      setupAction: VoiceProviderSetupAction | null;
      source: null;
      state: "unavailable";
    }
  | {
      source: GlobalSpeechSource;
      state: GlobalSpeechCaptureActiveState["type"];
      transcript: string;
    }
  | { source: GlobalSpeechSource; state: "submitting" }
  | {
      message: string;
      retry: "conversation" | "master" | null;
      source: GlobalSpeechSource | null;
      state: "failed";
    };

type PaneSpeechSourceScope =
  | "this_pane"
  | "this_conversation"
  | "master"
  | "other_conversation"
  | "none";

export interface PaneSpeechTarget {
  conversationId: string | null;
  paneId: string | null;
}

export interface PaneSpeechPresentation {
  activityKind: "capture" | "failed" | "queued" | "speaking" | "synthesizing" | null;
  activityLabel: string | null;
  captureScope: PaneSpeechSourceScope;
  captureState: GlobalSpeechCapturePresentation["state"];
  playbackScope: PaneSpeechSourceScope;
  playbackState: SpeechPlaybackState["type"];
  speakingSourceEventId: string | null;
  transcriptPreview: string | null;
  voiceControlDisabled: boolean;
  voiceControlLabel: string;
  voiceControlSetupAction: VoiceProviderSetupAction | null;
}

export interface GlobalSpeechPresentationSource {
  capture: Pick<AppShellSpeechCaptureController, "getSnapshot" | "subscribe">;
  playback: Pick<AppShellSpeechPlaybackController, "getSnapshot" | "subscribe">;
}

export type ShellSpeechCaptureAction =
  | "cancel"
  | "commit"
  | VoiceProviderSetupAction
  | "retry_conversation"
  | "retry_master"
  | "start"
  | null;

export function globalSpeechCapturePresentation(
  snapshot: AppShellSpeechCaptureSnapshot,
): GlobalSpeechCapturePresentation {
  const active = activeCapturePresentation(snapshot.capture);
  if (active) {
    return active;
  }
  const conversationSubmission = conversationSubmissionPresentation(
    snapshot.conversationSubmission,
  );
  if (conversationSubmission) {
    return conversationSubmission;
  }
  const masterSubmission = masterSubmissionPresentation(snapshot.masterSubmission);
  if (masterSubmission) {
    return masterSubmission;
  }
  return inactiveCapturePresentation(snapshot);
}

function conversationSubmissionPresentation(
  submission: AppShellSpeechCaptureSnapshot["conversationSubmission"],
): GlobalSpeechCapturePresentation | null {
  switch (submission.type) {
    case "submitting":
      return {
        source: conversationInputSource(submission.input),
        state: "submitting",
      };
    case "failed":
      return {
        message: submission.message,
        retry: "conversation",
        source: conversationInputSource(submission.input),
        state: "failed",
      };
    case "idle":
    case "accepted":
      return null;
    default:
      return assertNever(submission);
  }
}

function masterSubmissionPresentation(
  submission: AppShellSpeechCaptureSnapshot["masterSubmission"],
): GlobalSpeechCapturePresentation | null {
  switch (submission.type) {
    case "submitting":
      return { source: masterInputSource(), state: "submitting" };
    case "failed":
      return {
        message: submission.message,
        retry: "master",
        source: masterInputSource(),
        state: "failed",
      };
    case "idle":
    case "accepted":
      return null;
    default:
      return assertNever(submission);
  }
}

function inactiveCapturePresentation(
  snapshot: AppShellSpeechCaptureSnapshot,
): GlobalSpeechCapturePresentation {
  if (snapshot.capture.type === "failed") {
    return {
      message: snapshot.capture.message,
      retry: null,
      source: null,
      state: "failed",
    };
  }
  return captureAvailabilityPresentation(snapshot.availability);
}

function captureAvailabilityPresentation(
  availability: AppShellSpeechCaptureSnapshot["availability"],
): GlobalSpeechCapturePresentation {
  switch (availability.type) {
    case "configured":
      return { source: null, state: "idle" };
    case "disconnected":
      return {
        message: "Voice capture is disconnected.",
        setupAction: null,
        source: null,
        state: "unavailable",
      };
    case "loading":
      return {
        message: "Voice capture is loading.",
        setupAction: null,
        source: null,
        state: "unavailable",
      };
    case "not_configured":
      return {
        message: availability.message,
        setupAction: availability.setupAction,
        source: null,
        state: "unavailable",
      };
    case "failed":
    case "unsupported":
      return {
        message: availability.message,
        setupAction: null,
        source: null,
        state: "unavailable",
      };
    default:
      return assertNever(availability);
  }
}

export function paneSpeechPresentation(
  capture: GlobalSpeechCapturePresentation,
  playback: SpeechPlaybackSnapshot,
  target: PaneSpeechTarget,
  sourceConversationTitle: string | null = null,
): PaneSpeechPresentation {
  const captureScope = paneSourceScope(capture.source, target);
  const playbackSource = playbackStateSource(playback.state);
  const playbackScope = paneSourceScope(playbackSource, target);
  const activity = paneActivity(
    capture,
    captureScope,
    playback,
    playbackScope,
    sourceConversationTitle,
  );
  const control = paneVoiceControl(capture, captureScope);
  return {
    activityKind: activity?.kind ?? null,
    activityLabel: activity?.label ?? null,
    captureScope,
    captureState: capture.state,
    playbackScope,
    playbackState: playback.state.type,
    speakingSourceEventId: speakingSourceEventId(playback, playbackScope),
    transcriptPreview:
      captureScope === "this_pane" ? speechCaptureTranscriptPreview(capture) : null,
    voiceControlDisabled: control.disabled,
    voiceControlLabel: control.label,
    voiceControlSetupAction: control.setupAction,
  };
}

export function shellSpeechCaptureAction(
  capture: GlobalSpeechCapturePresentation,
): ShellSpeechCaptureAction {
  if (capture.state === "unavailable" && capture.setupAction !== null) {
    return capture.setupAction;
  }
  if (capture.state === "failed") {
    return failedCaptureActions[capture.retry ?? "capture"];
  }
  return shellCaptureActions[capture.state];
}

const failedCaptureActions = {
  capture: "start",
  conversation: "retry_conversation",
  master: "retry_master",
} as const satisfies Record<
  "capture" | NonNullable<Extract<GlobalSpeechCapturePresentation, { state: "failed" }>["retry"]>,
  Exclude<ShellSpeechCaptureAction, null>
>;

const shellCaptureActions = {
  committing: null,
  draining: null,
  idle: "start",
  recording: "commit",
  requesting_permission: "cancel",
  submitting: null,
  unavailable: null,
} as const satisfies Record<
  Exclude<GlobalSpeechCapturePresentation["state"], "failed">,
  ShellSpeechCaptureAction
>;

export function shellSpeechCaptureLabel(
  capture: GlobalSpeechCapturePresentation,
  sourceConversationTitle: string | null = null,
): string {
  if (capture.state === "failed") {
    return capture.message;
  }
  if (capture.state === "unavailable") {
    return unavailableCaptureControlLabel(capture);
  }
  const destination = speechSourceLabel(capture.source, sourceConversationTitle);
  return shellCaptureLabelers[capture.state](destination);
}

export function shellSpeechCaptureControlLabel(
  capture: GlobalSpeechCapturePresentation,
  sourceConversationTitle: string | null = null,
): string {
  const destination = speechSourceLabel(capture.source, sourceConversationTitle);
  if (capture.state === "failed") {
    return capture.retry === null
      ? "Start a new voice request for Setta"
      : `Retry the voice request for ${destination}`;
  }
  if (capture.state === "unavailable") {
    return unavailableCaptureControlLabel(capture);
  }
  return shellCaptureControlLabelers[capture.state](destination);
}

const shellCaptureLabelers = {
  committing: (destination) => `Finishing the voice request for ${destination}`,
  draining: (destination) => `Finishing captured audio for ${destination}`,
  idle: () => "Start a voice request for Setta",
  recording: (destination) => `Listening for ${destination}`,
  requesting_permission: (destination) => `Requesting microphone access for ${destination}`,
  submitting: (destination) => `Sending the voice request to ${destination}`,
} satisfies Record<
  Exclude<GlobalSpeechCapturePresentation["state"], "failed" | "unavailable">,
  (destination: string) => string
>;

const shellCaptureControlLabelers = {
  committing: (destination) => `Finishing the voice request for ${destination}`,
  draining: (destination) => `Finishing captured audio for ${destination}`,
  idle: () => "Start a voice request for Setta",
  recording: (destination) => `Finish the voice request for ${destination}`,
  requesting_permission: (destination) => `Cancel the voice request for ${destination}`,
  submitting: (destination) => `Sending the voice request to ${destination}`,
} satisfies Record<
  Exclude<GlobalSpeechCapturePresentation["state"], "failed" | "unavailable">,
  (destination: string) => string
>;

export function speechCaptureTranscriptPreview(
  capture: GlobalSpeechCapturePresentation,
): string | null {
  if (!("transcript" in capture)) {
    return null;
  }
  const transcript = capture.transcript.trim();
  return transcript === "" ? null : transcript;
}

export function shellSpeechPlaybackLabel(
  playback: SpeechPlaybackSnapshot,
  sourceConversationTitle: string | null = null,
): string | null {
  const source = playbackStateSource(playback.state);
  switch (playback.state.type) {
    case "idle":
      return optionalQueuedSpeechLabel(playback.queued.length);
    case "synthesizing":
      return preparingSpeechLabel(source, sourceConversationTitle);
    case "speaking":
      return speakingSpeechLabel(source, sourceConversationTitle);
    case "failed":
      return playback.state.message;
    case "stopped":
      return optionalQueuedSpeechLabel(playback.queued.length);
    default:
      return assertNever(playback.state);
  }
}

export function shellSpeechStatusLabel(
  capture: GlobalSpeechCapturePresentation,
  captureLabel: string,
  playbackLabel: string | null,
): string | null {
  if (playbackLabel && passiveCaptureStates.has(capture.state)) {
    return playbackLabel;
  }
  switch (capture.state) {
    case "idle":
      return null;
    case "unavailable":
      return "Voice unavailable";
    default:
      return captureLabel;
  }
}

const passiveCaptureStates = new Set<GlobalSpeechCapturePresentation["state"]>([
  "idle",
  "unavailable",
]);

export function speechPresentationConversationId(
  capture: GlobalSpeechCapturePresentation,
  playback: SpeechPlaybackSnapshot,
): string | null {
  if (capture.source) {
    return capture.source.type === "conversation" ? capture.source.conversationId : null;
  }
  const source = playbackStateSource(playback.state);
  return source?.type === "conversation" ? source.conversationId : null;
}

function activeCapturePresentation(
  capture: SpeechCaptureState,
): GlobalSpeechCapturePresentation | null {
  switch (capture.type) {
    case "requesting_permission":
    case "recording":
    case "draining":
    case "committing":
      return {
        source: captureRequestSource(capture.request),
        state: capture.type,
        transcript: capture.transcript,
      };
    case "failed":
    case "idle":
      return null;
    default:
      return assertNever(capture);
  }
}

function captureRequestSource(request: SpeechCaptureRequest): GlobalSpeechSource {
  switch (request.destination.type) {
    case "master":
      return { conversationId: null, sourcePaneId: null, type: "master" };
    case "conversation":
      if (request.sourcePaneId === null) {
        throw new Error("conversation speech capture presentation requires its source pane");
      }
      return {
        conversationId: request.destination.conversationId,
        sourcePaneId: request.sourcePaneId,
        type: "conversation",
      };
    default:
      return assertNever(request.destination);
  }
}

function conversationInputSource(input: ConversationInput): GlobalSpeechSource {
  if (input.sourcePaneId === null) {
    throw new Error("conversation voice submission presentation requires its source pane");
  }
  return {
    conversationId: input.conversationId,
    sourcePaneId: input.sourcePaneId,
    type: "conversation",
  };
}

function masterInputSource(): GlobalSpeechSource {
  return { conversationId: null, sourcePaneId: null, type: "master" };
}

function playbackStateSource(state: SpeechPlaybackState): GlobalSpeechSource | null {
  if (state.type === "idle") {
    return null;
  }
  const speaker = state.intent.source.speaker;
  switch (speaker) {
    case "master":
      return { conversationId: null, sourcePaneId: null, type: "master" };
    case "narrator":
      if (state.intent.source.conversationId === null) {
        throw new Error("narrator playback presentation requires its conversation id");
      }
      return {
        conversationId: state.intent.source.conversationId,
        sourcePaneId: "",
        type: "conversation",
      };
    default:
      return assertNever(speaker);
  }
}

function speakingSourceEventId(
  playback: SpeechPlaybackSnapshot,
  playbackScope: PaneSpeechSourceScope,
): string | null {
  if (
    playback.state.type !== "speaking" ||
    playbackScope !== "this_conversation" ||
    playback.state.intent.source.speaker !== "narrator"
  ) {
    return null;
  }
  return playback.state.intent.source.eventId;
}

function paneSourceScope(
  source: GlobalSpeechSource | null,
  target: PaneSpeechTarget,
): PaneSpeechSourceScope {
  if (!source) {
    return "none";
  }
  if (source.type === "master") {
    return "master";
  }
  if (source.conversationId !== target.conversationId) {
    return "other_conversation";
  }
  if (source.sourcePaneId !== "" && source.sourcePaneId === target.paneId) {
    return "this_pane";
  }
  return "this_conversation";
}

function paneActivity(
  capture: GlobalSpeechCapturePresentation,
  captureScope: PaneSpeechSourceScope,
  playback: SpeechPlaybackSnapshot,
  playbackScope: PaneSpeechSourceScope,
  sourceConversationTitle: string | null,
): { kind: NonNullable<PaneSpeechPresentation["activityKind"]>; label: string } | null {
  const captureActivity = paneCaptureActivity(capture, captureScope);
  if (captureActivity) {
    return captureActivity;
  }
  return panePlaybackActivity(playback, playbackScope, sourceConversationTitle);
}

function paneCaptureActivity(
  capture: GlobalSpeechCapturePresentation,
  scope: PaneSpeechSourceScope,
): { kind: "capture" | "failed"; label: string } | null {
  if (capture.state === "failed") {
    return { kind: "failed", label: capture.message };
  }
  const label = paneCaptureActivityLabels[capture.state];
  return label ? { kind: "capture", label: paneCaptureLabel(label, scope) } : null;
}

const paneCaptureActivityLabels = {
  committing: "Finishing voice request",
  draining: "Finishing captured audio",
  idle: null,
  recording: "Listening",
  requesting_permission: "Requesting microphone",
  submitting: "Sending voice request",
  unavailable: null,
} as const satisfies Record<
  Exclude<GlobalSpeechCapturePresentation["state"], "failed">,
  string | null
>;

function panePlaybackActivity(
  playback: SpeechPlaybackSnapshot,
  scope: PaneSpeechSourceScope,
  sourceConversationTitle: string | null,
): { kind: "failed" | "queued" | "speaking" | "synthesizing"; label: string } | null {
  switch (playback.state.type) {
    case "synthesizing":
      return {
        kind: "synthesizing",
        label: panePlaybackLabel("Preparing voice", scope, sourceConversationTitle),
      };
    case "speaking":
      return {
        kind: "speaking",
        label: panePlaybackLabel("Speaking", scope, sourceConversationTitle),
      };
    case "failed":
      return { kind: "failed", label: playback.state.message };
    case "idle":
    case "stopped":
      return queuedPaneActivity(playback.queued.length);
    default:
      return assertNever(playback.state);
  }
}

function paneCaptureLabel(label: string, scope: PaneSpeechSourceScope): string {
  switch (scope) {
    case "this_pane":
      return label;
    case "this_conversation":
      return `${label} for this topic`;
    case "master":
      return `${label} for Setta`;
    case "other_conversation":
      return `${label} for another topic`;
    case "none":
      return label;
    default:
      return assertNever(scope);
  }
}

function panePlaybackLabel(
  label: string,
  scope: PaneSpeechSourceScope,
  sourceConversationTitle: string | null,
): string {
  switch (scope) {
    case "this_pane":
    case "this_conversation":
      return `Narrator ${label.toLocaleLowerCase()}`;
    case "master":
      return `Setta ${label.toLocaleLowerCase()}`;
    case "other_conversation":
      return `${sourceConversationTitle ?? "Another topic"} narrator ${label.toLocaleLowerCase()}`;
    case "none":
      return label;
    default:
      return assertNever(scope);
  }
}

interface PaneVoiceControl {
  disabled: boolean;
  label: string;
  setupAction: VoiceProviderSetupAction | null;
}

function paneVoiceControl(
  capture: GlobalSpeechCapturePresentation,
  scope: PaneSpeechSourceScope,
): PaneVoiceControl {
  if (capture.state === "failed") {
    return failedPaneVoiceControl(capture);
  }
  if (capture.state === "recording") {
    return recordingPaneVoiceControl(scope);
  }
  if (capture.state === "unavailable") {
    return {
      disabled: capture.setupAction === null,
      label: unavailableCaptureControlLabel(capture),
      setupAction: capture.setupAction,
    };
  }
  return paneVoiceControls[capture.state](scope);
}

const paneVoiceControls = {
  committing: activePaneVoiceControl,
  draining: activePaneVoiceControl,
  idle: () => ({
    disabled: false,
    label: "Start a voice request for this conversation",
    setupAction: null,
  }),
  requesting_permission: activePaneVoiceControl,
  submitting: activePaneVoiceControl,
} satisfies Record<
  Exclude<GlobalSpeechCapturePresentation["state"], "failed" | "recording" | "unavailable">,
  (scope: PaneSpeechSourceScope) => PaneVoiceControl
>;

function activePaneVoiceControl(scope: PaneSpeechSourceScope) {
  return {
    disabled: true,
    label: paneCaptureLabel("Voice capture is active", scope),
    setupAction: null,
  };
}

function failedPaneVoiceControl(
  capture: Extract<GlobalSpeechCapturePresentation, { state: "failed" }>,
) {
  if (capture.retry === null) {
    return {
      disabled: false,
      label: "Retry voice capture for this conversation",
      setupAction: null,
    };
  }
  return { disabled: true, label: capture.message, setupAction: null };
}

function recordingPaneVoiceControl(scope: PaneSpeechSourceScope) {
  if (scope === "this_pane") {
    return { disabled: false, label: "Finish this voice request", setupAction: null };
  }
  return activePaneVoiceControl(scope);
}

function unavailableCaptureControlLabel(
  capture: Extract<GlobalSpeechCapturePresentation, { state: "unavailable" }>,
): string {
  return capture.setupAction === null
    ? capture.message
    : voiceProviderSetupActionLabel(capture.setupAction);
}

function speechSourceLabel(
  source: GlobalSpeechSource | null,
  sourceConversationTitle: string | null,
): string {
  if (source?.type === "conversation") {
    return sourceConversationTitle ?? "the topic narrator";
  }
  return "Setta";
}

function optionalQueuedSpeechLabel(count: number): string | null {
  return count > 0 ? queuedSpeechLabel(count) : null;
}

function queuedPaneActivity(count: number): { kind: "queued"; label: string } | null {
  const label = optionalQueuedSpeechLabel(count);
  return label ? { kind: "queued", label } : null;
}

function preparingSpeechLabel(
  source: GlobalSpeechSource | null,
  sourceConversationTitle: string | null,
): string {
  if (source?.type === "master") {
    return "Preparing Setta voice";
  }
  return `Preparing ${sourceConversationTitle ?? "topic"} narrator voice`;
}

function speakingSpeechLabel(
  source: GlobalSpeechSource | null,
  sourceConversationTitle: string | null,
): string {
  if (source?.type === "master") {
    return "Setta is speaking";
  }
  return `${sourceConversationTitle ?? "Topic"} narrator is speaking`;
}

function queuedSpeechLabel(count: number): string {
  return `${count} voice ${count === 1 ? "reply" : "replies"} queued`;
}

function assertNever(value: never): never {
  throw new Error(`Unsupported global speech presentation value: ${JSON.stringify(value)}`);
}
