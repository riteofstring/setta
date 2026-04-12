import type {
  GitreadCommitChangedFile,
  GitreadStatusEntry,
} from "openapi/http";
import { describe, expect, it } from "vitest";
import {
  gitFileStatusCategoryFromCommitFile,
  gitFileStatusCategoryFromEntry,
  gitFileStatusVisuals,
} from "./gitFileStatusVisuals";

function buildGitStatusEntry(
  overrides: Partial<GitreadStatusEntry>,
): GitreadStatusEntry {
  return {
    indexStatus: " ",
    kind: "unstaged",
    oldPath: null,
    path: "tracked.py",
    worktreeStatus: " ",
    ...overrides,
  };
}

function buildGitCommitChangedFile(
  overrides: Partial<GitreadCommitChangedFile>,
): GitreadCommitChangedFile {
  return {
    additions: 0,
    deletions: 0,
    oldPath: null,
    path: "tracked.py",
    status: "M",
    ...overrides,
  };
}

describe("gitFileStatusVisuals", () => {
  it("derives list-entry categories from staged/unstaged/untracked/conflict rows", () => {
    // Staged/unstaged entries use the active porcelain status column.
    expect(
      gitFileStatusCategoryFromEntry(
        buildGitStatusEntry({
          kind: "staged",
          path: "tracked.py",
          indexStatus: "D",
          worktreeStatus: " ",
        }),
      ),
    ).toBe("deleted");
    expect(
      gitFileStatusCategoryFromEntry(
        buildGitStatusEntry({
          kind: "unstaged",
          path: "tracked.py",
          indexStatus: " ",
          worktreeStatus: "M",
        }),
      ),
    ).toBe("changed");
    // Untracked/conflict kinds should be explicit regardless of status columns.
    expect(
      gitFileStatusCategoryFromEntry(
        buildGitStatusEntry({
          kind: "untracked",
          path: "new.py",
          indexStatus: "?",
          worktreeStatus: "?",
        }),
      ),
    ).toBe("added");
    expect(
      gitFileStatusCategoryFromEntry(
        buildGitStatusEntry({
          kind: "conflict",
          path: "merge.py",
          indexStatus: "U",
          worktreeStatus: "U",
        }),
      ),
    ).toBe("conflict");
  });

  it("derives commit-file categories from commit status strings", () => {
    // Commit details provide single status strings (e.g. A/M/D/R100).
    expect(
      gitFileStatusCategoryFromCommitFile(
        buildGitCommitChangedFile({
          path: "new.py",
          status: "A",
        }),
      ),
    ).toBe("added");
    expect(
      gitFileStatusCategoryFromCommitFile(
        buildGitCommitChangedFile({
          path: "draft.py",
          status: "??",
        }),
      ),
    ).toBe("added");
    expect(
      gitFileStatusCategoryFromCommitFile(
        buildGitCommitChangedFile({
          path: "tracked.py",
          status: "M",
        }),
      ),
    ).toBe("changed");
    expect(
      gitFileStatusCategoryFromCommitFile(
        buildGitCommitChangedFile({
          path: "renamed.py",
          status: "R100",
        }),
      ),
    ).toBe("changed");
    expect(
      gitFileStatusCategoryFromCommitFile(
        buildGitCommitChangedFile({
          path: "copied.py",
          status: "C100",
        }),
      ),
    ).toBe("changed");
    expect(
      gitFileStatusCategoryFromCommitFile(
        buildGitCommitChangedFile({
          path: "gone.py",
          status: "D",
        }),
      ),
    ).toBe("deleted");
    expect(
      gitFileStatusCategoryFromCommitFile(
        buildGitCommitChangedFile({
          path: "conflict.py",
          status: "U",
        }),
      ),
    ).toBe("conflict");
  });

  it("returns distinct badge class palettes for key categories", () => {
    // Distinct class palettes ensure visible color coding in both file lists.
    const added = gitFileStatusVisuals("added").badgeClassName;
    const changed = gitFileStatusVisuals("changed").badgeClassName;
    const deleted = gitFileStatusVisuals("deleted").badgeClassName;

    expect(added).toContain("emerald");
    expect(changed).toContain("amber");
    expect(deleted).toContain("rose");
    expect(added).not.toBe(changed);
    expect(changed).not.toBe(deleted);
  });
});
