import type { DirectorIntent, DirectorReceipt } from "@generated/backend";
import { LoaderCircle, Mic, RotateCcw, Send, Square, X } from "lucide-react";
import { useState, type FormEvent, type KeyboardEvent } from "react";

import { voiceProviderSetupActionLabel } from "../global-speech/speech-capture-availability";
import type {
  DirectorSpeechCaptureController,
  DirectorSpeechCaptureSnapshot,
  DirectorSpeechCaptureState,
} from "./director-speech-capture";
import type { DirectorComposerCommitment } from "./director-workstream-status";

export interface DirectorSpeechCaptureBinding {
  controller: DirectorSpeechCaptureController;
  snapshot: DirectorSpeechCaptureSnapshot;
}

export function DirectorComposer({
  commitment,
  dispatch,
  dispatching,
  onOpenVoiceCredentialSettings,
  speechCapture,
}: {
  commitment: DirectorComposerCommitment;
  dispatch: (intent: DirectorIntent) => Promise<DirectorReceipt>;
  dispatching: boolean;
  onOpenVoiceCredentialSettings: () => void;
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
      setText(submittedText);
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
      <div className="director-composer-input-stack">
        <p
          className="director-composer-hint"
          data-active={commitment.active ? "true" : "false"}
          data-status={commitment.status}
        >
          <span aria-hidden="true" className="director-composer-hint-dot" />
          <span className="director-composer-hint-copy">
            <span>on: {commitment.title}</span>
            <span>{commitment.statusLabel}</span>
          </span>
        </p>
        <label className="sr-only" htmlFor="director-composer-input">
          Ask the Director
        </label>
        <textarea
          aria-keyshortcuts="Enter"
          disabled={dispatching}
          id="director-composer-input"
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
        <button disabled={dispatching || text.trim().length === 0} type="submit">
          <Send aria-hidden="true" size={17} />
          <span>Send</span>
        </button>
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
