import { useEffect, type RefObject } from "react";

import {
  directorGraphDevNodeCounts,
  directorGraphDevSpeeds,
  directorGraphDevThreadCounts,
  type DirectorGraphDevNodeCount,
  type DirectorGraphDevSpeed,
  type DirectorGraphDevThreadCount,
} from "./director-graph-dev-simulation";

export const directorGraphDevPanelId = "director-graph-dev-panel";
export const directorGraphDevShortcut = "Meta+Shift+G Control+Shift+G";

function isDirectorGraphDevShortcut(event: KeyboardEvent): boolean {
  return event.shiftKey && event.key.toLowerCase() === "g" && (event.metaKey || event.ctrlKey);
}

function directorGraphDevPanelKeyAction(event: KeyboardEvent, open: boolean): boolean | null {
  if (isDirectorGraphDevShortcut(event)) {
    return event.repeat ? null : !open;
  }
  return event.key === "Escape" && open ? false : null;
}

export function DirectorGraphDevPanel({
  description,
  directorEdgeDisturbance,
  nodeCount,
  onOpenChange,
  onSelectNodeCount,
  onSelectSpeed,
  onSelectThreadCount,
  onToggleDirectorEdgeDisturbance,
  open,
  speed,
  threadCount,
  triggerRef,
}: {
  description: string;
  directorEdgeDisturbance: boolean;
  nodeCount: DirectorGraphDevNodeCount;
  onOpenChange: (open: boolean) => void;
  onSelectNodeCount: (nodeCount: DirectorGraphDevNodeCount) => void;
  onSelectSpeed: (speed: DirectorGraphDevSpeed) => void;
  onSelectThreadCount: (threadCount: DirectorGraphDevThreadCount | null) => void;
  onToggleDirectorEdgeDisturbance: (enabled: boolean) => void;
  open: boolean;
  speed: DirectorGraphDevSpeed;
  threadCount: DirectorGraphDevThreadCount | null;
  triggerRef: RefObject<HTMLButtonElement | null>;
}): React.JSX.Element {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      const nextOpen = directorGraphDevPanelKeyAction(event, open);
      if (nextOpen === null) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      onOpenChange(nextOpen);
      triggerRef.current?.focus({ preventScroll: true });
    };
    globalThis.window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => {
      globalThis.window.removeEventListener("keydown", handleKeyDown, { capture: true });
    };
  }, [onOpenChange, open, triggerRef]);

  return (
    <aside
      aria-hidden={!open}
      aria-labelledby="director-graph-dev-heading"
      className="director-graph-dev-panel"
      data-open={open}
      id={directorGraphDevPanelId}
      inert={!open || undefined}
      onWheel={(event) => event.stopPropagation()}
    >
      <header className="director-graph-dev-header">
        <div>
          <p className="director-graph-dev-kicker">Development preview</p>
          <h2 id="director-graph-dev-heading">Graph simulator</h2>
        </div>
        <span className="director-graph-dev-badge">Dev only</span>
      </header>

      <p className="director-graph-dev-copy">
        Run a continuous production-layout demo without changing conversations.
      </p>

      <div className="director-graph-dev-live">
        <button
          aria-pressed={threadCount === null}
          className="director-graph-dev-live-button"
          onClick={() => onSelectThreadCount(null)}
          type="button"
        >
          Use live data
        </button>
        <span>Restore the connected runtime.</span>
      </div>

      <fieldset className="director-graph-dev-counts">
        <legend>Simulated threads</legend>
        <div className="director-graph-dev-count-grid">
          {directorGraphDevThreadCounts.map((count) => (
            <button
              aria-label={`Simulate ${count} threads`}
              aria-pressed={threadCount === count}
              key={count}
              onClick={() => onSelectThreadCount(count)}
              type="button"
            >
              {count}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="director-graph-dev-counts" disabled={threadCount === null}>
        <legend>Nodes per thread</legend>
        <p className="director-graph-dev-count-help">Director and every side thread.</p>
        <div className="director-graph-dev-count-grid">
          {directorGraphDevNodeCounts.map((count) => (
            <button
              aria-label={`Simulate ${count} nodes in the Director and every side thread`}
              aria-pressed={threadCount !== null && nodeCount === count}
              key={count}
              onClick={() => onSelectNodeCount(count)}
              type="button"
            >
              {count}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="director-graph-dev-speed" disabled={threadCount === null}>
        <legend>Demo speed</legend>
        <div className="director-graph-dev-speed-control">
          <label htmlFor="director-graph-dev-speed">Playback rate</label>
          <output aria-hidden="true" htmlFor="director-graph-dev-speed">
            {speed === 0 ? "Paused" : `${speed}×`}
          </output>
          <input
            aria-describedby="director-graph-dev-speed-help"
            aria-valuetext={speed === 0 ? "Paused" : `${speed} times speed`}
            id="director-graph-dev-speed"
            max={directorGraphDevSpeeds.length - 1}
            min={0}
            onChange={(event) => {
              const next = directorGraphDevSpeeds[Number(event.currentTarget.value)];
              if (next !== undefined) {
                onSelectSpeed(next);
              }
            }}
            step={1}
            type="range"
            value={directorGraphDevSpeeds.indexOf(speed)}
          />
        </div>
        <p id="director-graph-dev-speed-help">
          Slow settings model long-running work. Move to 0 to pause.
        </p>
      </fieldset>

      <fieldset className="director-graph-dev-effect">
        <legend>Scroll edge effect</legend>
        <label className="director-graph-dev-effect-control">
          <input
            checked={directorEdgeDisturbance}
            onChange={(event) => onToggleDirectorEdgeDisturbance(event.currentTarget.checked)}
            type="checkbox"
          />
          <span>
            <strong>Director particle wake</strong>
            <small>
              Briefly accelerates only Director particles as elastic scrolling springs back.
              Reduced-motion mode keeps it off.
            </small>
          </span>
        </label>
      </fieldset>

      <p className="director-graph-dev-status" role="status">
        {description}
      </p>
      <p className="director-graph-dev-shortcut">
        Toggle with <kbd>⌘/Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>G</kbd>
      </p>
    </aside>
  );
}
