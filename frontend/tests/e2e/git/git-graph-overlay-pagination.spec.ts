import { expect, test } from "@playwright/test";
import { allowExpectedApiError } from "../helpers";
import {
  cleanupGitOverlayFixture,
  getWorkspaceRootOrThrow,
  openGitOverview,
  seedGitOverlayFixture,
} from "./helpers/gitOverlayFixture";

test("git graph paginates, filters, and loads commit file diffs", async ({
  page,
}) => {
  const workspaceRoot = getWorkspaceRootOrThrow();
  const fixture = await seedGitOverlayFixture(workspaceRoot, {
    historyCommitCount: 260,
  });

  try {
    await openGitOverview(page);

    await page.getByRole("button", { name: "Graph" }).click();
    const graphFilter = page.getByPlaceholder(/Filter commits/);
    await expect(graphFilter).toBeVisible();

    const graphOverlay = graphFilter.locator("xpath=ancestor::section[1]");
    await expect(
      graphOverlay.getByRole("button", { name: "Show all refs" }),
    ).toBeVisible();
    await expect(
      graphOverlay.getByText("Select a commit to view details.").first(),
    ).toBeVisible();
    await expect(
      graphOverlay.getByRole("button", { name: /history-259/ }),
    ).toBeVisible();

    const commitListWrapper = graphOverlay.getByTestId(
      "git-graph-commit-list-wrapper",
    );

    await graphFilter.fill("history-000");
    await expect(
      graphOverlay.getByRole("button", { name: /history-000.*lanes 1/ }),
    ).toHaveCount(0);
    await expect(
      graphOverlay.getByTestId("git-graph-load-more-status"),
    ).toContainText("Filtering loaded commits only.");
    await graphFilter.fill("");

    const commitListScroller = commitListWrapper
      .locator(":scope > div")
      .first();
    await commitListScroller.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await expect(
      graphOverlay.getByTestId("git-graph-load-more-status"),
    ).toContainText("Start of history reached.");

    await graphFilter.fill("history-000");
    await expect(
      graphOverlay.getByRole("button", { name: /history-000.*lanes 1/ }),
    ).toBeVisible();
    await graphFilter.fill("");

    await expect(
      graphOverlay.getByRole("button", { name: /history-259.*lanes 1/ }),
    ).toBeVisible();
    await graphFilter.fill("init");
    await expect(
      graphOverlay.getByRole("button", { name: /init.*lanes 1/ }),
    ).toBeVisible();
    await graphFilter.fill("");

    await graphFilter.fill("add tracked");
    const addTrackedCommit = graphOverlay.getByRole("button", {
      name: /add tracked.*lanes 1/,
    });
    await expect(addTrackedCommit).toBeVisible();
    await addTrackedCommit.click();

    await expect(graphOverlay.getByText("Files changed")).toBeVisible();
    await expect(
      graphOverlay.getByTestId("git-graph-expanded-gutter").first(),
    ).toBeVisible();
    const filesList = graphOverlay.getByTestId("git-graph-files-list");
    await expect(filesList).toBeVisible();
    const overflowModes = await filesList.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return { overflowX: style.overflowX, overflowY: style.overflowY };
    });
    expect(overflowModes.overflowX).toBe("hidden");
    expect(overflowModes.overflowY).toBe("auto");

    const trackedFileButton = graphOverlay.getByRole("button", {
      name: /tracked\.py/,
    });
    await expect(trackedFileButton).toBeVisible();
    await expect(trackedFileButton).toHaveAttribute(
      "data-file-status-category",
      "added",
    );
    await trackedFileButton.click();

    await graphFilter.fill("history-259");
    const historyCommit = graphOverlay.getByRole("button", {
      name: /history-259.*lanes 1/,
    });
    await expect(historyCommit).toBeVisible();
    await historyCommit.click();
    const historyFileButton = graphOverlay.getByRole("button", {
      name: /history\.txt/,
    });
    await expect(historyFileButton).toBeVisible();
    await expect(historyFileButton).toHaveAttribute(
      "data-file-status-category",
      "changed",
    );

    await graphFilter.fill("add tracked");
    await expect(addTrackedCommit).toBeVisible();
    await addTrackedCommit.click();
    const trackedFileButtonAfterReselect = graphOverlay.getByRole("button", {
      name: /tracked\.py/,
    });
    await expect(trackedFileButtonAfterReselect).toBeVisible();
    await trackedFileButtonAfterReselect.click();

    const graphDiffContent = graphOverlay.locator(".cm-content");
    await expect(graphDiffContent).toContainText(
      `diff --git a/${fixture.trackedRepoPath} b/${fixture.trackedRepoPath}`,
    );
    await expect(graphDiffContent).toContainText("+def foo():");
    await expect(
      graphOverlay.locator(".cm-gitdiff-syntax").first(),
    ).toBeVisible();

    await addTrackedCommit.click();
    await expect(graphOverlay.getByText("Files changed")).toHaveCount(0);
    await expect(
      graphOverlay.getByText("Select a commit to view details.").first(),
    ).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(graphFilter).toHaveCount(0);
  } finally {
    await cleanupGitOverlayFixture(fixture);
  }
});

