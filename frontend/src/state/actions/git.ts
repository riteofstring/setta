import {
  callOpenAPI,
  getErrorDetail,
  res200,
  type ResponseDataAndStatus,
} from "@setta/app-subsystem-frontend-sdk";
import {
  getGitCommitDetails,
  getGitCommitFileDiff,
  getGitDiff,
  getGitLog,
  getGitStatus,
  type GitreadCommitDetailsResponse as CommitDetailsResponse,
  type GitreadCommitFileDiffResponse as CommitFileDiffResponse,
  type GitreadDiffResponse as DiffResponse,
  type GitreadDiffRequest,
  type GitreadLogResponse as LogResponse,
  type GitreadStatusEntry as StatusEntry,
  type GitreadStatusResponse as StatusResponse,
} from "openapi/http";
import { ensureTrackedGitPaneGraphWindow } from "state/actions/projectChatWindowing";
import { useProjectState } from "state/definitions";
import { useGitStore } from "state/git";
import {
  appendGitGraphRows,
  computeGitGraphRowsWithState,
  createEmptyGitGraphRowComputationState,
} from "utils/gitGraph";

type DiffMode = GitreadDiffRequest["mode"];
let statusRequestId = 0;
let diffRequestId = 0;
let logRequestId = 0;
let commitDetailsRequestId = 0;
let commitFileDiffRequestId = 0;
const DEFAULT_GIT_GRAPH_PAGE_SIZE = 250;
type GitStatusRouteResponse = ResponseDataAndStatus<StatusResponse>;
type GitDiffRouteResponse = ResponseDataAndStatus<DiffResponse>;
type GitLogRouteResponse = ResponseDataAndStatus<LogResponse>;
type GitCommitDetailsRouteResponse =
  ResponseDataAndStatus<CommitDetailsResponse>;
type GitCommitFileDiffRouteResponse =
  ResponseDataAndStatus<CommitFileDiffResponse>;
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
function buildGitDiffAvailabilityByPath(entries: readonly StatusEntry[]): Map<
  string,
  {
    hasStaged: boolean;
    hasUnstaged: boolean;
  }
