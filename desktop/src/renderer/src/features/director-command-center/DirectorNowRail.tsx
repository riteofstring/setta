import { ChevronDown, History } from "lucide-react";

import { DirectorNowActivityList, type DirectorNowActivity } from "./DirectorNowActivityList";
import type { DirectorFocus } from "./director-focus";

/** What the shell is waiting on before the Now rail can speak for itself. */
export type DirectorLoadState = "loading" | "ready" | "resyncing" | "error";

/**
 * The Now rail: what is happening, and the longer story behind it.
 *
 * It does not name the selected workstream, its status, or its folder. The top
 * bar already renders all three, and restating them here is what turned the
 * rail into a second header stacked on the first. The rail owns current
 * activity, the way into thread history, and the summary disclosure — nothing
 * that another surface already says.
 *
 * Nothing in it is a card. Activity reads as text over the canvas, with recency
 * carried by opacity, so the rail stays a heads-up layer rather than a panel.
 */
export function NowRail({
  activity,
  focus,
  loadState,
  message,
  onOpenHistory,
  receiptText,
}: {
  activity: DirectorNowActivity;
  focus: DirectorFocus;
  loadState: DirectorLoadState;
  message: string | null;
  onOpenHistory: (trigger: HTMLButtonElement) => void;
  receiptText: string | null;
}) {
  const summary = focus.kind === "workstream" ? focus.summary : null;
  return (
    <aside aria-label="Now" className="director-now-rail" id="director-now-rail">
      <div className="director-rail-head">
        <p className="director-rail-kicker">Now</p>
        {/*
         * The compact transcript stays one click away, as the mockup's
         * "see thread history ›" link does. It is always reachable: an empty
         * thread is something the overlay says, not something the rail hides.
         */}
        <button
          className="director-history-open"
          onClick={(event) => onOpenHistory(event.currentTarget)}
          type="button"
        >
          <History aria-hidden="true" size={13} />
          <span>See thread history</span>
        </button>
      </div>
      <DirectorNowActivityList activity={activity} />
      {summary === null ? null : <CurrentWorkstreamSummaryDisclosure summary={summary} />}
      <div aria-live="polite" className="director-live-status" role="status">
        {message ?? receiptText ?? loadStateMessage(loadState)}
      </div>
    </aside>
  );
}

function CurrentWorkstreamSummaryDisclosure({ summary }: { summary: string }) {
  return (
    <details className="director-summary-disclosure">
      <summary>
        <span>Summary</span>
        <ChevronDown aria-hidden="true" size={14} />
      </summary>
      <p className="director-rail-summary">{summary}</p>
    </details>
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
