import { useGitStore } from "state/git";
import { getErrorDetail, res200 } from "utils/endpointUtils";
import {
  route_get_git_commit_diff,
  route_get_git_diff,
  route_get_git_log,
  route_get_git_status,
} from "utils/generatedEndpoints";
import type { GitCommit, GitDiffMode } from "utils/generatedTypes";
import { computeGitGraphRows } from "utils/gitGraph";

let statusRequestId = 0;
let diffRequestId = 0;
let logRequestId = 0;
let commitDiffRequestId = 0;

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
          error: null,
          selectedCommitHash: null,
          selectedCommitResponse: null,
          selectedCommitIsLoading: false,
          selectedCommitError: null,
        },
      },
    };
  });

  const res = await route_get_git_log({ rev: "HEAD", maxCount: 2000, allRefs });
  if (requestId !== logRequestId) {
    return;
  }
  if (res200(res)) {
    const commits = res.data.commits.map(normalizeGitCommit);
    const normalizedResponse = { ...res.data, commits };
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
        error: null,
        selectedCommitHash: null,
        selectedCommitResponse: null,
        selectedCommitIsLoading: false,
        selectedCommitError: null,
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
  const requestId = (commitDiffRequestId += 1);
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
          selectedCommitResponse: null,
          selectedCommitIsLoading: true,
          selectedCommitError: null,
        },
      },
    };
  });

  const res = await route_get_git_commit_diff({ commitHash });
  if (requestId !== commitDiffRequestId) {
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
            selectedCommitResponse: res.data,
            selectedCommitIsLoading: false,
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
          selectedCommitResponse: null,
          selectedCommitIsLoading: false,
          selectedCommitError:
            getErrorDetail(res.data) ?? "Failed to load commit diff.",
        },
      },
    };
  });
}
