import { Mic } from "lucide-react";
import type { FormEventHandler } from "react";

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
        <ConversationVoiceButton available={available} onVoiceCapture={onVoiceCapture} />
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
}: {
  available: boolean;
  onVoiceCapture: (() => void) | undefined;
}) {
  if (!onVoiceCapture) {
    return null;
  }
  return (
    <button
      aria-label="Start a voice request for this conversation"
      className="easy-button-voice-chip"
      data-testid="easy-button-voice-capture"
      disabled={!available}
      onClick={onVoiceCapture}
      type="button"
    >
      <Mic aria-hidden="true" className="easy-button-voice-icon" />
    </button>
  );
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
