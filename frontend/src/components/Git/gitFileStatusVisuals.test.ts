import type {
  GitreadCommitChangedFile,
  GitreadStatusEntry,
} from "openapi/http";
import { describe, expect, it } from "vitest";
import {
  gitFileStatusCategoryFromCode,
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
  it("maps git status codes into add/change/delete/conflict categories", () => {
    // New/untracked file statuses should map to the "added" color path.
    expect(gitFileStatusCategoryFromCode("A")).toBe("added");
    expect(gitFileStatusCategoryFromCode("??")).toBe("added");
    // Regular edits and renames/copies are shown as "changed".
    expect(gitFileStatusCategoryFromCode("M")).toBe("changed");
    expect(gitFileStatusCategoryFromCode("R100")).toBe("changed");
    expect(gitFileStatusCategoryFromCode("C100")).toBe("changed");
    // Deletions and merge conflicts have dedicated categories.
    expect(gitFileStatusCategoryFromCode("D")).toBe("deleted");
    expect(gitFileStatusCategoryFromCode("U")).toBe("conflict");
  });

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
          path: "tracked.py",
          status: "M",
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
