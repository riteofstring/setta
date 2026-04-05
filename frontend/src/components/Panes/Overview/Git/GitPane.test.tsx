import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useGitStore } from "state/git";
import { createGitStatusResponse } from "utils/generatedTypes";
import { GitPane } from "./GitPane";

let mockCanEditLayout = true;

vi.mock("state/hooks/share", () => ({
  useShareCapabilities: () => ({
    canEditLayout: mockCanEditLayout,
  }),
}));

function syncStoreInitialState(store: {
  getState: () => Record<string, unknown>;
  getInitialState?: () => Record<string, unknown>;
}): void {
  if (!store.getInitialState) {
    return;
  }
  Object.assign(store.getInitialState(), store.getState());
}

function renderPane(
  props: Partial<Parameters<typeof GitPane>[0]> = {},
): string {
  syncStoreInitialState(useGitStore);
  return renderToStaticMarkup(<GitPane {...props} />);
}

describe("GitPane", () => {
  beforeEach(() => {
    mockCanEditLayout = true;
    useGitStore.getState().reset();
  });

  afterEach(() => {
    useGitStore.getState().reset();
  });

  it("renders a truncation warning when status output is partial", () => {
    useGitStore.setState((state) => ({
      ...state,
      status: {
        response: createGitStatusResponse({
          repo: {
            isGitRepo: true,
            repoRoot: "/repo",
            headBranch: "main",
            headCommit: "abc1234",
          },
          entries: [],
          isTruncated: true,
        }),
        diffAvailabilityByPath: new Map(),
        isLoading: false,
        error: null,
      },
    }));

    const markup = renderPane();

    expect(markup).toContain(
      "Git status output was truncated. The file list may be incomplete.",
    );
  });

  it("can hide the graph launcher when embedded inside a git graph window", () => {
    useGitStore.setState((state) => ({
      ...state,
      status: {
        response: createGitStatusResponse({
          repo: {
            isGitRepo: true,
            repoRoot: "/repo",
            headBranch: "main",
            headCommit: "abc1234",
          },
          entries: [],
          isTruncated: false,
        }),
        diffAvailabilityByPath: new Map(),
        isLoading: false,
        error: null,
      },
    }));

    const markup = renderPane({ showGraphButton: false });

    expect(markup).not.toContain(">Graph<");
    expect(markup).toContain(">Refresh<");
  });

  it("disables the graph launcher when layout edits are disallowed", () => {
    mockCanEditLayout = false;
    useGitStore.setState((state) => ({
      ...state,
      status: {
        response: createGitStatusResponse({
          repo: {
            isGitRepo: true,
            repoRoot: "/repo",
            headBranch: "main",
            headCommit: "abc1234",
          },
          entries: [],
          isTruncated: false,
        }),
        diffAvailabilityByPath: new Map(),
        isLoading: false,
        error: null,
      },
    }));

    const markup = renderPane();

    expect(markup).toContain(">Graph<");
    expect(markup).toContain('disabled=""');
  });

  it("renders an open worktree accordion when additional worktrees exist", () => {
    useGitStore.setState((state) => ({
      ...state,
      status: {
        response: createGitStatusResponse({
          repo: {
            isGitRepo: true,
            repoRoot: "/repo",
            headBranch: "main",
            headCommit: "abc1234",
          },
          entries: [],
          isTruncated: false,
          worktrees: [
            {
              path: "/repo",
              displayName: "main",
              branchName: "main",
              headCommit: "abc1234",
              isCurrent: true,
              isPrunable: false,
              prunableReason: null,
            },
            {
              path: "/repo.feature-extra",
              displayName: "feature-extra",
              branchName: "feature-extra",
              headCommit: "def5678",
              isCurrent: false,
              isPrunable: true,
              prunableReason: "gitdir file points to non-existent location",
            },
          ],
        }),
        diffAvailabilityByPath: new Map(),
        isLoading: false,
        error: null,
      },
    }));

    const markup = renderPane();

    expect(markup).toContain('data-testid="git-worktrees-accordion"');
    expect(markup).toContain("open");
    expect(markup).toContain(">Current<");
    expect(markup).toContain(">Prunable<");
    expect(markup).toContain("feature-extra");
  });

  it("hides the worktree accordion when there are no additional worktrees", () => {
    useGitStore.setState((state) => ({
      ...state,
      status: {
        response: createGitStatusResponse({
          repo: {
            isGitRepo: true,
            repoRoot: "/repo",
            headBranch: "main",
            headCommit: "abc1234",
          },
          entries: [],
          isTruncated: false,
          worktrees: [
            {
              path: "/repo",
              displayName: "main",
              branchName: "main",
              headCommit: "abc1234",
              isCurrent: true,
              isPrunable: false,
              prunableReason: null,
            },
          ],
        }),
        diffAvailabilityByPath: new Map(),
        isLoading: false,
        error: null,
      },
    }));

    const markup = renderPane();

    expect(markup).not.toContain('data-testid="git-worktrees-accordion"');
  });
});
