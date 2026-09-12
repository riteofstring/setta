import { NO_WHEEL_CLASS_NAME } from "@setta/workspace";

import { useBench } from "../app/benchContext";
import { TERMINAL_RUN_STATUSES } from "../app/benchSelection";
import {
  failedFindingCount,
  formatDuration,
  formatTimestamp,
  runDuration,
  runProgress,
} from "./presentation";

export function RunsWindow() {
  const { actions, pendingAction, selection, snapshot } = useBench();
  if (snapshot.runs.length === 0) {
    return (
      <div className="bench-window-empty">
        <strong>No runs yet</strong>
        <span>Return to Build and launch the candidate comparison.</span>
      </div>
    );
  }
  return (
    <div className={`bench-table-scroll ${NO_WHEEL_CLASS_NAME}`}>
      <table className="bench-runs-table">
        <thead>
          <tr>
            <th>Candidate</th>
            <th>Status</th>
            <th>Cases</th>
            <th>Failed checks</th>
            <th>Duration</th>
            <th>Created</th>
            <th aria-label="Run actions" />
          </tr>
        </thead>
        <tbody>
          {snapshot.runs.map((run) => {
            const selected = selection.activeRunId === run.id;
            return (
              <tr
                aria-selected={selected}
                data-run-id={run.id}
                key={run.id}
                onClick={() => selection.selectRun(run.id)}
              >
                <td>
                  <strong>{run.candidateName}</strong>
                  <span>{run.id}</span>
                </td>
                <td>
                  <span className="bench-status" data-status={run.status}>
                    {run.status}
                  </span>
                </td>
                <td>{runProgress(run)}</td>
                <td>{failedFindingCount(run)}</td>
                <td>{formatDuration(runDuration(run))}</td>
                <td>{formatTimestamp(run.createdAt)}</td>
                <td>
                  {TERMINAL_RUN_STATUSES.has(run.status) ? (
                    <button
                      disabled={pendingAction !== null}
                      onClick={(event) => {
                        event.stopPropagation();
                        void actions.rerun(run.id);
                      }}
                      type="button"
                    >
                      Run again
                    </button>
                  ) : (
                    <button
                      disabled={pendingAction !== null}
                      onClick={(event) => {
                        event.stopPropagation();
                        void actions.cancelRun(run.id);
                      }}
                      type="button"
                    >
                      Cancel
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
