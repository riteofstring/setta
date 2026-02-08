import { createGitCommit } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";

import {
  buildGitCommitLookupByHash,
  buildGitCommitSearchBlob,
  buildGitGraphRowHeightCacheKey,
  collectRemoteDecorationPrefixes,
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
) {
  return createGitCommit({
    hash,
    parents: [],
    authorName,
    authorEmail: "a@example.com",
    authorTimeMs: 1,
    subject,
    decorations,
  });
}

describe("buildGitGraphRowHeightCacheKey", () => {
  it("changes when commit identities change even if commit count is unchanged", () => {
    const firstKey = buildGitGraphRowHeightCacheKey({
      commits: [commit("a1"), commit("b2"), commit("c3")],
      allRefs: false,
      filterText: "",
    });
    const secondKey = buildGitGraphRowHeightCacheKey({
      commits: [commit("x1"), commit("y2"), commit("z3")],
      allRefs: false,
      filterText: "",
    });

    expect(firstKey).not.toBe(secondKey);
  });

  it("includes ref-mode and normalized filter text", () => {
    const branchKey = buildGitGraphRowHeightCacheKey({
      commits: [commit("a1")],
      allRefs: false,
      filterText: "  Feature  ",
    });
    const allRefsKey = buildGitGraphRowHeightCacheKey({
      commits: [commit("a1")],
      allRefs: true,
      filterText: "feature",
    });

    expect(branchKey).not.toBe(allRefsKey);
  });

  it("changes when interior commits change with identical length and edge hashes", () => {
    const firstKey = buildGitGraphRowHeightCacheKey({
      commits: [
        commit("a1"),
        commit("b2"),
        commit("c3"),
        commit("d4"),
        commit("e5"),
      ],
      allRefs: false,
      filterText: "",
    });
    const secondKey = buildGitGraphRowHeightCacheKey({
      commits: [
        commit("a1"),
        commit("x9"),
        commit("c3"),
        commit("y8"),
        commit("e5"),
      ],
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
  it("detects remote prefixes from remote-head and matching local refs", () => {
    const remotePrefixes = collectRemoteDecorationPrefixes([
      "HEAD -> main",
      "upstream/main",
      "mirror/HEAD -> mirror/main",
      "feature/scope",
    ]);

    expect(remotePrefixes.has("upstream")).toBe(true);
    expect(remotePrefixes.has("mirror")).toBe(true);
    expect(remotePrefixes.has("feature")).toBe(false);
  });
});
