import { WorkspaceInspectorSettingsGroup } from "@setta/workspace";

import { useBench } from "../app/benchContext";
import { findRun } from "../app/benchSelection";
import {
  failedFindingCount,
  formatDuration,
  formatTimestamp,
  runDuration,
  runProgress,
} from "./presentation";

export function RunDetailsPane() {
  const { selection, snapshot } = useBench();
  const run = findRun(snapshot, selection.activeRunId);
  if (run === null) {
    return <p className="bench-pane-empty">Select a run to inspect it.</p>;
  }
  return (
    <div className="bench-pane bench-detail-pane">
      <WorkspaceInspectorSettingsGroup status={run.status} title="Run">
        <dl className="bench-inspector-facts">
          <div>
            <dt>Candidate</dt>
            <dd>{run.candidateName}</dd>
          </div>
          <div>
            <dt>Cases</dt>
            <dd>{runProgress(run)}</dd>
          </div>
          <div>
            <dt>Failed checks</dt>
            <dd>{failedFindingCount(run)}</dd>
          </div>
          <div>
            <dt>Duration</dt>
            <dd>{formatDuration(runDuration(run))}</dd>
          </div>
          <div>
            <dt>Created</dt>
            <dd>{formatTimestamp(run.createdAt)}</dd>
          </div>
        </dl>
      </WorkspaceInspectorSettingsGroup>
      <WorkspaceInspectorSettingsGroup title="Provenance">
        <dl className="bench-inspector-facts">
          <div>
            <dt>Run</dt>
            <dd>{run.id}</dd>
          </div>
          <div>
            <dt>Launch</dt>
            <dd>{run.launchId}</dd>
          </div>
          <div>
            <dt>Rerun parent</dt>
            <dd>{run.rerunParentId ?? "—"}</dd>
          </div>
        </dl>
      </WorkspaceInspectorSettingsGroup>
      {run.error === null ? null : (
        <p className="bench-pane-error" role="alert">
          {run.error.message}
        </p>
      )}
    </div>
  );
}
