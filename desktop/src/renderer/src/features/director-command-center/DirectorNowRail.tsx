import type { WorkstreamNarration, WorkstreamStatus } from "@generated/backend";

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
  narration,
  workstreamStatus,
}: {
  narration: readonly WorkstreamNarration[];
  workstreamStatus: WorkstreamStatus | null;
}) {
  return (
    <aside aria-label="Now" className="director-now-rail" id="director-now-rail">
      <p className="director-rail-kicker">Now</p>
      <DirectorNarrationList narration={narration} workstreamStatus={workstreamStatus} />
    </aside>
  );
}

function DirectorNarrationList({
  narration,
  workstreamStatus,
}: {
  narration: readonly WorkstreamNarration[];
  workstreamStatus: WorkstreamStatus | null;
}) {
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
          data-narration-outcome={
            narrationOutcome(entry, index === 0, workstreamStatus) ?? undefined
          }
          key={entry.id}
        >
          <span aria-hidden="true" className="director-narration-mark" />
          <span className="director-narration-text">{entry.text}</span>
        </li>
      ))}
    </ol>
  );
}

/**
 * Which verdict colour the latest final summary carries, if any.
 *
 * Green is reserved for the whole task succeeding, and a narration entry does
 * not know how the run ended — colouring every final summary green painted a
 * failed run's last word as a win. The workstream's own terminal status is the
 * fact that knows, and it only speaks for the latest line: an older summary
 * belongs to a run this status no longer describes.
 */
function narrationOutcome(
  entry: WorkstreamNarration,
  latest: boolean,
  workstreamStatus: WorkstreamStatus | null,
): "succeeded" | "failed" | null {
  if (!latest || entry.kind !== "final_summary") {
    return null;
  }
  if (workstreamStatus === "completed") {
    return "succeeded";
  }
  if (workstreamStatus === "failed") {
    return "failed";
  }
  return null;
}
