import {
  NO_DRAG_CLASS_NAME,
  NO_PAN_CLASS_NAME,
  WorkspaceInspectorSettingsGroup,
  type WorkspaceSection,
} from "@setta/workspace";
import { useState } from "react";

import { projectDraft, useBench } from "../app/benchContext";
import type { CandidateV1 } from "../backend/generatedContract";

function candidateIssue(
  snapshot: ReturnType<typeof useBench>["snapshot"],
  candidateId: string,
): string | null {
  return (
    snapshot.validation.issues.find((issue) =>
      issue.path.startsWith(`project.candidates.${candidateId}.`),
    )?.message ?? null
  );
}

export function CandidateHeaderControls({
  section,
}: {
  section: WorkspaceSection;
}) {
  const { snapshot } = useBench();
  const candidateIndex = snapshot.project.candidates.findIndex(
    (entry) => entry.id === section.id,
  );
  const candidate = snapshot.project.candidates[candidateIndex];
  if (candidate === undefined) return null;
  const issue = candidateIssue(snapshot, candidate.id);
  return (
    <span
      className="bench-code-header-stage"
      data-status={issue === null ? "ready" : "error"}
      title={
        issue ??
        `Candidate ${String(candidateIndex + 1)} of ${String(snapshot.project.candidates.length)} runs once per input`
      }
    >
      2 · {candidate.origin === null ? "command" : "Canvas export"}
    </span>
  );
}

export function CandidateInspector({ candidateId }: { candidateId: string }) {
  const { snapshot } = useBench();
  const candidate = snapshot.project.candidates.find(
    (entry) => entry.id === candidateId,
  );
  if (candidate === undefined) {
    return <p role="alert">Candidate {candidateId} is missing.</p>;
  }
  return (
    <CandidateEditor
      candidate={candidate}
      entityId={candidateId}
      key={`${candidateId}:${String(snapshot.project.revision)}`}
    />
  );
}

function CandidateEditor({
  candidate,
  entityId,
}: {
  candidate: CandidateV1;
  entityId: string;
}) {
  const { actions, pendingAction } = useBench();
  const [name, setName] = useState(candidate.name);
  const [argumentsDraft, setArgumentsDraft] = useState(
    candidate.command.argv.join("\n"),
  );
  const [workingDirectory, setWorkingDirectory] = useState(
    candidate.command.workingDirectory,
  );
  const [feedback, setFeedback] = useState<string | null>(null);
  const interaction = `${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME}`;
  const imported = candidate.origin !== null;
  const save = async () => {
    if (imported) return;
    const argv = argumentsDraft
      .split("\n")
      .map((entry) => entry.trim())
      .filter((entry) => entry !== "");
    const nextName = name.trim();
    if (nextName === "" || argv.length === 0) {
      setFeedback("Name and at least one command argument are required.");
      return;
    }
    const saved = await actions.replaceProject((project) => ({
      ...projectDraft(project),
      candidates: project.candidates.map((entry) =>
        entry.id === entityId
          ? {
              ...entry,
              command: {
                argv,
                workingDirectory: workingDirectory.trim() || ".",
              },
              name: nextName,
            }
          : entry,
      ),
    }));
    setFeedback(saved ? "Candidate saved." : "Candidate was not saved.");
  };
  return (
    <>
      <WorkspaceInspectorSettingsGroup
        status={candidate.origin === null ? "local" : "exported"}
        title="Invocation"
      >
        <p className="setta-workspace-inspector-help">
          Bench starts this command once per input case, writes the case as JSON
          to stdin, and reads one JSON result from stdout.
        </p>
        <label className="setta-workspace-inspector-config-row">
          <span className="setta-workspace-inspector-config-label">Name</span>
          <input
            className={`setta-workspace-inspector-config-input ${interaction}`}
            disabled={imported}
            onChange={(event) => setName(event.currentTarget.value)}
            value={name}
          />
        </label>
        <label className="bench-inspector-stack">
          <span>Command arguments, one per line</span>
          <textarea
            className={interaction}
            disabled={imported}
            onChange={(event) => setArgumentsDraft(event.currentTarget.value)}
            rows={6}
            value={argumentsDraft}
          />
        </label>
        <label className="setta-workspace-inspector-config-row">
          <span className="setta-workspace-inspector-config-label">
            Working directory
          </span>
          <input
            className={`setta-workspace-inspector-config-input ${interaction}`}
            disabled={imported}
            onChange={(event) => setWorkingDirectory(event.currentTarget.value)}
            placeholder="project root"
            value={workingDirectory}
          />
        </label>
        {imported ? (
          <p className="setta-workspace-inspector-help">
            Exported commands are frozen. Edit the callable in Python Canvas,
            export it again, and re-import the candidate.
          </p>
        ) : (
          <button
            className={`setta-workspace-inspector-primary-action ${interaction}`}
            disabled={pendingAction !== null}
            onClick={() => void save()}
            type="button"
          >
            Save invocation
          </button>
        )}
        {feedback === null ? null : <p role="status">{feedback}</p>}
      </WorkspaceInspectorSettingsGroup>
      <CandidateSource candidate={candidate} />
    </>
  );
}

function CandidateSource({ candidate }: { candidate: CandidateV1 }) {
  if (candidate.origin === null) {
    return (
      <WorkspaceInspectorSettingsGroup status="local" title="Source">
        <p className="setta-workspace-inspector-help">
          Bench stores the invocation, not local source files. Edit the source
          in its own project; the code section shows exactly what Bench runs.
        </p>
      </WorkspaceInspectorSettingsGroup>
    );
  }
  return (
    <WorkspaceInspectorSettingsGroup title="Source">
      <dl className="bench-inspector-facts">
        <div>
          <dt>Application</dt>
          <dd>{candidate.origin.application}</dd>
        </div>
        <div>
          <dt>Revision</dt>
          <dd>{candidate.origin.projectRevision}</dd>
        </div>
        <div>
          <dt>Callable</dt>
          <dd>{candidate.origin.callableId}</dd>
        </div>
      </dl>
      <a href={candidate.origin.deepLink}>Open in Python Canvas</a>
    </WorkspaceInspectorSettingsGroup>
  );
}
