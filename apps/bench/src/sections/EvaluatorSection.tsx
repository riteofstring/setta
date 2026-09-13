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
import type { CheckV1 } from "../backend/generatedContract";
import { readBenchSectionData } from "./sectionData";

export function EvaluatorSummary({ section }: { section: WorkspaceSection }) {
  const { snapshot } = useBench();
  const { entityId } = readBenchSectionData(section.data);
  const evaluator = snapshot.project.evaluator;
  if (evaluator === null || evaluator.id !== entityId) {
    return <p className="bench-card-error">Shared checks are missing.</p>;
  }
  return (
    <div className="bench-section-intro">
      <div className="bench-card-stage">
        <span>3 · Checks</span>
        <strong>{String(evaluator.checks.length)} shared rules</strong>
      </div>
      <p className="bench-card-explanation">
        Every candidate result is tested against the same rules. Each rule names
        the output artifact it expects.
      </p>
    </div>
  );
}

export function EvaluatorSection({ section }: { section: WorkspaceSection }) {
  const { actions, pendingAction, snapshot } = useBench();
  const itemTree = section.itemTree;
  if (itemTree === undefined) {
    return <p className="bench-card-error">Shared checks are unavailable.</p>;
  }
  const topLevelItemIds = itemTree.items[itemTree.rootId]?.children ?? [];
  const ready = snapshot.validation.ready;
  const interaction = `${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME}`;
  return (
    <div className="bench-evaluator-content">
      <ItemDndContext>
        <WorkspaceItemList
          listKey={`bench-checks:${section.id}`}
          sectionId={section.id}
          topLevelItemIds={topLevelItemIds}
        />
      </ItemDndContext>
      <div className="bench-card-launch">
        <button
          className={`setta-workspace-inspector-primary-action ${interaction}`}
          disabled={!ready || pendingAction !== null}
          onClick={() => void actions.launch()}
          type="button"
        >
          {pendingAction === "launch" ? "Starting…" : "Run comparison"}
        </button>
        <span>
          {ready
            ? `${String(snapshot.validation.caseCount)} inputs × ${String(snapshot.project.candidates.length)} candidates = ${String(snapshot.validation.executionCount)} executions`
            : "Resolve the setup issues before running."}
        </span>
      </div>
    </div>
  );
}

function CheckEditor({ check }: { check: CheckV1 }) {
  const { actions, pendingAction, snapshot } = useBench();
  const [artifactName, setArtifactName] = useState(check.artifactName);
  const [first, setFirst] = useState("");
  const [second, setSecond] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  useEffect(() => {
    setArtifactName(check.artifactName);
    setFirst(
      String(
        check.kind === "artifact_max_bytes"
          ? (check.maximumBytes ?? "")
          : (check.width ?? ""),
      ),
    );
    setSecond(
      check.kind === "image_dimensions" ? String(check.height ?? "") : "",
    );
    setFeedback(null);
  }, [
    check.height,
    check.id,
    check.kind,
    check.artifactName,
    check.maximumBytes,
    check.width,
    snapshot.project.revision,
  ]);
  const interaction = `${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME}`;
  const save = async () => {
    const nextArtifactName = artifactName.trim();
    const firstNumber = Number(first);
    const secondNumber = Number(second);
    if (
      nextArtifactName === "" ||
      !Number.isSafeInteger(firstNumber) ||
      firstNumber <= 0 ||
      (check.kind === "image_dimensions" &&
        (!Number.isSafeInteger(secondNumber) || secondNumber <= 0))
    ) {
      setFeedback(
        nextArtifactName === ""
          ? "An output artifact name is required."
          : "Check values must be positive whole numbers.",
      );
      return;
    }
    const saved = await actions.replaceProject((project) => ({
      ...projectDraft(project),
      evaluator:
        project.evaluator === null
          ? null
          : {
              ...project.evaluator,
              checks: project.evaluator.checks.map((entry) =>
                entry.id !== check.id
                  ? entry
                  : entry.kind === "artifact_max_bytes"
                    ? {
                        ...entry,
                        artifactName: nextArtifactName,
                        maximumBytes: firstNumber,
                      }
                    : {
                        ...entry,
                        artifactName: nextArtifactName,
                        height: secondNumber,
                        width: firstNumber,
                      },
              ),
            },
    }));
    setFeedback(saved ? "Check saved." : "Check was not saved.");
  };
  return (
    <WorkspaceInspectorSettingsGroup
      status={check.artifactName}
      title={check.name}
    >
      <label className="setta-workspace-inspector-config-row">
        <span className="setta-workspace-inspector-config-label">
          Output artifact
        </span>
        <input
          className={`setta-workspace-inspector-config-input ${interaction}`}
          onChange={(event) => setArtifactName(event.currentTarget.value)}
          value={artifactName}
        />
      </label>
      <label className="setta-workspace-inspector-config-row">
        <span className="setta-workspace-inspector-config-label">
          {check.kind === "artifact_max_bytes" ? "Maximum bytes" : "Width"}
        </span>
        <input
          className={`setta-workspace-inspector-config-input ${interaction}`}
          min={1}
          onChange={(event) => setFirst(event.currentTarget.value)}
          step={1}
          type="number"
          value={first}
        />
      </label>
      {check.kind === "image_dimensions" ? (
        <label className="setta-workspace-inspector-config-row">
          <span className="setta-workspace-inspector-config-label">Height</span>
          <input
            className={`setta-workspace-inspector-config-input ${interaction}`}
            min={1}
            onChange={(event) => setSecond(event.currentTarget.value)}
            step={1}
            type="number"
            value={second}
          />
        </label>
      ) : null}
      <button
        className={`setta-workspace-inspector-primary-action ${interaction}`}
        disabled={pendingAction !== null}
        onClick={() => void save()}
        type="button"
      >
        Save check
      </button>
      {feedback === null ? null : <p role="status">{feedback}</p>}
    </WorkspaceInspectorSettingsGroup>
  );
}

export function EvaluatorInspector({ data }: { data: unknown }) {
  const { snapshot } = useBench();
  const { entityId } = readBenchSectionData(data);
  const evaluator = snapshot.project.evaluator;
  if (evaluator === null || evaluator.id !== entityId) {
    return <p role="alert">Shared checks are missing.</p>;
  }
  return (
    <>
      <WorkspaceInspectorSettingsGroup title="How checks work">
        <p className="setta-workspace-inspector-help">
          Bench applies each rule to every case result independently. Checks
          record evidence; they do not choose a winning candidate.
        </p>
      </WorkspaceInspectorSettingsGroup>
      {evaluator.checks.map((check) => (
        <CheckEditor check={check} key={check.id} />
      ))}
    </>
  );
}
