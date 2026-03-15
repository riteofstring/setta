import { useProjectState } from "state/definitions";
import { useGitStore } from "state/git";
import { route_get_git_log } from "utils/generatedEndpoints";
import { createGetGitLogResponse, createGitCommit } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { refreshGitGraphData } from "./gitGraphRefreshState";
import { createInitialGitGraphState } from "./gitGraphState";

vi.mock("utils/generatedEndpoints", () => ({
  route_get_git_log: vi.fn(),
}));

function createDeferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function createLogResponse(commitHash: string) {
  return createGetGitLogResponse({
    repoRoot: "/repo",
    headBranch: "main",
    commits: [
      createGitCommit({
        hash: commitHash,
        parents: [],
        authorName: "A",
        authorEmail: "a@example.com",
        authorTimeMs: 1,
        subject: commitHash,
        decorations: [],
      }),
    ],
    offset: 0,
    pageSize: 250,
    nextOffset: null,
    hasMore: false,
    isCapped: false,
  });
}

function seedInitialGraphState(): void {
  useGitStore.setState((state) => ({
    ...state,
    graph: createInitialGitGraphState({
      projectConfigId: "project-config-1",
      allRefs: false,
      filterText: "",
    }),
  }));
}

describe("gitGraphRefreshState", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useGitStore.getState().reset();
    useProjectState.setState((state) => {
      state.projectConfig.id = "project-config-1";
    });
    seedInitialGraphState();
  });

  afterEach(() => {
    vi.resetAllMocks();
    useGitStore.getState().reset();
    useProjectState.setState((state) => {
      state.projectConfig.id = "project-config-1";
    });
  });

  it("ignores an older refresh response after a newer graph request wins", async () => {
    // The shared request tracker must keep late refresh responses from
    // overwriting whichever graph load started most recently.
    const firstRequest = createDeferred<{
      status: number;
      hasResponse: boolean;
      data: ReturnType<typeof createLogResponse>;
    }>();
    const secondRequest = createDeferred<{
      status: number;
      hasResponse: boolean;
      data: ReturnType<typeof createLogResponse>;
    }>();
    vi.mocked(route_get_git_log)
      .mockReturnValueOnce(firstRequest.promise)
      .mockReturnValueOnce(secondRequest.promise);

    const firstRefresh = refreshGitGraphData({ allRefs: false });
    const secondRefresh = refreshGitGraphData({ allRefs: true });

    secondRequest.resolve({
      status: 200,
      hasResponse: true,
      data: createLogResponse("newer"),
    });
    await secondRefresh;

    firstRequest.resolve({
      status: 200,
      hasResponse: true,
      data: createLogResponse("older"),
    });
    await firstRefresh;

    const graph = useGitStore.getState().graph;
    expect(graph).not.toBeNull();
    if (!graph) {
      throw new Error("Expected git graph state.");
    }
    expect(graph.allRefs).toBe(true);
    expect(graph.response?.commits.map((commit) => commit.hash)).toEqual([
      "newer",
    ]);
  });
});
