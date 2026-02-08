import { useGitStore } from "state/git";
import { getErrorDetail, res200 } from "utils/endpointUtils";
import {
  route_get_git_commit_details,
  route_get_git_commit_file_diff,
  route_get_git_diff,
  route_get_git_log,
  route_get_git_status,
} from "utils/generatedEndpoints";
import type {
  GetGitLogResponse,
  GitCommit,
  GitDiffMode,
} from "utils/generatedTypes";
import { computeGitGraphRows } from "utils/gitGraph";

let statusRequestId = 0;
let diffRequestId = 0;
let logRequestId = 0;
let commitDetailsRequestId = 0;
let commitFileDiffRequestId = 0;

const DEFAULT_GIT_GRAPH_PAGE_SIZE = 250;

function normalizeGitCommit(commit: GitCommit): GitCommit {
  // Defensive: backend should already return clean hashes, but whitespace here
  // breaks lane computation and commit-diff lookups.
  return {
    ...commit,
    hash: commit.hash.trim(),
    parents: commit.parents.map((parent) => parent.trim()).filter(Boolean),
    decorations: commit.decorations.map((d) => d.trim()).filter(Boolean),
  };
}

function normalizeGitLogResponse(response: GetGitLogResponse): GetGitLogResponse {
  return {
    ...response,
    commits: response.commits.map(normalizeGitCommit),
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
    useGitStore.setState((state) => ({
      ...state,
      status: { ...state.status, response: res.data, isLoading: false },
    }));
    return;
  }
  useGitStore.setState((state) => ({
    ...state,
    status: {
      ...state.status,
      response: null,
      isLoading: false,
      error: getErrorDetail(res.data) ?? "Failed to load git status.",
    },
  }));
}

function computeDiffAvailability(path: string) {
  const status = useGitStore.getState().status.response;
  const entries = status?.entries ?? [];
  let hasStaged = false;
  let hasUnstaged = false;
  for (const entry of entries) {
    if (entry.path !== path) {
      continue;
    }
    if (entry.kind === "staged") {
      hasStaged = true;
    } else if (
      entry.kind === "unstaged" ||
      entry.kind === "untracked" ||
      entry.kind === "conflict"
    ) {
      hasUnstaged = true;
    }
  }
  return { hasStaged, hasUnstaged };
}

async function refreshGitDiff(path: string, mode: GitDiffMode): Promise<void> {
  const requestId = (diffRequestId += 1);
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
          mode,
          response: null,
          isLoading: true,
          error: null,
        },
      },
    };
  });

  const res = await route_get_git_diff({ path, mode });
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
  mode,
}: {
  path: string;
  mode: GitDiffMode;
}): Promise<void> {
  const { hasStaged, hasUnstaged } = computeDiffAvailability(path);
  useGitStore.setState((state) => ({
    ...state,
    overlay: {
      kind: "diff",
      diff: {
        path,
        mode,
        hasStaged,
        hasUnstaged,
        response: null,
        isLoading: true,
        error: null,
      },
    },
  }));
  await refreshGitDiff(path, mode);
}

export async function setGitDiffMode(mode: GitDiffMode): Promise<void> {
  const overlay = useGitStore.getState().overlay;
  if (overlay.kind !== "diff") {
    return;
  }
  if (overlay.diff.mode === mode) {
    return;
  }
  await openGitDiffOverlay({ path: overlay.diff.path, mode });
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
          selectedCommitFileOldPath: null,
          selectedCommitFileDiffResponse: null,
          selectedCommitFileDiffIsLoading: false,
          selectedCommitFileDiffError: null,
        },
      },
    };
  });
}

