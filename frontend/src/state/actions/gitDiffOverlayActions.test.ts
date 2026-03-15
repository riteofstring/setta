import { useGitStore } from "state/git";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("utils/generatedEndpoints", () => ({
  route_get_git_diff: vi.fn(),
}));

import { route_get_git_diff } from "utils/generatedEndpoints";

import {
  closeGitOverlay,
  openGitDiffOverlay,
  setGitDiffMode,
} from "./gitDiffOverlayActions";

function createDeferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

describe("gitDiffOverlayActions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useGitStore.getState().reset();
  });

  afterEach(() => {
    vi.resetAllMocks();
    useGitStore.getState().reset();
  });

  it("opens a diff overlay with staged and unstaged availability from git status", async () => {
    // Diff mode buttons should reflect the current availability map immediately.
    useGitStore.setState((state) => ({
      ...state,
      status: {
        ...state.status,
        diffAvailabilityByPath: new Map([
          ["tracked.py", { hasStaged: true, hasUnstaged: false }],
        ]),
      },
    }));
    vi.mocked(route_get_git_diff).mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: {
        repoRoot: "/repo",
        path: "tracked.py",
        mode: "staged",
        diff: "diff --git a/tracked.py b/tracked.py",
        isTruncated: false,
      },
    });

    await openGitDiffOverlay({
      path: "tracked.py",
      oldPath: null,
      mode: "staged",
    });

    const overlay = useGitStore.getState().overlay;
    expect(overlay.kind).toBe("diff");
    if (overlay.kind !== "diff") {
      return;
    }
    expect(overlay.diff.hasStaged).toBe(true);
    expect(overlay.diff.hasUnstaged).toBe(false);
    expect(overlay.diff.response?.path).toBe("tracked.py");
  });

  it("ignores stale diff responses when a newer overlay request finishes first", async () => {
    // Switching targets mid-flight should keep only the newest diff payload.
    useGitStore.setState((state) => ({
      ...state,
      status: {
        ...state.status,
        diffAvailabilityByPath: new Map([
          ["first.py", { hasStaged: true, hasUnstaged: true }],
          ["second.py", { hasStaged: true, hasUnstaged: true }],
        ]),
      },
    }));
    const first = createDeferred<{
      status: number;
      hasResponse: boolean;
      data: {
        repoRoot: string;
        path: string;
        mode: "staged" | "unstaged";
        diff: string;
        isTruncated: boolean;
      };
    }>();
    const second = createDeferred<{
      status: number;
      hasResponse: boolean;
      data: {
        repoRoot: string;
        path: string;
        mode: "staged" | "unstaged";
        diff: string;
        isTruncated: boolean;
      };
    }>();
    vi.mocked(route_get_git_diff)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    const firstOpen = openGitDiffOverlay({
      path: "first.py",
      oldPath: null,
      mode: "staged",
    });
    const secondOpen = openGitDiffOverlay({
      path: "second.py",
      oldPath: "legacy-second.py",
      mode: "unstaged",
    });

    second.resolve({
      status: 200,
      hasResponse: true,
      data: {
        repoRoot: "/repo",
        path: "second.py",
        mode: "unstaged",
        diff: "second diff",
        isTruncated: false,
      },
    });
    await secondOpen;

    first.resolve({
      status: 200,
      hasResponse: true,
      data: {
        repoRoot: "/repo",
        path: "first.py",
        mode: "staged",
        diff: "first diff",
        isTruncated: false,
      },
    });
    await firstOpen;

    const overlay = useGitStore.getState().overlay;
    expect(overlay.kind).toBe("diff");
    if (overlay.kind !== "diff") {
      return;
    }
    expect(overlay.diff.path).toBe("second.py");
    expect(overlay.diff.oldPath).toBe("legacy-second.py");
    expect(overlay.diff.mode).toBe("unstaged");
    expect(overlay.diff.response?.diff).toBe("second diff");
  });

  it("skips a diff reload when the requested mode is already active", async () => {
    // Clicking the active mode should not trigger a redundant backend request.
    useGitStore.setState((state) => ({
      ...state,
      overlay: {
        kind: "diff",
        diff: {
          path: "tracked.py",
          oldPath: null,
          mode: "staged",
          hasStaged: true,
          hasUnstaged: true,
          response: null,
          isLoading: false,
          error: null,
        },
      },
    }));

    await setGitDiffMode("staged");

    expect(route_get_git_diff).not.toHaveBeenCalled();
    closeGitOverlay();
    expect(useGitStore.getState().overlay).toEqual({ kind: "none" });
  });
});
