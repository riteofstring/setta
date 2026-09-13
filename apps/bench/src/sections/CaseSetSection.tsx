import {
  ItemDndContext,
  NO_DRAG_CLASS_NAME,
  NO_PAN_CLASS_NAME,
  WorkspaceInspectorSettingsGroup,
  WorkspaceItemList,
  type WorkspaceSection,
} from "@setta/workspace";
import { useEffect, useState } from "react";

import { projectDraft, useBench } from "../app/benchContext";
import { readBenchSectionData } from "./sectionData";

function caseSetIssue(
  snapshot: ReturnType<typeof useBench>["snapshot"],
): string | null {
  return (
    snapshot.validation.issues.find((issue) =>
      issue.path.startsWith("project.caseSet"),
    )?.message ?? null
  );
}

export function CaseSetSummary({ section }: { section: WorkspaceSection }) {
  const { snapshot } = useBench();
  const { entityId } = readBenchSectionData(section.data);
  const caseSet = snapshot.project.caseSet;
  if (caseSet.id !== entityId) {
    return <p className="bench-card-error">Case set {entityId} is missing.</p>;
  }
  const issue = caseSetIssue(snapshot);
  return (
    <div className="bench-section-intro">
      <div className="bench-card-stage">
        <span>1 · Inputs</span>
        <strong>
          {issue === null
            ? `${String(snapshot.cases.length)} input cases`
            : "Needs attention"}
        </strong>
      </div>
      <p className="bench-card-explanation">
        Each named JSON value below is sent to every candidate. Expected values
        are reference data; shared checks decide pass or fail.
      </p>
      {issue === null ? null : <p className="bench-card-error">{issue}</p>}
    </div>
  );
}

export function CaseSetSection({ section }: { section: WorkspaceSection }) {
  const itemTree = section.itemTree;
  if (itemTree === undefined) {
    return <p className="bench-card-error">Input cases are unavailable.</p>;
  }
  const topLevelItemIds = itemTree.items[itemTree.rootId]?.children ?? [];
  if (topLevelItemIds.length === 0) {
    return <p className="bench-card-empty">No input cases could be loaded.</p>;
  }
  return (
    <ItemDndContext>
      <WorkspaceItemList
        listKey={`bench-inputs:${section.id}`}
        sectionId={section.id}
        topLevelItemIds={topLevelItemIds}
      />
    </ItemDndContext>
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
    <WorkspaceInspectorSettingsGroup
      status={`${String(snapshot.cases.length)} inputs`}
      title="Input source"
    >
      <p className="setta-workspace-inspector-help">
        Bench loads one named JSON object per line, then shows the parsed input
        and expected value in the section.
      </p>
      <label className="setta-workspace-inspector-config-row">
        <span className="setta-workspace-inspector-config-label">Name</span>
        <input
          className={`setta-workspace-inspector-config-input ${interaction}`}
          onChange={(event) => setName(event.currentTarget.value)}
          value={name}
        />
      </label>
      <label className="setta-workspace-inspector-config-row">
        <span className="setta-workspace-inspector-config-label">
          JSONL case file
        </span>
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
        Save input source
      </button>
      {feedback === null ? null : <p role="status">{feedback}</p>}
    </WorkspaceInspectorSettingsGroup>
  );
}
