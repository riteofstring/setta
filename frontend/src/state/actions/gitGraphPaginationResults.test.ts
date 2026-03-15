import { useGitStore } from "state/git";
import {
  createGetGitLogResponse,
  createGitCommit,
  type GetGitLogResponse,
  type GitCommit,
} from "utils/generatedTypes";
import { computeGitGraphRowsWithState } from "utils/gitGraph";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  applyGitGraphPaginationError,
  applyGitGraphPaginationSuccess,
} from "./gitGraphPaginationResults";
import { createInitialGitGraphState } from "./gitGraphState";

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

function seedGraphState({
  projectConfigId = "project-config-1",
  response,
}: {
  projectConfigId?: string;
  response: GetGitLogResponse | null;
}): void {
  useGitStore.setState((state) => {
    const baseGraph = createInitialGitGraphState({
      projectConfigId,
      allRefs: true,
      filterText: "",
    });
    if (!response) {
      return {
        ...state,
        graph: {
          ...baseGraph,
          isLoading: false,
        },
      };
    }
    const rowResult = computeGitGraphRowsWithState(response.commits);
    return {
      ...state,
      graph: {
        ...baseGraph,
        response,
        seenCommitHashes: new Set(response.commits.map((entry) => entry.hash)),
        rows: rowResult.rows,
        rowComputationState: rowResult.rowComputationState,
        isLoading: false,
        hasMore: response.hasMore,
        nextOffset: response.nextOffset,
        pageSize: response.pageSize,
        isCapped: response.isCapped,
      },
    };
  });
}

function getGraphState() {
  const graph = useGitStore.getState().graph;
  expect(graph).not.toBeNull();
  if (!graph) {
    throw new Error("Expected git graph state.");
  }
  return graph;
}

describe("gitGraphPaginationResults", () => {
  beforeEach(() => {
    useGitStore.getState().reset();
  });

  afterEach(() => {
    useGitStore.getState().reset();
  });

  it("merges a loaded page without duplicating commit hashes", () => {
    const c1 = commit("c1", []);
    const c2 = commit("c2", ["c1"]);
    const c3 = commit("c3", ["c2"]);
    seedGraphState({
      response: createLogResponse({
        commits: [c3, c2],
        offset: 0,
        pageSize: 2,
        nextOffset: 2,
        hasMore: true,
        isCapped: false,
      }),
    });

    applyGitGraphPaginationSuccess({
      request: {
        requestId: 1,
        projectConfigId: "project-config-1",
      },
      responseData: createLogResponse({
        commits: [c2, c1],
        offset: 2,
        pageSize: 2,
        nextOffset: null,
        hasMore: false,
        isCapped: false,
      }),
    });

    const graph = getGraphState();
    expect(graph.response?.commits.map((entry) => entry.hash)).toEqual([
      "c3",
      "c2",
      "c1",
    ]);
    expect(graph.rows).toEqual(computeGitGraphRowsWithState([c3, c2, c1]).rows);
    expect(Array.from(graph.seenCommitHashes).sort()).toEqual([
      "c1",
      "c2",
      "c3",
    ]);
    expect(graph.loadMoreError).toBeNull();
    expect(graph.isLoadingMore).toBe(false);
  });

  it("replaces an empty graph response when pagination lands before refresh state", () => {
    const c1 = commit("c1", []);
    seedGraphState({ response: null });

    applyGitGraphPaginationSuccess({
      request: {
        requestId: 2,
        projectConfigId: "project-config-1",
      },
      responseData: createLogResponse({
        commits: [c1],
        offset: 0,
        pageSize: 1,
        nextOffset: null,
        hasMore: false,
        isCapped: false,
      }),
    });

    const graph = getGraphState();
    expect(graph.response?.commits.map((entry) => entry.hash)).toEqual(["c1"]);
    expect(graph.rows).toEqual(computeGitGraphRowsWithState([c1]).rows);
    expect(Array.from(graph.seenCommitHashes)).toEqual(["c1"]);
  });

  it("stores load-more errors without disturbing the current page", () => {
    const c1 = commit("c1", []);
    const c2 = commit("c2", ["c1"]);
    seedGraphState({
      response: createLogResponse({
        commits: [c2, c1],
        offset: 0,
        pageSize: 2,
        nextOffset: 2,
        hasMore: true,
        isCapped: false,
      }),
    });

    applyGitGraphPaginationError({
      request: {
        requestId: 3,
        projectConfigId: "project-config-1",
      },
      errorMessage: "Failed to load more commits.",
    });

    const graph = getGraphState();
    expect(graph.response?.commits.map((entry) => entry.hash)).toEqual([
      "c2",
      "c1",
    ]);
    expect(graph.nextOffset).toBe(2);
    expect(graph.loadMoreError).toBe("Failed to load more commits.");
    expect(graph.isLoadingMore).toBe(false);
  });
});
