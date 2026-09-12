import {
  NO_DRAG_CLASS_NAME,
  NO_PAN_CLASS_NAME,
  WorkspaceInspectorSettingsGroup,
  type WorkspaceSection,
} from "@setta/workspace";
import { useEffect, useState } from "react";

import { projectDraft, useBench } from "../app/benchContext";
import type { CheckV1 } from "../backend/generatedContract";
import { readBenchSectionData } from "./sectionData";

function checkSummary(check: CheckV1): string {
  if (check.kind === "artifact_max_bytes") {
    return check.maximumBytes === null
      ? "Maximum size"
      : `≤ ${formatBytes(check.maximumBytes)}`;
  }
  return `${String(check.width ?? "?")} × ${String(check.height ?? "?")}`;
}

function formatBytes(value: number): string {
  return value < 1_000
    ? `${String(value)} B`
    : `${Math.round(value / 1_000)} KB`;
}

export function EvaluatorSection({ section }: { section: WorkspaceSection }) {
  const { snapshot } = useBench();
  const { entityId } = readBenchSectionData(section.data);
  const evaluator = snapshot.project.evaluator;
  if (evaluator === null || evaluator.id !== entityId) {
    return <p className="bench-card-error">Shared checks are missing.</p>;
  }
  return (
    <div className="bench-card-content">
      <div className="bench-card-kind">Shared evaluator</div>
      <ul className="bench-check-list">
        {evaluator.checks.map((check) => (
          <li key={check.id}>
            <span>{check.name}</span>
            <strong>{checkSummary(check)}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CheckEditor({ check }: { check: CheckV1 }) {
  const { actions, pendingAction, snapshot } = useBench();
  const [first, setFirst] = useState("");
  const [second, setSecond] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  useEffect(() => {
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
    check.maximumBytes,
    check.width,
    snapshot.project.revision,
  ]);
  const interaction = `${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME}`;
  const save = async () => {
    const firstNumber = Number(first);
    const secondNumber = Number(second);
    if (
      !Number.isSafeInteger(firstNumber) ||
      firstNumber <= 0 ||
      (check.kind === "image_dimensions" &&
        (!Number.isSafeInteger(secondNumber) || secondNumber <= 0))
    ) {
      setFeedback("Check values must be positive whole numbers.");
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
                    ? { ...entry, maximumBytes: firstNumber }
                    : { ...entry, height: secondNumber, width: firstNumber },
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
      {evaluator.checks.map((check) => (
        <CheckEditor check={check} key={check.id} />
      ))}
    </>
  );
}
