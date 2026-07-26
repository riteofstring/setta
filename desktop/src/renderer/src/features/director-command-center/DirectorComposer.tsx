import type { DirectorIntent, DirectorReceipt } from "@generated/backend";
import { LoaderCircle, Mic, RotateCcw, Send, Square, X } from "lucide-react";
import { useState, type FormEvent, type KeyboardEvent } from "react";

import { voiceProviderSetupActionLabel } from "../global-speech/speech-capture-availability";
import { directorTitle, type DirectorFocus } from "./director-focus";
import type {
  DirectorSpeechCaptureController,
  DirectorSpeechCaptureSnapshot,
  DirectorSpeechCaptureState,
} from "./director-speech-capture";

export interface DirectorSpeechCaptureBinding {
  controller: DirectorSpeechCaptureController;
  snapshot: DirectorSpeechCaptureSnapshot;
}

/** What the composer's hint line says about who is listening, and to what. */
export interface DirectorComposerHintCopy {
  /** A request of ours is a turn in flight, so the Director is mid-answer. */
  readonly answering: boolean;
  readonly focusText: string;
  readonly role: string;
  readonly statusText: string | null;
}

/** A keystroke offered to the composer from wherever it actually landed. */
export interface DirectorComposerKeystroke {
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
  readonly key: string;
  readonly metaKey: boolean;
  readonly targetIsEditable: boolean;
}

export const directorComposerInputId = "director-composer-input";
const directorAnsweringLabel = "Answering";

/**
 * The request always reaches the Director. What changes is the work it is being
 * asked about, so the hint names the Director first and the workstream second.
 *
 * While a turn is in flight the status slot reports the Director rather than the
 * workstream. What the user needs from the composer at that moment is whether
 * the request they just sent has landed; the workstream's own status is on the
 * top bar and in the Now rail either way.
 */
export function directorComposerHint(
  focus: DirectorFocus,
  answering: boolean,
): DirectorComposerHintCopy {
  if (focus.kind === "director") {
    return {
      answering,
      focusText: focus.roleLabel,
      role: directorTitle,
      statusText: answering ? directorAnsweringLabel : null,
    };
  }
  return {
    answering,
    focusText: `on ${focus.title}`,
    role: directorTitle,
    statusText: answering ? directorAnsweringLabel : focus.statusLabel,
  };
}

/**
 * Whether a keystroke that landed elsewhere belongs in the composer.
 *
 * The composer is the app's front door, so typing anywhere on the command
 * center starts a request instead of being swallowed by whatever held focus.
 * Only a plain printable character redirects: a modifier carries an app
 * shortcut, a space activates the focused control, and an editable target is
 * already taking the text.
 */
export function directorComposerTakesKeystroke({
  altKey,
  ctrlKey,
  key,
  metaKey,
  targetIsEditable,
}: DirectorComposerKeystroke): boolean {
  if (targetIsEditable || altKey || ctrlKey || metaKey) {
    return false;
  }
  return key.length === 1 && key !== " ";
}

/**
 * Moves the caret into the composer. Called during the keydown that redirected,
 * so the character itself lands in the composer as the default action.
 */
export function focusDirectorComposer(ownerDocument: Document): void {
  ownerDocument.getElementById(directorComposerInputId)?.focus({ preventScroll: true });
}

/**
 * Restores a request the backend did not finish without overwriting anything
 * the user typed while that request was in flight.
 */
export function restoreFailedDirectorDraft(currentDraft: string, failedSubmission: string): string {
  return currentDraft.trim().length === 0
    ? failedSubmission
    : `${failedSubmission}\n\n${currentDraft}`;
}

function DirectorComposerHint({ hint }: { hint: DirectorComposerHintCopy }) {
  return (
    <p className="director-composer-hint" data-answering={hint.answering ? "true" : "false"}>
      <span aria-hidden="true" className="director-composer-hint-dot" />
      <span className="director-composer-hint-copy">
        <span className="director-composer-hint-role">{hint.role}</span>
        <span className="director-composer-hint-focus">{hint.focusText}</span>
        <span aria-live="polite" className="director-composer-hint-status">
          {hint.statusText ?? ""}
        </span>
      </span>
    </p>
  );
}

