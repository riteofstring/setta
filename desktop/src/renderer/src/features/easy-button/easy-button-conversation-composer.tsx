import { Mic, Square } from "lucide-react";
import type { FormEventHandler } from "react";

import { PaneSpeechActivityIndicator } from "../global-speech/app-shell-speech-status";
import type { PaneSpeechPresentation } from "../global-speech/global-speech-presentation";

export function EasyButtonConversationComposer({
  available,
  canSubmit,
  clarificationQuestion = null,
  input,
  onInput,
  onSubmit,
  onVoiceCapture,
  placeholder,
  speech,
}: {
  available: boolean;
  canSubmit: boolean;
  clarificationQuestion?: string | null;
  input: string;
  onInput: ((value: string) => void) | undefined;
  onSubmit: FormEventHandler<HTMLFormElement> | undefined;
  onVoiceCapture: (() => void) | undefined;
  placeholder: string;
  speech: PaneSpeechPresentation | null | undefined;
}) {
  return (
    <div className="easy-button-footer">
      {clarificationQuestion ? (
        <p className="easy-button-clarification" data-testid="easy-button-clarification">
          {clarificationQuestion}
        </p>
      ) : null}
      <div className="easy-button-composer-row">
        <form className="easy-button-input-wrap" onSubmit={onSubmit}>
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
          <button
            className="easy-button-enter-chip"
            data-testid="easy-button-submit"
            disabled={!canSubmit}
            type="submit"
          >
            {clarificationQuestion ? "Reply" : "Send"}
          </button>
        </form>
        <PaneSpeechActivityIndicator presentation={speech} />
        <ConversationVoiceButton
          available={available}
          onVoiceCapture={onVoiceCapture}
          speech={speech}
        />
      </div>
    </div>
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
  const finishesCapture =
    speech.captureState === "listening" && speech.captureScope === "this_pane";
  return {
    disabled: finishesCapture ? false : !available || speech.voiceControlDisabled,
    finishesCapture,
    label: speech.voiceControlLabel,
  };
}
