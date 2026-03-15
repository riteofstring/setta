import { useGitStore } from "state/git";
import { getErrorDetail, res200 } from "utils/endpointUtils";
import { route_get_git_log } from "utils/generatedEndpoints";
import { type GetGitLogResponse } from "utils/generatedTypes";
import {
  computeGitGraphRowsWithState,
  createEmptyGitGraphRowComputationState,
} from "utils/gitGraph";

import {
  beginGitGraphLogRequest,
  isGitGraphLogRequestCurrent,
} from "./gitGraphRequestTracker";
import {
  createClearedGitGraphSelectionState,
  DEFAULT_GIT_GRAPH_PAGE_SIZE,
} from "./gitGraphState";

function setGitGraphRefreshLoadingState(): void {
  useGitStore.setState((state) => {
    if (!state.graph) {
      return state;
    }
    return {
      ...state,
      graph: {
        ...state.graph,
        isLoading: true,
        isLoadingMore: false,
        error: null,
        loadMoreError: null,
      },
    };
  });
}

function applyGitGraphRefreshSuccess({
  allRefs,
  projectConfigId,
  responseData,
}: {
  allRefs: boolean;
  projectConfigId: string | null;
  responseData: GetGitLogResponse;
}): void {
  const seenCommitHashes = new Set(
    responseData.commits.map((commit) => commit.hash),
  );
  const { rows, rowComputationState } = computeGitGraphRowsWithState(
    responseData.commits,
  );

  useGitStore.setState((state) => {
    if (!state.graph) {
      return state;
    }
    const selectedCommitHash = state.graph.selectedCommitHash;
    const shouldClearSelection =
      selectedCommitHash !== null && !seenCommitHashes.has(selectedCommitHash);
    return {
      ...state,
      graph: {
        ...state.graph,
        projectConfigId,
        allRefs,
        response: responseData,
        seenCommitHashes,
        rows,
        rowComputationState,
        isLoading: false,
        isLoadingMore: false,
        loadMoreError: null,
        hasMore: responseData.hasMore,
        nextOffset: responseData.nextOffset,
        pageSize: responseData.pageSize,
        isCapped: responseData.isCapped,
        ...(shouldClearSelection ? createClearedGitGraphSelectionState() : {}),
      },
    };
  });
}

function applyGitGraphRefreshError({
  projectConfigId,
  errorMessage,
}: {
  projectConfigId: string | null;
  errorMessage: string;
}): void {
  useGitStore.setState((state) => {
    if (!state.graph) {
      return state;
    }
    return {
      ...state,
      graph: {
        ...state.graph,
        projectConfigId,
        response: null,
        seenCommitHashes: new Set<string>(),
        rows: [],
        rowComputationState: createEmptyGitGraphRowComputationState(),
        isLoading: false,
        error: errorMessage,
        isLoadingMore: false,
        loadMoreError: null,
        hasMore: false,
        nextOffset: null,
        isCapped: false,
        ...createClearedGitGraphSelectionState(),
      },
    };
  });
}

export async function refreshGitGraphData({
  allRefs,
  skipPreloadState = false,
}: {
  allRefs: boolean;
  skipPreloadState?: boolean;
}): Promise<void> {
  const request = beginGitGraphLogRequest();
  if (!skipPreloadState) {
    setGitGraphRefreshLoadingState();
  }

  const res = await route_get_git_log({
    rev: "HEAD",
    allRefs,
    offset: 0,
    pageSize: DEFAULT_GIT_GRAPH_PAGE_SIZE,
  });
  if (!isGitGraphLogRequestCurrent(request)) {
    return;
  }
  if (res200(res)) {
    applyGitGraphRefreshSuccess({
      allRefs,
      projectConfigId: request.projectConfigId,
      responseData: res.data,
    });
    return;
  }

  applyGitGraphRefreshError({
    projectConfigId: request.projectConfigId,
    errorMessage: getErrorDetail(res.data) ?? "Failed to load git log.",
  });
}
