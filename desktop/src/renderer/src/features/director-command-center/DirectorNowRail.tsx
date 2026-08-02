import type { WorkstreamNarration, WorkstreamStatus } from "@generated/backend";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@renderer/components/ui/tooltip";

import { useDirectorRailArrivalKeys } from "./director-rail-arrivals";

const directorNowMinimizedItemLimit = 8;

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
  visible,
  workstreamStatus,
}: {
  narration: readonly WorkstreamNarration[];
  visible: boolean;
  workstreamStatus: WorkstreamStatus | null;
}) {
  const arrivingIds = useDirectorRailArrivalKeys(narration.map((entry) => entry.id));
  return (
    <TooltipProvider delay={120}>
      <aside aria-label="Now" className="director-now-rail" id="director-now-rail">
        <div
          aria-hidden={!visible || undefined}
          className="director-rail-expanded-content"
          inert={!visible || undefined}
        >
          <p
            aria-hidden={narration.length === 0 || undefined}
            className="director-rail-kicker"
            data-visible={narration.length > 0 ? "true" : "false"}
          >
            Now
          </p>
          <DirectorNarrationList
            arrivingIds={arrivingIds}
            narration={narration}
            workstreamStatus={workstreamStatus}
          />
        </div>
        <DirectorNowMinimized
          arrivingIds={arrivingIds}
          narration={narration}
          visible={!visible}
          workstreamStatus={workstreamStatus}
        />
      </aside>
    </TooltipProvider>
  );
}

function DirectorNowMinimized({
  arrivingIds,
  narration,
  visible,
  workstreamStatus,
}: {
  arrivingIds: ReadonlySet<string>;
  narration: readonly WorkstreamNarration[];
  visible: boolean;
  workstreamStatus: WorkstreamStatus | null;
}) {
  const newestFirst = [...narration].reverse().slice(0, directorNowMinimizedItemLimit);
  return (
    <div
      aria-hidden={!visible || undefined}
      aria-label="Recent Now activity"
      className="director-rail-minimized director-now-minimized"
      inert={!visible || undefined}
      role="group"
    >
      {newestFirst.map((entry, index) => {
        const outcome = narrationOutcome(entry, index === 0, workstreamStatus);
        return (
          <Tooltip key={entry.id}>
            <TooltipTrigger
              render={
                <button
                  aria-label={`Preview update: ${entry.text}`}
                  className="director-rail-minimized-marker director-now-minimized-marker"
                  data-narration-kind={entry.kind}
                  data-narration-latest={index === 0 ? "true" : "false"}
                  data-narration-outcome={outcome ?? undefined}
                  data-rail-arriving={arrivingIds.has(entry.id) ? "true" : undefined}
                  data-rail-latest={index === 0 ? "true" : "false"}
                  type="button"
                />
              }
            >
              <span aria-hidden="true" className="director-narration-mark" />
            </TooltipTrigger>
            <TooltipContent
              align="start"
              className="director-rail-preview-tooltip director-rail-now-tooltip"
              side="right"
              sideOffset={10}
            >
              <div
                className="director-narration-item director-rail-tooltip-narration"
                data-narration-kind={entry.kind}
                data-narration-latest={index === 0 ? "true" : "false"}
                data-narration-outcome={outcome ?? undefined}
              >
                <DirectorNarrationContent entry={entry} />
              </div>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

function DirectorNarrationList({
  arrivingIds,
  narration,
  workstreamStatus,
}: {
  arrivingIds: ReadonlySet<string>;
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
          data-rail-arriving={arrivingIds.has(entry.id) ? "true" : undefined}
          data-narration-outcome={
            narrationOutcome(entry, index === 0, workstreamStatus) ?? undefined
          }
          key={entry.id}
        >
          <DirectorNarrationContent entry={entry} />
        </li>
      ))}
    </ol>
  );
}

function DirectorNarrationContent({ entry }: { entry: WorkstreamNarration }) {
  return (
    <>
      <span aria-hidden="true" className="director-narration-mark" />
      <span className="director-narration-text">{entry.text}</span>
    </>
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
