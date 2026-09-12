import { useBench } from "../app/benchContext";

export function RunsPane() {
  const { selection, snapshot } = useBench();
  return (
    <div className="bench-pane">
      <div className="bench-pane-heading">
        <span>History</span>
        <strong>{snapshot.runs.length}</strong>
      </div>
      {snapshot.launches.length === 0 ? (
        <p className="bench-pane-empty">No launches yet.</p>
      ) : (
        <ol className="bench-launch-list">
          {snapshot.launches.map((launch) => (
            <li key={launch.id}>
              <div className="bench-launch-heading">
                <strong>{launch.id}</strong>
                <span>{launch.cases.length} cases</span>
              </div>
              <div className="bench-run-buttons">
                {launch.runIds.map((runId) => {
                  const run = snapshot.runs.find((entry) => entry.id === runId);
                  return run === undefined ? null : (
                    <button
                      aria-pressed={selection.activeRunId === run.id}
                      key={run.id}
                      onClick={() => selection.selectRun(run.id)}
                      type="button"
                    >
                      <span
                        className="bench-status-dot"
                        data-status={run.status}
                      />
                      <span>{run.candidateName}</span>
                      <small>{run.status}</small>
                    </button>
                  );
                })}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
