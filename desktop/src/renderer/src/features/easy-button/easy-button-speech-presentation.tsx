import { Mic } from "lucide-react";

import type { SpeechCaptureState } from "./speech-capture-controller";
import type { SpeechCaptureAvailability } from "./use-speech-capture";

export function SpeechCaptureRings() {
  return (
    <div aria-hidden="true" className="easy-button-rings">
      <div className="easy-button-ring" />
      <div className="easy-button-ring" />
      <div className="easy-button-ring" />
    </div>
  );
}

export function SpeechCaptureLine({ state }: { state: SpeechCaptureState }) {
  return (
    <p aria-live="off" className="easy-button-capture-line" data-testid="easy-button-capture-line">
      {captureTranscript(state)}
    </p>
  );
}

export function SpeechCaptureError({ state }: { state: SpeechCaptureState }) {
  if (state.type !== "failed") {
    return null;
  }
  return (
    <p
      aria-live="polite"
      className="easy-button-capture-error"
      data-testid="easy-button-capture-error"
      role="status"
    >
      {state.message}
    </p>
  );
}

export function SpeechAvailabilityStatus({
  availability,
}: {
  availability: SpeechCaptureAvailability;
}) {
  switch (availability.type) {
    case "unsupported":
    case "failed":
      return (
        <p aria-live="polite" className="easy-button-voice-status" role="status">
          {availability.message}
        </p>
      );
    case "configured":
    case "loading":
    case "not_configured":
      return null;
  }
}

export function SpeechControlGlyph() {
  return <Mic aria-hidden="true" className="easy-button-glyph" />;
}

export function speechCaptureDOMState(state: SpeechCaptureState): string {
  switch (state.type) {
    case "requesting_permission":
      return "requesting-permission";
    case "connecting":
    case "listening":
    case "committing":
    case "failed":
      return state.type;
    case "idle":
      return "off";
  }
}

export function speechCaptureHelperCopy(state: SpeechCaptureState, runWorking: boolean): string {
  switch (state.type) {
    case "requesting_permission":
      return "Allow microphone access…";
    case "connecting":
      return "Connecting…";
    case "listening":
      return `${runWorking ? "Listening — tap to steer" : "Listening — tap to send"} · Esc to cancel`;
    case "committing":
      return "Committing…";
    case "failed":
      return "";
    case "idle":
      return runWorking ? "Tap to steer" : "Tap to speak";
  }
}

export function speechCaptureControlLabel(state: SpeechCaptureState, runWorking: boolean): string {
  switch (state.type) {
    case "listening":
      return voiceIntentCopy(runWorking, "Finish voice request", "Finish voice steering");
    case "failed":
      return voiceIntentCopy(runWorking, "Retry voice request", "Retry voice steering");
    case "requesting_permission":
      return "Requesting microphone permission";
    case "connecting":
      return "Connecting voice transcription";
    case "committing":
      return "Committing voice transcript";
    case "idle":
      return voiceIntentCopy(runWorking, "Start voice request", "Start voice steering");
  }
}

function voiceIntentCopy(runWorking: boolean, startCopy: string, steerCopy: string): string {
  return runWorking ? steerCopy : startCopy;
}

function captureTranscript(state: SpeechCaptureState): string {
  switch (state.type) {
    case "requesting_permission":
    case "connecting":
    case "listening":
    case "committing":
      return state.transcript;
    case "idle":
    case "failed":
      return "";
  }
}
