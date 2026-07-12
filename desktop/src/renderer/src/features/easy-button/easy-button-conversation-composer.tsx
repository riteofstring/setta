import { GitFork, MessagesSquare, Mic, Square } from "lucide-react";
import { type FormEventHandler, useEffect, useState } from "react";

import { PaneSpeechActivityIndicator } from "../global-speech/app-shell-speech-status";
import type { PaneSpeechPresentation } from "../global-speech/global-speech-presentation";

export function EasyButtonConversationComposer({
  available,
  canSubmit,
  defaultForkTitle = "Topic fork",
  forkPoints = [],
  input,
  onFork,
  onInput,
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
  defaultForkTitle?: string;
  forkPoints?: readonly EasyButtonForkPoint[];
  input: string;
  onFork?: (forkedAtTurnId: string, title: string) => Promise<boolean>;
  onInput: ((value: string) => void) | undefined;
  onSide?: (() => void) | undefined;
  onStatus: (() => void) | undefined;
  onSteer: (() => void) | undefined;
  onSubmit: FormEventHandler<HTMLFormElement> | undefined;
  onVoiceCapture: (() => void) | undefined;
  placeholder: string;
  speech: PaneSpeechPresentation | null | undefined;
  working: boolean;
}) {
  const [forkOpen, setForkOpen] = useState(false);
  const [forkTitle, setForkTitle] = useState(defaultForkTitle);
  const [forkedAtTurnId, setForkedAtTurnId] = useState(forkPoints[0]?.turnId ?? "");
  useEffect(() => {
    if (forkPoints.some((point) => point.turnId === forkedAtTurnId)) {
      return;
    }
    setForkedAtTurnId(forkPoints[0]?.turnId ?? "");
  }, [forkPoints, forkedAtTurnId]);

  async function createFork(): Promise<void> {
    const title = forkTitle.trim();
    if (!onFork || !forkedAtTurnId || !title) {
      return;
    }
    if (await onFork(forkedAtTurnId, title)) {
      setForkOpen(false);
      setForkTitle(defaultForkTitle);
    }
  }

  return (
    <div className="easy-button-footer">
      {forkOpen ? (
        <ForkConversationPanel
          available={available}
          createFork={createFork}
          forkPoints={forkPoints}
          forkTitle={forkTitle}
          forkedAtTurnId={forkedAtTurnId}
          setForkTitle={setForkTitle}
          setForkedAtTurnId={setForkedAtTurnId}
        />
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
          available={available}
          forkOpen={forkOpen}
          hasForkPoint={forkPoints.length > 0}
          onToggle={() => {
            setForkTitle(defaultForkTitle);
            setForkOpen((open) => !open);
          }}
          visible={Boolean(onFork)}
        />
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
      </form>
    </div>
  );
}

export interface EasyButtonForkPoint {
  label: string;
  turnId: string;
}

function ForkConversationPanel({
  available,
  createFork,
  forkPoints,
  forkTitle,
  forkedAtTurnId,
  setForkTitle,
  setForkedAtTurnId,
}: {
  available: boolean;
  createFork: () => Promise<void>;
  forkPoints: readonly EasyButtonForkPoint[];
  forkTitle: string;
  forkedAtTurnId: string;
  setForkTitle: (title: string) => void;
  setForkedAtTurnId: (turnId: string) => void;
}) {
  return (
    <section
      aria-label="Create durable fork"
      className="easy-button-fork-panel"
      data-testid="easy-button-fork-panel"
      role="dialog"
    >
      <label>
        Fork title
        <input
          aria-label="Fork title"
          disabled={!available}
          onChange={(event) => setForkTitle(event.target.value)}
          type="text"
          value={forkTitle}
        />
      </label>
      <label>
        History through
        <select
          aria-label="Fork source turn"
          disabled={!available}
          onChange={(event) => setForkedAtTurnId(event.target.value)}
          value={forkedAtTurnId}
        >
          {forkPoints.map((point) => (
            <option key={point.turnId} value={point.turnId}>
              {point.label}
            </option>
          ))}
        </select>
      </label>
      <button
        data-testid="easy-button-fork-create"
        disabled={!available || !forkedAtTurnId || !forkTitle.trim()}
        onClick={() => void createFork()}
        type="button"
      >
        <GitFork aria-hidden="true" />
        Create fork
      </button>
    </section>
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
  available,
  forkOpen,
  hasForkPoint,
  onToggle,
  visible,
}: {
  available: boolean;
  forkOpen: boolean;
  hasForkPoint: boolean;
  onToggle: () => void;
  visible: boolean;
}) {
  if (!visible) {
    return null;
  }
  return (
    <button
      aria-expanded={forkOpen}
      aria-label={hasForkPoint ? "Create a durable fork" : "A completed turn is required to fork"}
      className="easy-button-fork-chip"
      data-testid="easy-button-fork-start"
      disabled={!available || !hasForkPoint}
      onClick={onToggle}
      type="button"
    >
      <GitFork aria-hidden="true" />
      Fork
    </button>
  );
}