export function DirectorComposer({
  answering,
  dispatch,
  focus,
  onOpenVoiceCredentialSettings,
  pendingActions,
  speechCapture,
}: {
  answering: boolean;
  dispatch: (intent: DirectorIntent) => Promise<DirectorReceipt>;
  focus: DirectorFocus;
  onOpenVoiceCredentialSettings: () => void;
  /**
   * What the Director is waiting on the user for, rendered directly above the
   * hint. The composer owns the column rather than the content, so the surface
   * stays a sibling of the input the user answers with.
   */
  pendingActions: React.ReactNode;
  speechCapture: DirectorSpeechCaptureBinding;
}) {
  const [text, setText] = useState("");
  const voice = directorVoiceComposerState(speechCapture.snapshot);
  const voiceAnnouncement = [voice.status, voice.transcriptPreview].filter(Boolean).join(" ");
  const submitText = async (submittedText: string): Promise<void> => {
    setText("");
    try {
      await dispatch(submitIntent(submittedText));
    } catch {
      setText((current) => restoreFailedDirectorDraft(current, submittedText));
    }
  };
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      return;
    }
    void submitText(trimmed);
  };
  const submitOnEnter = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
      return;
    }
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  };
  return (
    <form
      aria-label="Director composer"
      className="director-composer"
      data-voice-discard={voice.discardFailedSubmission || undefined}
      data-voice-state={voice.state}
      onSubmit={submit}
    >
      {pendingActions}
      <DirectorComposerHint hint={directorComposerHint(focus, answering)} />
      <div className="director-composer-pill">
        <div className="director-composer-input-stack">
          <label className="sr-only" htmlFor={directorComposerInputId}>
            Ask the Director
          </label>
          <textarea
            aria-keyshortcuts="Enter"
            id={directorComposerInputId}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={submitOnEnter}
            placeholder="Ask the Director…"
            rows={1}
            value={text}
          />
          <span aria-atomic="true" className="sr-only" role="status">
            {voiceAnnouncement}
          </span>
          {voice.status === null ? null : (
            <p aria-hidden="true" className="director-composer-voice-status">
              <span>{voice.status}</span>
              {voice.transcriptPreview === null ? null : (
                <span className="director-composer-transcript">{voice.transcriptPreview}</span>
              )}
            </p>
          )}
        </div>
        <div className="director-composer-controls">
          <button
            aria-label={voice.controlLabel}
            className="director-composer-voice-button"
            disabled={voice.action === null}
            onClick={() =>
              executeDirectorVoiceAction(
                speechCapture.controller,
                voice.action,
                onOpenVoiceCredentialSettings,
              )
            }
            title={voice.controlLabel}
            type="button"
          >
            <DirectorVoiceGlyph state={voice.state} />
          </button>
          {voice.discardFailedSubmission ? (
            <button
              aria-label="Discard failed voice request"
              className="director-composer-discard-voice-button"
              onClick={speechCapture.controller.discardSubmission}
              title="Discard failed voice request"
              type="button"
            >
              <X aria-hidden="true" size={16} />
            </button>
          ) : null}
          <button disabled={text.trim().length === 0} type="submit">
            <Send aria-hidden="true" size={17} />
            <span>Send</span>
          </button>
        </div>
      </div>
    </form>
  );
}

type DirectorVoiceAction =
  | "cancel"
  | "commit"
  | "open_voice_credential_settings"
  | "retry_submission"
  | "start"
  | null;

interface DirectorVoiceComposerState {
  action: DirectorVoiceAction;
  controlLabel: string;
  discardFailedSubmission: boolean;
  state: DirectorSpeechCaptureState["type"] | "unavailable";
  status: string | null;
  transcriptPreview: string | null;
}

