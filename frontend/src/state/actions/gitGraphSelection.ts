import { useGitStore } from "state/git";
import { getErrorDetail, res200 } from "utils/endpointUtils";
import {
  route_get_git_commit_details,
  route_get_git_commit_file_diff,
} from "utils/generatedEndpoints";

import {
  createClearedGitGraphSelectionState,
  getCurrentGitGraphProjectConfigId,
  getGitGraphState,
} from "./gitGraphState";

let commitDetailsRequestId = 0;
let commitFileDiffRequestId = 0;

export function clearGitGraphSelectedCommit(): void {
  useGitStore.setState((state) => {
    if (!state.graph) {
      return state;
    }
    return {
      ...state,
      graph: {
        ...state.graph,
        ...createClearedGitGraphSelectionState(),
      },
    };
  });
}

export async function selectGitCommit(commitHash: string): Promise<void> {
  const graph = getGitGraphState();
  if (!graph) {
    return;
  }
  const requestId = (commitDetailsRequestId += 1);
  const requestProjectConfigId = graph.projectConfigId;
  useGitStore.setState((state) => {
    if (!state.graph) {
      return state;
    }
    return {
      ...state,
      graph: {
        ...state.graph,
        ...createClearedGitGraphSelectionState(),
        selectedCommitHash: commitHash,
        selectedCommitDetailsIsLoading: true,
      },
    };
  });

  const res = await route_get_git_commit_details({ commitHash });
  if (requestId !== commitDetailsRequestId) {
    return;
  }
  if (requestProjectConfigId !== getCurrentGitGraphProjectConfigId()) {
    return;
  }
  if (res200(res)) {
    useGitStore.setState((state) => {
      if (!state.graph) {
        return state;
      }
      if (state.graph.projectConfigId !== requestProjectConfigId) {
        return state;
      }
      if (state.graph.selectedCommitHash !== commitHash) {
        return state;
      }
      return {
        ...state,
        graph: {
          ...state.graph,
          selectedCommitDetails: res.data,
          selectedCommitDetailsIsLoading: false,
        },
      };
    });
    return;
  }

  useGitStore.setState((state) => {
    if (!state.graph) {
      return state;
    }
    if (state.graph.projectConfigId !== requestProjectConfigId) {
      return state;
    }
    if (state.graph.selectedCommitHash !== commitHash) {
      return state;
    }
    return {
      ...state,
      graph: {
        ...state.graph,
        selectedCommitDetails: null,
        selectedCommitDetailsIsLoading: false,
        selectedCommitDetailsError:
          getErrorDetail(res.data) ?? "Failed to load commit details.",
      },
    };
  });
}

export async function selectGitCommitFile({
  path,
  oldPath,
}: {
  path: string;
  oldPath: string | null;
}): Promise<void> {
  const graph = getGitGraphState();
  if (!graph) {
    return;
  }
  const commitHash = graph.selectedCommitHash;
  if (!commitHash) {
    return;
  }
  const requestId = (commitFileDiffRequestId += 1);
  const requestProjectConfigId = graph.projectConfigId;
  useGitStore.setState((state) => {
    if (!state.graph) {
      return state;
    }
    if (state.graph.selectedCommitHash !== commitHash) {
      return state;
    }
    return {
      ...state,
      graph: {
        ...state.graph,
        selectedCommitFilePath: path,
        selectedCommitFileDiffResponse: null,
        selectedCommitFileDiffIsLoading: true,
        selectedCommitFileDiffError: null,
      },
    };
  });

  const res = await route_get_git_commit_file_diff({
    commitHash,
    path,
    oldPath,
  });
  if (requestId !== commitFileDiffRequestId) {
    return;
  }
  if (requestProjectConfigId !== getCurrentGitGraphProjectConfigId()) {
    return;
  }
  if (res200(res)) {
    useGitStore.setState((state) => {
      if (!state.graph) {
        return state;
      }
      if (state.graph.projectConfigId !== requestProjectConfigId) {
        return state;
      }
      if (state.graph.selectedCommitHash !== commitHash) {
        return state;
      }
      if (state.graph.selectedCommitFilePath !== path) {
        return state;
      }
      return {
        ...state,
        graph: {
          ...state.graph,
          selectedCommitFileDiffResponse: res.data,
          selectedCommitFileDiffIsLoading: false,
        },
      };
    });
    return;
  }

  useGitStore.setState((state) => {
    if (!state.graph) {
      return state;
    }
    if (state.graph.projectConfigId !== requestProjectConfigId) {
      return state;
    }
    if (state.graph.selectedCommitHash !== commitHash) {
      return state;
    }
    if (state.graph.selectedCommitFilePath !== path) {
      return state;
    }
    return {
      ...state,
      graph: {
        ...state.graph,
        selectedCommitFileDiffResponse: null,
        selectedCommitFileDiffIsLoading: false,
        selectedCommitFileDiffError:
          getErrorDetail(res.data) ?? "Failed to load file diff.",
      },
    };
  });
}
