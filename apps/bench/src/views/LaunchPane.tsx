import {
  NO_DRAG_CLASS_NAME,
  NO_PAN_CLASS_NAME,
  WorkspaceInspectorSettingsGroup,
} from "@setta/workspace";
import { useEffect, useState } from "react";

import { projectDraft, useBench } from "../app/benchContext";
import type { StructuredErrorV1 } from "../backend/generatedContract";

export function LaunchPane() {
  const { actions, pendingAction, snapshot } = useBench();
  const project = snapshot.project;
  const [concurrency, setConcurrency] = useState(
    String(project.execution.concurrency),
  );
  const [timeout, setTimeoutValue] = useState(
    String(project.execution.timeoutMilliseconds),
  );
  const [bundleDirectory, setBundleDirectory] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  useEffect(() => {
    setConcurrency(String(project.execution.concurrency));
    setTimeoutValue(String(project.execution.timeoutMilliseconds));
  }, [
    project.execution.concurrency,
    project.execution.timeoutMilliseconds,
    project.revision,
  ]);
  const { caseCount, executionCount, issues, ready } = snapshot.validation;
  const interaction = `${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME}`;
  const saveExecution = async () => {
    const nextConcurrency = Number(concurrency);
    const nextTimeout = Number(timeout);
    if (
      !Number.isSafeInteger(nextConcurrency) ||
      nextConcurrency < 1 ||
      !Number.isSafeInteger(nextTimeout) ||
      nextTimeout < 1
    ) {
      setFeedback("Concurrency and timeout must be positive whole numbers.");
      return;
    }
    const saved = await actions.replaceProject((current) => ({
      ...projectDraft(current),
      execution: {
        concurrency: nextConcurrency,
        timeoutMilliseconds: nextTimeout,
      },
    }));
    setFeedback(
      saved ? "Execution settings saved." : "Settings were not saved.",
    );
  };
  const importCandidate = async () => {
    const directory = bundleDirectory.trim();
    if (directory === "") {
      setFeedback("A bundle directory is required.");
      return;
    }
    const imported = await actions.importCandidate(directory);
    if (imported) setBundleDirectory("");
    setFeedback(
      imported ? "Candidate imported." : "Candidate was not imported.",
    );
  };
  return (
    <div className="bench-pane bench-launch-pane">
      <WorkspaceInspectorSettingsGroup
        status={`${String(project.candidates.length)} candidates`}
        title="Launch preview"
      >
        <div className="bench-launch-equation">
          <div>
            <strong>{ready ? caseCount : "—"}</strong>
            <span>cases</span>
          </div>
          <b>×</b>
          <div>
            <strong>{project.candidates.length}</strong>
            <span>candidates</span>
          </div>
          <b>=</b>
          <div>
            <strong>{ready ? executionCount : "—"}</strong>
            <span>executions</span>
          </div>
        </div>
        <p className="setta-workspace-inspector-help">
          The validated JSONL manifest is frozen when the launch is accepted.
        </p>
        {issues.length === 0 ? null : (
          <ul className="bench-diagnostics">
            {issues.map((issue) => (
              <li key={`${issue.path}:${issue.code}`}>
                <strong>{issue.path}</strong>
                <span>{issue.message}</span>
              </li>
            ))}
          </ul>
        )}
        <ul className="bench-candidate-summary">
          {project.candidates.map((candidate) => (
            <li key={candidate.id}>
              <span>{candidate.name}</span>
              <code>{candidate.command.argv[0]}</code>
            </li>
          ))}
        </ul>
        <button
          className={`setta-workspace-inspector-primary-action ${interaction}`}
          disabled={pendingAction !== null || !ready}
          onClick={() => void actions.launch()}
          type="button"
        >
          {pendingAction === "launch" ? "Starting…" : "Run all candidates"}
        </button>
      </WorkspaceInspectorSettingsGroup>
      <WorkspaceInspectorSettingsGroup title="Execution">
        <label className="setta-workspace-inspector-config-row">
          <span className="setta-workspace-inspector-config-label">
            Concurrency
          </span>
          <input
            className={`setta-workspace-inspector-config-input ${interaction}`}
            min={1}
            onChange={(event) => setConcurrency(event.currentTarget.value)}
            step={1}
            type="number"
            value={concurrency}
          />
        </label>
        <label className="setta-workspace-inspector-config-row">
          <span className="setta-workspace-inspector-config-label">
            Timeout, ms
          </span>
          <input
            className={`setta-workspace-inspector-config-input ${interaction}`}
            min={1}
            onChange={(event) => setTimeoutValue(event.currentTarget.value)}
            step={1}
            type="number"
            value={timeout}
          />
        </label>
        <button
          className={`setta-workspace-inspector-primary-action ${interaction}`}
          disabled={pendingAction !== null}
          onClick={() => void saveExecution()}
          type="button"
        >
          Save execution settings
        </button>
      </WorkspaceInspectorSettingsGroup>
      <WorkspaceInspectorSettingsGroup title="Python Canvas handoff">
        <label className="bench-inspector-stack">
          <span>Candidate bundle directory</span>
          <input
            className={interaction}
            onChange={(event) => setBundleDirectory(event.currentTarget.value)}
            placeholder=".local/python-canvas/bench-export"
            value={bundleDirectory}
          />
        </label>
        <button
          className={`setta-workspace-inspector-primary-action ${interaction}`}
          disabled={pendingAction !== null}
          onClick={() => void importCandidate()}
          type="button"
        >
          Import candidate
        </button>
      </WorkspaceInspectorSettingsGroup>
      <Diagnostics diagnostics={snapshot.diagnostics} />
      {feedback === null ? null : <p role="status">{feedback}</p>}
    </div>
  );
}

function Diagnostics({
  diagnostics,
}: {
  diagnostics: ReadonlyArray<StructuredErrorV1>;
}) {
  if (diagnostics.length === 0) return null;
  return (
    <WorkspaceInspectorSettingsGroup
      status={String(diagnostics.length)}
      title="Diagnostics"
    >
      <ul className="bench-diagnostics">
        {diagnostics.map((diagnostic, index) => (
          <li key={`${diagnostic.code}:${String(index)}`}>
            <strong>{diagnostic.code}</strong>
            <span>{diagnostic.message}</span>
          </li>
        ))}
      </ul>
    </WorkspaceInspectorSettingsGroup>
  );
}
