import type { WorkstreamNarration } from "@generated/backend";

/** What the shell is waiting on before the Now rail can speak for itself. */
export type DirectorLoadState = "loading" | "ready" | "resyncing" | "error";

/**
 * The Now rail: what the narrator has said about the work in focus.
 *
 * It renders narration and nothing else. It used to render the last five
 * semantic graph nodes, which were hardcoded constants — a row reading
 * "Tool / Action / Done" carries no information — raw provider text with its
 * markdown unrendered, and a provenance line of actor, evidence class, and
 * source-event counts that exists to debug a projector.
 *
 * There is deliberately no fallback. If the narrator has said nothing, the rail
 * says so in one line. A rail that degrades into a node dump is the defect this
 * replaced, and a fallback would reintroduce it under a different name.
 *
 * It does not name the selected workstream, its status, or its folder: the top
 * bar renders those, and restating them here is what turned the rail into a
 * second header stacked on the first. Nothing in it is a card — narration reads
 * as text over the canvas, so the rail stays a heads-up layer.
 */
export function NowRail({
  loadState,
  message,
  narration,
  receiptText,
}: {
  loadState: DirectorLoadState;
  message: string | null;
  narration: readonly WorkstreamNarration[];
  receiptText: string | null;
}) {
  return (
    <aside aria-label="Now" className="director-now-rail" id="director-now-rail">
      <p className="director-rail-kicker">Now</p>
      <DirectorNarrationList narration={narration} />
      <div aria-live="polite" className="director-live-status" role="status">
        {message ?? receiptText ?? loadStateMessage(loadState)}
      </div>
    </aside>
  );
}

function DirectorNarrationList({ narration }: { narration: readonly WorkstreamNarration[] }) {
  if (narration.length === 0) {
    return <p className="director-rail-quiet">Nothing to report yet.</p>;
  }
  /*
   * Newest first. The backend keeps narration in the order it was written, and
   * the newest sentence is the one a glance is for.
   */
  const newestFirst = [...narration].reverse();
  return (
    <ol aria-label="What the narrator has reported" className="director-narration-list">
      {newestFirst.map((entry, index) => (
        <li
          className="director-narration-item"
          data-narration-kind={entry.kind}
          data-narration-latest={index === 0 ? "true" : "false"}
          key={entry.id}
        >
          <span aria-hidden="true" className="director-narration-mark" />
          <span className="director-narration-text">{entry.text}</span>
        </li>
      ))}
    </ol>
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
