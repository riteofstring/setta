import { useGitStore } from "state/git";
import {
  route_get_git_commit_details,
  route_get_git_commit_file_diff,
  route_get_git_diff,
  route_get_git_log,
} from "utils/generatedEndpoints";
import {
  createGetGitCommitDetailsResponse,
  createGetGitLogResponse,
  createGitCommit,
  type GetGitLogResponse,
  type GitCommit,
} from "utils/generatedTypes";
import { computeGitGraphRows } from "utils/gitGraph";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadMoreGitGraphCommits,
  openGitDiffOverlay,
  openGitGraphOverlay,
  selectGitCommit,
  selectGitCommitFile,
  setGitDiffMode,
} from "./git";

vi.mock("utils/generatedEndpoints", () => ({
  route_get_git_commit_details: vi.fn(),
  route_get_git_commit_file_diff: vi.fn(),
  route_get_git_diff: vi.fn(),
  route_get_git_log: vi.fn(),
  route_get_git_status: vi.fn(),
}));

function commit(hash: string, parents: string[]): GitCommit {
  return createGitCommit({
    hash,
    parents,
    authorName: "A",
    authorEmail: "a@example.com",
    authorTimeMs: 1,
    subject: hash,
    decorations: [],
  });
}

function createLogResponse({
  commits,
  offset,
  pageSize,
  nextOffset,
  hasMore,
  isCapped,
}: {
  commits: GitCommit[];
  offset: number;
  pageSize: number;
  nextOffset: number | null;
  hasMore: boolean;
  isCapped: boolean;
}): GetGitLogResponse {
  return createGetGitLogResponse({
    repoRoot: "/repo",
    headBranch: "main",
    commits,
    offset,
    pageSize,
    nextOffset,
    hasMore,
    isCapped,
  });
}

