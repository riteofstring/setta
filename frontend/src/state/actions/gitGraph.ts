import { ensureTrackedGitPaneGraphWindow } from "state/actions/projectChatWindowing";
import { useProjectState } from "state/definitions";
import { useGitStore } from "state/git";
import { getErrorDetail, res200 } from "utils/endpointUtils";
import {
  route_get_git_commit_details,
  route_get_git_commit_file_diff,
  route_get_git_log,
} from "utils/generatedEndpoints";
import {
  appendGitGraphRows,
  computeGitGraphRowsWithState,
  createEmptyGitGraphRowComputationState,
} from "utils/gitGraph";

let logRequestId = 0;
let commitDetailsRequestId = 0;
let commitFileDiffRequestId = 0;

const DEFAULT_GIT_GRAPH_PAGE_SIZE = 250;

function getCurrentGitGraphProjectConfigId(): string | null {
  const projectConfigId = useProjectState.getState().projectConfig.id;
  if (typeof projectConfigId !== "string" || projectConfigId.trim() === "") {
    return null;
  }
  return projectConfigId;
}

function createClearedGitGraphSelectionState() {
  return {
    selectedCommitHash: null,
    selectedCommitDetails: null,
    selectedCommitDetailsIsLoading: false,
    selectedCommitDetailsError: null,
    selectedCommitFilePath: null,
    selectedCommitFileDiffResponse: null,
    selectedCommitFileDiffIsLoading: false,
    selectedCommitFileDiffError: null,
  };
}

function createInitialGitGraphState({
  projectConfigId,
  allRefs,
  filterText,
}: {
  projectConfigId: string | null;
  allRefs: boolean;
  filterText: string;
}) {
  return {
    projectConfigId,
    allRefs,
    response: null,
    seenCommitHashes: new Set<string>(),
    rows: [],
    rowComputationState: createEmptyGitGraphRowComputationState(),
    filterText,
    isLoading: true,
    isLoadingMore: false,
    error: null,
    loadMoreError: null,
    hasMore: false,
    nextOffset: null,
    pageSize: DEFAULT_GIT_GRAPH_PAGE_SIZE,
    isCapped: false,
    ...createClearedGitGraphSelectionState(),
  };
}

function getGitGraphState() {
  return useGitStore.getState().graph;
}

export function setGitGraphFilterText(filterText: string): void {
  useGitStore.setState((state) => {
    if (!state.graph) {
      return state;
    }
    return {
      ...state,
      graph: { ...state.graph, filterText },
    };
  });
}

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

