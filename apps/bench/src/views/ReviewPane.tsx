import {
  NO_DRAG_CLASS_NAME,
  NO_PAN_CLASS_NAME,
  WorkspaceInspectorSettingsGroup,
} from "@setta/workspace";
import { useState } from "react";

import { useBench, type BenchSelection } from "../app/benchContext";
import {
  findReviewForRunPair,
  findRun,
  terminalRuns,
} from "../app/benchSelection";
import type {
  PutReviewRequestV1,
  ReviewV1,
  RunV1,
} from "../backend/generatedContract";

const INTERACTION_CLASS = `${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME}`;

export function ReviewPane() {
  const { pendingAction, selection, snapshot } = useBench();
  const terminal = terminalRuns(snapshot);
  const left = findRun(snapshot, selection.comparedRunIds[0]);
  const right = findRun(snapshot, selection.comparedRunIds[1]);
  const storedReview = findReviewForRunPair(
    snapshot,
    selection.comparedRunIds[0],
    selection.comparedRunIds[1],
  );
  return (
    <div className="bench-pane bench-review-pane">
      <RunSelectors
        left={left}
        right={right}
        selectComparedRun={selection.selectComparedRun}
        terminal={terminal}
      />
      <ReviewEditor
        key={reviewEditorKey(left, right, storedReview)}
        left={left}
        pendingAction={pendingAction}
        right={right}
        storedReview={storedReview}
      />
    </div>
  );
}

function reviewEditorKey(
  left: RunV1 | null,
  right: RunV1 | null,
  storedReview: ReviewV1 | null,
): string {
  return JSON.stringify([
    left?.id ?? null,
    right?.id ?? null,
    storedReview?.updatedAt ?? null,
  ]);
}

function RunSelectors({
  left,
  right,
  selectComparedRun,
  terminal,
}: {
  left: RunV1 | null;
  right: RunV1 | null;
  selectComparedRun: BenchSelection["selectComparedRun"];
  terminal: ReadonlyArray<RunV1>;
}) {
  return (
    <WorkspaceInspectorSettingsGroup title="Runs">
      <RunSelector
        excludedRunId={right?.id ?? null}
        label="Left"
        onSelect={(runId) => selectComparedRun("left", runId)}
        run={left}
        terminal={terminal}
      />
      <RunSelector
        excludedRunId={left?.id ?? null}
        label="Right"
        onSelect={(runId) => selectComparedRun("right", runId)}
        run={right}
        terminal={terminal}
      />
    </WorkspaceInspectorSettingsGroup>
  );
}

function RunSelector({
  excludedRunId,
  label,
  onSelect,
  run,
  terminal,
}: {
  excludedRunId: string | null;
  label: "Left" | "Right";
  onSelect: (runId: string) => void;
  run: RunV1 | null;
  terminal: ReadonlyArray<RunV1>;
}) {
  return (
    <label className="setta-workspace-inspector-config-row">
      <span className="setta-workspace-inspector-config-label">{label}</span>
      <select
        aria-label={`${label} comparison run`}
        className={`setta-workspace-inspector-config-input ${INTERACTION_CLASS}`}
        onChange={(event) => onSelect(event.currentTarget.value)}
        value={run?.id ?? ""}
      >
        <option disabled value="">
          Select a run
        </option>
        {terminal
          .filter((candidate) => candidate.id !== excludedRunId)
          .map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.candidateName} · {candidate.id}
            </option>
          ))}
      </select>
    </label>
  );
}

function ReviewEditor({
  left,
  pendingAction,
  right,
  storedReview,
}: {
  left: RunV1 | null;
  pendingAction: string | null;
  right: RunV1 | null;
  storedReview: ReviewV1 | null;
}) {
  const { actions } = useBench();
  const [preferredRunId, setPreferredRunId] = useState<string | null>(
    storedReview?.preferredRunId ?? null,
  );
  const [note, setNote] = useState(storedReview?.note ?? "");
  const [feedback, setFeedback] = useState<string | null>(null);
  const save = async () => {
    const input = reviewInput(left, right, storedReview, preferredRunId, note);
    if (input === null) {
      setFeedback("Select two terminal runs first.");
      return;
    }
    const saved = await actions.saveReview(input);
    setFeedback(saved ? "Review saved." : "Review was not saved.");
  };
  return (
    <WorkspaceInspectorSettingsGroup
      status={storedReview === null ? "not saved" : "saved"}
      title="Preference"
    >
      <PreferenceOptions
        left={left}
        preferredRunId={preferredRunId}
        right={right}
        setPreferredRunId={setPreferredRunId}
      />
      <label className="bench-inspector-stack">
        <span>Note</span>
        <textarea
          className={INTERACTION_CLASS}
          maxLength={4_000}
          onChange={(event) => setNote(event.currentTarget.value)}
          rows={5}
          value={note}
        />
      </label>
      <button
        className={`setta-workspace-inspector-primary-action ${INTERACTION_CLASS}`}
        disabled={reviewSaveDisabled(left, right, pendingAction)}
        onClick={() => void save()}
        type="button"
      >
        Save review
      </button>
      {feedback === null ? null : <p role="status">{feedback}</p>}
    </WorkspaceInspectorSettingsGroup>
  );
}

function reviewInput(
  left: RunV1 | null,
  right: RunV1 | null,
  storedReview: ReviewV1 | null,
  preferredRunId: string | null,
  note: string,
): PutReviewRequestV1 | null {
  if (left === null || right === null) return null;
  return {
    leftRunId: storedReview?.leftRunId ?? left.id,
    note,
    preferredRunId,
    rightRunId: storedReview?.rightRunId ?? right.id,
  };
}

function reviewSaveDisabled(
  left: RunV1 | null,
  right: RunV1 | null,
  pendingAction: string | null,
): boolean {
  return left === null || right === null || pendingAction !== null;
}

function PreferenceOptions({
  left,
  preferredRunId,
  right,
  setPreferredRunId,
}: {
  left: RunV1 | null;
  preferredRunId: string | null;
  right: RunV1 | null;
  setPreferredRunId: (runId: string | null) => void;
}) {
  return (
    <div className="bench-preference-options">
      <RunPreference
        fallbackLabel="Left run"
        preferredRunId={preferredRunId}
        run={left}
        setPreferredRunId={setPreferredRunId}
      />
      <RunPreference
        fallbackLabel="Right run"
        preferredRunId={preferredRunId}
        run={right}
        setPreferredRunId={setPreferredRunId}
      />
      <label>
        <input
          checked={preferredRunId === null}
          name="bench-preference"
          onChange={() => setPreferredRunId(null)}
          type="radio"
        />
        <span>No preference</span>
      </label>
    </div>
  );
}

function RunPreference({
  fallbackLabel,
  preferredRunId,
  run,
  setPreferredRunId,
}: {
  fallbackLabel: string;
  preferredRunId: string | null;
  run: RunV1 | null;
  setPreferredRunId: (runId: string | null) => void;
}) {
  const runId = run?.id ?? null;
  return (
    <label>
      <input
        checked={runId !== null && preferredRunId === runId}
        disabled={run === null}
        name="bench-preference"
        onChange={() => setPreferredRunId(runId)}
        type="radio"
      />
      <span>{run?.candidateName ?? fallbackLabel}</span>
    </label>
  );
}
