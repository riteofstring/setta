import {
  getGitCommitDetails,
  getGitCommitFileDiff,
  getGitDiff,
  getGitLog,
  getGitStatus,
  type GitreadCommit as Commit,
  type GitreadCommitDetailsResponse as CommitDetailsResponse,
  type GitreadLogResponse as LogResponse,
  type GitreadStatusResponse as StatusResponse,
} from "openapi/http";
import { ensureTrackedGitPaneGraphWindow } from "state/actions/projectChatWindowing";
import { useProjectState } from "state/definitions";
import { useGitStore } from "state/git";
import { computeGitGraphRowsWithState } from "utils/gitGraph";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearGitGraphSelectedCommit,
  ensureGitGraphStateLoaded,
  loadMoreGitGraphCommits,
  openGitDiffOverlay,
  openGitGraphOverlay,
  refreshGitGraphOverlay,
  refreshGitStatus,
  selectGitCommit,
  selectGitCommitFile,
  setGitDiffMode,
} from "./git";

vi.mock("openapi/http", () => ({
  getGitCommitDetails: vi.fn(),
  getGitCommitFileDiff: vi.fn(),
  getGitDiff: vi.fn(),
  getGitLog: vi.fn(),
  getGitStatus: vi.fn(),
}));

vi.mock("@setta/app-subsystem-frontend-sdk", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@setta/app-subsystem-frontend-sdk")>();
  return {
    ...actual,
    callOpenAPI: function <T>(promise: Promise<T>) {
      return promise;
    },
  };
});

vi.mock("state/actions/projectChatWindowing", () => ({
  ensureTrackedGitPaneGraphWindow: vi.fn(),
}));