> {
  const availabilityByPath = new Map<
    string,
    {
      hasStaged: boolean;
      hasUnstaged: boolean;
    }
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
type GitGraphState = NonNullable<ReturnType<typeof getGitGraphState>>;
type GitLogCommit = NonNullable<LogResponse["commits"]>[number];

function canLoadMoreGitGraphCommits(
  graph: GitGraphState | null,
  force: boolean,
): graph is GitGraphState & { response: LogResponse } {
  if (!graph || !graph.response) {
    return false;
  }
  if (graph.isLoading || graph.isLoadingMore) {
    return false;
  }
  if (graph.nextOffset === null || !graph.hasMore) {
    return false;
  }
  if (!force && graph.loadMoreError) {
    return false;
  }
  return graph.filterText.trim() === "";
}

function setGitGraphLoadingMore(): void {
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

function collectNewGitGraphCommits(
  seenCommitHashes: ReadonlySet<string>,
  commits: readonly GitLogCommit[],
) {
  const nextSeenCommitHashes = new Set(seenCommitHashes);
  const appendedCommits: GitLogCommit[] = [];
  for (const commit of commits) {
    if (nextSeenCommitHashes.has(commit.hash)) {
      continue;
    }
    nextSeenCommitHashes.add(commit.hash);
    appendedCommits.push(commit);
  }
  return {
    nextSeenCommitHashes,
    appendedCommits,
  };
}

function buildAppendedGitGraphRows(
  graph: GitGraphState,
  commits: readonly GitLogCommit[],
) {
  if (commits.length === 0) {
    return {
      rows: [] as GitGraphState["rows"],
      rowComputationState: graph.rowComputationState,
    };
  }
  return appendGitGraphRows(commits, graph.rowComputationState);
}

function applyGitGraphLoadMoreSuccess(
  requestProjectConfigId: string | null,
  nextPage: LogResponse,
): void {
  useGitStore.setState((state) => {
    if (
      !state.graph ||
      state.graph.projectConfigId !== requestProjectConfigId ||
      !state.graph.response
    ) {
      return state;
    }
    const nextCommits = nextPage.commits ?? [];
    const { nextSeenCommitHashes, appendedCommits } = collectNewGitGraphCommits(
      state.graph.seenCommitHashes,
      nextCommits,
    );
    const appendedResult = buildAppendedGitGraphRows(
      state.graph,
      appendedCommits,
    );
    const mergedResponse = {
      ...state.graph.response,
      commits: (state.graph.response.commits ?? []).concat(appendedCommits),
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
        rows: state.graph.rows.concat(appendedResult.rows),
        rowComputationState: appendedResult.rowComputationState,
        isLoadingMore: false,
        loadMoreError: null,
        hasMore: nextPage.hasMore,
        nextOffset: nextPage.nextOffset,
        pageSize: nextPage.pageSize,
        isCapped: nextPage.isCapped,
      },
    };
  });
}

function applyGitGraphLoadMoreError(
  requestProjectConfigId: string | null,
  detail: string,
): void {
  useGitStore.setState((state) => {
    if (
      !state.graph ||
      state.graph.projectConfigId !== requestProjectConfigId
    ) {
      return state;
    }
    return {
      ...state,
      graph: {
        ...state.graph,
        isLoadingMore: false,
        loadMoreError: detail,
      },
    };
  });
}

export async function refreshGitStatus(): Promise<void> {
  const requestId = (statusRequestId += 1);
  useGitStore.setState((state) => ({
    ...state,
    status: { ...state.status, isLoading: true, error: null },
  }));
  const res = (await callOpenAPI(getGitStatus())) as GitStatusRouteResponse;
  if (requestId !== statusRequestId) {
    return;
  }
  if (res200(res)) {
    const diffAvailabilityByPath = buildGitDiffAvailabilityByPath(
      res.data.entries ?? [],
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
      response: null,
      diffAvailabilityByPath: new Map(),
      isLoading: false,
      error: getErrorDetail(res.data) ?? "Failed to load git status.",
    },
  }));
}
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
  mode: DiffMode;
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
  const res = (await callOpenAPI(
    getGitDiff({
      body: {
        path,
        oldPath,
        mode,
      },
    } as Parameters<typeof getGitDiff>[0]),
  )) as GitDiffRouteResponse;
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
  mode: DiffMode;
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
export async function setGitDiffMode(mode: DiffMode): Promise<void> {
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
  const res = (await callOpenAPI(
    getGitLog({
      body: {
        rev: "HEAD",
        allRefs,
        offset: 0,
        pageSize: DEFAULT_GIT_GRAPH_PAGE_SIZE,
      },
    } as Parameters<typeof getGitLog>[0]),
  )) as GitLogRouteResponse;
  if (requestId !== logRequestId) {
    return;
  }
  if (requestProjectConfigId !== getCurrentGitGraphProjectConfigId()) {
    return;
  }
  if (res200(res)) {
    const responseData = res.data;
    const commits = responseData.commits ?? [];
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
  if (!canLoadMoreGitGraphCommits(graph, force)) {
    return;
  }
  const requestId = (logRequestId += 1);
  const nextOffset = graph.nextOffset;
  const pageSize = graph.pageSize;
  const allRefs = graph.allRefs;
  const requestProjectConfigId = graph.projectConfigId;
  setGitGraphLoadingMore();
  const res = (await callOpenAPI(
    getGitLog({
      body: {
        rev: "HEAD",
        allRefs,
        offset: nextOffset,
        pageSize,
      },
    } as Parameters<typeof getGitLog>[0]),
  )) as GitLogRouteResponse;
  if (requestId !== logRequestId) {
    return;
  }
  if (requestProjectConfigId !== getCurrentGitGraphProjectConfigId()) {
    return;
  }
  if (res200(res)) {
    applyGitGraphLoadMoreSuccess(requestProjectConfigId, res.data);
    return;
  }
  applyGitGraphLoadMoreError(
    requestProjectConfigId,
    getErrorDetail(res.data) ?? "Failed to load more commits.",
  );
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
  const res = (await callOpenAPI(
    getGitCommitDetails({
      body: {
        commitHash,
      },
    } as Parameters<typeof getGitCommitDetails>[0]),
  )) as GitCommitDetailsRouteResponse;
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
  const res = (await callOpenAPI(
    getGitCommitFileDiff({
      body: {
        commitHash,
        path,
        oldPath,
      },
    } as Parameters<typeof getGitCommitFileDiff>[0]),
  )) as GitCommitFileDiffRouteResponse;
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
