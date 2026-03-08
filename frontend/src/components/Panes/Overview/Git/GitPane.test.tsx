import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useGitStore } from "state/git";
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
        response: {
          repo: {
            isGitRepo: true,
            repoRoot: "/repo",
            headBranch: "main",
            headCommit: "abc1234",
          },
          entries: [],
          isTruncated: true,
        },
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
        response: {
          repo: {
            isGitRepo: true,
            repoRoot: "/repo",
            headBranch: "main",
            headCommit: "abc1234",
          },
          entries: [],
          isTruncated: false,
        },
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
        response: {
          repo: {
            isGitRepo: true,
            repoRoot: "/repo",
            headBranch: "main",
            headCommit: "abc1234",
          },
          entries: [],
          isTruncated: false,
        },
        diffAvailabilityByPath: new Map(),
        isLoading: false,
        error: null,
      },
    }));

    const markup = renderPane();

    expect(markup).toContain(">Graph<");
    expect(markup).toContain('disabled=""');
  });
});
