import { ChevronDown, Folder, History } from "lucide-react";

import { DirectorNowActivityList, type DirectorNowActivity } from "./DirectorNowActivityList";
import { StatusGlyph } from "./DirectorWorkstreamNavigation";
import type { DirectorFocus } from "./director-focus";
import type { DirectorHistory } from "./DirectorHistoryOverlay";

/** What the shell is waiting on before the Now rail can speak for itself. */
export type DirectorLoadState = "loading" | "ready" | "resyncing" | "error";

/**
 * The Now rail: what is happening, what just happened, and what the shell is
 * waiting on.
 *
 * It is the artifacts rail's opposite number, and like that rail it owns the
 * whole of its own presentation rather than leaving pieces in the shell.
 */
export function NowRail({
  activity,
  focus,
  history,
  loadState,
  message,
  onOpenHistory,
  receiptText,
}: {
  activity: DirectorNowActivity;
  focus: DirectorFocus;
  history: DirectorHistory;
  loadState: DirectorLoadState;
  message: string | null;
  onOpenHistory: (trigger: HTMLButtonElement) => void;
  receiptText: string | null;
}) {
  return (
    <aside aria-label="Now" className="director-now-rail" id="director-now-rail">
      <CurrentFocusSummary focus={focus} />
      <DirectorNowActivityList activity={activity} />
      <HistoryList history={history} onOpenHistory={onOpenHistory} />
      <div aria-live="polite" className="director-live-status" role="status">
        {message ?? receiptText ?? loadStateMessage(loadState)}
      </div>
    </aside>
  );
}

function CurrentFocusSummary({ focus }: { focus: DirectorFocus }) {
  return (
    <section className="director-rail-section" data-focus={focus.kind}>
      <p className="director-rail-kicker">Now</p>
      <h2>{focus.title}</h2>
      {focus.kind === "director" ? (
        <div className="director-selected-status">
          <span aria-hidden="true" className="director-role-dot" />
          <span>{focus.roleLabel}</span>
        </div>
      ) : (
        <CurrentWorkstreamFacts focus={focus} />
      )}
    </section>
  );
}

function CurrentWorkstreamFacts({
  focus,
}: {
  focus: Extract<DirectorFocus, { kind: "workstream" }>;
}) {
  return (
    <>
      <div className="director-focus-facts">
        <div className="director-selected-status" data-status={focus.status}>
          <StatusGlyph status={focus.status} />
          <span>{focus.statusLabel}</span>
        </div>
        <div
          className="director-selected-folder"
          data-folder={focus.folder.path === null ? "none" : "bound"}
        >
          <Folder aria-hidden="true" size={14} />
          <span className="sr-only">Folder: </span>
          <span title={focus.folder.path ?? undefined}>{focus.folder.label}</span>
        </div>
      </div>
      {focus.summary === null ? null : (
        <CurrentWorkstreamSummaryDisclosure summary={focus.summary} />
      )}
    </>
  );
}

function CurrentWorkstreamSummaryDisclosure({ summary }: { summary: string }) {
  return (
    <details className="director-summary-disclosure">
      <summary>
        <span>Summary</span>
        <ChevronDown aria-hidden="true" size={15} />
      </summary>
      <p className="director-rail-summary">{summary}</p>
    </details>
  );
}

function HistoryList({
  history,
  onOpenHistory,
}: {
  history: DirectorHistory;
  onOpenHistory: (trigger: HTMLButtonElement) => void;
}) {
  return (
    <section className="director-rail-section" aria-label="Recent work">
      <p className="director-rail-kicker">History</p>
      {history.length > 0 ? (
        <>
          <ol className="director-history-list">
            {history.slice(-3).map((node) => (
              <li data-node-kind={node.kind} key={node.id}>
                <span>{node.publicSummary}</span>
              </li>
            ))}
          </ol>
          <button
            className="director-history-open"
            onClick={(event) => onOpenHistory(event.currentTarget)}
            type="button"
          >
            <History aria-hidden="true" size={14} />
            <span>See thread history</span>
          </button>
        </>
      ) : (
        <p className="director-rail-summary">No workstream history yet.</p>
      )}
    </section>
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
