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
 */
export function DirectorReply({
  loadState,
  message,
  receiptText,
}: {
  loadState: DirectorLoadState;
  message: string | null;
  receiptText: string | null;
}) {
  const text = message ?? receiptText ?? loadStateMessage(loadState);
  return (
    <p
      aria-live="polite"
      className="director-reply"
      data-empty={text === "" ? "true" : "false"}
      role="status"
    >
      {text}
    </p>
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
