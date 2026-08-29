import { type CSSProperties } from "react";
import { FiSquare } from "react-icons/fi";
import {
  type WorkspaceFloatingWindow,
  type WorkspaceWindowBoundaryInsets,
} from "./windowingTypes";

const EMPTY_BOUNDARY_INSETS: WorkspaceWindowBoundaryInsets = Object.freeze({
  bottom: 0,
  left: 0,
  right: 0,
  top: 0,
});

type WorkspaceMinimizedWindowStripProps = {
  readonly windows: readonly WorkspaceFloatingWindow[];
  readonly onRestore: (windowId: string) => void;
  readonly boundaryInsets?: WorkspaceWindowBoundaryInsets;
  readonly zIndex?: number;
};

function getRecoveryStripStyle(
  boundaryInsets: WorkspaceWindowBoundaryInsets,
  zIndex: number,
): CSSProperties {
  return {
    bottom: boundaryInsets.bottom,
    insetInlineEnd: boundaryInsets.right,
    insetInlineStart: boundaryInsets.left,
    pointerEvents: "auto",
    zIndex,
  };
}

/**
 * Package-private recovery chrome for minimized windows. The manager supplies
 * lifecycle changes; this strip deliberately only reports the requested id.
 */
export function WorkspaceMinimizedWindowStrip({
  boundaryInsets = EMPTY_BOUNDARY_INSETS,
  onRestore,
  windows,
  zIndex = 0,
}: WorkspaceMinimizedWindowStripProps) {
  const minimizedWindows = windows.filter(
    (window) => window.isMinimized && !window.isClosed,
  );
  if (minimizedWindows.length === 0) return null;

  return (
    <nav
      aria-label="Minimized windows"
      className="setta-workspace-minimized-window-strip"
      style={getRecoveryStripStyle(boundaryInsets, zIndex)}
      data-testid="workspace-minimized-window-strip"
      data-workspace-window-recovery-strip="true"
    >
      <div className="setta-workspace-minimized-window-strip-scroll">
        <div className="setta-workspace-minimized-window-strip-pills">
          {minimizedWindows.map((window) => {
            const label = `Restore ${window.title}`;
            return (
              <button
                key={window.id}
                type="button"
                aria-label={label}
                className="setta-workspace-minimized-window-strip-pill"
                title={label}
                data-testid="workspace-window-restore-pill"
                data-workspace-window-id={window.id}
                onClick={() => onRestore(window.id)}
              >
                <FiSquare
                  aria-hidden="true"
                  className="setta-workspace-minimized-window-strip-icon"
                  size={13}
                />
                <span className="setta-workspace-minimized-window-strip-title">
                  {window.title}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
