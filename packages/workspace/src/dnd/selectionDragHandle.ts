import { signal } from "@dnd-kit/state";
import { assertWorkspaceHostActive } from "../workspaceHostInternals";
import type { WorkspaceHost } from "../workspaceHost";

type SelectionDragHandleState = {
  handle: { value: Element | null };
  primaryId: { value: string | null };
};

const statesByHost = new WeakMap<WorkspaceHost, SelectionDragHandleState>();

function getSelectionDragHandleState(
  host: WorkspaceHost,
): SelectionDragHandleState {
  assertWorkspaceHostActive(host);
  const existing = statesByHost.get(host);
  if (existing) {
    return existing;
  }
  const state = {
    handle: signal<Element | null>(null),
    primaryId: signal<string | null>(null),
  };
  statesByHost.set(host, state);
  return state;
}

export function getSelectionDragHandle(host: WorkspaceHost) {
  return getSelectionDragHandleState(host).handle;
}

export function getSelectionDragPrimaryId(host: WorkspaceHost) {
  return getSelectionDragHandleState(host).primaryId;
}

export function setSelectionDragHandle(
  host: WorkspaceHost,
  element: Element | null,
) {
  getSelectionDragHandleState(host).handle.value = element;
}

export function setSelectionDragPrimaryId(
  host: WorkspaceHost,
  sectionId: string | null,
) {
  getSelectionDragHandleState(host).primaryId.value = sectionId;
}
