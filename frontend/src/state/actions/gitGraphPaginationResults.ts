import { useGitStore } from "state/git";
import { type GetGitLogResponse, type GitCommit } from "utils/generatedTypes";
import {
  appendGitGraphRows,
  computeGitGraphRowsWithState,
} from "utils/gitGraph";

import { type GitGraphLogRequest } from "./gitGraphRequestTracker";

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

function buildGitGraphPaginationLoadedPage({
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

export function applyGitGraphPaginationSuccess({
  request,
  responseData,
}: {
  request: GitGraphLogRequest;
  responseData: GetGitLogResponse;
}): void {
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
          ...buildGitGraphPaginationLoadedPage({
            request,
            responseData,
          }),
        },
      };
    }

    const nextSeenCommitHashes = new Set(state.graph.seenCommitHashes);
    const appendedCommits = getAppendedGitGraphCommits({
      seenCommitHashes: nextSeenCommitHashes,
      nextPageCommits: responseData.commits,
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
          pageSize: responseData.pageSize,
          nextOffset: responseData.nextOffset,
          hasMore: responseData.hasMore,
          isCapped: responseData.isCapped,
        },
        seenCommitHashes: nextSeenCommitHashes,
        rows: state.graph.rows.concat(appendedRows),
        rowComputationState: nextRowComputationState,
        isLoadingMore: false,
        loadMoreError: null,
        hasMore: responseData.hasMore,
        nextOffset: responseData.nextOffset,
        pageSize: responseData.pageSize,
        isCapped: responseData.isCapped,
      },
    };
  });
}

export function applyGitGraphPaginationError({
  request,
  errorMessage,
}: {
  request: GitGraphLogRequest;
  errorMessage: string;
}): void {
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
        loadMoreError: errorMessage,
      },
    };
  });
}