async function refreshGitGraph(allRefs: boolean): Promise<void> {
  const requestId = (logRequestId += 1);
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
          allRefs,
          response: null,
          rows: [],
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
          selectedCommitFileOldPath: null,
          selectedCommitFileDiffResponse: null,
          selectedCommitFileDiffIsLoading: false,
          selectedCommitFileDiffError: null,
        },
      },
    };
  });

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
    const normalizedResponse = normalizeGitLogResponse(res.data);
    const commits = normalizedResponse.commits;
    const rows = computeGitGraphRows(commits);
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
            response: normalizedResponse,
            rows,
            isLoading: false,
            isLoadingMore: false,
            loadMoreError: null,
            hasMore: normalizedResponse.hasMore,
            nextOffset: normalizedResponse.nextOffset,
            pageSize: normalizedResponse.pageSize,
            isCapped: normalizedResponse.isCapped,
          },
        },
      };
    });
    if (commits.length > 0) {
      await selectGitCommit(commits[0]!.hash);
    }
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
          response: null,
          rows: [],
          isLoading: false,
          error: getErrorDetail(res.data) ?? "Failed to load git log.",
          isLoadingMore: false,
          loadMoreError: null,
          hasMore: false,
          nextOffset: null,
          isCapped: false,
        },
      },
    };
  });
}

export async function loadMoreGitGraphCommits(): Promise<void> {
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
    const normalizedPage = normalizeGitLogResponse(res.data);
    useGitStore.setState((state) => {
      if (state.overlay.kind !== "graph") {
        return state;
      }
      const existingResponse = state.overlay.graph.response;
      if (!existingResponse) {
        return {
          ...state,
          overlay: {
            kind: "graph",
            graph: {
              ...state.overlay.graph,
              response: normalizedPage,
              rows: computeGitGraphRows(normalizedPage.commits),
              isLoadingMore: false,
              loadMoreError: null,
              hasMore: normalizedPage.hasMore,
              nextOffset: normalizedPage.nextOffset,
              pageSize: normalizedPage.pageSize,
              isCapped: normalizedPage.isCapped,
            },
          },
        };
      }

      const seenHashes = new Set(existingResponse.commits.map((commit) => commit.hash));
      const appendedCommits = normalizedPage.commits.filter(
        (commit) => !seenHashes.has(commit.hash),
      );
      const mergedCommits = existingResponse.commits.concat(appendedCommits);
      const mergedResponse = {
        ...existingResponse,
        commits: mergedCommits,
        offset: 0,
        pageSize: normalizedPage.pageSize,
        nextOffset: normalizedPage.nextOffset,
        hasMore: normalizedPage.hasMore,
        isCapped: normalizedPage.isCapped,
      };

      return {
        ...state,
        overlay: {
          kind: "graph",
          graph: {
            ...state.overlay.graph,
            response: mergedResponse,
            rows: computeGitGraphRows(mergedCommits),
            isLoadingMore: false,
            loadMoreError: null,
            hasMore: normalizedPage.hasMore,
            nextOffset: normalizedPage.nextOffset,
            pageSize: normalizedPage.pageSize,
            isCapped: normalizedPage.isCapped,
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
          loadMoreError: getErrorDetail(res.data) ?? "Failed to load more commits.",
        },
      },
    };
  });
}

export async function openGitGraphOverlay(): Promise<void> {
  const allRefs = true;
  useGitStore.setState((state) => ({
    ...state,
    overlay: {
      kind: "graph",
      graph: {
        allRefs,
        response: null,
        rows: [],
        filterText: "",
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
        selectedCommitFileOldPath: null,
        selectedCommitFileDiffResponse: null,
        selectedCommitFileDiffIsLoading: false,
        selectedCommitFileDiffError: null,
      },
    },
  }));
  await refreshGitGraph(allRefs);
}

export async function refreshGitGraphOverlay(): Promise<void> {
  const overlay = useGitStore.getState().overlay;
  if (overlay.kind !== "graph") {
    return;
  }
  await refreshGitGraph(overlay.graph.allRefs);
}

export async function toggleGitGraphAllRefs(): Promise<void> {
  const overlay = useGitStore.getState().overlay;
  if (overlay.kind !== "graph") {
    return;
  }
  await refreshGitGraph(!overlay.graph.allRefs);
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
          selectedCommitFileOldPath: null,
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
    const first = res.data.files[0] ?? null;
    if (first) {
      await selectGitCommitFile({
        path: first.path,
        oldPath: first.oldPath ?? null,
      });
    }
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
          selectedCommitFileOldPath: oldPath,
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
