import { expect, test } from "@playwright/test";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  cleanupGitOverlayFixture,
  getWorkspaceRootOrThrow,
  openGitOverview,
  runGit,
  seedGitOverlayFixture,
} from "./helpers/gitOverlayFixture";

test("git pane hides the worktree accordion when the current repo has no additional worktrees", async ({
  page,
}) => {
  const workspaceRoot = getWorkspaceRootOrThrow();
  const fixture = await seedGitOverlayFixture(workspaceRoot, {
    historyCommitCount: 0,
  });

  try {
    await openGitOverview(page);

    await expect(page.getByTestId("git-worktrees-accordion")).toHaveCount(0);
  } finally {
    await cleanupGitOverlayFixture(fixture);
  }
});

test("git pane shows an open worktree accordion when additional worktrees exist", async ({
  page,
}) => {
  const workspaceRoot = getWorkspaceRootOrThrow();
  const fixture = await seedGitOverlayFixture(workspaceRoot, {
    historyCommitCount: 0,
  });
  const worktreeRoot = path.join(
    path.dirname(workspaceRoot),
    "setta.git-pane-wt",
  );
  const extraWorktreePath = path.join(worktreeRoot, "feature-extra");

  try {
    await fs.mkdir(worktreeRoot, { recursive: true });
    runGit(workspaceRoot, ["branch", "feature-extra"]);
    runGit(workspaceRoot, [
      "worktree",
      "add",
      extraWorktreePath,
      "feature-extra",
    ]);

    await openGitOverview(page);

    const accordion = page.getByTestId("git-worktrees-accordion");
    await expect(accordion).toBeVisible();
    await expect(accordion).toHaveAttribute("open", "");
    await expect(accordion).toContainText("Worktrees");
    await expect(accordion).toContainText("Current");
    await expect(accordion).toContainText("feature-extra");
    await expect(accordion).toContainText(extraWorktreePath);
  } finally {
    runGit(workspaceRoot, ["worktree", "remove", "--force", extraWorktreePath]);
    await fs.rm(worktreeRoot, { recursive: true, force: true });
    await cleanupGitOverlayFixture(fixture);
  }
});
