import { expect, test } from "@playwright/test";
import {
  cleanupGitOverlayFixture,
  getWorkspaceRootOrThrow,
  openGitOverview,
  seedGitOverlayFixture,
} from "./helpers/gitOverlayFixture";

test("git diff overlay renders staged, unstaged, rename, and untracked diffs", async ({
  page,
}) => {
  const workspaceRoot = getWorkspaceRootOrThrow();
  const fixture = await seedGitOverlayFixture(workspaceRoot, {
    historyCommitCount: 0,
  });

  try {
    await openGitOverview(page);

    const stagedGroup = page
      .getByRole("heading", { name: "Staged Changes" })
      .locator("xpath=ancestor::section[1]");
    const stagedTracked = stagedGroup.getByRole("button", {
      name: /tracked\.py/,
    });
    const stagedLegacy = stagedGroup.getByRole("button", {
      name: /legacy\.py/,
    });
    const stagedRename = stagedGroup.getByRole("button", {
      name: /rename-old\.py -> .*rename-new\.py/,
    });
    await expect(stagedTracked).toBeVisible();
    await expect(stagedLegacy).toBeVisible();
    await expect(stagedRename).toBeVisible();
    await expect(stagedTracked).toHaveAttribute(
      "data-file-status-category",
      "changed",
    );
    await expect(stagedLegacy).toHaveAttribute(
      "data-file-status-category",
      "deleted",
    );
    await stagedRename.click();

    const closeDiffButton = page.getByRole("button", {
      name: "Close git diff",
    });
    await expect(closeDiffButton).toBeVisible();

    const diffOverlay = closeDiffButton.locator("xpath=ancestor::section[1]");
    const diffContent = diffOverlay.locator(".cm-content");
    await expect(diffContent).toContainText(
      `rename from ${fixture.renameOldRepoPath}`,
    );
    await expect(diffContent).toContainText(
      `rename to ${fixture.renameNewRepoPath}`,
    );

    await stagedTracked.click();
    await expect(diffContent).toContainText(
      `diff --git a/${fixture.trackedRepoPath} b/${fixture.trackedRepoPath}`,
    );
    await expect(diffContent).toContainText("-  return 1");
    await expect(diffContent).toContainText("+  return 2");
    await expect(
      diffOverlay.locator(".cm-gitdiff-syntax").first(),
    ).toBeVisible();

    await diffOverlay.getByRole("button", { name: "Unstaged" }).click();
    await expect(diffContent).toContainText("-  return 2");
    await expect(diffContent).toContainText("+  return 3");

    await page.keyboard.press("Escape");
    await expect(closeDiffButton).toHaveCount(0);

    const untrackedGroup = page
      .getByRole("heading", { name: "Untracked" })
      .locator("xpath=ancestor::section[1]");
    const untrackedNew = untrackedGroup.getByRole("button", {
      name: /new\.py/,
    });
    await expect(untrackedNew).toHaveAttribute(
      "data-file-status-category",
      "added",
    );
    await untrackedNew.click();

    const closeDiffButton2 = page.getByRole("button", {
      name: "Close git diff",
    });
    await expect(closeDiffButton2).toBeVisible();
    const diffOverlay2 = closeDiffButton2.locator("xpath=ancestor::section[1]");
    const diffContent2 = diffOverlay2.locator(".cm-content");
    await expect(diffContent2).toContainText("new file mode");
    await expect(diffContent2).toContainText(
      `diff --git a/${fixture.untrackedRepoPath} b/${fixture.untrackedRepoPath}`,
    );
    await expect(diffContent2).toContainText("+def bar():");
    await expect(
      diffOverlay2.locator(".cm-gitdiff-syntax").first(),
    ).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(closeDiffButton2).toHaveCount(0);
  } finally {
    await cleanupGitOverlayFixture(fixture);
  }
});

test("git pane clears stale status entries when refresh fails", async ({
  page,
}) => {
  const workspaceRoot = getWorkspaceRootOrThrow();
  const fixture = await seedGitOverlayFixture(workspaceRoot, {
    historyCommitCount: 0,
  });

  try {
    await openGitOverview(page);

    const stagedGroup = page
      .getByRole("heading", { name: "Staged Changes" })
      .locator("xpath=ancestor::section[1]");
    const stagedTracked = stagedGroup.getByRole("button", {
      name: /tracked\.py/,
    });
    await expect(stagedTracked).toBeVisible();

    let shouldFailRefresh = false;
    await page.route("**/git/status*", async (route) => {
      if (route.request().method() !== "POST" || !shouldFailRefresh) {
        await route.continue();
        return;
      }
      shouldFailRefresh = false;
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ detail: "intentional status refresh failure" }),
      });
    });

    shouldFailRefresh = true;
    await page.getByRole("button", { name: "Refresh" }).click();

    await expect(
      page.getByText("intentional status refresh failure"),
    ).toBeVisible();
    await expect(stagedTracked).toHaveCount(0);
  } finally {
    await cleanupGitOverlayFixture(fixture);
  }
});
