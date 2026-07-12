import { Mic, Square } from "lucide-react";
import type { FormEventHandler } from "react";

import { PaneSpeechActivityIndicator } from "../global-speech/app-shell-speech-status";
import type { PaneSpeechPresentation } from "../global-speech/global-speech-presentation";

export function EasyButtonConversationComposer({
  available,
  canSubmit,
  input,
  onInput,
  onStatus,
  onSteer,
  onSubmit,
  onVoiceCapture,
  placeholder,
  speech,
  working,
}: {
  available: boolean;
  canSubmit: boolean;
  input: string;
  onInput: ((value: string) => void) | undefined;
  onStatus: (() => void) | undefined;
  onSteer: (() => void) | undefined;
  onSubmit: FormEventHandler<HTMLFormElement> | undefined;
  onVoiceCapture: (() => void) | undefined;
  placeholder: string;
  speech: PaneSpeechPresentation | null | undefined;
  working: boolean;
}) {
  return (
    <form className="easy-button-footer" onSubmit={onSubmit}>
      <div className="easy-button-input-wrap">
        <input
          aria-label="Easy Button request"
          className="easy-button-input"
          data-testid="easy-button-input"
          disabled={!available}
          onChange={(event) => onInput?.(event.target.value)}
          placeholder={placeholder}
          type="text"
          value={input}
        />
        <ConversationStatusButton canSubmit={canSubmit} onStatus={onStatus} />
        <ConversationSteerButton canSubmit={canSubmit} onSteer={onSteer} working={working} />
        <PaneSpeechActivityIndicator presentation={speech} />
        <ConversationVoiceButton
          available={available}
          onVoiceCapture={onVoiceCapture}
          speech={speech}
        />
        <button
          className="easy-button-enter-chip"
          data-testid="easy-button-submit"
          disabled={!canSubmit}
          type="submit"
        >
          {working ? "Queue" : "Send"}
        </button>
      </div>
    </form>
  );
}

function ConversationVoiceButton({
  available,
  onVoiceCapture,
  speech,
}: {
  available: boolean;
  onVoiceCapture: (() => void) | undefined;
  speech: PaneSpeechPresentation | null | undefined;
}) {
  if (!onVoiceCapture) {
    return null;
  }
  const control = conversationVoiceControl(available, speech);
  return (
    <button
      aria-label={control.label}
      className="easy-button-voice-chip"
      data-speech-capture={speech?.captureState}
      data-speech-capture-scope={speech?.captureScope}
      data-testid="easy-button-voice-capture"
      disabled={control.disabled}
      onClick={onVoiceCapture}
      title={control.label}
      type="button"
    >
      {control.finishesCapture ? (
        <Square aria-hidden="true" className="easy-button-voice-icon" />
      ) : (
        <Mic aria-hidden="true" className="easy-button-voice-icon" />
      )}
    </button>
  );
}

function conversationVoiceControl(
  available: boolean,
  speech: PaneSpeechPresentation | null | undefined,
) {
  if (!speech) {
    return {
      disabled: !available,
      finishesCapture: false,
      label: "Start a voice request for this conversation",
    };
  }
  return {
    disabled: !available || speech.voiceControlDisabled,
    finishesCapture: speech.captureState === "listening" && speech.captureScope === "this_pane",
    label: speech.voiceControlLabel,
  };
}

function ConversationStatusButton({
  canSubmit,
  onStatus,
}: {
  canSubmit: boolean;
  onStatus: (() => void) | undefined;
}) {
  if (!onStatus) {
    return null;
  }
  return (
    <button
      aria-label="Ask the narrator for status"
      className="easy-button-status-chip"
      data-testid="easy-button-status-request"
      disabled={!canSubmit}
      onClick={onStatus}
      type="button"
    >
      Ask status
    </button>
  );
}

function ConversationSteerButton({
  canSubmit,
  onSteer,
  working,
}: {
  canSubmit: boolean;
  onSteer: (() => void) | undefined;
  working: boolean;
}) {
  if (!working || !onSteer) {
    return null;
  }
  return (
    <button
      className="easy-button-steer-chip"
      data-testid="easy-button-steer"
      disabled={!canSubmit}
      onClick={onSteer}
      type="button"
    >
      Steer
    </button>
  );
}
