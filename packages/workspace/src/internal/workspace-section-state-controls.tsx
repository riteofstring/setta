import type { MouseEvent, RefObject } from "react";

import type { WorkspaceActionResult, WorkspaceSection } from "../core.js";
import type { ResolvedSectionDefinition } from "./workspace-section-registry.js";

export type WorkspaceSectionStateControlsProps = Readonly<{
  definition: ResolvedSectionDefinition<unknown>;
  layoutEditable: boolean;
  lockControlRef: RefObject<HTMLButtonElement | null>;
  minimizeControlRef: RefObject<HTMLButtonElement | null>;
  minimizeTargetIds: string;
  onLockedCommit(sectionId: string, locked: boolean): WorkspaceActionResult;
  onMinimizedCommit(sectionId: string, isMinimized: boolean): WorkspaceActionResult;
  presentationEditable: boolean;
  section: WorkspaceSection<unknown>;
}>;

// State-control icons rerender with their frame on every selection commit,
// so each variant is a module constant whose stable element identity lets
// React bail out of the SVG subtree.
function lockIcon(locked: boolean) {
  return (
    <svg
      aria-hidden="true"
      className="setta-workspace__section-action-icon"
      fill="none"
      focusable="false"
      viewBox="0 0 20 20"
    >
      <rect height="8" rx="1.5" width="11" x="4.5" y="9" />
      <path d={locked ? "M7 9V6.5a3 3 0 0 1 6 0V9" : "M13 9V6.5a3 3 0 0 0-5.7-1.3"} />
      <path d="M10 12v2" />
    </svg>
  );
}

const lockedLockIcon = lockIcon(true);
const unlockedLockIcon = lockIcon(false);

function LockIcon({ locked }: Readonly<{ locked: boolean }>) {
  return locked ? lockedLockIcon : unlockedLockIcon;
}

function minimizeIcon(minimized: boolean) {
  return (
    <svg
      aria-hidden="true"
      className="setta-workspace__section-action-icon"
      fill="none"
      focusable="false"
      viewBox="0 0 20 20"
    >
      <path d={minimized ? "m6.5 11.5 3.5-3 3.5 3" : "m6.5 8.5 3.5 3 3.5-3"} />
    </svg>
  );
}

const minimizedMinimizeIcon = minimizeIcon(true);
const expandedMinimizeIcon = minimizeIcon(false);

function MinimizeIcon({ minimized }: Readonly<{ minimized: boolean }>) {
  return minimized ? minimizedMinimizeIcon : expandedMinimizeIcon;
}

function stopNodeSelection(event: MouseEvent<HTMLButtonElement>): void {
  event.stopPropagation();
}

export function WorkspaceSectionStateControls({
  definition,
  layoutEditable,
  lockControlRef,
  minimizeControlRef,
  minimizeTargetIds,
  onLockedCommit,
  onMinimizedCommit,
  presentationEditable,
  section,
}: WorkspaceSectionStateControlsProps) {
  const locked = section.positionAndSizeLocked;
  const minimized = section.isMinimized;
  return (
    <>
      <button
        aria-label={`${locked ? "Unlock" : "Lock"} ${section.title}`}
        aria-pressed={locked}
        className="setta-workspace__section-edit-control setta-workspace__section-state-control"
        data-workspace-section-state-control="lock"
        disabled={!layoutEditable}
        onClick={(event) => {
          stopNodeSelection(event);
          onLockedCommit(section.id, !locked);
        }}
        ref={lockControlRef}
        type="button"
      >
        <LockIcon locked={locked} />
      </button>
      {definition.minimizable ? (
        <button
          aria-controls={minimizeTargetIds}
          aria-expanded={!minimized}
          aria-label={`${minimized ? "Expand" : "Minimize"} ${section.title}${definition.minimizeScope === "subtree" ? " and descendant sections" : ""}`}
          className="setta-workspace__section-edit-control setta-workspace__section-state-control"
          data-workspace-section-state-control="minimize"
          disabled={!presentationEditable}
          onClick={(event) => {
            stopNodeSelection(event);
            onMinimizedCommit(section.id, !minimized);
          }}
          ref={minimizeControlRef}
          type="button"
        >
          <MinimizeIcon minimized={minimized} />
        </button>
      ) : null}
    </>
  );
}
