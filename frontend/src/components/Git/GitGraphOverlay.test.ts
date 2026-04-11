import type { GitreadCommit as Commit } from "openapi/http";
import { DEFAULT_GIT_GRAPH_AUTHOR_WIDTH_PX } from "utils/gitGraphLayoutDefaults";
import { describe, expect, it } from "vitest";

import {
  buildGitCommitLookupByHash,
  buildGitCommitSearchBlob,
  buildGitGraphCommitDigest,
  buildGitGraphRowHeightCacheKey,
  collectRemoteDecorationPrefixes,
  computeGitGraphColumnDoubleClickPatch,
  computeGitGraphColumnWidthPatch,
  shouldLoadMoreGitGraphCommits,
  summarizeDecorationChips,
} from "./GitGraphOverlay";

function commit(
  hash: string,
  {
    subject = hash,
    authorName = "A",
    decorations = [],
  }: {
    subject?: string;
    authorName?: string;
    decorations?: string[];
  } = {},
): Commit {
  return {
    hash,
    parents: [],
    authorName,
    authorEmail: "a@example.com",
    authorTimeMs: 1,
    subject,
    decorations,
  };
}

describe("buildGitGraphRowHeightCacheKey", () => {
  it("changes when commit identities change even if commit count is unchanged", () => {
    const firstDigest = buildGitGraphCommitDigest([
      commit("a1"),
      commit("b2"),
      commit("c3"),
    ]);
    const secondDigest = buildGitGraphCommitDigest([
      commit("x1"),
      commit("y2"),
      commit("z3"),
    ]);
    const firstKey = buildGitGraphRowHeightCacheKey({
      commitDigest: firstDigest,
      allRefs: false,
      filterText: "",
    });
    const secondKey = buildGitGraphRowHeightCacheKey({
      commitDigest: secondDigest,
      allRefs: false,
      filterText: "",
    });

    expect(firstKey).not.toBe(secondKey);
  });

  it("includes ref-mode and normalized filter text", () => {
    const commitDigest = buildGitGraphCommitDigest([commit("a1")]);
    const branchKey = buildGitGraphRowHeightCacheKey({
      commitDigest,
      allRefs: false,
      filterText: "  Feature  ",
    });
    const allRefsKey = buildGitGraphRowHeightCacheKey({
      commitDigest,
      allRefs: true,
      filterText: "feature",
    });

    expect(branchKey).not.toBe(allRefsKey);
  });

  it("changes when interior commits change with identical length and edge hashes", () => {
    const firstDigest = buildGitGraphCommitDigest([
      commit("a1"),
      commit("b2"),
      commit("c3"),
      commit("d4"),
      commit("e5"),
    ]);
    const secondDigest = buildGitGraphCommitDigest([
      commit("a1"),
      commit("x9"),
      commit("c3"),
      commit("y8"),
      commit("e5"),
    ]);
    const firstKey = buildGitGraphRowHeightCacheKey({
      commitDigest: firstDigest,
      allRefs: false,
      filterText: "",
    });
    const secondKey = buildGitGraphRowHeightCacheKey({
      commitDigest: secondDigest,
      allRefs: false,
      filterText: "",
    });

    expect(firstKey).not.toBe(secondKey);
  });
});

describe("buildGitCommitLookupByHash", () => {
  it("builds a hash lookup map for O(1)-style access", () => {
    const commits = [commit("a1"), commit("b2"), commit("c3")];
    const lookup = buildGitCommitLookupByHash(commits);

    expect(lookup.get("a1")?.subject).toBe("a1");
    expect(lookup.get("b2")?.subject).toBe("b2");
    expect(lookup.get("c3")?.subject).toBe("c3");
  });
});

describe("buildGitCommitSearchBlob", () => {
  it("normalizes commit fields for case-insensitive filtering", () => {
    const blob = buildGitCommitSearchBlob(
      commit("AbCd", {
        subject: "Fix Parser",
        authorName: "Jane Doe",
        decorations: ["HEAD -> Main", "upstream/main"],
      }),
    );

    expect(blob).toContain("abcd");
    expect(blob).toContain("fix parser");
    expect(blob).toContain("jane doe");
    expect(blob).toContain("upstream/main");
  });
});

describe("collectRemoteDecorationPrefixes", () => {
  it("detects remote prefixes from remote-head and known remote names", () => {
    const remotePrefixes = collectRemoteDecorationPrefixes([
      "HEAD -> main",
      "upstream/main",
      "mirror/HEAD -> mirror/main",
      "feature/main",
    ]);

    expect(remotePrefixes.has("upstream")).toBe(true);
    expect(remotePrefixes.has("mirror")).toBe(true);
    expect(remotePrefixes.has("feature")).toBe(false);
  });
});

describe("summarizeDecorationChips", () => {
  it("defaults remote-prefix context so fallback calls are safe", () => {
    const summary = summarizeDecorationChips(["feature/main"]);

    expect(summary.chips).toEqual([{ label: "feature/main", kind: "branch" }]);
    expect(summary.extraChipCount).toBe(0);
  });
});

describe("shouldLoadMoreGitGraphCommits", () => {
  it("requests more rows only when pagination is still active and near the end", () => {
    expect(
      shouldLoadMoreGitGraphCommits({
        graphState: {
          isLoading: false,
          isLoadingMore: false,
          loadMoreError: null,
          nextOffset: 200,
          hasMore: true,
        },
        filteredRowCount: 120,
        stopIndex: 90,
        isFilterActive: false,
      }),
    ).toBe(true);

    expect(
      shouldLoadMoreGitGraphCommits({
        graphState: {
          isLoading: false,
          isLoadingMore: false,
          loadMoreError: "boom",
          nextOffset: 200,
          hasMore: true,
        },
        filteredRowCount: 120,
        stopIndex: 90,
        isFilterActive: false,
      }),
    ).toBe(false);
  });
});

describe("computeGitGraphColumnWidthPatch", () => {
  it("clamps shared author-date drags so the date column cannot shrink past its minimum", () => {
    const patch = computeGitGraphColumnWidthPatch({
      boundary: "authorDate",
      deltaX: 100,
      start: {
        graph: 120,
        author: 100,
        date: 95,
        hash: 80,
      },
      contentWidth: 700,
    });

    expect(patch).toEqual({
      author: 105,
      date: 90,
    });
  });
});

describe("computeGitGraphColumnDoubleClickPatch", () => {
  it("resets a single-column boundary to the persisted default width when space allows", () => {
    const patch = computeGitGraphColumnDoubleClickPatch({
      boundary: "messageAuthor",
      start: {
        graph: 120,
        author: 200,
        date: 120,
        hash: 80,
      },
      contentWidth: 800,
    });

    expect(patch).toEqual({
      author: DEFAULT_GIT_GRAPH_AUTHOR_WIDTH_PX,
    });
  });
});
