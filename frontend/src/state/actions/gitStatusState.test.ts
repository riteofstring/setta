import { useGitStore } from "state/git";
import {
  createGetGitStatusResponse,
  type GitStatusEntry,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("utils/generatedEndpoints", () => ({
  route_get_git_status: vi.fn(),
}));

import { route_get_git_status } from "utils/generatedEndpoints";

import {
  buildGitDiffAvailabilityByPath,
  refreshGitStatus,
} from "./gitStatusState";

function createDeferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function createStatusEntry(
  entry: Partial<GitStatusEntry> & Pick<GitStatusEntry, "path" | "kind">,
): GitStatusEntry {
  return {
    path: entry.path,
    oldPath: entry.oldPath,
    indexStatus: entry.indexStatus ?? " ",
    worktreeStatus: entry.worktreeStatus ?? " ",
    kind: entry.kind,
  };
}

describe("gitStatusState", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useGitStore.getState().reset();
  });

  afterEach(() => {
    vi.resetAllMocks();
    useGitStore.getState().reset();
  });

  it("builds staged and unstaged availability per path without object-key collisions", () => {
    // Availability must be keyed by path, even for prototype-like names.
    const availabilityByPath = buildGitDiffAvailabilityByPath([
      createStatusEntry({
        path: "tracked.py",
        kind: "staged",
        indexStatus: "M",
      }),
      createStatusEntry({
        path: "tracked.py",
        kind: "unstaged",
        worktreeStatus: "M",
      }),
      createStatusEntry({
        path: "__proto__",
        kind: "untracked",
        indexStatus: "?",
        worktreeStatus: "?",
      }),
    ]);

    expect(availabilityByPath.get("tracked.py")).toEqual({
      hasStaged: true,
      hasUnstaged: true,
    });
    expect(availabilityByPath.get("__proto__")).toEqual({
      hasStaged: false,
      hasUnstaged: true,
    });
  });

  it("ignores stale status responses when a newer refresh finishes first", async () => {
    // The latest refresh should win even if an older request resolves afterward.
    const first = createDeferred<{
      status: number;
      hasResponse: boolean;
      data: ReturnType<typeof createGetGitStatusResponse>;
    }>();
    const second = createDeferred<{
      status: number;
      hasResponse: boolean;
      data: ReturnType<typeof createGetGitStatusResponse>;
    }>();
    vi.mocked(route_get_git_status)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    const firstRefresh = refreshGitStatus();
    const secondRefresh = refreshGitStatus();

    second.resolve({
      status: 200,
      hasResponse: true,
      data: createGetGitStatusResponse({
        repo: {
          isGitRepo: true,
          repoRoot: "/repo",
          headBranch: "main",
          headCommit: "second",
        },
        entries: [createStatusEntry({ path: "second.py", kind: "staged" })],
        isTruncated: false,
      }),
    });
    await secondRefresh;

    first.resolve({
      status: 200,
      hasResponse: true,
      data: createGetGitStatusResponse({
        repo: {
          isGitRepo: true,
          repoRoot: "/repo",
          headBranch: "main",
          headCommit: "first",
        },
        entries: [createStatusEntry({ path: "first.py", kind: "staged" })],
        isTruncated: false,
      }),
    });
    await firstRefresh;

    const status = useGitStore.getState().status;
    expect(status.response?.repo.headCommit).toBe("second");
    expect(status.response?.entries.map((entry) => entry.path)).toEqual([
      "second.py",
    ]);
  });
});
