import {
  getGitStatus,
  type GitreadCommit as Commit,
  type GitreadCommitDetailsResponse as CommitDetailsResponse,
  type GitreadLogResponse as LogResponse,
  type GitreadStatusResponse as StatusResponse,
} from "openapi/http";
import { useGitStore } from "state/git";
import { computeGitGraphRowsWithState } from "utils/gitGraph";
import { expect, vi } from "vitest";
import { refreshGitStatus } from "./git";

export function commit(hash: string, parents: string[]): Commit {
  return {
    hash,
    parents,
    authorName: "A",
    authorEmail: "a@example.com",
    authorTimeMs: 1,
    subject: hash,
    decorations: [],
  };
}

export function createLogResponse({
  commits,
  offset,
  pageSize,
  nextOffset,
  hasMore,
  isCapped,
}: {
  commits: Commit[];
  offset: number;
  pageSize: number;
  nextOffset: number | null;
  hasMore: boolean;
  isCapped: boolean;
}): LogResponse {
  return {
    repoRoot: "/repo",
    headBranch: "main",
    commits,
    offset,
    pageSize,
    nextOffset,
    hasMore,
    isCapped,
  };
}

export function createCommitDetailsResponse(
  overrides: Partial<CommitDetailsResponse> &
    Pick<CommitDetailsResponse, "commitHash">,
): CommitDetailsResponse {
  const defaults: CommitDetailsResponse = {
    repoRoot: "/repo",
    commitHash: overrides.commitHash,
    parents: [],
    authorName: "A",
    authorEmail: "a@example.com",
    authorTimeMs: 1,
    committerName: "A",
    committerEmail: "a@example.com",
    committerTimeMs: 1,
    subject: overrides.commitHash,
    body: "",
    files: [],
    isTruncated: false,
  };
  return {
    ...defaults,
    ...overrides,
    commitHash: overrides.commitHash,
  };
}

export function createStatusResponse(
  entries: StatusResponse["entries"],
): StatusResponse {
  return {
    repo: {
      isGitRepo: true,
      repoRoot: "/repo",
      headBranch: "main",
      headCommit: "abc123",
    },
    entries,
    isTruncated: false,
    worktrees: [],
  };
}

export function setGraphOverlayState({
  projectConfigId = "project-config-1",
  response,
  filterText = "",
  loadMoreError = null,
}: {
  projectConfigId?: string;
  response: LogResponse;
  filterText?: string;
  loadMoreError?: string | null;
}): void {
  const commits = response.commits ?? [];
  const rowResult = computeGitGraphRowsWithState(commits);
  useGitStore.setState((state) => ({
    ...state,
    graph: {
      projectConfigId,
      allRefs: true,
      response,
      seenCommitHashes: new Set(commits.map((commit) => commit.hash)),
      rows: rowResult.rows,
      rowComputationState: rowResult.rowComputationState,
      filterText,
      isLoading: false,
      isLoadingMore: false,
      error: null,
      loadMoreError,
      hasMore: response.hasMore,
      nextOffset: response.nextOffset,
      pageSize: response.pageSize,
      isCapped: response.isCapped,
      selectedCommitHash: null,
      selectedCommitDetails: null,
      selectedCommitDetailsIsLoading: false,
      selectedCommitDetailsError: null,
      selectedCommitFilePath: null,
      selectedCommitFileDiffResponse: null,
      selectedCommitFileDiffIsLoading: false,
      selectedCommitFileDiffError: null,
    },
  }));
}

export function getGraphState() {
  const graph = useGitStore.getState().graph;
  expect(graph).not.toBeNull();
  if (!graph) {
    throw new Error("Expected git graph state.");
  }
  return graph;
}

export function createDeferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

export async function setGitStatusResponse(
  entries: Array<{
    path: string;
    oldPath: string | null;
    indexStatus: string;
    worktreeStatus: string;
    kind: "conflict" | "staged" | "unstaged" | "untracked";
  }>,
): Promise<void> {
  vi.mocked(getGitStatus).mockResolvedValue({
    status: 200,
    hasResponse: true,
    data: createStatusResponse(entries),
  });
  await refreshGitStatus();
}
