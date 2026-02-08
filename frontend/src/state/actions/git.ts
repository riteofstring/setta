import { useGitStore } from "state/git";
import { getErrorDetail, res200 } from "utils/endpointUtils";
import {
  route_get_git_commit_details,
  route_get_git_commit_file_diff,
  route_get_git_diff,
  route_get_git_log,
  route_get_git_status,
} from "utils/generatedEndpoints";
import type { GitDiffMode, GitStatusEntry } from "utils/generatedTypes";
import {
  appendGitGraphRows,
  computeGitGraphRowsWithState,
  createEmptyGitGraphRowComputationState,
} from "utils/gitGraph";

let statusRequestId = 0;
let diffRequestId = 0;
let logRequestId = 0;
let commitDetailsRequestId = 0;
let commitFileDiffRequestId = 0;

const DEFAULT_GIT_GRAPH_PAGE_SIZE = 250;

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

function createInitialGitGraphOverlayState({
  allRefs,
  filterText,
}: {
  allRefs: boolean;
  filterText: string;
}) {
  return {
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
      isLoading: false,
      error: getErrorDetail(res.data) ?? "Failed to load git status.",
    },
  }));
}

function computeDiffAvailability(path: string) {
  const availability = useGitStore.getState().status.diffAvailabilityByPath.get(path);
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

export function setGitGraphFilterText(filterText: string): void {
  useGitStore.setState((state) => {
    if (state.overlay.kind !== "graph") {
      return state;
    }
    return {
      ...state,
      overlay: {
        kind: "graph",
        graph: { ...state.overlay.graph, filterText },
      },
    };
  });
}

export function clearGitGraphSelectedCommit(): void {
  useGitStore.setState((state) => {
    if (state.overlay.kind !== "graph") {
      return state;
    }
    return {
      ...state,
      overlay: {
        kind: "graph",
        graph: {
          ...state.overlay.graph,
          selectedCommitHash: null,
          selectedCommitDetails: null,
          selectedCommitDetailsIsLoading: false,
          selectedCommitDetailsError: null,
          selectedCommitFilePath: null,
          selectedCommitFileDiffResponse: null,
          selectedCommitFileDiffIsLoading: false,
          selectedCommitFileDiffError: null,
        },
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
  if (!skipPreloadState) {
    useGitStore.setState((state) => {
      if (state.overlay.kind !== "graph") {
        return state;
      }
      return {
        ...state,
        overlay: {
          kind: "graph",
          graph: {
            ...state.overlay.graph,
            isLoading: true,
            isLoadingMore: false,
            error: null,
            loadMoreError: null,
          },
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
  if (res200(res)) {
    const responseData = res.data;
    const commits = responseData.commits;
    const seenCommitHashes = new Set(commits.map((commit) => commit.hash));
    const { rows, rowComputationState } = computeGitGraphRowsWithState(commits);
    useGitStore.setState((state) => {
      if (state.overlay.kind !== "graph") {
        return state;
      }
      const selectedCommitHash = state.overlay.graph.selectedCommitHash;
      const shouldClearSelection =
        selectedCommitHash !== null && !seenCommitHashes.has(selectedCommitHash);
      return {
        ...state,
        overlay: {
          kind: "graph",
          graph: {
            ...state.overlay.graph,
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
              ? {
                  selectedCommitHash: null,
                  selectedCommitDetails: null,
                  selectedCommitDetailsIsLoading: false,
                  selectedCommitDetailsError: null,
                  selectedCommitFilePath: null,
                  selectedCommitFileDiffResponse: null,
                  selectedCommitFileDiffIsLoading: false,
                  selectedCommitFileDiffError: null,
                }
              : {}),
          },
        },
      };
    });
    return;
  }

  useGitStore.setState((state) => {
    if (state.overlay.kind !== "graph") {
      return state;
    }
    return {
      ...state,
      overlay: {
        kind: "graph",
        graph: {
          ...state.overlay.graph,
          isLoading: false,
          error: getErrorDetail(res.data) ?? "Failed to load git log.",
          isLoadingMore: false,
          loadMoreError: null,
        },
      },
    };
  });
}

export async function loadMoreGitGraphCommits({
  force = false,
}: {
  force?: boolean;
} = {}): Promise<void> {
  const overlay = useGitStore.getState().overlay;
  if (overlay.kind !== "graph") {
    return;
  }
  const graph = overlay.graph;
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

  useGitStore.setState((state) => {
    if (state.overlay.kind !== "graph") {
      return state;
    }
    return {
      ...state,
      overlay: {
        kind: "graph",
        graph: {
          ...state.overlay.graph,
          isLoadingMore: true,
          loadMoreError: null,
        },
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

  if (res200(res)) {
    const nextPage = res.data;
    useGitStore.setState((state) => {
      if (state.overlay.kind !== "graph") {
        return state;
      }
      const existingResponse = state.overlay.graph.response;
      if (!existingResponse) {
        const initialSeenCommitHashes = new Set(
          nextPage.commits.map((commit) => commit.hash),
        );
        const initialRows = computeGitGraphRowsWithState(nextPage.commits);
        return {
          ...state,
          overlay: {
            kind: "graph",
            graph: {
              ...state.overlay.graph,
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
          },
        };
      }

      const nextSeenCommitHashes = new Set(state.overlay.graph.seenCommitHashes);
      const appendedCommits: typeof nextPage.commits = [];
      for (const commit of nextPage.commits) {
        if (nextSeenCommitHashes.has(commit.hash)) {
          continue;
        }
        nextSeenCommitHashes.add(commit.hash);
        appendedCommits.push(commit);
      }
      const mergedCommits = existingResponse.commits.concat(appendedCommits);
      let appendedRows: typeof state.overlay.graph.rows = [];
      let nextRowComputationState = state.overlay.graph.rowComputationState;
      if (appendedCommits.length > 0) {
        const appendedResult = appendGitGraphRows(
          appendedCommits,
          state.overlay.graph.rowComputationState,
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
        overlay: {
          kind: "graph",
          graph: {
            ...state.overlay.graph,
            response: mergedResponse,
            seenCommitHashes: nextSeenCommitHashes,
            rows: state.overlay.graph.rows.concat(appendedRows),
            rowComputationState: nextRowComputationState,
            isLoadingMore: false,
            loadMoreError: null,
            hasMore: nextPage.hasMore,
            nextOffset: nextPage.nextOffset,
            pageSize: nextPage.pageSize,
            isCapped: nextPage.isCapped,
          },
        },
      };
    });
    return;
  }

  useGitStore.setState((state) => {
    if (state.overlay.kind !== "graph") {
      return state;
    }
    return {
      ...state,
      overlay: {
        kind: "graph",
        graph: {
          ...state.overlay.graph,
          isLoadingMore: false,
          loadMoreError:
            getErrorDetail(res.data) ?? "Failed to load more commits.",
        },
      },
    };
  });
}

export async function openGitGraphOverlay(): Promise<void> {
  const allRefs = false;
  useGitStore.setState((state) => ({
    ...state,
    overlay: {
      kind: "graph",
      graph: createInitialGitGraphOverlayState({ allRefs, filterText: "" }),
    },
  }));
  await refreshGitGraph({ allRefs, skipPreloadState: true });
}

export async function refreshGitGraphOverlay(): Promise<void> {
  const overlay = useGitStore.getState().overlay;
  if (overlay.kind !== "graph") {
    return;
  }
  await refreshGitGraph({ allRefs: overlay.graph.allRefs });
}

export async function toggleGitGraphAllRefs(): Promise<void> {
  const overlay = useGitStore.getState().overlay;
  if (overlay.kind !== "graph") {
    return;
  }
  await refreshGitGraph({ allRefs: !overlay.graph.allRefs });
}

export async function selectGitCommit(commitHash: string): Promise<void> {
  const overlay = useGitStore.getState().overlay;
  if (overlay.kind !== "graph") {
    return;
  }
  const requestId = (commitDetailsRequestId += 1);
  useGitStore.setState((state) => {
    if (state.overlay.kind !== "graph") {
      return state;
    }
    return {
      ...state,
      overlay: {
        kind: "graph",
        graph: {
          ...state.overlay.graph,
          selectedCommitHash: commitHash,
          selectedCommitDetails: null,
          selectedCommitDetailsIsLoading: true,
          selectedCommitDetailsError: null,
          selectedCommitFilePath: null,
          selectedCommitFileDiffResponse: null,
          selectedCommitFileDiffIsLoading: false,
          selectedCommitFileDiffError: null,
        },
      },
    };
  });

  const res = await route_get_git_commit_details({ commitHash });
  if (requestId !== commitDetailsRequestId) {
    return;
  }
  if (res200(res)) {
    useGitStore.setState((state) => {
      if (state.overlay.kind !== "graph") {
        return state;
      }
      if (state.overlay.graph.selectedCommitHash !== commitHash) {
        return state;
      }
      return {
        ...state,
        overlay: {
          kind: "graph",
          graph: {
            ...state.overlay.graph,
            selectedCommitDetails: res.data,
            selectedCommitDetailsIsLoading: false,
          },
        },
      };
    });
    return;
  }

  useGitStore.setState((state) => {
    if (state.overlay.kind !== "graph") {
      return state;
    }
    if (state.overlay.graph.selectedCommitHash !== commitHash) {
      return state;
    }
    return {
      ...state,
      overlay: {
        kind: "graph",
        graph: {
          ...state.overlay.graph,
          selectedCommitDetails: null,
          selectedCommitDetailsIsLoading: false,
          selectedCommitDetailsError:
            getErrorDetail(res.data) ?? "Failed to load commit details.",
        },
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
  const overlay = useGitStore.getState().overlay;
  if (overlay.kind !== "graph") {
    return;
  }
  const commitHash = overlay.graph.selectedCommitHash;
  if (!commitHash) {
    return;
  }
  const requestId = (commitFileDiffRequestId += 1);
  useGitStore.setState((state) => {
    if (state.overlay.kind !== "graph") {
      return state;
    }
    if (state.overlay.graph.selectedCommitHash !== commitHash) {
      return state;
    }
    return {
      ...state,
      overlay: {
        kind: "graph",
        graph: {
          ...state.overlay.graph,
          selectedCommitFilePath: path,
          selectedCommitFileDiffResponse: null,
          selectedCommitFileDiffIsLoading: true,
          selectedCommitFileDiffError: null,
        },
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
  if (res200(res)) {
    useGitStore.setState((state) => {
      if (state.overlay.kind !== "graph") {
        return state;
      }
      if (state.overlay.graph.selectedCommitHash !== commitHash) {
        return state;
      }
      if (state.overlay.graph.selectedCommitFilePath !== path) {
        return state;
      }
      return {
        ...state,
        overlay: {
          kind: "graph",
          graph: {
            ...state.overlay.graph,
            selectedCommitFileDiffResponse: res.data,
            selectedCommitFileDiffIsLoading: false,
          },
        },
      };
    });
    return;
  }

  useGitStore.setState((state) => {
    if (state.overlay.kind !== "graph") {
      return state;
    }
    if (state.overlay.graph.selectedCommitHash !== commitHash) {
      return state;
    }
    if (state.overlay.graph.selectedCommitFilePath !== path) {
      return state;
    }
    return {
      ...state,
      overlay: {
        kind: "graph",
        graph: {
          ...state.overlay.graph,
          selectedCommitFileDiffResponse: null,
          selectedCommitFileDiffIsLoading: false,
          selectedCommitFileDiffError:
            getErrorDetail(res.data) ?? "Failed to load file diff.",
        },
      },
    };
  });
}