function commit(hash: string, parents: string[]): Commit {
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

function createLogResponse({
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

function createCommitDetailsResponse(
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

function createStatusResponse(
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

function setGraphOverlayState({
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

function getGraphState() {
  const graph = useGitStore.getState().graph;
  expect(graph).not.toBeNull();
  if (!graph) {
    throw new Error("Expected git graph state.");
  }
  return graph;
}

function createDeferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

async function setGitStatusResponse(
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

describe("git graph actions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useGitStore.getState().reset();
    useProjectState.setState((state) => {
      state.projectConfig.id = "project-config-1";
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
    useGitStore.getState().reset();
    useProjectState.setState((state) => {
      state.projectConfig.id = "project-config-1";
    });
  });

  it("appends additional git-log pages without duplicating commit hashes", async () => {
    // Start with two commits loaded in the graph overlay.
    const c1 = commit("c1", []);
    const c2 = commit("c2", ["c1"]);
    const c3 = commit("c3", ["c2"]);
    const firstPage = createLogResponse({
      commits: [c3, c2],
      offset: 0,
      pageSize: 2,
      nextOffset: 2,
      hasMore: true,
      isCapped: false,
    });
    setGraphOverlayState({ response: firstPage });

    vi.mocked(getGitLog).mockResolvedValue({
      status: 200,
      hasResponse: true,
      // Backend page intentionally repeats c2; client should dedupe by hash.
      data: createLogResponse({
        commits: [c2, c1],
        offset: 2,
        pageSize: 2,
        nextOffset: null,
        hasMore: false,
        isCapped: false,
      }),
    });

    await loadMoreGitGraphCommits();

    expect(getGitLog).toHaveBeenCalledWith({
      body: {
        rev: "HEAD",
        allRefs: true,
        offset: 2,
        pageSize: 2,
      },
    });

    const graph = getGraphState();
    expect(graph.response?.commits.map((entry) => entry.hash)).toEqual([
      "c3",
      "c2",
      "c1",
    ]);
    const expectedRows = computeGitGraphRowsWithState([c3, c2, c1]).rows;
    expect(graph.rows).toEqual(expectedRows);
    expect(Array.from(graph.seenCommitHashes).sort()).toEqual([
      "c1",
      "c2",
      "c3",
    ]);
    expect(graph.isLoadingMore).toBe(false);
    expect(graph.hasMore).toBe(false);
    expect(graph.nextOffset).toBeNull();
    expect(graph.loadMoreError).toBeNull();
  });

  it("keeps git-graph rows stable when a later page only repeats seen commits", async () => {
    const c1 = commit("c1", []);
    const c2 = commit("c2", ["c1"]);
    const c3 = commit("c3", ["c2"]);
    const initialResponse = createLogResponse({
      commits: [c3, c2, c1],
      offset: 0,
      pageSize: 3,
      nextOffset: 3,
      hasMore: true,
      isCapped: false,
    });
    setGraphOverlayState({ response: initialResponse });
    const initialGraph = getGraphState();

    vi.mocked(getGitLog).mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: createLogResponse({
        commits: [c2, c1],
        offset: 3,
        pageSize: 2,
        nextOffset: null,
        hasMore: false,
        isCapped: false,
      }),
    });

    await loadMoreGitGraphCommits();

    const graph = getGraphState();
    expect(graph.response?.commits.map((entry) => entry.hash)).toEqual([
      "c3",
      "c2",
      "c1",
    ]);
    expect(graph.rows).toEqual(initialGraph.rows);
    expect(graph.rowComputationState).toEqual(initialGraph.rowComputationState);
    expect(Array.from(graph.seenCommitHashes).sort()).toEqual([
      "c1",
      "c2",
      "c3",
    ]);
    expect(graph.hasMore).toBe(false);
    expect(graph.nextOffset).toBeNull();
  });

  it("does not request another page while a graph filter is active", async () => {
    // Filtering is limited to already loaded commits, so pagination must be paused.
    const c1 = commit("c1", []);
    const c2 = commit("c2", ["c1"]);
    setGraphOverlayState({
      response: createLogResponse({
        commits: [c2, c1],
        offset: 0,
        pageSize: 2,
        nextOffset: 2,
        hasMore: true,
        isCapped: false,
      }),
      filterText: "c1",
    });

    await loadMoreGitGraphCommits();

    expect(getGitLog).not.toHaveBeenCalled();
    const graph = getGraphState();
    expect(graph.isLoadingMore).toBe(false);
    expect(graph.loadMoreError).toBeNull();
  });

  it("stores load-more errors when a pagination request fails", async () => {
    // A failed page request should surface an error while keeping pagination state.
    const c1 = commit("c1", []);
    const c2 = commit("c2", ["c1"]);
    setGraphOverlayState({
      response: createLogResponse({
        commits: [c2, c1],
        offset: 0,
        pageSize: 2,
        nextOffset: 2,
        hasMore: true,
        isCapped: false,
      }),
    });
    vi.mocked(getGitLog).mockResolvedValue({
      status: 500,
      hasResponse: true,
      data: { detail: "backend failed while loading more commits" },
    });

    await loadMoreGitGraphCommits();

    const graph = getGraphState();
    expect(graph.isLoadingMore).toBe(false);
    expect(graph.loadMoreError).toBe(
      "backend failed while loading more commits",
    );
    expect(graph.nextOffset).toBe(2);
  });

  it("reloads git graph state when the current project config changes", async () => {
    const currentProjectResponse = createLogResponse({
      commits: [commit("old-1", [])],
      offset: 0,
      pageSize: 2,
      nextOffset: null,
      hasMore: false,
      isCapped: false,
    });
    setGraphOverlayState({
      projectConfigId: "project-config-1",
      response: currentProjectResponse,
    });
    useProjectState.setState((state) => {
      state.projectConfig.id = "project-config-2";
    });
    vi.mocked(getGitLog).mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: createLogResponse({
        commits: [commit("new-1", [])],
        offset: 0,
        pageSize: 2,
        nextOffset: null,
        hasMore: false,
        isCapped: false,
      }),
    });

    await ensureGitGraphStateLoaded();

    expect(getGitLog).toHaveBeenCalledWith({
      body: {
        rev: "HEAD",
        allRefs: false,
        offset: 0,
        pageSize: 250,
      },
    });
    const graph = getGraphState();
    expect(graph.projectConfigId).toBe("project-config-2");
    expect(graph.response?.commits.map((entry) => entry.hash)).toEqual([
      "new-1",
    ]);
  });

  it("does not auto-load more again after a load-more error until retry is explicit", async () => {
    const c1 = commit("c1", []);
    const c2 = commit("c2", ["c1"]);
    setGraphOverlayState({
      response: createLogResponse({
        commits: [c2, c1],
        offset: 0,
        pageSize: 2,
        nextOffset: 2,
        hasMore: true,
        isCapped: false,
      }),
      loadMoreError: "backend failed while loading more commits",
    });
    vi.mocked(getGitLog).mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: createLogResponse({
        commits: [],
        offset: 2,
        pageSize: 2,
        nextOffset: null,
        hasMore: false,
        isCapped: false,
      }),
    });

    await loadMoreGitGraphCommits();
    expect(getGitLog).not.toHaveBeenCalled();

    await loadMoreGitGraphCommits({ force: true });
    expect(getGitLog).toHaveBeenCalledTimes(1);
  });

  it("preserves oldPath when requesting diffs across mode toggles", async () => {
    await setGitStatusResponse([
      {
        path: "renamed.py",
        oldPath: "legacy.py",
        indexStatus: "R",
        worktreeStatus: " ",
        kind: "staged",
      },
      {
        path: "renamed.py",
        oldPath: "legacy.py",
        indexStatus: " ",
        worktreeStatus: "M",
        kind: "unstaged",
      },
    ]);
    vi.mocked(getGitDiff).mockImplementation(async ({ body }) => {
      if (!body) {
        throw new Error("Expected git diff request body.");
      }
      const { path, mode } = body;
      return {
        status: 200,
        hasResponse: true,
        data: {
          repoRoot: "/repo",
          path,
          mode,
          diff: "",
          isTruncated: false,
        },
      };
    });

    await openGitDiffOverlay({
      path: "renamed.py",
      oldPath: "legacy.py",
      mode: "staged",
    });

    expect(getGitDiff).toHaveBeenNthCalledWith(1, {
      body: {
        path: "renamed.py",
        oldPath: "legacy.py",
        mode: "staged",
      },
    });

    await setGitDiffMode("unstaged");

    expect(getGitDiff).toHaveBeenNthCalledWith(2, {
      body: {
        path: "renamed.py",
        oldPath: "legacy.py",
        mode: "unstaged",
      },
    });

    const overlay = useGitStore.getState().overlay;
    expect(overlay.kind).toBe("diff");
    if (overlay.kind !== "diff") {
      return;
    }
    expect(overlay.diff.oldPath).toBe("legacy.py");
  });

  it("does not duplicate preload state writes when opening git diff overlay", async () => {
    await setGitStatusResponse([
      {
        path: "tracked.py",
        oldPath: null,
        indexStatus: "M",
        worktreeStatus: "M",
        kind: "staged",
      },
    ]);
    vi.mocked(getGitDiff).mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: {
        repoRoot: "/repo",
        path: "tracked.py",
        mode: "staged",
        diff: "",
        isTruncated: false,
      },
    });
    const setStateSpy = vi.spyOn(useGitStore, "setState");

    await openGitDiffOverlay({
      path: "tracked.py",
      oldPath: null,
      mode: "staged",
    });

    expect(setStateSpy).toHaveBeenCalledTimes(2);
    setStateSpy.mockRestore();
  });

  it("builds a path-indexed staged/unstaged availability map", async () => {
    vi.mocked(getGitStatus).mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: createStatusResponse([
        {
          path: "tracked.py",
          oldPath: null,
          indexStatus: "M",
          worktreeStatus: " ",
          kind: "staged",
        },
        {
          path: "tracked.py",
          oldPath: null,
          indexStatus: " ",
          worktreeStatus: "M",
          kind: "unstaged",
        },
        {
          path: "new.py",
          oldPath: null,
          indexStatus: "?",
          worktreeStatus: "?",
          kind: "untracked",
        },
      ]),
    });

    await refreshGitStatus();

    const availabilityByPath =
      useGitStore.getState().status.diffAvailabilityByPath;

    expect(availabilityByPath.get("tracked.py")).toEqual({
      hasStaged: true,
      hasUnstaged: true,
    });
    expect(availabilityByPath.get("new.py")).toEqual({
      hasStaged: false,
      hasUnstaged: true,
    });
  });

  it("treats prototype-like file names as normal keys in diff availability map", async () => {
    vi.mocked(getGitStatus).mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: createStatusResponse([
        {
          path: "toString",
          oldPath: null,
          indexStatus: "M",
          worktreeStatus: " ",
          kind: "staged",
        },
        {
          path: "__proto__",
          oldPath: null,
          indexStatus: " ",
          worktreeStatus: "M",
          kind: "unstaged",
        },
      ]),
    });

    await refreshGitStatus();

    const availabilityByPath =
      useGitStore.getState().status.diffAvailabilityByPath;

    expect(availabilityByPath.get("toString")).toEqual({
      hasStaged: true,
      hasUnstaged: false,
    });
    expect(availabilityByPath.get("__proto__")).toEqual({
      hasStaged: false,
      hasUnstaged: true,
    });
  });

  it("clears stale git status payload when a refresh fails", async () => {
    await setGitStatusResponse([
      {
        path: "tracked.py",
        oldPath: null,
        indexStatus: "M",
        worktreeStatus: "M",
        kind: "staged",
      },
    ]);
    vi.mocked(getGitStatus).mockResolvedValue({
      status: 500,
      hasResponse: true,
      data: { detail: "status backend failed" },
    });

    await refreshGitStatus();

    const status = useGitStore.getState().status;
    expect(status.response).toBeNull();
    expect(status.diffAvailabilityByPath.size).toBe(0);
    expect(status.error).toBe("status backend failed");
  });

  it("ignores stale commit file diff responses after commit selection changes", async () => {
    const commitA = commit("a1b2c3", []);
    const commitB = commit("b4c5d6", ["a1b2c3"]);
    setGraphOverlayState({
      response: createLogResponse({
        commits: [commitB, commitA],
        offset: 0,
        pageSize: 2,
        nextOffset: null,
        hasMore: false,
        isCapped: false,
      }),
    });

    vi.mocked(getGitCommitDetails).mockImplementation(async ({ body }) => {
      if (!body) {
        throw new Error("Expected commit details request body.");
      }
      const { commitHash } = body;
      if (commitHash === "a1b2c3") {
        return {
          status: 200,
          hasResponse: true,
          data: createCommitDetailsResponse({
            repoRoot: "/repo",
            commitHash,
            parents: [],
            authorName: "A",
            authorEmail: "a@example.com",
            authorTimeMs: 1,
            committerName: "A",
            committerEmail: "a@example.com",
            committerTimeMs: 1,
            subject: "A",
            body: "",
            isTruncated: false,
            files: [
              {
                path: "a.txt",
                oldPath: null,
                status: "M",
                additions: 1,
                deletions: 1,
              },
            ],
          }),
        };
      }
      return {
        status: 200,
        hasResponse: true,
        data: createCommitDetailsResponse({
          repoRoot: "/repo",
          commitHash,
          parents: ["a1b2c3"],
          authorName: "B",
          authorEmail: "b@example.com",
          authorTimeMs: 2,
          committerName: "B",
          committerEmail: "b@example.com",
          committerTimeMs: 2,
          subject: "B",
          body: "",
          isTruncated: false,
          files: [
            {
              path: "b.txt",
              oldPath: null,
              status: "M",
              additions: 1,
              deletions: 1,
            },
          ],
        }),
      };
    });
    vi.mocked(getGitCommitFileDiff).mockImplementation(() => {
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve({
            status: 200,
            hasResponse: true,
            data: {
              repoRoot: "/repo",
              commitHash: "a1b2c3",
              path: "a.txt",
              diff: "stale",
              isTruncated: false,
            },
          });
        }, 0);
      });
    });

    await selectGitCommit("a1b2c3");
    await selectGitCommitFile({
      path: "a.txt",
      oldPath: null,
    });
    await selectGitCommit("b4c5d6");
    await vi.waitFor(() => {
      const graph = getGraphState();
      expect(graph.selectedCommitHash).toBe("b4c5d6");
      expect(graph.selectedCommitFileDiffResponse).toBeNull();
    });

    const calls = vi.mocked(getGitCommitFileDiff).mock.calls;
    expect(calls).toEqual([
      [{ body: { commitHash: "a1b2c3", path: "a.txt", oldPath: null } }],
    ]);
  });

  it("ignores stale commit details responses after the graph switches to another project", async () => {
    const commitA = commit("a1b2c3", []);
    const detailsDeferred = createDeferred<{
      status: number;
      hasResponse: boolean;
      data: ReturnType<typeof createCommitDetailsResponse>;
    }>();
    setGraphOverlayState({
      projectConfigId: "project-a",
      response: createLogResponse({
        commits: [commitA],
        offset: 0,
        pageSize: 2,
        nextOffset: null,
        hasMore: false,
        isCapped: false,
      }),
    });
    vi.mocked(getGitCommitDetails).mockImplementation(({ body }) => {
      if (!body) {
        throw new Error("Expected commit details request body.");
      }
      const { commitHash } = body;
      if (commitHash !== "a1b2c3") {
        throw new Error("Unexpected commit details request.");
      }
      return detailsDeferred.promise;
    });

    // Start a details request for project A, then replace the graph owner with
    // project B before the delayed response resolves.
    const pendingSelection = selectGitCommit("a1b2c3");

    useProjectState.setState((state) => {
      state.projectConfig.id = "project-b";
    });
    setGraphOverlayState({
      projectConfigId: "project-b",
      response: createLogResponse({
        commits: [commitA],
        offset: 0,
        pageSize: 2,
        nextOffset: null,
        hasMore: false,
        isCapped: false,
      }),
    });

    detailsDeferred.resolve({
      status: 200,
      hasResponse: true,
      data: createCommitDetailsResponse({
        repoRoot: "/repo-a",
        commitHash: "a1b2c3",
        parents: [],
        authorName: "A",
        authorEmail: "a@example.com",
        authorTimeMs: 1,
        committerName: "A",
        committerEmail: "a@example.com",
        committerTimeMs: 1,
        subject: "stale-project-a-details",
        body: "",
        isTruncated: false,
        files: [],
      }),
    });
    await pendingSelection;

    const graph = getGraphState();
    expect(graph.projectConfigId).toBe("project-b");
    expect(graph.selectedCommitHash).toBeNull();
    expect(graph.selectedCommitDetails).toBeNull();
    expect(graph.selectedCommitDetailsError).toBeNull();
  });

  it("ignores stale commit file diff responses after the graph switches to another project", async () => {
    const commitA = commit("a1b2c3", []);
    const diffDeferred = createDeferred<{
      status: number;
      hasResponse: boolean;
      data: {
        repoRoot: string;
        commitHash: string;
        path: string;
        diff: string;
        isTruncated: boolean;
      };
    }>();
    setGraphOverlayState({
      projectConfigId: "project-a",
      response: createLogResponse({
        commits: [commitA],
        offset: 0,
        pageSize: 2,
        nextOffset: null,
        hasMore: false,
        isCapped: false,
      }),
    });
    vi.mocked(getGitCommitDetails).mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: createCommitDetailsResponse({
        repoRoot: "/repo",
        commitHash: "a1b2c3",
        parents: [],
        authorName: "A",
        authorEmail: "a@example.com",
        authorTimeMs: 1,
        committerName: "A",
        committerEmail: "a@example.com",
        committerTimeMs: 1,
        subject: "A",
        body: "",
        isTruncated: false,
        files: [
          {
            path: "a.txt",
            oldPath: null,
            status: "M",
            additions: 1,
            deletions: 1,
          },
        ],
      }),
    });
    vi.mocked(getGitCommitFileDiff).mockImplementation(() => {
      return diffDeferred.promise;
    });

    // The delayed diff response belongs to project A and must be ignored once
    // project B owns the graph state, even if the hash/path match.
    await selectGitCommit("a1b2c3");
    const pendingDiff = selectGitCommitFile({
      path: "a.txt",
      oldPath: null,
    });

    useProjectState.setState((state) => {
      state.projectConfig.id = "project-b";
    });
    setGraphOverlayState({
      projectConfigId: "project-b",
      response: createLogResponse({
        commits: [commitA],
        offset: 0,
        pageSize: 2,
        nextOffset: null,
        hasMore: false,
        isCapped: false,
      }),
    });

    diffDeferred.resolve({
      status: 200,
      hasResponse: true,
      data: {
        repoRoot: "/repo-a",
        commitHash: "a1b2c3",
        path: "a.txt",
        diff: "stale project-a diff",
        isTruncated: false,
      },
    });
    await pendingDiff;

    const graph = getGraphState();
    expect(graph.projectConfigId).toBe("project-b");
    expect(graph.selectedCommitHash).toBeNull();
    expect(graph.selectedCommitFileDiffResponse).toBeNull();
    expect(graph.selectedCommitFileDiffError).toBeNull();
  });

  it("loads commit details on selection but waits for explicit file selection to load diff", async () => {
    const commitA = commit("a1b2c3", []);
    setGraphOverlayState({
      response: createLogResponse({
        commits: [commitA],
        offset: 0,
        pageSize: 2,
        nextOffset: null,
        hasMore: false,
        isCapped: false,
      }),
    });
    vi.mocked(getGitCommitDetails).mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: createCommitDetailsResponse({
        repoRoot: "/repo",
        commitHash: "a1b2c3",
        parents: [],
        authorName: "A",
        authorEmail: "a@example.com",
        authorTimeMs: 1,
        committerName: "A",
        committerEmail: "a@example.com",
        committerTimeMs: 1,
        subject: "A",
        body: "",
        isTruncated: false,
        files: [
          {
            path: "a.txt",
            oldPath: null,
            status: "M",
            additions: 1,
            deletions: 1,
          },
        ],
      }),
    });
    vi.mocked(getGitCommitFileDiff).mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: {
        repoRoot: "/repo",
        commitHash: "a1b2c3",
        path: "a.txt",
        diff: "content",
        isTruncated: false,
      },
    });

    await selectGitCommit("a1b2c3");
    expect(getGitCommitFileDiff).not.toHaveBeenCalled();

    await selectGitCommitFile({
      path: "a.txt",
      oldPath: null,
    });
    expect(getGitCommitFileDiff).toHaveBeenCalledWith({
      body: {
        commitHash: "a1b2c3",
        path: "a.txt",
        oldPath: null,
      },
    });
  });

  it("surfaces backend detail when commit file diff path is not part of commit", async () => {
    const commitA = commit("a1b2c3", []);
    setGraphOverlayState({
      response: createLogResponse({
        commits: [commitA],
        offset: 0,
        pageSize: 2,
        nextOffset: null,
        hasMore: false,
        isCapped: false,
      }),
    });
    vi.mocked(getGitCommitDetails).mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: createCommitDetailsResponse({
        repoRoot: "/repo",
        commitHash: "a1b2c3",
        parents: [],
        authorName: "A",
        authorEmail: "a@example.com",
        authorTimeMs: 1,
        committerName: "A",
        committerEmail: "a@example.com",
        committerTimeMs: 1,
        subject: "A",
        body: "",
        isTruncated: false,
        files: [
          {
            path: "a.txt",
            oldPath: null,
            status: "M",
            additions: 1,
            deletions: 1,
          },
        ],
      }),
    });
    vi.mocked(getGitCommitFileDiff).mockResolvedValue({
      status: 404,
      hasResponse: true,
      data: { detail: "File is not part of this commit diff." },
    });

    await selectGitCommit("a1b2c3");
    await selectGitCommitFile({
      path: "a.txt",
      oldPath: null,
    });

    const graph = getGraphState();
    expect(graph.selectedCommitFileDiffResponse).toBeNull();
    expect(graph.selectedCommitFileDiffError).toBe(
      "File is not part of this commit diff.",
    );
  });

  it("opens graph on branch-only mode and does not auto-select a commit", async () => {
    vi.mocked(getGitLog).mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: createLogResponse({
        commits: [
          {
            hash: "abc123",
            parents: ["def456"],
            authorName: "A",
            authorEmail: "a@example.com",
            authorTimeMs: 1,
            subject: "subject",
            decorations: ["HEAD -> main", "origin/main"],
          },
        ],
        offset: 0,
        pageSize: 250,
        nextOffset: null,
        hasMore: false,
        isCapped: false,
      }),
    });

    await openGitGraphOverlay();

    expect(getGitLog).toHaveBeenCalledWith({
      body: {
        rev: "HEAD",
        allRefs: false,
        offset: 0,
        pageSize: 250,
      },
    });
    expect(getGitCommitDetails).not.toHaveBeenCalled();
    expect(getGitCommitFileDiff).not.toHaveBeenCalled();

    const graph = getGraphState();
    const firstCommit = graph.response?.commits[0];
    expect(firstCommit?.hash).toBe("abc123");
    expect(graph.allRefs).toBe(false);
    expect(graph.selectedCommitHash).toBeNull();
  });

  it("does not duplicate preload state writes when opening git graph overlay", async () => {
    vi.mocked(getGitLog).mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: createLogResponse({
        commits: [
          {
            hash: "abc123",
            parents: [],
            authorName: "A",
            authorEmail: "a@example.com",
            authorTimeMs: 1,
            subject: "subject",
            decorations: [],
          },
        ],
        offset: 0,
        pageSize: 250,
        nextOffset: null,
        hasMore: false,
        isCapped: false,
      }),
    });
    const setStateSpy = vi.spyOn(useGitStore, "setState");

    await openGitGraphOverlay();

    expect(ensureTrackedGitPaneGraphWindow).toHaveBeenCalledTimes(1);
    expect(setStateSpy).toHaveBeenCalledTimes(2);
    setStateSpy.mockRestore();
  });

  it("clears selected commit state when refresh removes the selected commit", async () => {
    const commitA = commit("a1b2c3", []);
    const commitB = commit("b4c5d6", ["a1b2c3"]);
    setGraphOverlayState({
      response: createLogResponse({
        commits: [commitB, commitA],
        offset: 0,
        pageSize: 2,
        nextOffset: null,
        hasMore: false,
        isCapped: false,
      }),
    });
    useGitStore.setState((state) => {
      if (!state.graph) {
        return state;
      }
      return {
        ...state,
        graph: {
          ...state.graph,
          selectedCommitHash: "b4c5d6",
          selectedCommitDetails: createCommitDetailsResponse({
            repoRoot: "/repo",
            commitHash: "b4c5d6",
            parents: ["a1b2c3"],
            authorName: "B",
            authorEmail: "b@example.com",
            authorTimeMs: 2,
            committerName: "B",
            committerEmail: "b@example.com",
            committerTimeMs: 2,
            subject: "B",
            body: "",
            isTruncated: false,
            files: [
              {
                path: "b.txt",
                oldPath: null,
                status: "M",
                additions: 1,
                deletions: 1,
              },
            ],
          }),
          selectedCommitDetailsIsLoading: false,
          selectedCommitDetailsError: null,
          selectedCommitFilePath: "b.txt",
          selectedCommitFileDiffResponse: {
            repoRoot: "/repo",
            commitHash: "b4c5d6",
            path: "b.txt",
            diff: "stale",
            isTruncated: false,
          },
          selectedCommitFileDiffIsLoading: false,
          selectedCommitFileDiffError: null,
        },
      };
    });
    vi.mocked(getGitLog).mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: createLogResponse({
        commits: [commitA],
        offset: 0,
        pageSize: 250,
        nextOffset: null,
        hasMore: false,
        isCapped: false,
      }),
    });

    await refreshGitGraphOverlay();

    const graphAfterRefresh = getGraphState();
    expect(graphAfterRefresh.selectedCommitHash).toBeNull();
    expect(graphAfterRefresh.selectedCommitDetails).toBeNull();
    expect(graphAfterRefresh.selectedCommitDetailsIsLoading).toBe(false);
    expect(graphAfterRefresh.selectedCommitDetailsError).toBeNull();
    expect(graphAfterRefresh.selectedCommitFilePath).toBeNull();
    expect(graphAfterRefresh.selectedCommitFileDiffResponse).toBeNull();
    expect(graphAfterRefresh.selectedCommitFileDiffIsLoading).toBe(false);
    expect(graphAfterRefresh.selectedCommitFileDiffError).toBeNull();
  });

  it("clears selected commit details and diff state when selection is cleared", async () => {
    const commitA = commit("a1b2c3", []);
    const commitB = commit("b4c5d6", ["a1b2c3"]);
    setGraphOverlayState({
      response: createLogResponse({
        commits: [commitB, commitA],
        offset: 0,
        pageSize: 2,
        nextOffset: null,
        hasMore: false,
        isCapped: false,
      }),
    });
    useGitStore.setState((state) => {
      if (!state.graph) {
        return state;
      }
      return {
        ...state,
        graph: {
          ...state.graph,
          selectedCommitHash: "b4c5d6",
          selectedCommitDetails: createCommitDetailsResponse({
            repoRoot: "/repo",
            commitHash: "b4c5d6",
            parents: ["a1b2c3"],
            authorName: "B",
            authorEmail: "b@example.com",
            authorTimeMs: 2,
            committerName: "B",
            committerEmail: "b@example.com",
            committerTimeMs: 2,
            subject: "B",
            body: "",
            isTruncated: false,
            files: [
              {
                path: "b.txt",
                oldPath: null,
                status: "M",
                additions: 1,
                deletions: 1,
              },
            ],
          }),
          selectedCommitDetailsIsLoading: true,
          selectedCommitDetailsError: "stale details error",
          selectedCommitFilePath: "b.txt",
          selectedCommitFileDiffResponse: {
            repoRoot: "/repo",
            commitHash: "b4c5d6",
            path: "b.txt",
            diff: "stale",
            isTruncated: false,
          },
          selectedCommitFileDiffIsLoading: true,
          selectedCommitFileDiffError: "stale diff error",
        },
      };
    });

    clearGitGraphSelectedCommit();

    const graphAfterClear = getGraphState();
    expect(graphAfterClear.selectedCommitHash).toBeNull();
    expect(graphAfterClear.selectedCommitDetails).toBeNull();
    expect(graphAfterClear.selectedCommitDetailsIsLoading).toBe(false);
    expect(graphAfterClear.selectedCommitDetailsError).toBeNull();
    expect(graphAfterClear.selectedCommitFilePath).toBeNull();
    expect(graphAfterClear.selectedCommitFileDiffResponse).toBeNull();
    expect(graphAfterClear.selectedCommitFileDiffIsLoading).toBe(false);
    expect(graphAfterClear.selectedCommitFileDiffError).toBeNull();
  });

  it("clears stale git graph rows when refresh fails", async () => {
    const c1 = commit("c1", []);
    const c2 = commit("c2", ["c1"]);
    const firstPage = createLogResponse({
      commits: [c2, c1],
      offset: 0,
      pageSize: 2,
      nextOffset: null,
      hasMore: false,
      isCapped: false,
    });
    setGraphOverlayState({ response: firstPage });
    vi.mocked(getGitLog).mockResolvedValue({
      status: 500,
      hasResponse: true,
      data: { detail: "git log failed on refresh" },
    });

    await refreshGitGraphOverlay();

    const graphAfterFailedRefresh = getGraphState();
    expect(graphAfterFailedRefresh.response).toBeNull();
    expect(graphAfterFailedRefresh.rows).toHaveLength(0);
    expect(graphAfterFailedRefresh.seenCommitHashes.size).toBe(0);
    expect(graphAfterFailedRefresh.selectedCommitHash).toBeNull();
    expect(graphAfterFailedRefresh.selectedCommitDetails).toBeNull();
    expect(graphAfterFailedRefresh.selectedCommitFileDiffResponse).toBeNull();
    expect(graphAfterFailedRefresh.error).toBe("git log failed on refresh");
    expect(graphAfterFailedRefresh.isLoading).toBe(false);
  });
});