function setGraphOverlayState({
  response,
  filterText = "",
}: {
  response: GetGitLogResponse;
  filterText?: string;
}): void {
  useGitStore.setState((state) => ({
    ...state,
    overlay: {
      kind: "graph",
      graph: {
        allRefs: true,
        response,
        rows: computeGitGraphRows(response.commits),
        filterText,
        isLoading: false,
        isLoadingMore: false,
        error: null,
        loadMoreError: null,
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
    },
  }));
}

function setGitStatusResponse(
  entries: Array<{
    path: string;
    oldPath: string | null;
    indexStatus: string;
    worktreeStatus: string;
    kind: "conflict" | "staged" | "unstaged" | "untracked";
  }>,
): void {
  useGitStore.setState((state) => ({
    ...state,
    status: {
      response: {
        repo: {
          isGitRepo: true,
          repoRoot: "/repo",
          headBranch: "main",
          headCommit: "abc123",
        },
        entries,
        isTruncated: false,
      },
      isLoading: false,
      error: null,
    },
  }));
}

describe("git graph actions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useGitStore.getState().reset();
  });

  afterEach(() => {
    vi.resetAllMocks();
    useGitStore.getState().reset();
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

    vi.mocked(route_get_git_log).mockResolvedValue({
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

    expect(route_get_git_log).toHaveBeenCalledWith({
      rev: "HEAD",
      allRefs: true,
      offset: 2,
      pageSize: 2,
    });

    const overlay = useGitStore.getState().overlay;
    expect(overlay.kind).toBe("graph");
    if (overlay.kind !== "graph") {
      return;
    }
    expect(overlay.graph.response?.commits.map((entry) => entry.hash)).toEqual([
      "c3",
      "c2",
      "c1",
    ]);
    expect(overlay.graph.isLoadingMore).toBe(false);
    expect(overlay.graph.hasMore).toBe(false);
    expect(overlay.graph.nextOffset).toBeNull();
    expect(overlay.graph.loadMoreError).toBeNull();
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

    expect(route_get_git_log).not.toHaveBeenCalled();
    const overlay = useGitStore.getState().overlay;
    expect(overlay.kind).toBe("graph");
    if (overlay.kind !== "graph") {
      return;
    }
    expect(overlay.graph.isLoadingMore).toBe(false);
    expect(overlay.graph.loadMoreError).toBeNull();
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
    vi.mocked(route_get_git_log).mockResolvedValue({
      status: 500,
      hasResponse: true,
      data: { detail: "backend failed while loading more commits" },
    });

    await loadMoreGitGraphCommits();

    const overlay = useGitStore.getState().overlay;
    expect(overlay.kind).toBe("graph");
    if (overlay.kind !== "graph") {
      return;
    }
    expect(overlay.graph.isLoadingMore).toBe(false);
    expect(overlay.graph.loadMoreError).toBe(
      "backend failed while loading more commits",
    );
    expect(overlay.graph.nextOffset).toBe(2);
  });

  it("preserves oldPath when requesting diffs across mode toggles", async () => {
    setGitStatusResponse([
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
    vi.mocked(route_get_git_diff).mockImplementation(async ({ path, mode }) => {
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

    expect(route_get_git_diff).toHaveBeenNthCalledWith(1, {
      path: "renamed.py",
      oldPath: "legacy.py",
      mode: "staged",
    });

    await setGitDiffMode("unstaged");

    expect(route_get_git_diff).toHaveBeenNthCalledWith(2, {
      path: "renamed.py",
      oldPath: "legacy.py",
      mode: "unstaged",
    });

    const overlay = useGitStore.getState().overlay;
    expect(overlay.kind).toBe("diff");
    if (overlay.kind !== "diff") {
      return;
    }
    expect(overlay.diff.oldPath).toBe("legacy.py");
  });

  it("does not duplicate preload state writes when opening git diff overlay", async () => {
    setGitStatusResponse([
      {
        path: "tracked.py",
        oldPath: null,
        indexStatus: "M",
        worktreeStatus: "M",
        kind: "staged",
      },
    ]);
    vi.mocked(route_get_git_diff).mockResolvedValue({
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

    vi.mocked(route_get_git_commit_details).mockImplementation(
      async ({ commitHash }) => {
        if (commitHash === "a1b2c3") {
          return {
            status: 200,
            hasResponse: true,
            data: createGetGitCommitDetailsResponse({
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
          data: createGetGitCommitDetailsResponse({
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
      },
    );
    vi.mocked(route_get_git_commit_file_diff).mockImplementation(() => {
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
      const overlay = useGitStore.getState().overlay;
      expect(overlay.kind).toBe("graph");
      if (overlay.kind !== "graph") {
        return;
      }
      expect(overlay.graph.selectedCommitHash).toBe("b4c5d6");
      expect(overlay.graph.selectedCommitFileDiffResponse).toBeNull();
    });

    const calls = vi.mocked(route_get_git_commit_file_diff).mock.calls;
    expect(calls).toEqual([
      [{ commitHash: "a1b2c3", path: "a.txt", oldPath: null }],
    ]);
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
    vi.mocked(route_get_git_commit_details).mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: createGetGitCommitDetailsResponse({
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
    vi.mocked(route_get_git_commit_file_diff).mockResolvedValue({
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
    expect(route_get_git_commit_file_diff).not.toHaveBeenCalled();

    await selectGitCommitFile({
      path: "a.txt",
      oldPath: null,
    });
    expect(route_get_git_commit_file_diff).toHaveBeenCalledWith({
      commitHash: "a1b2c3",
      path: "a.txt",
      oldPath: null,
    });
  });

  it("opens graph on branch-only mode and does not auto-select a commit", async () => {
    vi.mocked(route_get_git_log).mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: createLogResponse({
        commits: [
          createGitCommit({
            hash: "abc123",
            parents: ["def456"],
            authorName: "A",
            authorEmail: "a@example.com",
            authorTimeMs: 1,
            subject: "subject",
            decorations: ["HEAD -> main", "origin/main"],
          }),
        ],
        offset: 0,
        pageSize: 250,
        nextOffset: null,
        hasMore: false,
        isCapped: false,
      }),
    });

    await openGitGraphOverlay();

    expect(route_get_git_log).toHaveBeenCalledWith({
      rev: "HEAD",
      allRefs: false,
      offset: 0,
      pageSize: 250,
    });
    expect(route_get_git_commit_details).not.toHaveBeenCalled();
    expect(route_get_git_commit_file_diff).not.toHaveBeenCalled();

    const overlay = useGitStore.getState().overlay;
    expect(overlay.kind).toBe("graph");
    if (overlay.kind !== "graph") {
      return;
    }
    const firstCommit = overlay.graph.response?.commits[0];
    expect(firstCommit?.hash).toBe("abc123");
    expect(overlay.graph.allRefs).toBe(false);
    expect(overlay.graph.selectedCommitHash).toBeNull();
  });
});
