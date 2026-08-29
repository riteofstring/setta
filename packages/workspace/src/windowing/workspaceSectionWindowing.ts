import { isGroupSection } from "../document/documentSelectors";
import { getRegisteredSectionKindOrThrow } from "../document/sectionKindRegistry";
import type { WorkspaceDocument, WorkspaceSection } from "../document/types";
import type { WorkspaceHost } from "../workspaceHost";
import { focusWorkspaceWindow, reopenWorkspaceWindow } from "./windowingState";
import {
  createWorkspaceWindowingState,
  type WorkspaceFloatingWindow,
  type WorkspaceWindowingState,
} from "./windowingTypes";

const WORKSPACE_SECTION_WINDOW_ID_PREFIX = "workspace-section-window:";
const WORKSPACE_SECTION_CONTENT_ID_PREFIX = "workspace-section:";

export function getWorkspaceSectionWindowBinding(
  state: WorkspaceWindowingState,
  sectionId: string,
): WorkspaceFloatingWindow | null {
  return (
    state.windows.find((candidate) => candidate.sectionId === sectionId) ?? null
  );
}

export function getExternalWorkspaceSectionWindowBinding(
  state: WorkspaceWindowingState,
  sectionId: string,
): WorkspaceFloatingWindow | null {
  const binding = getWorkspaceSectionWindowBinding(state, sectionId);
  return binding?.placement === "canvas_section" ? null : binding;
}

export function createWorkspaceSectionWindowContentId(
  sectionId: string,
): string {
  return `${WORKSPACE_SECTION_CONTENT_ID_PREFIX}${sectionId}`;
}

export function allocateWorkspaceSectionWindowId(
  state: WorkspaceWindowingState,
  sectionId: string,
): string {
  const baseId = `${WORKSPACE_SECTION_WINDOW_ID_PREFIX}${sectionId}`;
  const usedIds = new Set(state.windows.map((window) => window.id));
  if (!usedIds.has(baseId)) return baseId;
  let suffix = 2;
  while (usedIds.has(`${baseId}-${suffix}`)) suffix += 1;
  return `${baseId}-${suffix}`;
}

export function focusOrReopenWorkspaceWindow(
  state: WorkspaceWindowingState,
  windowId: string,
): WorkspaceWindowingState {
  const window = state.windows.find((candidate) => candidate.id === windowId);
  if (window?.isClosed || window?.isMinimized) {
    return reopenWorkspaceWindow(state, windowId);
  }
  return focusWorkspaceWindow(state, windowId);
}

export function canWorkspaceSectionOpenInWindow(
  host: WorkspaceHost,
  section: WorkspaceSection,
): boolean {
  if (isGroupSection(section)) return false;
  return (
    getRegisteredSectionKindOrThrow(host, section.kind).presentation?.type !==
    "meta-control"
  );
}

/** Drops stale or newly ineligible section bindings in one controlled publication. */
export function reconcileWorkspaceSectionWindowBindings(
  host: WorkspaceHost,
  document: Pick<WorkspaceDocument, "sections">,
  state: WorkspaceWindowingState,
): WorkspaceWindowingState {
  let changed = false;
  const windows: WorkspaceFloatingWindow[] = [];
  for (const window of state.windows) {
    if (window.sectionId === null) {
      windows.push(window);
      continue;
    }
    const section = document.sections[window.sectionId];
    if (!section || !canWorkspaceSectionOpenInWindow(host, section)) {
      changed = true;
      continue;
    }
    if (window.title !== section.name) {
      changed = true;
      windows.push({ ...window, title: section.name });
      continue;
    }
    windows.push(window);
  }
  return changed
    ? createWorkspaceWindowingState({
        windows,
        nextFocusOrder: state.nextFocusOrder,
      })
    : state;
}
