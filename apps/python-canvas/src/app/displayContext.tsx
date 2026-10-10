import { createContext, useContext } from "react";
import type { DisplayState } from "./displayRuntime";

export type DisplayContextValue = {
  enabled: boolean;
  state: DisplayState;
  run: () => void;
};

export const DisplayContext = createContext<DisplayContextValue | null>(null);
export const useDisplay = () => useContext(DisplayContext);

export function DisplayToolbar() {
  const display = useDisplay();
  if (!display?.enabled) return null;
  return (
    <div className="python-canvas-experiment-toolbar">
      <DisplayRunButton />
      <DisplayRunStatus />
    </div>
  );
}

export function DisplayRunButton({ compact = false }: { compact?: boolean }) {
  const display = useDisplay();
  if (!display?.enabled) return null;
  return (
    <button
      type="button"
      className={`nodrag nopan python-canvas-experiment-run ${compact ? "is-compact" : ""}`}
      onClick={display.run}
      disabled={display.state.busy}
      data-run-experiment
    >
      <span aria-hidden="true">{display.state.busy ? "◌" : "▶"}</span>
      {display.state.busy ? "Running…" : compact ? "Run" : "Run experiment"}
    </button>
  );
}

export function DisplayRunStatus() {
  const display = useDisplay();
  if (!display?.enabled) return null;
  const { state } = display;
  const hasResults = Object.keys(state.panels).length > 0;
  const stale = Object.values(state.panels).some(
    (item) => item.revision !== state.currentRevision,
  );
  return (
    <div className="python-canvas-run-status" aria-live="polite">
      <p>
        {state.busy
          ? "Calculating your experiment…"
          : (state.error ??
            (stale
              ? "Inputs changed. Run to update the results."
              : hasResults
                ? "Results ready. Change an ingredient and try again."
                : "Ready when you are. Run to fill the canvas."))}
      </p>
      {state.warnings.map((warning) => (
        <p key={warning}>{warning}</p>
      ))}
      {state.log && (
        <details>
          <summary>Run details</summary>
          <pre>{state.log}</pre>
        </details>
      )}
    </div>
  );
}
