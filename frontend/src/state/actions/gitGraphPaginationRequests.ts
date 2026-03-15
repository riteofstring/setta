import { useGitStore } from "state/git";
import { getErrorDetail, res200 } from "utils/endpointUtils";
import { route_get_git_log } from "utils/generatedEndpoints";

import {
  applyGitGraphPaginationError,
  applyGitGraphPaginationSuccess,
} from "./gitGraphPaginationResults";
import {
  beginGitGraphLogRequest,
  isGitGraphLogRequestCurrent,
  type GitGraphLogRequest,
} from "./gitGraphRequestTracker";
import { getGitGraphState } from "./gitGraphState";

type GitGraphPaginationRequestContext = {
  request: GitGraphLogRequest;
  allRefs: boolean;
  nextOffset: number;
  pageSize: number;
};

function setGitGraphLoadingMoreState(): void {
  useGitStore.setState((state) => {
    if (!state.graph) {
      return state;
    }
    return {
      ...state,
      graph: {
        ...state.graph,
        isLoadingMore: true,
        loadMoreError: null,
      },
    };
  });
}

function beginGitGraphPaginationRequest({
  force,
}: {
  force: boolean;
}): GitGraphPaginationRequestContext | null {
  const graph = getGitGraphState();
  if (!graph) {
    return null;
  }
  if (
    graph.isLoading ||
    graph.isLoadingMore ||
    graph.nextOffset === null ||
    !graph.hasMore
  ) {
    return null;
  }
  if (!force && graph.loadMoreError) {
    return null;
  }
  if (graph.filterText.trim()) {
    return null;
  }

  const request = beginGitGraphLogRequest();
  setGitGraphLoadingMoreState();
  return {
    request,
    nextOffset: graph.nextOffset,
    pageSize: graph.pageSize,
    allRefs: graph.allRefs,
  };
}

export async function loadMoreGitGraphCommits({
  force = false,
}: {
  force?: boolean;
} = {}): Promise<void> {
  const requestContext = beginGitGraphPaginationRequest({ force });
  if (!requestContext) {
    return;
  }

  const response = await route_get_git_log({
    rev: "HEAD",
    allRefs: requestContext.allRefs,
    offset: requestContext.nextOffset,
    pageSize: requestContext.pageSize,
  });
  if (!isGitGraphLogRequestCurrent(requestContext.request)) {
    return;
  }

  if (res200(response)) {
    applyGitGraphPaginationSuccess({
      request: requestContext.request,
      responseData: response.data,
    });
    return;
  }

  applyGitGraphPaginationError({
    request: requestContext.request,
    errorMessage:
      getErrorDetail(response.data) ?? "Failed to load more commits.",
  });
}
