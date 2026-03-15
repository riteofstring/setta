/* @vitest-environment jsdom */

import "testUtils/reactRefreshPreamble";

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createGitCommit } from "utils/generatedTypes";
import type { GitGraphRow } from "utils/gitGraph";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GitGraphOverlayCommitListSurface } from "./gitGraphOverlayCommitListSurface";

const clearGitGraphSelectedCommit = vi.fn();
const loadMoreGitGraphCommits = vi.fn();
const selectGitCommit = vi.fn();

vi.mock("state/actions/gitGraphPaginationRequests", () => ({
  loadMoreGitGraphCommits: (args?: { force?: boolean }) =>
    loadMoreGitGraphCommits(args),
}));

vi.mock("state/actions/gitGraphSelection", () => ({
  clearGitGraphSelectedCommit: () => clearGitGraphSelectedCommit(),
  selectGitCommit: (hash: string) => selectGitCommit(hash),
}));

vi.mock("./gitGraphOverlaySelectedCommitPane", () => ({
  GitGraphOverlaySelectedCommitDetails: ({
    commitHash,
  }: {
    commitHash: string;
  }) => (
    <div data-testid="mock-git-graph-selected-commit-details">{commitHash}</div>
  ),
}));

function buildCommitRow({
  hash,
  subject = hash,
  authorName = "Dana",
  decorations = [],
  laneIndex = 0,
  laneColorIds = [0],
  laneStartIndices = [],
  laneEndIndices = [],
  joinFromLaneIndices = [],
  mergeToLaneIndices = [],
}: {
  hash: string;
  subject?: string;
  authorName?: string;
  decorations?: string[];
  laneIndex?: number;
  laneColorIds?: number[];
  laneStartIndices?: number[];
  laneEndIndices?: number[];
  joinFromLaneIndices?: number[];
  mergeToLaneIndices?: number[];
}): GitGraphRow {
  return {
    commit: createGitCommit({
      hash,
      parents: [],
      authorName,
      authorEmail: "dana@example.com",
      authorTimeMs: 1,
      subject,
      decorations,
    }),
    laneIndex,
    laneColorIds,
    laneStartIndices,
    laneEndIndices,
    joinFromLaneIndices,
    mergeToLaneIndices,
  };
}

describe("GitGraphOverlayCommitListSurface", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    clearGitGraphSelectedCommit.mockReset();
    loadMoreGitGraphCommits.mockReset();
    selectGitCommit.mockReset();

    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("keeps row selection, clear-selection, and expanded details in the commit list owner", async () => {
    const selectedRow = buildCommitRow({
      hash: "abc12345def67890",
      subject: "Extract git graph commit list owner",
      decorations: ["HEAD -> main"],
    });

    await act(async () => {
      root.render(
        <GitGraphOverlayCommitListSurface
          rows={[selectedRow]}
          commits={[selectedRow.commit]}
          filterText=""
          allRefs={false}
          selectedCommitHash={selectedRow.commit.hash}
          darkMode={false}
          graphViewBoxWidth={120}
          isLoading={false}
          isLoadingMore={false}
          loadMoreError={null}
          hasMore={false}
          nextOffset={null}
          isCapped={false}
          error={null}
        />,
      );
    });

    const rowButton = host.querySelector(
      '[data-testid="git-graph-row"][data-commit-hash="abc12345def67890"]',
    );
    if (!(rowButton instanceof HTMLButtonElement)) {
      throw new Error("Missing selected git graph row.");
    }

    expect(host.textContent).toContain("Extract git graph commit list owner");
    expect(host.textContent).toContain("abc12345");
    expect(
      host.querySelector(
        '[data-testid="mock-git-graph-selected-commit-details"]',
      )?.textContent,
    ).toBe("abc12345def67890");
    expect(host.querySelector('[data-decoration-kind="head"]')).not.toBeNull();
    expect(
      host.querySelector('[data-testid="git-graph-expanded-gutter"]'),
    ).not.toBeNull();

    await act(async () => {
      rowButton.click();
    });

    expect(clearGitGraphSelectedCommit).toHaveBeenCalledTimes(1);
  });

  it("keeps decoration summaries, retry status, and select-on-click in the list surface owner", async () => {
    const row = buildCommitRow({
      hash: "feedface12345678",
      subject: "Keep remote chips visible",
      decorations: [
        "HEAD -> main",
        "upstream/main",
        "tag: v1.2.3",
        "mirror/HEAD -> mirror/main",
      ],
    });

    await act(async () => {
      root.render(
        <GitGraphOverlayCommitListSurface
          rows={[row]}
          commits={[row.commit]}
          filterText=""
          allRefs={true}
          selectedCommitHash={null}
          darkMode={false}
          graphViewBoxWidth={120}
          isLoading={false}
          isLoadingMore={false}
          loadMoreError="load failed"
          hasMore={true}
          nextOffset={10}
          isCapped={false}
          error={null}
        />,
      );
    });

    const rowButton = host.querySelector(
      '[data-testid="git-graph-row"][data-commit-hash="feedface12345678"]',
    );
    if (!(rowButton instanceof HTMLButtonElement)) {
      throw new Error("Missing unselected git graph row.");
    }

    expect(host.querySelector('[data-decoration-kind="head"]')).not.toBeNull();
    expect(
      host.querySelector('[data-decoration-kind="remote"]'),
    ).not.toBeNull();
    expect(host.querySelector('[data-decoration-kind="tag"]')).not.toBeNull();
    expect(host.textContent).toContain("+1");
    expect(host.textContent).toContain("load failed");

    await act(async () => {
      rowButton.click();
    });
    expect(selectGitCommit).toHaveBeenCalledWith("feedface12345678");

    const retryButton = host.querySelector(
      '[data-testid="git-graph-load-more-retry"]',
    );
    if (!(retryButton instanceof HTMLButtonElement)) {
      throw new Error("Missing retry button.");
    }

    await act(async () => {
      retryButton.click();
    });

    expect(loadMoreGitGraphCommits).toHaveBeenCalledWith({ force: true });
  });
});
