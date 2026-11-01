import { assertWorkspaceHostActive } from "../workspaceHostInternals.js";
import type { WorkspaceHost } from "../workspaceHost.js";

type SortingOverState = {
  overId: string | null;
  pastHalfway: boolean | null;
};

const sortingOverStatesByHost = new WeakMap<
  WorkspaceHost,
  Record<string, SortingOverState>
>();

function getSortingOverStateByContainer(host: WorkspaceHost) {
  assertWorkspaceHostActive(host);
  const existing = sortingOverStatesByHost.get(host);
  if (existing) {
    return existing;
  }
  const state: Record<string, SortingOverState> = {};
  sortingOverStatesByHost.set(host, state);
  return state;
}

export function setSortingOverState(
  host: WorkspaceHost,
  containerId: string,
  overId: string | null,
  pastHalfway: boolean | null,
): void {
  getSortingOverStateByContainer(host)[containerId] = { overId, pastHalfway };
}

export function clearSortingOverState(
  host: WorkspaceHost,
  containerId: string,
): void {
  delete getSortingOverStateByContainer(host)[containerId];
}

export function resetSortingOverState(host: WorkspaceHost): void {
  const state = getSortingOverStateByContainer(host);
  for (const key of Object.keys(state)) {
    delete state[key];
  }
}

export function getSortingOverState(
  host: WorkspaceHost,
  containerId: string,
): SortingOverState | null {
  return getSortingOverStateByContainer(host)[containerId] ?? null;
}
