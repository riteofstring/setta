import { Square } from "lucide-react";
import type { FormEventHandler } from "react";

import { PaneSpeechActivityIndicator } from "../global-speech/app-shell-speech-status";
import type { PaneSpeechPresentation } from "../global-speech/global-speech-presentation";

export function EasyButtonConversationComposer({
  available,
  canSubmit,
  clarificationQuestion = null,
  input,
  masterReply = null,
  onInput,
  onStop,
  onSubmit,
  placeholder,
  showStop = false,
  speech,
}: {
  available: boolean;
  canSubmit: boolean;
  clarificationQuestion?: string | null;
  input: string;
  masterReply?: { kind: "answer" | "clarification"; text: string } | null;
  onInput: ((value: string) => void) | undefined;
  onStop?: (() => void) | undefined;
  onSubmit: FormEventHandler<HTMLFormElement> | undefined;
  placeholder: string;
  showStop?: boolean;
  speech: PaneSpeechPresentation | null | undefined;
}) {
  return (
    <div className="easy-button-footer">
      {masterReply ? (
        <p
          className="easy-button-clarification"
          data-master-reply-kind={masterReply.kind}
          data-testid="easy-button-master-reply"
          role="status"
        >
          {masterReply.text}
        </p>
      ) : null}
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
            Send
          </button>
        </form>
        <PaneSpeechActivityIndicator presentation={speech} />
        {showStop ? (
          <button
            aria-label="Stop conversation work"
            className="easy-button-stop-button"
            data-testid="easy-button-stop-run"
            disabled={!onStop}
            onClick={onStop}
            title="Stop conversation work"
            type="button"
          >
            <Square aria-hidden="true" className="easy-button-stop-button-icon" />
            Stop
          </button>
        ) : null}
      </div>
    </div>
  );
}
