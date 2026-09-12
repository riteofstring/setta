import {
  NO_DRAG_CLASS_NAME,
  NO_PAN_CLASS_NAME,
  WorkspaceInspectorSettingsGroup,
  type WorkspaceSection,
} from "@setta/workspace";
import { useEffect, useState } from "react";

import { projectDraft, useBench } from "../app/benchContext";
import { readBenchSectionData } from "./sectionData";

export function CaseSetSection({ section }: { section: WorkspaceSection }) {
  const { snapshot } = useBench();
  const { entityId } = readBenchSectionData(section.data);
  const caseSet = snapshot.project.caseSet;
  if (caseSet.id !== entityId) {
    return <p className="bench-card-error">Case set {entityId} is missing.</p>;
  }
  return (
    <div className="bench-card-content">
      <div className="bench-card-kind">Case set</div>
      <dl className="bench-card-facts">
        <div>
          <dt>Manifest</dt>
          <dd title={caseSet.manifest}>{caseSet.manifest}</dd>
        </div>
        <div>
          <dt>Cases</dt>
          <dd>
            {snapshot.validation.ready
              ? snapshot.validation.caseCount
              : "manifest unavailable"}
          </dd>
        </div>
      </dl>
    </div>
  );
}

export function CaseSetInspector({ data }: { data: unknown }) {
  const { actions, pendingAction, snapshot } = useBench();
  const { entityId } = readBenchSectionData(data);
  const caseSet = snapshot.project.caseSet;
  const [name, setName] = useState(caseSet.name);
  const [manifest, setManifest] = useState(caseSet.manifest);
  const [feedback, setFeedback] = useState<string | null>(null);
  useEffect(() => {
    setName(caseSet.name);
    setManifest(caseSet.manifest);
    setFeedback(null);
  }, [caseSet.id, caseSet.manifest, caseSet.name, snapshot.project.revision]);
  if (caseSet.id !== entityId) {
    return <p role="alert">Case set {entityId} is missing.</p>;
  }
  const interaction = `${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME}`;
  const save = async () => {
    const nextName = name.trim();
    const nextManifest = manifest.trim();
    if (nextName === "" || nextManifest === "") {
      setFeedback("Name and manifest are required.");
      return;
    }
    const saved = await actions.replaceProject((project) => ({
      ...projectDraft(project),
      caseSet: { ...project.caseSet, manifest: nextManifest, name: nextName },
    }));
    setFeedback(saved ? "Case set saved." : "Case set was not saved.");
  };
  return (
    <WorkspaceInspectorSettingsGroup status="JSONL" title="Case set">
      <label className="setta-workspace-inspector-config-row">
        <span className="setta-workspace-inspector-config-label">Name</span>
        <input
          className={`setta-workspace-inspector-config-input ${interaction}`}
          onChange={(event) => setName(event.currentTarget.value)}
          value={name}
        />
      </label>
      <label className="setta-workspace-inspector-config-row">
        <span className="setta-workspace-inspector-config-label">Manifest</span>
        <input
          className={`setta-workspace-inspector-config-input ${interaction}`}
          onChange={(event) => setManifest(event.currentTarget.value)}
          value={manifest}
        />
      </label>
      <button
        className={`setta-workspace-inspector-primary-action ${interaction}`}
        disabled={pendingAction !== null}
        onClick={() => void save()}
        type="button"
      >
        Save case set
      </button>
      {feedback === null ? null : <p role="status">{feedback}</p>}
    </WorkspaceInspectorSettingsGroup>
  );
}
