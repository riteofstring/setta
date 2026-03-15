import { useGitStore } from "state/git";
import { getErrorDetail, res200 } from "utils/endpointUtils";
import { route_get_git_log } from "utils/generatedEndpoints";
import { type GetGitLogResponse, type GitCommit } from "utils/generatedTypes";
import {
  appendGitGraphRows,
  computeGitGraphRowsWithState,
} from "utils/gitGraph";

import {
  beginGitGraphLogRequest,
  isGitGraphLogRequestCurrent,
  type GitGraphLogRequest,
} from "./gitGraphRequestTracker";
import { getGitGraphState } from "./gitGraphState";

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

function getAppendedGitGraphCommits({
  seenCommitHashes,
  nextPageCommits,
}: {
  seenCommitHashes: Set<string>;
  nextPageCommits: readonly GitCommit[];
}): GitCommit[] {
  const appendedCommits: GitCommit[] = [];
  for (const commit of nextPageCommits) {
    if (seenCommitHashes.has(commit.hash)) {
      continue;
    }
    seenCommitHashes.add(commit.hash);
    appendedCommits.push(commit);
  }
  return appendedCommits;
}

function applyGitGraphInitialLoadedPage({
  request,
  responseData,
}: {
  request: GitGraphLogRequest;
  responseData: GetGitLogResponse;
}) {
  const seenCommitHashes = new Set(
    responseData.commits.map((commit) => commit.hash),
  );
  const rowResult = computeGitGraphRowsWithState(responseData.commits);

  return {
    projectConfigId: request.projectConfigId,
    response: responseData,
    seenCommitHashes,
    rows: rowResult.rows,
    rowComputationState: rowResult.rowComputationState,
    isLoadingMore: false,
    loadMoreError: null,
    hasMore: responseData.hasMore,
    nextOffset: responseData.nextOffset,
    pageSize: responseData.pageSize,
    isCapped: responseData.isCapped,
  };
}

export async function loadMoreGitGraphCommits({
  force = false,
}: {
  force?: boolean;
} = {}): Promise<void> {
  const graph = getGitGraphState();
  if (!graph) {
    return;
  }
  if (
    graph.isLoading ||
    graph.isLoadingMore ||
    graph.nextOffset === null ||
    !graph.hasMore
  ) {
    return;
  }
  if (!force && graph.loadMoreError) {
    return;
  }
  if (graph.filterText.trim()) {
    return;
  }

  const request = beginGitGraphLogRequest();
  const nextOffset = graph.nextOffset;
  const pageSize = graph.pageSize;
  const allRefs = graph.allRefs;

  setGitGraphLoadingMoreState();

  const res = await route_get_git_log({
    rev: "HEAD",
    allRefs,
    offset: nextOffset,
    pageSize,
  });
  if (!isGitGraphLogRequestCurrent(request)) {
    return;
  }

  if (res200(res)) {
    const nextPage = res.data;
    useGitStore.setState((state) => {
      if (!state.graph) {
        return state;
      }
      if (state.graph.projectConfigId !== request.projectConfigId) {
        return state;
      }
      const existingResponse = state.graph.response;
      if (!existingResponse) {
        return {
          ...state,
          graph: {
            ...state.graph,
            ...applyGitGraphInitialLoadedPage({
              request,
              responseData: nextPage,
            }),
          },
        };
      }

      const nextSeenCommitHashes = new Set(state.graph.seenCommitHashes);
      const appendedCommits = getAppendedGitGraphCommits({
        seenCommitHashes: nextSeenCommitHashes,
        nextPageCommits: nextPage.commits,
      });
      const mergedCommits = existingResponse.commits.concat(appendedCommits);
      let appendedRows: typeof state.graph.rows = [];
      let nextRowComputationState = state.graph.rowComputationState;
      if (appendedCommits.length > 0) {
        const appendedResult = appendGitGraphRows(
          appendedCommits,
          state.graph.rowComputationState,
        );
        appendedRows = appendedResult.rows;
        nextRowComputationState = appendedResult.rowComputationState;
      }
      return {
        ...state,
        graph: {
          ...state.graph,
          projectConfigId: request.projectConfigId,
          response: {
            ...existingResponse,
            commits: mergedCommits,
            offset: 0,
            pageSize: nextPage.pageSize,
            nextOffset: nextPage.nextOffset,
            hasMore: nextPage.hasMore,
            isCapped: nextPage.isCapped,
          },
          seenCommitHashes: nextSeenCommitHashes,
          rows: state.graph.rows.concat(appendedRows),
          rowComputationState: nextRowComputationState,
          isLoadingMore: false,
          loadMoreError: null,
          hasMore: nextPage.hasMore,
          nextOffset: nextPage.nextOffset,
          pageSize: nextPage.pageSize,
          isCapped: nextPage.isCapped,
        },
      };
    });
    return;
  }

  useGitStore.setState((state) => {
    if (!state.graph) {
      return state;
    }
    if (state.graph.projectConfigId !== request.projectConfigId) {
      return state;
    }
    return {
      ...state,
      graph: {
        ...state.graph,
        isLoadingMore: false,
        loadMoreError:
          getErrorDetail(res.data) ?? "Failed to load more commits.",
      },
    };
  });
}