async function refreshGitGraph({
  allRefs,
  skipPreloadState = false,
}: {
  allRefs: boolean;
  skipPreloadState?: boolean;
}): Promise<void> {
  const requestId = (logRequestId += 1);
  const requestProjectConfigId = getCurrentGitGraphProjectConfigId();
  if (!skipPreloadState) {
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

  const res = await route_get_git_log({
    rev: "HEAD",
    allRefs,
    offset: 0,
    pageSize: DEFAULT_GIT_GRAPH_PAGE_SIZE,
  });
  if (requestId !== logRequestId) {
    return;
  }
  if (requestProjectConfigId !== getCurrentGitGraphProjectConfigId()) {
    return;
  }
  if (res200(res)) {
    const responseData = res.data;
    const commits = responseData.commits;
    const seenCommitHashes = new Set(commits.map((commit) => commit.hash));
    const { rows, rowComputationState } = computeGitGraphRowsWithState(commits);
    useGitStore.setState((state) => {
      if (!state.graph) {
        return state;
      }
      const selectedCommitHash = state.graph.selectedCommitHash;
      const shouldClearSelection =
        selectedCommitHash !== null &&
        !seenCommitHashes.has(selectedCommitHash);
      return {
        ...state,
        graph: {
          ...state.graph,
          projectConfigId: requestProjectConfigId,
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
          ...(shouldClearSelection
            ? createClearedGitGraphSelectionState()
            : {}),
        },
      };
    });
    return;
  }

  useGitStore.setState((state) => {
    if (!state.graph) {
      return state;
    }
    return {
      ...state,
      graph: {
        ...state.graph,
        projectConfigId: requestProjectConfigId,
        response: null,
        seenCommitHashes: new Set<string>(),
        rows: [],
        rowComputationState: createEmptyGitGraphRowComputationState(),
        isLoading: false,
        error: getErrorDetail(res.data) ?? "Failed to load git log.",
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

  const requestId = (logRequestId += 1);
  const nextOffset = graph.nextOffset;
  const pageSize = graph.pageSize;
  const allRefs = graph.allRefs;
  const requestProjectConfigId = graph.projectConfigId;

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

  const res = await route_get_git_log({
    rev: "HEAD",
    allRefs,
    offset: nextOffset,
    pageSize,
  });
  if (requestId !== logRequestId) {
    return;
  }
  if (requestProjectConfigId !== getCurrentGitGraphProjectConfigId()) {
    return;
  }

  if (res200(res)) {
    const nextPage = res.data;
    useGitStore.setState((state) => {
      if (!state.graph) {
        return state;
      }
      if (state.graph.projectConfigId !== requestProjectConfigId) {
        return state;
      }
      const existingResponse = state.graph.response;
      if (!existingResponse) {
        const initialSeenCommitHashes = new Set(
          nextPage.commits.map((commit) => commit.hash),
        );
        const initialRows = computeGitGraphRowsWithState(nextPage.commits);
        return {
          ...state,
          graph: {
            ...state.graph,
            projectConfigId: requestProjectConfigId,
            response: nextPage,
            seenCommitHashes: initialSeenCommitHashes,
            rows: initialRows.rows,
            rowComputationState: initialRows.rowComputationState,
            isLoadingMore: false,
            loadMoreError: null,
            hasMore: nextPage.hasMore,
            nextOffset: nextPage.nextOffset,
            pageSize: nextPage.pageSize,
            isCapped: nextPage.isCapped,
          },
        };
      }

      const nextSeenCommitHashes = new Set(state.graph.seenCommitHashes);
      const appendedCommits: typeof nextPage.commits = [];
      for (const commit of nextPage.commits) {
        if (nextSeenCommitHashes.has(commit.hash)) {
          continue;
        }
        nextSeenCommitHashes.add(commit.hash);
        appendedCommits.push(commit);
      }
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
      const mergedResponse = {
        ...existingResponse,
        commits: mergedCommits,
        offset: 0,
        pageSize: nextPage.pageSize,
        nextOffset: nextPage.nextOffset,
        hasMore: nextPage.hasMore,
        isCapped: nextPage.isCapped,
      };

      return {
        ...state,
        graph: {
          ...state.graph,
          projectConfigId: requestProjectConfigId,
          response: mergedResponse,
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
    if (state.graph.projectConfigId !== requestProjectConfigId) {
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

export async function ensureGitGraphStateLoaded(): Promise<void> {
  const projectConfigId = getCurrentGitGraphProjectConfigId();
  const existingGraphState = getGitGraphState();
  if (
    existingGraphState &&
    existingGraphState.projectConfigId === projectConfigId
  ) {
    return;
  }
  const allRefs = false;
  useGitStore.setState((state) => ({
    ...state,
    graph: createInitialGitGraphState({
      projectConfigId,
      allRefs,
      filterText: "",
    }),
  }));
  await refreshGitGraph({ allRefs, skipPreloadState: true });
}

export async function openGitGraphOverlay(): Promise<void> {
  const allRefs = false;
  ensureTrackedGitPaneGraphWindow({
    title: "Git Graph",
  });
  const projectConfigId = getCurrentGitGraphProjectConfigId();
  useGitStore.setState((state) => ({
    ...state,
    overlay: { kind: "none" },
    graph: createInitialGitGraphState({
      projectConfigId,
      allRefs,
      filterText: "",
    }),
  }));
  await refreshGitGraph({ allRefs, skipPreloadState: true });
}

export async function refreshGitGraphOverlay(): Promise<void> {
  const graph = getGitGraphState();
  if (!graph) {
    return;
  }
  await refreshGitGraph({ allRefs: graph.allRefs });
}

export async function toggleGitGraphAllRefs(): Promise<void> {
  const graph = getGitGraphState();
  if (!graph) {
    return;
  }
  await refreshGitGraph({ allRefs: !graph.allRefs });
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
