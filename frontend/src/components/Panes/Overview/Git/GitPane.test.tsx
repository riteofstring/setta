import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useGitStore } from "state/git";
import { GitPane } from "./GitPane";

function syncStoreInitialState(store: {
  getState: () => Record<string, unknown>;
  getInitialState?: () => Record<string, unknown>;
}): void {
  if (!store.getInitialState) {
    return;
  }
  Object.assign(store.getInitialState(), store.getState());
}

function renderPane(): string {
  syncStoreInitialState(useGitStore);
  return renderToStaticMarkup(<GitPane />);
}

describe("GitPane", () => {
  beforeEach(() => {
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
        diffAvailabilityByPath: {},
        isLoading: false,
        error: null,
      },
    }));

    const markup = renderPane();

    expect(markup).toContain(
      "Git status output was truncated. The file list may be incomplete.",
    );
  });
});
