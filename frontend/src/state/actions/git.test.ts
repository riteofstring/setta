import { useGitStore } from "state/git";
import { computeGitGraphRows } from "utils/gitGraph";
import {
  createGetGitCommitDetailsResponse,
  createGetGitLogResponse,
  createGitCommit,
  type GetGitLogResponse,
  type GitCommit,
} from "utils/generatedTypes";
import {
  route_get_git_commit_details,
  route_get_git_commit_file_diff,
  route_get_git_log,
} from "utils/generatedEndpoints";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadMoreGitGraphCommits, openGitGraphOverlay } from "./git";

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
        selectedCommitFileOldPath: null,
        selectedCommitFileDiffResponse: null,
        selectedCommitFileDiffIsLoading: false,
        selectedCommitFileDiffError: null,
      },
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

  it("normalizes hashes, parent hashes, and decorations when opening graph", async () => {
    // The frontend trims git-log fields before lane computation and commit selection.
    vi.mocked(route_get_git_log).mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: createLogResponse({
        commits: [
          createGitCommit({
            hash: "  abc123  ",
            parents: ["  def456  ", "   "],
            authorName: "A",
            authorEmail: "a@example.com",
            authorTimeMs: 1,
            subject: "subject",
            decorations: [" HEAD -> main ", " ", " origin/main "],
          }),
        ],
        offset: 0,
        pageSize: 250,
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
        commitHash: "abc123",
        parents: ["def456"],
        authorName: "A",
        authorEmail: "a@example.com",
        authorTimeMs: 1,
        committerName: "A",
        committerEmail: "a@example.com",
        committerTimeMs: 1,
        subject: "subject",
        body: "",
        files: [],
      }),
    });
    vi.mocked(route_get_git_commit_file_diff).mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: {
        repoRoot: "/repo",
        commitHash: "abc123",
        path: "a.txt",
        diff: "",
        isTruncated: false,
      },
    });

    await openGitGraphOverlay();

    expect(route_get_git_commit_details).toHaveBeenCalledWith({
      commitHash: "abc123",
    });
    expect(route_get_git_commit_file_diff).not.toHaveBeenCalled();

    const overlay = useGitStore.getState().overlay;
    expect(overlay.kind).toBe("graph");
    if (overlay.kind !== "graph") {
      return;
    }
    const firstCommit = overlay.graph.response?.commits[0];
    expect(firstCommit?.hash).toBe("abc123");
    expect(firstCommit?.parents).toEqual(["def456"]);
    expect(firstCommit?.decorations).toEqual(["HEAD -> main", "origin/main"]);
    expect(overlay.graph.selectedCommitHash).toBe("abc123");
  });
});
