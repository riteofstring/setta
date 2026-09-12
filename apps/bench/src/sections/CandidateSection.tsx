import {
  NO_DRAG_CLASS_NAME,
  NO_PAN_CLASS_NAME,
  WorkspaceInspectorSettingsGroup,
  type WorkspaceSection,
} from "@setta/workspace";
import { useState } from "react";

import { projectDraft, useBench } from "../app/benchContext";
import type { CandidateV1 } from "../backend/generatedContract";
import { readBenchSectionData } from "./sectionData";

export function CandidateSection({ section }: { section: WorkspaceSection }) {
  const { snapshot } = useBench();
  const { entityId } = readBenchSectionData(section.data);
  const candidate = snapshot.project.candidates.find(
    (entry) => entry.id === entityId,
  );
  if (candidate === undefined) {
    return <p className="bench-card-error">Candidate {entityId} is missing.</p>;
  }
  return (
    <div className="bench-card-content">
      <div className="bench-card-kind">
        {candidate.origin === null ? "Local command" : "Python Canvas export"}
      </div>
      <dl className="bench-card-facts">
        <div>
          <dt>Command</dt>
          <dd title={candidate.command.argv.join(" ")}>
            {candidate.command.argv.join(" ")}
          </dd>
        </div>
        <div>
          <dt>Directory</dt>
          <dd>{candidate.command.workingDirectory || "project root"}</dd>
        </div>
      </dl>
    </div>
  );
}

export function CandidateInspector({ data }: { data: unknown }) {
  const { snapshot } = useBench();
  const { entityId } = readBenchSectionData(data);
  const candidate = snapshot.project.candidates.find(
    (entry) => entry.id === entityId,
  );
  if (candidate === undefined) {
    return <p role="alert">Candidate {entityId} is missing.</p>;
  }
  return (
    <CandidateEditor
      candidate={candidate}
      entityId={entityId}
      key={`${entityId}:${String(snapshot.project.revision)}`}
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
  const save = async () => {
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
        title="Candidate"
      >
        <label className="setta-workspace-inspector-config-row">
          <span className="setta-workspace-inspector-config-label">Name</span>
          <input
            className={`setta-workspace-inspector-config-input ${interaction}`}
            onChange={(event) => setName(event.currentTarget.value)}
            value={name}
          />
        </label>
        <label className="bench-inspector-stack">
          <span>Command arguments, one per line</span>
          <textarea
            className={interaction}
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
            onChange={(event) => setWorkingDirectory(event.currentTarget.value)}
            placeholder="project root"
            value={workingDirectory}
          />
        </label>
        <button
          className={`setta-workspace-inspector-primary-action ${interaction}`}
          disabled={pendingAction !== null}
          onClick={() => void save()}
          type="button"
        >
          Save candidate
        </button>
        {feedback === null ? null : <p role="status">{feedback}</p>}
      </WorkspaceInspectorSettingsGroup>
      <CandidateSource candidate={candidate} />
    </>
  );
}

function CandidateSource({ candidate }: { candidate: CandidateV1 }) {
  if (candidate.origin === null) return null;
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
