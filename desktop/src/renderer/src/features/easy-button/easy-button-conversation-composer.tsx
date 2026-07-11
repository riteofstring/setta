import type { FormEventHandler } from "react";

export function EasyButtonConversationComposer({
  available,
  canSubmit,
  input,
  onInput,
  onSteer,
  onSubmit,
  placeholder,
  working,
}: {
  available: boolean;
  canSubmit: boolean;
  input: string;
  onInput: ((value: string) => void) | undefined;
  onSteer: (() => void) | undefined;
  onSubmit: FormEventHandler<HTMLFormElement> | undefined;
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
        <ConversationSteerButton canSubmit={canSubmit} onSteer={onSteer} working={working} />
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