type ActiveDirectorVoiceCapture = Exclude<DirectorSpeechCaptureState, { type: "failed" | "idle" }>;

function directorVoiceComposerState(
  snapshot: DirectorSpeechCaptureSnapshot,
): DirectorVoiceComposerState {
  const capture = snapshot.capture;
  if (capture.type === "idle") {
    return inactiveDirectorVoiceComposerState(snapshot);
  }
  if (capture.type === "failed") {
    return failedDirectorVoiceComposerState(capture);
  }
  return activeDirectorVoiceComposerState(capture);
}

function activeDirectorVoiceComposerState(
  capture: ActiveDirectorVoiceCapture,
): DirectorVoiceComposerState {
  switch (capture.type) {
    case "committing":
      return committingDirectorVoiceComposerState(capture);
    case "draining":
      return drainingDirectorVoiceComposerState(capture);
    case "recording":
      return recordingDirectorVoiceComposerState(capture);
    case "requesting_permission":
      return requestingDirectorVoiceComposerState(capture);
    case "submitted":
      return submittedDirectorVoiceComposerState(capture);
    case "submitting":
      return submittingDirectorVoiceComposerState(capture);
    default:
      return assertNever(capture);
  }
}

function committingDirectorVoiceComposerState(
  capture: Extract<ActiveDirectorVoiceCapture, { type: "committing" }>,
): DirectorVoiceComposerState {
  return {
    action: null,
    controlLabel: "Preparing voice request",
    discardFailedSubmission: false,
    state: capture.type,
    status: "Preparing voice request.",
    transcriptPreview: transcriptPreview(capture.transcript),
  };
}

function drainingDirectorVoiceComposerState(
  capture: Extract<ActiveDirectorVoiceCapture, { type: "draining" }>,
): DirectorVoiceComposerState {
  return {
    action: null,
    controlLabel: "Finishing captured audio",
    discardFailedSubmission: false,
    state: capture.type,
    status: "Finishing captured audio.",
    transcriptPreview: transcriptPreview(capture.transcript),
  };
}

function recordingDirectorVoiceComposerState(
  capture: Extract<ActiveDirectorVoiceCapture, { type: "recording" }>,
): DirectorVoiceComposerState {
  return {
    action: "commit",
    controlLabel: "Finish voice request",
    discardFailedSubmission: false,
    state: capture.type,
    status: capture.connection === "ready" ? "Listening." : "Connecting voice capture.",
    transcriptPreview: transcriptPreview(capture.transcript),
  };
}

function requestingDirectorVoiceComposerState(
  capture: Extract<ActiveDirectorVoiceCapture, { type: "requesting_permission" }>,
): DirectorVoiceComposerState {
  return {
    action: "cancel",
    controlLabel: "Cancel voice request",
    discardFailedSubmission: false,
    state: capture.type,
    status: "Requesting microphone access.",
    transcriptPreview: null,
  };
}

function submittedDirectorVoiceComposerState(
  capture: Extract<ActiveDirectorVoiceCapture, { type: "submitted" }>,
): DirectorVoiceComposerState {
  return {
    action: "start",
    controlLabel: "Start voice request",
    discardFailedSubmission: false,
    state: capture.type,
    status: capture.receiptText ?? "Voice request sent.",
    transcriptPreview: transcriptPreview(capture.transcript),
  };
}

function submittingDirectorVoiceComposerState(
  capture: Extract<ActiveDirectorVoiceCapture, { type: "submitting" }>,
): DirectorVoiceComposerState {
  return {
    action: null,
    controlLabel: "Sending voice request",
    discardFailedSubmission: false,
    state: capture.type,
    status: "Sending voice request.",
    transcriptPreview: transcriptPreview(capture.transcript),
  };
}

