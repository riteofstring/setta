import { GitFork, MessagesSquare, Mic, Square } from "lucide-react";
import { type FormEventHandler, useState } from "react";

import { conversationInputModeValues, type ConversationInputMode } from "@generated/backend";

import { PaneSpeechActivityIndicator } from "../global-speech/app-shell-speech-status";
import type { PaneSpeechPresentation } from "../global-speech/global-speech-presentation";

export function EasyButtonConversationComposer({
  available,
  canSubmit,
  clarificationQuestion = null,
  forkPoints = [],
  input,
  onFork,
  onInput,
  onQueue,
  onSend,
  onSide,
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
  clarificationQuestion?: string | null;
  forkPoints?: readonly EasyButtonForkPoint[];
  input: string;
  onFork?: (() => void) | undefined;
  onInput: ((value: string) => void) | undefined;
  onQueue?: (() => void) | undefined;
  onSend?: (() => void) | undefined;
  onSide?: (() => void) | undefined;
  onStatus: (() => void) | undefined;
  onSteer: (() => void) | undefined;
  onSubmit: FormEventHandler<HTMLFormElement> | undefined;
  onVoiceCapture: ((inputMode?: ConversationInputMode) => void) | undefined;
  placeholder: string;
  speech: PaneSpeechPresentation | null | undefined;
  working: boolean;
}) {
  const [voiceInputMode, setVoiceInputMode] = useState<ConversationInputMode>("route");
  const frozenVoiceInputMode = speech?.captureInputMode ?? null;
  const effectiveVoiceInputMode = frozenVoiceInputMode ?? voiceInputMode;

  return (
    <div className="easy-button-footer">
      {clarificationQuestion ? (
        <p className="easy-button-clarification" data-testid="easy-button-clarification">
          {clarificationQuestion}
        </p>
      ) : null}
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
        <ConversationStatusButton canSubmit={canSubmit} onStatus={onStatus} />
        <ConversationSteerButton canSubmit={canSubmit} onSteer={onSteer} working={working} />
        <ConversationSideButton canSubmit={canSubmit} onSide={onSide} />
        <ConversationForkButton
          canSubmit={canSubmit}
          hasForkPoint={forkPoints.length > 0}
          onFork={onFork}
        />
        <ConversationExplicitDeliveryButton
          canSubmit={canSubmit}
          onQueue={onQueue}
          onSend={onSend}
          working={working}
        />
        <PaneSpeechActivityIndicator presentation={speech} />
        <ConversationVoiceModeSelect
          available={available}
          frozen={frozenVoiceInputMode !== null}
          inputMode={effectiveVoiceInputMode}
          onInputMode={setVoiceInputMode}
          visible={Boolean(onVoiceCapture)}
        />
        <ConversationVoiceButton
          available={available}
          onVoiceCapture={onVoiceCapture}
          speech={speech}
          voiceInputMode={effectiveVoiceInputMode}
        />
        <button
          className="easy-button-enter-chip"
          data-testid="easy-button-submit"
          disabled={!canSubmit}
          type="submit"
        >
          {clarificationQuestion ? "Reply" : "Route"}
        </button>
      </form>
    </div>
  );
}

export interface EasyButtonForkPoint {
  label: string;
  turnId: string;
}

function ConversationVoiceButton({
  available,
  onVoiceCapture,
  speech,
  voiceInputMode,
}: {
  available: boolean;
  onVoiceCapture: ((inputMode?: ConversationInputMode) => void) | undefined;
  speech: PaneSpeechPresentation | null | undefined;
  voiceInputMode: ConversationInputMode;
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
      onClick={() => onVoiceCapture(voiceInputMode)}
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

function ConversationVoiceModeSelect({
  available,
  frozen,
  inputMode,
  onInputMode,
  visible,
}: {
  available: boolean;
  frozen: boolean;
  inputMode: ConversationInputMode;
  onInputMode: (inputMode: ConversationInputMode) => void;
  visible: boolean;
}) {
  if (!visible) {
    return null;
  }
  return (
    <select
      aria-label="Voice input mode"
      className="easy-button-voice-mode"
      data-testid="easy-button-voice-mode"
      disabled={!available || frozen}
      onChange={(event) => onInputMode(event.target.value as ConversationInputMode)}
      value={inputMode}
    >
      {conversationInputModeValues.map((mode) => (
        <option key={mode} value={mode}>
          {conversationInputModeLabel(mode)}
        </option>
      ))}
    </select>
  );
}

function conversationInputModeLabel(mode: ConversationInputMode): string {
  switch (mode) {
    case "route":
      return "Route voice";
    case "send":
      return "Send voice";
    case "queue":
      return "Queue voice";
    case "steer":
      return "Steer voice";
    case "ask_narrator":
      return "Status voice";
    case "side":
      return "Side voice";
    case "fork":
      return "Fork voice";
  }
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

function ConversationSideButton({
  canSubmit,
  onSide,
}: {
  canSubmit: boolean;
  onSide: (() => void) | undefined;
}) {
  if (!onSide) {
    return null;
  }
  return (
    <button
      aria-label="Start a temporary side conversation with this request"
      className="easy-button-side-chip"
      data-testid="easy-button-side-start"
      disabled={!canSubmit}
      onClick={onSide}
      type="button"
    >
      <MessagesSquare aria-hidden="true" />
      Side
    </button>
  );
}

function ConversationForkButton({
  canSubmit,
  hasForkPoint,
  onFork,
}: {
  canSubmit: boolean;
  hasForkPoint: boolean;
  onFork: (() => void) | undefined;
}) {
  if (!onFork) {
    return null;
  }
  return (
    <button
      aria-label={hasForkPoint ? "Create a durable fork" : "A completed turn is required to fork"}
      className="easy-button-fork-chip"
      data-testid="easy-button-fork-start"
      disabled={!canSubmit || !hasForkPoint}
      onClick={onFork}
      type="button"
    >
      <GitFork aria-hidden="true" />
      Fork
    </button>
  );
}

function ConversationExplicitDeliveryButton({
  canSubmit,
  onQueue,
  onSend,
  working,
}: {
  canSubmit: boolean;
  onQueue: (() => void) | undefined;
  onSend: (() => void) | undefined;
  working: boolean;
}) {
  const action = working ? onQueue : onSend;
  if (!action) {
    return null;
  }
  return (
    <button
      className="easy-button-delivery-chip"
      data-testid={working ? "easy-button-queue" : "easy-button-send"}
      disabled={!canSubmit}
      onClick={action}
      type="button"
    >
      {working ? "Queue" : "Send"}
    </button>
  );
}
