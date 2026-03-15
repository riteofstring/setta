import { useGitStore } from "state/git";
import { getErrorDetail, res200 } from "utils/endpointUtils";
import { route_get_git_status } from "utils/generatedEndpoints";
import { type GitStatusEntry } from "utils/generatedTypes";

let statusRequestId = 0;

export function buildGitDiffAvailabilityByPath(
  entries: readonly GitStatusEntry[],
): Map<string, { hasStaged: boolean; hasUnstaged: boolean }> {
  const availabilityByPath = new Map<
    string,
    { hasStaged: boolean; hasUnstaged: boolean }
  >();
  for (const entry of entries) {
    const existing = availabilityByPath.get(entry.path);
    if (existing) {
      if (entry.kind === "staged") {
        existing.hasStaged = true;
      } else if (
        entry.kind === "unstaged" ||
        entry.kind === "untracked" ||
        entry.kind === "conflict"
      ) {
        existing.hasUnstaged = true;
      }
      continue;
    }
    availabilityByPath.set(entry.path, {
      hasStaged: entry.kind === "staged",
      hasUnstaged:
        entry.kind === "unstaged" ||
        entry.kind === "untracked" ||
        entry.kind === "conflict",
    });
  }
  return availabilityByPath;
}

export async function refreshGitStatus(): Promise<void> {
  const requestId = (statusRequestId += 1);
  useGitStore.setState((state) => ({
    ...state,
    status: { ...state.status, isLoading: true, error: null },
  }));
  const res = await route_get_git_status();
  if (requestId !== statusRequestId) {
    return;
  }
  if (res200(res)) {
    const diffAvailabilityByPath = buildGitDiffAvailabilityByPath(
      res.data.entries,
    );
    useGitStore.setState((state) => ({
      ...state,
      status: {
        ...state.status,
        response: res.data,
        diffAvailabilityByPath,
        isLoading: false,
      },
    }));
    return;
  }
  useGitStore.setState((state) => ({
    ...state,
    status: {
      ...state.status,
      response: null,
      diffAvailabilityByPath: new Map(),
      isLoading: false,
      error: getErrorDetail(res.data) ?? "Failed to load git status.",
    },
  }));
}