test("git graph pauses auto-pagination after a load-more error until Retry is clicked", async ({
  page,
}) => {
  const workspaceRoot = getWorkspaceRootOrThrow();
  const fixture = await seedGitOverlayFixture(workspaceRoot, {
    historyCommitCount: 260,
  });
  let failedPaginationRequests = 0;

  await page.route("**/git/log*", async (route) => {
    const req = route.request();
    if (req.method() !== "POST") {
      await route.continue();
      return;
    }
    const body = req.postDataJSON() as { offset?: unknown } | null;
    if (typeof body?.offset === "number" && body.offset > 0) {
      failedPaginationRequests += 1;
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({
          detail: "intentional pagination failure for e2e",
        }),
      });
      return;
    }
    await route.continue();
  });

  try {
    await openGitOverview(page);
    allowExpectedApiError(page, {
      path: "/api/git/log",
      statuses: [500],
      method: "POST",
      count: 2,
    });
    await page.getByRole("button", { name: "Graph" }).click();
    const graphFilter = page.getByPlaceholder(/Filter commits/);
    await expect(graphFilter).toBeVisible();
    const graphOverlay = graphFilter.locator("xpath=ancestor::section[1]");
    await expect(
      graphOverlay.getByRole("button", { name: /history-259/ }),
    ).toBeVisible();
    const commitListScroller = graphOverlay
      .getByTestId("git-graph-commit-list-wrapper")
      .locator(":scope > div")
      .first();

    for (let i = 0; i < 3; i += 1) {
      await commitListScroller.evaluate((el) => {
        el.scrollTop = el.scrollHeight;
      });
    }
    await expect.poll(() => failedPaginationRequests).toBe(1);
    await expect(
      graphOverlay.getByTestId("git-graph-load-more-status"),
    ).toContainText("intentional pagination failure for e2e");

    await commitListScroller.evaluate((el) => {
      el.scrollTop = 0;
    });
    await commitListScroller.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await expect.poll(() => failedPaginationRequests).toBe(1);

    await graphOverlay.getByTestId("git-graph-load-more-retry").click();
    await expect.poll(() => failedPaginationRequests).toBe(2);
  } finally {
    await cleanupGitOverlayFixture(fixture);
  }
});

test("git graph shows a warning when commit details are truncated", async ({
  page,
}) => {
  const workspaceRoot = getWorkspaceRootOrThrow();
  const fixture = await seedGitOverlayFixture(workspaceRoot, {
    historyCommitCount: 0,
  });

  await page.route("**/git/commitDetails*", async (route) => {
    const body = route.request().postDataJSON() as { commitHash?: unknown };
    if (typeof body.commitHash !== "string") {
      throw new Error("Expected commitHash in getGitCommitDetails request.");
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        repoRoot: workspaceRoot,
        commitHash: body.commitHash,
        parents: [],
        authorName: "E2E",
        authorEmail: "e2e@example.com",
        authorTimeMs: 1,
        committerName: "E2E",
        committerEmail: "e2e@example.com",
        committerTimeMs: 1,
        subject: "truncated details",
        body: "",
        files: [
          {
            path: fixture.trackedRepoPath,
            oldPath: null,
            status: "M",
            additions: 1,
            deletions: 1,
          },
        ],
        isTruncated: true,
      }),
    });
  });

  try {
    await openGitOverview(page);
    await page.getByRole("button", { name: "Graph" }).click();
    const graphFilter = page.getByPlaceholder(/Filter commits/);
    await expect(graphFilter).toBeVisible();
    const graphOverlay = graphFilter.locator("xpath=ancestor::section[1]");

    await graphFilter.fill("add tracked");
    const addTrackedCommit = graphOverlay.getByRole("button", {
      name: /add tracked.*lanes 1/,
    });
    await expect(addTrackedCommit).toBeVisible();
    await addTrackedCommit.click();
    await expect(graphOverlay.getByText("Files changed")).toBeVisible();

    await expect(
      graphOverlay.getByTestId("git-graph-commit-details-truncated-warning"),
    ).toContainText(
      "Commit details were truncated. The changed-file list may be incomplete.",
    );
  } finally {
    await cleanupGitOverlayFixture(fixture);
  }
});
