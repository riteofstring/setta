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
 * Folded, it is bare text over the canvas — the same layer the graph's own
 * labels live on, so it needs no box. Disclosing it grows the same element
 * into an enclosed card: the height animates and the ground fades in, so the
 * card reads as the text expanding rather than a panel replacing it.
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
  const text = directorReplyText(message, receiptText, loadState);
  const [expanded, setExpanded] = useState(false);
  const [clamped, setClamped] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const textRef = useRef<HTMLParagraphElement | null>(null);
  const showToggle = shouldShowReplyToggle(expanded, clamped);
  /** Height captured in the click, before React re-lays the disclosure out. */
  const morphFromHeightRef = useRef<number | null>(null);

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

  /*
   * The disclosure morph. The clamp switch is discrete, so the fluid motion is
   * a first/last height animation over the same element; the enclosure itself
   * fades in through the CSS transition on the container's ground and border.
   */
  useLayoutEffect(() => {
    const container = containerRef.current;
    const fromHeight = morphFromHeightRef.current;
    morphFromHeightRef.current = null;
    if (container === null || fromHeight === null) {
      return;
    }
    if (globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    const toHeight = container.offsetHeight;
    if (fromHeight === toHeight) {
      return;
    }
    container.animate([{ height: `${fromHeight}px` }, { height: `${toHeight}px` }], {
      duration: 240,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
    });
  }, [expanded]);

  return (
    <div
      aria-live="polite"
      className="director-reply"
      data-answering={booleanDataValue(answering)}
      data-empty={booleanDataValue(isReplyEmpty(text, answering))}
      data-expanded={booleanDataValue(expanded)}
      ref={containerRef}
      role="status"
    >
      <p className="director-reply-text" data-expanded={booleanDataValue(expanded)} ref={textRef}>
        {text}
      </p>
      {showToggle ? (
        <button
          className="director-reply-toggle"
          onClick={() => {
            morphFromHeightRef.current = containerRef.current?.offsetHeight ?? null;
            setExpanded((current) => !current);
          }}
          type="button"
        >
          {replyToggleLabel(expanded)}
        </button>
      ) : null}
    </div>
  );
}

function directorReplyText(
  message: string | null,
  receiptText: string | null,
  loadState: DirectorLoadState,
): string {
  return stripInlineMarkdown(message ?? receiptText ?? loadStateMessage(loadState));
}

function shouldShowReplyToggle(expanded: boolean, clamped: boolean): boolean {
  return expanded || clamped;
}

function isReplyEmpty(text: string, answering: boolean): boolean {
  return text === "" && !answering;
}

function booleanDataValue(value: boolean): "true" | "false" {
  return value ? "true" : "false";
}

function replyToggleLabel(expanded: boolean): string {
  return expanded ? "Show less" : "Show more";
}

function loadStateMessage(state: DirectorLoadState): string {
  switch (state) {
    case "loading":
    case "resyncing":
      // Transport progress belongs to the Director graph's particle field, not
      // to the conversation reply above the composer.
      return "";
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
