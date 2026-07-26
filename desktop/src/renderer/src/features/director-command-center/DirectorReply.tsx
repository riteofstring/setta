import { useLayoutEffect, useRef, useState } from "react";

import { stripInlineMarkdown } from "@renderer/lib/plain-inline-text";

/** What the shell is waiting on before it can speak for itself. */
export type DirectorLoadState = "loading" | "ready" | "resyncing" | "error";

/**
 * The Director's last word, above the composer that asked for it.
 *
 * This used to be a line inside the Now rail. The Director's own view has no
 * rails — its canvas is the content — so the app's primary interaction, asking
 * the Director something, completed with an answer nobody could read. A reply
 * belongs beside the thing you typed into, and it is the same place the mockup
 * puts it.
 *
 * It is a live region rather than a transcript: one reply, replaced by the
 * next. The durable account of what happened is the narration in the rail, and
 * of what was produced, the artifacts.
 *
 * It draws as the mockup's response card: start-aligned reading text, clamped
 * to a few lines so a long answer never floods the canvas, with its full text
 * one disclosure away. The disclosure is a separate button rather than the card
 * itself so the reply stays selectable text.
 */
export function DirectorReply({
  answering,
  loadState,
  message,
  receiptText,
}: {
  answering: boolean;
  loadState: DirectorLoadState;
  message: string | null;
  receiptText: string | null;
}) {
  const text = stripInlineMarkdown(message ?? receiptText ?? loadStateMessage(loadState));
  const [expanded, setExpanded] = useState(false);
  const [clamped, setClamped] = useState(false);
  const textRef = useRef<HTMLParagraphElement | null>(null);

  // A new reply starts folded; the previous reply's disclosure state is about
  // text that is no longer on screen.
  useLayoutEffect(() => {
    setExpanded(false);
  }, [text]);

  useLayoutEffect(() => {
    const element = textRef.current;
    if (element === null) {
      return;
    }
    const measure = (): void => {
      setClamped(element.scrollHeight > element.clientHeight + 1);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [text, expanded]);

  return (
    <div
      aria-live="polite"
      className="director-reply"
      data-answering={answering ? "true" : "false"}
      data-empty={text === "" && !answering ? "true" : "false"}
      role="status"
    >
      <p className="director-reply-text" data-expanded={expanded ? "true" : "false"} ref={textRef}>
        {text}
      </p>
      {expanded || clamped ? (
        <button
          className="director-reply-toggle"
          onClick={() => {
            setExpanded((current) => !current);
          }}
          type="button"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      ) : null}
    </div>
  );
}

function loadStateMessage(state: DirectorLoadState): string {
  switch (state) {
    case "loading":
      return "Loading Director state.";
    case "resyncing":
      return "Resyncing Director state.";
    case "error":
      return "The Director command center is unavailable.";
    case "ready":
      return "";
    default:
      return exhaustiveLoadState(state);
  }
}

function exhaustiveLoadState(state: never): never {
  throw new Error(`unsupported Director load state ${state}`);
}
