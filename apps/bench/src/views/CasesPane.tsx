import { useMemo, useState } from "react";

import { useBench } from "../app/benchContext";
import { alignedCaseResults, findRun } from "../app/benchSelection";

export function CasesPane() {
  const { selection, snapshot } = useBench();
  const [differencesOnly, setDifferencesOnly] = useState(false);
  const left = findRun(snapshot, selection.comparedRunIds[0]);
  const right = findRun(snapshot, selection.comparedRunIds[1]);
  const cases = useMemo(() => alignedCaseResults(left, right), [left, right]);
  const visible = differencesOnly
    ? cases.filter((entry) => entry.differs)
    : cases;
  return (
    <div className="bench-pane">
      <div className="bench-pane-heading">
        <span>Aligned cases</span>
        <strong>{cases.length}</strong>
      </div>
      <label className="bench-pane-toggle">
        <input
          checked={differencesOnly}
          onChange={(event) => setDifferencesOnly(event.currentTarget.checked)}
          type="checkbox"
        />
        <span>Differences only</span>
        <strong>{cases.filter((entry) => entry.differs).length}</strong>
      </label>
      {left === null || right === null ? (
        <p className="bench-pane-empty">
          Select two terminal runs in Review to compare them.
        </p>
      ) : (
        <div className="bench-case-buttons">
          {visible.map((entry) => (
            <button
              aria-pressed={selection.activeCaseId === entry.caseId}
              key={entry.caseId}
              onClick={() => selection.selectCase(entry.caseId)}
              type="button"
            >
              <span>{entry.caseName}</span>
              <small>{entry.differs ? "different" : "same"}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
