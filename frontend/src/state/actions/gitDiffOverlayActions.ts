import { useGitStore } from "state/git";
import { getErrorDetail, res200 } from "utils/endpointUtils";
import { route_get_git_diff } from "utils/generatedEndpoints";
import { type GitDiffMode } from "utils/generatedTypes";

let diffRequestId = 0;

function computeDiffAvailability(path: string) {
  const availability = useGitStore
    .getState()
    .status.diffAvailabilityByPath.get(path);
  if (!availability) {
    return { hasStaged: false, hasUnstaged: false };
  }
  return availability;
}

async function refreshGitDiff({
  path,
  oldPath,
  mode,
  skipPreloadState = false,
}: {
  path: string;
  oldPath: string | null;
  mode: GitDiffMode;
  skipPreloadState?: boolean;
}): Promise<void> {
  const requestId = (diffRequestId += 1);
  if (!skipPreloadState) {
    useGitStore.setState((state) => {
      if (state.overlay.kind !== "diff") {
        return state;
      }
      return {
        ...state,
        overlay: {
          kind: "diff",
          diff: {
            ...state.overlay.diff,
            path,
            oldPath,
            mode,
            response: null,
            isLoading: true,
            error: null,
          },
        },
      };
    });
  }

  const res = await route_get_git_diff({ path, oldPath, mode });
  if (requestId !== diffRequestId) {
    return;
  }
  if (res200(res)) {
    useGitStore.setState((state) => {
      if (state.overlay.kind !== "diff") {
        return state;
      }
      return {
        ...state,
        overlay: {
          kind: "diff",
          diff: {
            ...state.overlay.diff,
            response: res.data,
            isLoading: false,
          },
        },
      };
    });
    return;
  }

  useGitStore.setState((state) => {
    if (state.overlay.kind !== "diff") {
      return state;
    }
    return {
      ...state,
      overlay: {
        kind: "diff",
        diff: {
          ...state.overlay.diff,
          response: null,
          isLoading: false,
          error: getErrorDetail(res.data) ?? "Failed to load git diff.",
        },
      },
    };
  });
}

export async function openGitDiffOverlay({
  path,
  oldPath,
  mode,
}: {
  path: string;
  oldPath: string | null;
  mode: GitDiffMode;
}): Promise<void> {
  const { hasStaged, hasUnstaged } = computeDiffAvailability(path);
  useGitStore.setState((state) => ({
    ...state,
    overlay: {
      kind: "diff",
      diff: {
        path,
        oldPath,
        mode,
        hasStaged,
        hasUnstaged,
        response: null,
        isLoading: true,
        error: null,
      },
    },
  }));
  await refreshGitDiff({ path, oldPath, mode, skipPreloadState: true });
}

export async function setGitDiffMode(mode: GitDiffMode): Promise<void> {
  const overlay = useGitStore.getState().overlay;
  if (overlay.kind !== "diff") {
    return;
  }
  if (overlay.diff.mode === mode) {
    return;
  }
  await openGitDiffOverlay({
    path: overlay.diff.path,
    oldPath: overlay.diff.oldPath,
    mode,
  });
}

export function closeGitOverlay(): void {
  useGitStore.setState((state) => ({ ...state, overlay: { kind: "none" } }));
}