function failedDirectorVoiceComposerState(
  capture: Extract<DirectorSpeechCaptureState, { type: "failed" }>,
): DirectorVoiceComposerState {
  return {
    action: capture.retryTranscript === null ? "start" : "retry_submission",
    controlLabel: capture.retryTranscript === null ? "Start voice request" : "Retry voice request",
    discardFailedSubmission: capture.retryTranscript !== null,
    state: capture.type,
    status: capture.message,
    transcriptPreview: transcriptPreview(capture.retryTranscript?.transcript ?? ""),
  };
}

function inactiveDirectorVoiceComposerState(
  snapshot: DirectorSpeechCaptureSnapshot,
): DirectorVoiceComposerState {
  switch (snapshot.availability.type) {
    case "configured":
      return {
        action: "start",
        controlLabel: "Start voice request",
        discardFailedSubmission: false,
        state: "idle",
        status: null,
        transcriptPreview: null,
      };
    case "not_configured":
      return {
        action: snapshot.availability.setupAction,
        controlLabel: voiceProviderSetupActionLabel(snapshot.availability.setupAction),
        discardFailedSubmission: false,
        state: "unavailable",
        status: snapshot.availability.message,
        transcriptPreview: null,
      };
    case "disconnected":
      return unavailableDirectorVoiceComposerState("Voice capture is disconnected.");
    case "failed":
    case "unsupported":
      return unavailableDirectorVoiceComposerState(snapshot.availability.message);
    case "loading":
      return unavailableDirectorVoiceComposerState("Voice capture is loading.");
    default:
      return assertNever(snapshot.availability);
  }
}

function unavailableDirectorVoiceComposerState(status: string): DirectorVoiceComposerState {
  return {
    action: null,
    controlLabel: status,
    discardFailedSubmission: false,
    state: "unavailable",
    status,
    transcriptPreview: null,
  };
}

function executeDirectorVoiceAction(
  controller: DirectorSpeechCaptureController,
  action: DirectorVoiceAction,
  onOpenVoiceCredentialSettings: () => void,
): void {
  switch (action) {
    case "cancel":
      controller.cancel();
      return;
    case "commit":
      controller.commit();
      return;
    case "open_voice_credential_settings":
      onOpenVoiceCredentialSettings();
      return;
    case "retry_submission":
      controller.retrySubmission();
      return;
    case "start":
      void controller.start();
      return;
    case null:
      return;
    default:
      return assertNever(action);
  }
}

type DirectorVoiceGlyphKind = "failed" | "loading" | "microphone" | "stop";

const directorVoiceGlyphKinds = {
  committing: "loading",
  draining: "loading",
  failed: "failed",
  idle: "microphone",
  recording: "stop",
  requesting_permission: "loading",
  submitted: "microphone",
  submitting: "loading",
  unavailable: "microphone",
} as const satisfies Record<DirectorVoiceComposerState["state"], DirectorVoiceGlyphKind>;

function DirectorVoiceGlyph({ state }: { state: DirectorVoiceComposerState["state"] }) {
  switch (directorVoiceGlyphKinds[state]) {
    case "failed":
      return <RotateCcw aria-hidden="true" size={17} />;
    case "loading":
      return <LoaderCircle aria-hidden="true" className="director-spinner" size={17} />;
    case "microphone":
      return <Mic aria-hidden="true" size={17} />;
    case "stop":
      return <Square aria-hidden="true" size={16} />;
    default:
      return assertNever(directorVoiceGlyphKinds[state]);
  }
}

function submitIntent(text: string): DirectorIntent {
  return {
    cancelRun: null,
    createWorkstream: null,
    kind: "submit",
    moveSelection: null,
    resolveApproval: null,
    resolveResourceRequest: null,
    selectWorkstream: null,
    submit: { modality: "text", text },
  };
}

function transcriptPreview(transcript: string): string | null {
  const trimmed = transcript.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function assertNever(value: never): never {
  throw new Error(`unsupported Director composer value ${JSON.stringify(value)}`);
}
