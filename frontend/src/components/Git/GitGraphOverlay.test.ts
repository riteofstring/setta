import { createGitCommit } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";

import {
  buildGitCommitLookupByHash,
  buildGitGraphRowHeightCacheKey,
} from "./GitGraphOverlay";

function commit(hash: string) {
  return createGitCommit({
    hash,
    parents: [],
    authorName: "A",
    authorEmail: "a@example.com",
    authorTimeMs: 1,
    subject: hash,
    decorations: [],
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
