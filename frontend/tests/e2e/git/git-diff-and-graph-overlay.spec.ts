import { expect, test } from "@playwright/test";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  cleanupGitOverlayFixture,
  getWorkspaceRootOrThrow,
  initializeDisposableGitRepo,
  openGitOverview,
  runGit,
  seedGitOverlayFixture,
  toRepoRelativePath,
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

test("git graph panes and columns resize without overlap or geometry drift", async ({
  page,
}) => {
  const workspaceRoot = getWorkspaceRootOrThrow();
  const fixture = await seedGitOverlayFixture(workspaceRoot, {
    historyCommitCount: 40,
  });

  try {
    await openGitOverview(page);

    await page.getByRole("button", { name: "Graph" }).click();
    const graphFilter = page.getByPlaceholder(/Filter commits/);
    await expect(graphFilter).toBeVisible();
    const graphOverlay = graphFilter.locator("xpath=ancestor::section[1]");

    if (!fixture.latestHistoryLabel) {
      throw new Error("Expected latest history label for graph resize test.");
    }
    await expect(
      graphOverlay.getByRole("button", {
        name: new RegExp(fixture.latestHistoryLabel),
      }),
    ).toBeVisible();

    const historyPane = graphOverlay.getByTestId("git-graph-history-pane");
    const diffPane = graphOverlay.getByTestId("git-graph-diff-pane");
    const paneSplitter = graphOverlay.getByTestId("git-graph-pane-splitter");
    const historyBefore = await historyPane.evaluate(
      (el) => el.getBoundingClientRect().width,
    );
    const diffBefore = await diffPane.evaluate(
      (el) => el.getBoundingClientRect().width,
    );
    const paneSplitterBox = await paneSplitter.boundingBox();
    if (!paneSplitterBox) {
      throw new Error(
        "Expected git graph pane splitter to have a bounding box.",
      );
    }
    await page.mouse.move(
      paneSplitterBox.x + paneSplitterBox.width / 2,
      paneSplitterBox.y + paneSplitterBox.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      paneSplitterBox.x + paneSplitterBox.width / 2 + 120,
      paneSplitterBox.y + paneSplitterBox.height / 2,
      { steps: 8 },
    );
    await page.mouse.up();

    const historyAfter = await historyPane.evaluate(
      (el) => el.getBoundingClientRect().width,
    );
    const diffAfter = await diffPane.evaluate(
      (el) => el.getBoundingClientRect().width,
    );
    expect(historyAfter).toBeGreaterThan(historyBefore + 40);
    expect(diffAfter).toBeLessThan(diffBefore - 40);

    const messageHeader = graphOverlay.getByTestId("git-graph-header-message");
    const authorHeader = graphOverlay.getByTestId("git-graph-header-author");
    const graphMessageResizeHandle = graphOverlay.getByTestId(
      "git-graph-col-resize-graph-message",
    );
    const messageAuthorResizeHandle = graphOverlay.getByTestId(
      "git-graph-col-resize-message-author",
    );
    const authorDateResizeHandle = graphOverlay.getByTestId(
      "git-graph-col-resize-author-date",
    );
    const dateHashResizeHandle = graphOverlay.getByTestId(
      "git-graph-col-resize-date-hash",
    );
    await expect(graphMessageResizeHandle).toBeVisible();
    await expect(messageAuthorResizeHandle).toBeVisible();
    await expect(authorDateResizeHandle).toBeVisible();
    await expect(dateHashResizeHandle).toBeVisible();

    const paneSplitterBoxBeforeNarrowDrag = await paneSplitter.boundingBox();
    if (!paneSplitterBoxBeforeNarrowDrag) {
      throw new Error(
        "Expected git graph pane splitter to have a bounding box before narrow drag.",
      );
    }
    await page.mouse.move(
      paneSplitterBoxBeforeNarrowDrag.x +
        paneSplitterBoxBeforeNarrowDrag.width / 2,
      paneSplitterBoxBeforeNarrowDrag.y +
        paneSplitterBoxBeforeNarrowDrag.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      paneSplitterBoxBeforeNarrowDrag.x +
        paneSplitterBoxBeforeNarrowDrag.width / 2 -
        1200,
      paneSplitterBoxBeforeNarrowDrag.y +
        paneSplitterBoxBeforeNarrowDrag.height / 2,
      { steps: 24 },
    );
    await page.mouse.up();

    const messageHeaderAfterNarrowPane = await messageHeader.boundingBox();
    const authorHeaderAfterNarrowPane = await authorHeader.boundingBox();
    if (!messageHeaderAfterNarrowPane || !authorHeaderAfterNarrowPane) {
      throw new Error(
        "Expected message and author headers to have bounding boxes after narrow pane drag.",
      );
    }
    expect(
      messageHeaderAfterNarrowPane.x + messageHeaderAfterNarrowPane.width,
    ).toBeLessThanOrEqual(authorHeaderAfterNarrowPane.x + 1);

    const paneSplitterBoxAfterNarrowDrag = await paneSplitter.boundingBox();
    if (!paneSplitterBoxAfterNarrowDrag) {
      throw new Error(
        "Expected git graph pane splitter to have a bounding box after narrow drag.",
      );
    }
    await page.mouse.move(
      paneSplitterBoxAfterNarrowDrag.x +
        paneSplitterBoxAfterNarrowDrag.width / 2,
      paneSplitterBoxAfterNarrowDrag.y +
        paneSplitterBoxAfterNarrowDrag.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      paneSplitterBoxAfterNarrowDrag.x +
        paneSplitterBoxAfterNarrowDrag.width / 2 +
        320,
      paneSplitterBoxAfterNarrowDrag.y +
        paneSplitterBoxAfterNarrowDrag.height / 2,
      { steps: 12 },
    );
    await page.mouse.up();

    const historyCommitSvg = graphOverlay
      .getByRole("button", {
        name: new RegExp(fixture.latestHistoryLabel),
      })
      .locator("svg")
      .first();

    const metricsBeforeGraphResize = await historyCommitSvg.evaluate((svg) => {
      const dot = svg.querySelector("circle");
      const laneStroke = svg.querySelector("line");
      if (!dot || !laneStroke) {
        return null;
      }
      const dotRect = dot.getBoundingClientRect();
      const laneStrokeRect = laneStroke.getBoundingClientRect();
      return {
        dotWidth: dotRect.width,
        dotHeight: dotRect.height,
        laneStrokeWidth: laneStrokeRect.width,
      };
    });
    if (!metricsBeforeGraphResize) {
      throw new Error(
        "Expected git graph row to render both a commit dot and lane stroke.",
      );
    }

    const graphMessageHandleBefore =
      await graphMessageResizeHandle.boundingBox();
    if (!graphMessageHandleBefore) {
      throw new Error(
        "Expected git graph graph-message resize handle to have a bounding box.",
      );
    }
    await page.mouse.move(
      graphMessageHandleBefore.x + graphMessageHandleBefore.width / 2,
      graphMessageHandleBefore.y + graphMessageHandleBefore.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      graphMessageHandleBefore.x + graphMessageHandleBefore.width / 2 + 80,
      graphMessageHandleBefore.y + graphMessageHandleBefore.height / 2,
      { steps: 8 },
    );
    const metricsDuringGraphResize = await historyCommitSvg.evaluate((svg) => {
      const dot = svg.querySelector("circle");
      const laneStroke = svg.querySelector("line");
      if (!dot || !laneStroke) {
        return null;
      }
      const dotRect = dot.getBoundingClientRect();
      const laneStrokeRect = laneStroke.getBoundingClientRect();
      return {
        dotWidth: dotRect.width,
        dotHeight: dotRect.height,
        laneStrokeWidth: laneStrokeRect.width,
      };
    });
    if (!metricsDuringGraphResize) {
      throw new Error(
        "Expected git graph row to keep rendering geometry while dragging.",
      );
    }
    expect(
      Math.abs(
        metricsBeforeGraphResize.dotWidth - metricsBeforeGraphResize.dotHeight,
      ),
    ).toBeLessThanOrEqual(1.5);
    expect(
      Math.abs(
        metricsDuringGraphResize.dotWidth - metricsDuringGraphResize.dotHeight,
      ),
    ).toBeLessThanOrEqual(1.5);
    expect(
      Math.abs(
        metricsDuringGraphResize.laneStrokeWidth -
          metricsBeforeGraphResize.laneStrokeWidth,
      ),
    ).toBeLessThanOrEqual(1.25);
    await page.mouse.up();

    const graphMessageHandleAfterGrow =
      await graphMessageResizeHandle.boundingBox();
    if (!graphMessageHandleAfterGrow) {
      throw new Error(
        "Expected git graph graph-message resize handle to remain measurable after drag.",
      );
    }
    await page.mouse.move(
      graphMessageHandleAfterGrow.x + graphMessageHandleAfterGrow.width / 2,
      graphMessageHandleAfterGrow.y + graphMessageHandleAfterGrow.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      graphMessageHandleAfterGrow.x +
        graphMessageHandleAfterGrow.width / 2 -
        160,
      graphMessageHandleAfterGrow.y + graphMessageHandleAfterGrow.height / 2,
      { steps: 8 },
    );
    await page.mouse.up();

    const metricsAfterGraphResize = await historyCommitSvg.evaluate((svg) => {
      const dot = svg.querySelector("circle");
      const laneStroke = svg.querySelector("line");
      if (!dot || !laneStroke) {
        return null;
      }
      const dotRect = dot.getBoundingClientRect();
      const laneStrokeRect = laneStroke.getBoundingClientRect();
      return {
        dotWidth: dotRect.width,
        dotHeight: dotRect.height,
        laneStrokeWidth: laneStrokeRect.width,
      };
    });
    if (!metricsAfterGraphResize) {
      throw new Error(
        "Expected git graph row to render both a commit dot and lane stroke after drag.",
      );
    }
    expect(
      Math.abs(
        metricsAfterGraphResize.dotWidth - metricsAfterGraphResize.dotHeight,
      ),
    ).toBeLessThanOrEqual(1.5);
    expect(
      Math.abs(
        metricsAfterGraphResize.laneStrokeWidth -
          metricsBeforeGraphResize.laneStrokeWidth,
      ),
    ).toBeLessThanOrEqual(1.25);

    const authorBefore = await authorHeader.evaluate(
      (el) => el.getBoundingClientRect().width,
    );
    const messageAuthorHandleBefore =
      await messageAuthorResizeHandle.boundingBox();
    const authorDateHandleBefore = await authorDateResizeHandle.boundingBox();
    const dateHashHandleBefore = await dateHashResizeHandle.boundingBox();
    if (!messageAuthorHandleBefore) {
      throw new Error(
        "Expected git graph message-author resize handle to have a bounding box.",
      );
    }
    if (!authorDateHandleBefore) {
      throw new Error(
        "Expected git graph author-date resize handle to have a bounding box.",
      );
    }
    if (!dateHashHandleBefore) {
      throw new Error(
        "Expected git graph date-hash resize handle to have a bounding box.",
      );
    }

    await page.mouse.move(
      messageAuthorHandleBefore.x + messageAuthorHandleBefore.width / 2,
      messageAuthorHandleBefore.y + messageAuthorHandleBefore.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      messageAuthorHandleBefore.x + messageAuthorHandleBefore.width / 2 + 70,
      messageAuthorHandleBefore.y + messageAuthorHandleBefore.height / 2,
      { steps: 8 },
    );
    await page.mouse.up();

    const messageAuthorHandleAfter =
      await messageAuthorResizeHandle.boundingBox();
    if (!messageAuthorHandleAfter) {
      throw new Error(
        "Expected git graph message-author resize handle to have a bounding box after drag.",
      );
    }
    const authorDateHandleAfterMessageDrag =
      await authorDateResizeHandle.boundingBox();
    const dateHashHandleAfterMessageDrag =
      await dateHashResizeHandle.boundingBox();
    if (!authorDateHandleAfterMessageDrag || !dateHashHandleAfterMessageDrag) {
      throw new Error(
        "Expected git graph non-adjacent resize handles to be measurable after message-author drag.",
      );
    }
    const authorAfter = await authorHeader.evaluate(
      (el) => el.getBoundingClientRect().width,
    );
    expect(messageAuthorHandleAfter.x).toBeGreaterThan(
      messageAuthorHandleBefore.x + 10,
    );
    expect(Math.abs(authorAfter - authorBefore)).toBeGreaterThan(10);
    expect(
      Math.abs(authorDateHandleAfterMessageDrag.x - authorDateHandleBefore.x),
    ).toBeLessThanOrEqual(2);
    expect(
      Math.abs(dateHashHandleAfterMessageDrag.x - dateHashHandleBefore.x),
    ).toBeLessThanOrEqual(2);

    const messageAuthorHandleBeforeAuthorDateDrag =
      await messageAuthorResizeHandle.boundingBox();
    if (!messageAuthorHandleBeforeAuthorDateDrag) {
      throw new Error(
        "Expected git graph message-author resize handle before author-date drag.",
      );
    }
    const authorDateHandleBeforeAuthorDateDrag =
      await authorDateResizeHandle.boundingBox();
    const dateHashHandleBeforeAuthorDateDrag =
      await dateHashResizeHandle.boundingBox();
    if (
      !authorDateHandleBeforeAuthorDateDrag ||
      !dateHashHandleBeforeAuthorDateDrag
    ) {
      throw new Error(
        "Expected git graph author-date/date-hash resize handles before author-date drag.",
      );
    }
    await page.mouse.move(
      authorDateHandleBeforeAuthorDateDrag.x +
        authorDateHandleBeforeAuthorDateDrag.width / 2,
      authorDateHandleBeforeAuthorDateDrag.y +
        authorDateHandleBeforeAuthorDateDrag.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      authorDateHandleBeforeAuthorDateDrag.x +
        authorDateHandleBeforeAuthorDateDrag.width / 2 +
        50,
      authorDateHandleBeforeAuthorDateDrag.y +
        authorDateHandleBeforeAuthorDateDrag.height / 2,
      { steps: 8 },
    );
    await page.mouse.up();

    const authorDateHandleAfter = await authorDateResizeHandle.boundingBox();
    if (!authorDateHandleAfter) {
      throw new Error(
        "Expected git graph author-date resize handle to have a bounding box after drag.",
      );
    }
    const messageAuthorHandleAfterAuthorDateDrag =
      await messageAuthorResizeHandle.boundingBox();
    const dateHashHandleAfterAuthorDateDrag =
      await dateHashResizeHandle.boundingBox();
    if (
      !messageAuthorHandleAfterAuthorDateDrag ||
      !dateHashHandleAfterAuthorDateDrag
    ) {
      throw new Error(
        "Expected git graph adjacent resize handles after author-date drag.",
      );
    }
    expect(authorDateHandleAfter.x).toBeGreaterThan(
      authorDateHandleBeforeAuthorDateDrag.x + 8,
    );
    expect(
      Math.abs(
        messageAuthorHandleAfterAuthorDateDrag.x -
          messageAuthorHandleBeforeAuthorDateDrag.x,
      ),
    ).toBeLessThanOrEqual(2);
    expect(
      Math.abs(
        dateHashHandleAfterAuthorDateDrag.x -
          dateHashHandleBeforeAuthorDateDrag.x,
      ),
    ).toBeLessThanOrEqual(2);

    const messageAuthorHandleBeforeDateHashDrag =
      await messageAuthorResizeHandle.boundingBox();
    const authorDateHandleBeforeDateHashDrag =
      await authorDateResizeHandle.boundingBox();
    const dateHashHandleBeforeDateHashDrag =
      await dateHashResizeHandle.boundingBox();
    if (
      !messageAuthorHandleBeforeDateHashDrag ||
      !authorDateHandleBeforeDateHashDrag ||
      !dateHashHandleBeforeDateHashDrag
    ) {
      throw new Error(
        "Expected git graph resize handles before date-hash drag.",
      );
    }
    await page.mouse.move(
      dateHashHandleBeforeDateHashDrag.x +
        dateHashHandleBeforeDateHashDrag.width / 2,
      dateHashHandleBeforeDateHashDrag.y +
        dateHashHandleBeforeDateHashDrag.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      dateHashHandleBeforeDateHashDrag.x +
        dateHashHandleBeforeDateHashDrag.width / 2 +
        40,
      dateHashHandleBeforeDateHashDrag.y +
        dateHashHandleBeforeDateHashDrag.height / 2,
      { steps: 8 },
    );
    await page.mouse.up();

    const dateHashHandleAfter = await dateHashResizeHandle.boundingBox();
    if (!dateHashHandleAfter) {
      throw new Error(
        "Expected git graph date-hash resize handle to have a bounding box after drag.",
      );
    }
    const messageAuthorHandleAfterDateHashDrag =
      await messageAuthorResizeHandle.boundingBox();
    const authorDateHandleAfterDateHashDrag =
      await authorDateResizeHandle.boundingBox();
    if (
      !messageAuthorHandleAfterDateHashDrag ||
      !authorDateHandleAfterDateHashDrag
    ) {
      throw new Error(
        "Expected git graph resize handles after date-hash drag.",
      );
    }
    expect(dateHashHandleAfter.x).toBeGreaterThan(
      dateHashHandleBeforeDateHashDrag.x + 6,
    );
    expect(
      Math.abs(
        messageAuthorHandleAfterDateHashDrag.x -
          messageAuthorHandleBeforeDateHashDrag.x,
      ),
    ).toBeLessThanOrEqual(2);
    expect(
      Math.abs(
        authorDateHandleAfterDateHashDrag.x -
          authorDateHandleBeforeDateHashDrag.x,
      ),
    ).toBeLessThanOrEqual(2);

    const commitListWrapper = graphOverlay.getByTestId(
      "git-graph-commit-list-wrapper",
    );
    const commitListOverflow = await commitListWrapper.evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }));
    expect(
      commitListOverflow.scrollWidth - commitListOverflow.clientWidth,
    ).toBeLessThanOrEqual(1);
    const listOverflowX = await commitListWrapper
      .locator(":scope > div")
      .first()
      .evaluate((el) => window.getComputedStyle(el).overflowX);
    expect(listOverflowX).toBe("hidden");

    await page.keyboard.press("Escape");
    await expect(graphFilter).toHaveCount(0);
  } finally {
    await cleanupGitOverlayFixture(fixture);
  }
});

test("git graph can open a historical file diff when the current workspace path is a directory", async ({
  page,
}) => {
  const workspaceRoot = getWorkspaceRootOrThrow();
  const repo = await initializeDisposableGitRepo(workspaceRoot);
  const fixtureRoot = repo.fixtureRoot;

  try {
    const initPath = path.join(fixtureRoot, "init.txt");
    const initRepoPath = toRepoRelativePath(workspaceRoot, initPath);
    await fs.writeFile(initPath, "init\n", "utf8");
    runGit(workspaceRoot, ["add", initRepoPath]);
    runGit(workspaceRoot, ["commit", "-m", "init"]);

    const migratedPath = path.join(fixtureRoot, "migrated-path");
    const migratedRepoPath = toRepoRelativePath(workspaceRoot, migratedPath);
    await fs.writeFile(migratedPath, "before\n", "utf8");
    runGit(workspaceRoot, ["add", migratedRepoPath]);
    runGit(workspaceRoot, ["commit", "-m", "add migrated file"]);

    await fs.rm(migratedPath, { force: true });
    await fs.mkdir(migratedPath, { recursive: true });
    await fs.writeFile(path.join(migratedPath, "inside.txt"), "inside\n", "utf8");
    runGit(workspaceRoot, ["add", "-A"]);
    runGit(workspaceRoot, ["commit", "-m", "replace migrated file with dir"]);

    await openGitOverview(page);
    await page.getByRole("button", { name: "Graph" }).click();
    const graphFilter = page.getByPlaceholder(/Filter commits/);
    await expect(graphFilter).toBeVisible();

    const graphOverlay = graphFilter.locator("xpath=ancestor::section[1]");
    await graphFilter.fill("add migrated file");
    const migratedCommit = graphOverlay.getByRole("button", {
      name: /add migrated file.*lanes 1/,
    });
    await expect(migratedCommit).toBeVisible();
    await migratedCommit.click();

    const filesList = graphOverlay.getByTestId("git-graph-files-list");
    await expect(filesList).toBeVisible();
    const migratedFileButton = filesList.getByRole("button", {
      name: /migrated-path/,
    });
    await expect(migratedFileButton).toBeVisible();
    await migratedFileButton.click();

    const diffContent = graphOverlay.locator(".cm-content");
    await expect(diffContent).toContainText(
      `diff --git a/${migratedRepoPath} b/${migratedRepoPath}`,
    );
    await expect(
      graphOverlay.getByText("Path must point to a file."),
    ).toHaveCount(0);
  } finally {
    await fs.rm(repo.fixtureRoot, { recursive: true, force: true });
    await fs.rm(repo.gitDir, { recursive: true, force: true });
  }
});

test("git graph clears selected commit diff when selected commit disappears after ref toggle", async ({
  page,
}) => {
  const workspaceRoot = getWorkspaceRootOrThrow();
  const repo = await initializeDisposableGitRepo(workspaceRoot);
  const fixtureRoot = repo.fixtureRoot;

  try {
    const initPath = path.join(fixtureRoot, "init.txt");
    const initRepoPath = toRepoRelativePath(workspaceRoot, initPath);
    await fs.writeFile(initPath, "init\n", "utf8");
    runGit(workspaceRoot, ["add", initRepoPath]);
    runGit(workspaceRoot, ["commit", "-m", "init"]);

    const branchOnlyPath = path.join(fixtureRoot, "branch-only.txt");
    const branchOnlyRepoPath = toRepoRelativePath(workspaceRoot, branchOnlyPath);
    await fs.writeFile(branchOnlyPath, "main branch\n", "utf8");
    runGit(workspaceRoot, ["add", branchOnlyRepoPath]);
    runGit(workspaceRoot, ["commit", "-m", "main-branch-commit"]);

    const primaryBranch = runGit(workspaceRoot, [
      "rev-parse",
      "--abbrev-ref",
      "HEAD",
    ]).trim();
    runGit(workspaceRoot, ["checkout", "-b", "side-branch"]);
    const sideOnlyPath = path.join(fixtureRoot, "side-only.txt");
    const sideOnlyRepoPath = toRepoRelativePath(workspaceRoot, sideOnlyPath);
    await fs.writeFile(sideOnlyPath, "side branch\n", "utf8");
    runGit(workspaceRoot, ["add", sideOnlyRepoPath]);
    runGit(workspaceRoot, ["commit", "-m", "side-only-commit"]);
    runGit(workspaceRoot, ["checkout", primaryBranch]);

    await openGitOverview(page);
    await page.getByRole("button", { name: "Graph" }).click();
    const graphFilter = page.getByPlaceholder(/Filter commits/);
    await expect(graphFilter).toBeVisible();
    const graphOverlay = graphFilter.locator("xpath=ancestor::section[1]");

    await graphOverlay.getByRole("button", { name: "Show all refs" }).click();
    await expect(
      graphOverlay.getByRole("button", { name: "Show current branch only" }),
    ).toBeVisible();

    await graphFilter.fill("side-only-commit");
    const sideCommit = graphOverlay.getByRole("button", {
      name: /side-only-commit/,
    });
    await expect(sideCommit).toBeVisible();
    await sideCommit.click();

    const filesList = graphOverlay.getByTestId("git-graph-files-list");
    await expect(filesList).toBeVisible();
    await filesList.getByRole("button", { name: /side-only\.txt/ }).click();
    const diffContent = graphOverlay.locator(".cm-content");
    await expect(diffContent).toContainText(
      `diff --git a/${sideOnlyRepoPath} b/${sideOnlyRepoPath}`,
    );

    await graphOverlay
      .getByRole("button", { name: "Show current branch only" })
      .click();
    await expect(
      graphOverlay.getByRole("button", { name: "Show all refs" }),
    ).toBeVisible();
    await expect(
      graphOverlay.getByText("Select a commit to view details.").first(),
    ).toBeVisible();
    await expect(graphOverlay.locator(".cm-content")).toHaveCount(0);
  } finally {
    await fs.rm(repo.fixtureRoot, { recursive: true, force: true });
    await fs.rm(repo.gitDir, { recursive: true, force: true });
  }
});

test("git graph drag listeners are cleaned up when the overlay closes mid-drag", async ({
  page,
}) => {
  const workspaceRoot = getWorkspaceRootOrThrow();
  const fixture = await seedGitOverlayFixture(workspaceRoot, {
    historyCommitCount: 20,
  });

  try {
    await openGitOverview(page);
    await page.getByRole("button", { name: "Graph" }).click();

    const graphFilter = page.getByPlaceholder(/Filter commits/);
    await expect(graphFilter).toBeVisible();
    const graphOverlay = graphFilter.locator("xpath=ancestor::section[1]");
    const paneSplitter = graphOverlay.getByTestId("git-graph-pane-splitter");
    const firstSplitterBox = await paneSplitter.boundingBox();
    if (!firstSplitterBox) {
      throw new Error("Expected git graph pane splitter box before drag.");
    }

    await page.mouse.move(
      firstSplitterBox.x + firstSplitterBox.width / 2,
      firstSplitterBox.y + firstSplitterBox.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      firstSplitterBox.x + firstSplitterBox.width / 2 + 80,
      firstSplitterBox.y + firstSplitterBox.height / 2,
      { steps: 8 },
    );
    await page.keyboard.press("Escape");
    await expect(graphFilter).toHaveCount(0);
    await page.mouse.up();

    await page.getByRole("button", { name: "Graph" }).click();
    const graphFilterAfterReopen = page.getByPlaceholder(/Filter commits/);
    await expect(graphFilterAfterReopen).toBeVisible();
    const graphOverlayAfterReopen = graphFilterAfterReopen.locator(
      "xpath=ancestor::section[1]",
    );
    const historyPaneAfterReopen = graphOverlayAfterReopen.getByTestId(
      "git-graph-history-pane",
    );
    const paneSplitterAfterReopen = graphOverlayAfterReopen.getByTestId(
      "git-graph-pane-splitter",
    );
    const historyBefore = await historyPaneAfterReopen.evaluate(
      (el) => el.getBoundingClientRect().width,
    );
    const secondSplitterBox = await paneSplitterAfterReopen.boundingBox();
    if (!secondSplitterBox) {
      throw new Error("Expected git graph pane splitter box after reopen.");
    }

    await page.mouse.move(
      secondSplitterBox.x + secondSplitterBox.width / 2,
      secondSplitterBox.y + secondSplitterBox.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      secondSplitterBox.x + secondSplitterBox.width / 2 + 90,
      secondSplitterBox.y + secondSplitterBox.height / 2,
      { steps: 8 },
    );
    await page.mouse.up();

    const historyAfter = await historyPaneAfterReopen.evaluate(
      (el) => el.getBoundingClientRect().width,
    );
    expect(historyAfter).toBeGreaterThan(historyBefore + 20);
  } finally {
    await cleanupGitOverlayFixture(fixture);
  }
});

test("git graph shows an explicit empty-history state for unborn HEAD", async ({
  page,
}) => {
  const workspaceRoot = getWorkspaceRootOrThrow();
  const repo = await initializeDisposableGitRepo(workspaceRoot);

  try {
    await openGitOverview(page);

    await page.getByRole("button", { name: "Graph" }).click();
    const graphFilter = page.getByPlaceholder(/Filter commits/);
    await expect(graphFilter).toBeVisible();

    const graphOverlay = graphFilter.locator("xpath=ancestor::section[1]");
    await expect(
      graphOverlay.getByTestId("git-graph-load-more-status"),
    ).toContainText("No commits yet on this ref.");
    await expect(
      graphOverlay.getByRole("button", { name: /lanes/i }),
    ).toHaveCount(0);
  } finally {
    await fs.rm(repo.fixtureRoot, { recursive: true, force: true });
    await fs.rm(repo.gitDir, { recursive: true, force: true });
  }
});

test("git graph keeps overlay open when Escape is pressed inside the filter input", async ({
  page,
}) => {
  const workspaceRoot = getWorkspaceRootOrThrow();
  const fixture = await seedGitOverlayFixture(workspaceRoot, {
    historyCommitCount: 20,
  });

  try {
    await openGitOverview(page);
    await page.getByRole("button", { name: "Graph" }).click();

    const graphFilter = page.getByPlaceholder(/Filter commits/);
    await expect(graphFilter).toBeVisible();
    await graphFilter.fill("history-00");
    await graphFilter.press("Escape");

    await expect(graphFilter).toBeVisible();
    await expect(graphFilter).toHaveValue("history-00");

    await page.locator("body").click();
    await page.keyboard.press("Escape");
    await expect(graphFilter).toHaveCount(0);
  } finally {
    await cleanupGitOverlayFixture(fixture);
  }
});

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

test("git graph keeps lanes aligned across join boundaries", async ({
  page,
}) => {
  const workspaceRoot = getWorkspaceRootOrThrow();
  const repo = await initializeDisposableGitRepo(workspaceRoot);
  const mainPath = path.join(repo.fixtureRoot, "graph-test-main.txt");
  const sidePath = path.join(repo.fixtureRoot, "graph-test-side.txt");
  const mainRepoPath = toRepoRelativePath(workspaceRoot, mainPath);
  const sideRepoPath = toRepoRelativePath(workspaceRoot, sidePath);
  const commitEnv = (isoTime: string): Record<string, string> => ({
    GIT_AUTHOR_DATE: isoTime,
    GIT_COMMITTER_DATE: isoTime,
  });

  try {
    // Root commit: graph-test A
    await fs.writeFile(mainPath, "A\n", "utf8");
    runGit(workspaceRoot, ["add", mainRepoPath]);
    runGit(
      workspaceRoot,
      ["commit", "-m", "graph-test A"],
      commitEnv("2000-01-01T00:00:00Z"),
    );
    const defaultBranch = runGit(workspaceRoot, [
      "rev-parse",
      "--abbrev-ref",
      "HEAD",
    ]).trim();

    // Side branch from A (will be merged later).
    runGit(workspaceRoot, ["checkout", "-b", "graph-test-side"]);
    await fs.writeFile(sidePath, "D\n", "utf8");
    runGit(workspaceRoot, ["add", sideRepoPath]);
    runGit(
      workspaceRoot,
      ["commit", "-m", "graph-test D"],
      commitEnv("2000-01-01T00:02:00Z"),
    );

    // Mainline commit: A -> B
    runGit(workspaceRoot, ["checkout", defaultBranch]);
    await fs.writeFile(mainPath, "B\n", "utf8");
    runGit(workspaceRoot, ["add", mainRepoPath]);
    runGit(
      workspaceRoot,
      ["commit", "-m", "graph-test B"],
      commitEnv("2000-01-01T00:01:00Z"),
    );

    // Branch1 from B (newest head, to force traversal order: C1 first).
    runGit(workspaceRoot, ["checkout", "-b", "graph-test-branch1"]);
    await fs.writeFile(mainPath, "C1\n", "utf8");
    runGit(workspaceRoot, ["add", mainRepoPath]);
    runGit(
      workspaceRoot,
      ["commit", "-m", "graph-test C1"],
      commitEnv("2000-01-01T00:05:00Z"),
    );

    runGit(workspaceRoot, ["checkout", defaultBranch]);
    // Branch2 from B: C2 then merge side branch: M
    runGit(workspaceRoot, ["checkout", "-b", "graph-test-branch2"]);
    await fs.writeFile(mainPath, "C2\n", "utf8");
    runGit(workspaceRoot, ["add", mainRepoPath]);
    runGit(
      workspaceRoot,
      ["commit", "-m", "graph-test C2"],
      commitEnv("2000-01-01T00:03:00Z"),
    );
    runGit(workspaceRoot, [
      "merge",
      "--no-ff",
      "graph-test-side",
      "-m",
      "graph-test M",
    ]);
    runGit(
      workspaceRoot,
      ["commit", "--amend", "--no-edit"],
      commitEnv("2000-01-01T00:04:00Z"),
    );

    await seedLocalStorage(page, { overviewTab: "Git", overviewVis: true });
    await ensureAppReady(page);

    await expect(page.getByRole("heading", { name: "Git" })).toBeVisible();

    await page.getByRole("button", { name: "Graph" }).click();
    const graphFilter = page.getByPlaceholder(/Filter commits/);
    await expect(graphFilter).toBeVisible();
    const graphOverlay = graphFilter.locator("xpath=ancestor::section[1]");
    const showAllRefsButton = graphOverlay.getByRole("button", {
      name: "Show all refs",
    });
    await expect(showAllRefsButton).toBeVisible();
    await showAllRefsButton.click();
    await expect(
      graphOverlay.getByRole("button", { name: "Show current branch only" }),
    ).toBeVisible();

    await expect(
      graphOverlay.getByRole("button", { name: /graph-test D/ }),
    ).toBeVisible();
    await expect(
      graphOverlay.getByRole("button", { name: /graph-test B/ }),
    ).toBeVisible();
    await expect(
      graphOverlay.getByRole("button", { name: /graph-test A/ }),
    ).toBeVisible();

    const bRow = graphOverlay.getByRole("button", { name: /graph-test B/ });
    const dRow = graphOverlay.getByRole("button", { name: /graph-test D/ });
    const aRow = graphOverlay.getByRole("button", { name: /graph-test A/ });

    // Lane-shift regression guard:
    // Compare the x coordinate of the rightmost vertical lane segment at B
    // with the x coordinate of the join curve at A. If lanes shift left when
    // a middle lane is removed, these won't match and the graph will look
    // "disconnected" at the row boundary.
    const dLaneColor = await dRow.locator("svg circle").evaluate((circle) => {
      return circle.getAttribute("fill");
    });
    expect(dLaneColor).not.toBeNull();

    const bLaneX = await bRow.locator("svg").evaluate((svg, laneColor) => {
      const lines = Array.from(svg.querySelectorAll("line"));
      for (const line of lines) {
        if (line.getAttribute("stroke") !== laneColor) {
          continue;
        }
        const raw = line.getAttribute("x1");
        if (!raw) {
          continue;
        }
        const value = Number(raw);
        return Number.isFinite(value) ? value : null;
      }
      return null;
    }, dLaneColor);
    expect(bLaneX).not.toBeNull();

    const aJoinStartX = await aRow.locator("svg").evaluate((svg, laneColor) => {
      const paths = Array.from(svg.querySelectorAll("path"));
      for (const path of paths) {
        if (path.getAttribute("stroke") !== laneColor) {
          continue;
        }
        const d = path.getAttribute("d") ?? "";
        const match = d.match(/M\s*([-\d.]+)[ ,]+([-\d.]+)\s*C/);
        if (!match) {
          continue;
        }
        const x = Number(match[1]);
        const y = Number(match[2]);
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
          continue;
        }
        if (Math.abs(y) > 1e-6) {
          continue;
        }
        return x;
      }
      return null;
    }, dLaneColor);
    expect(aJoinStartX).not.toBeNull();
    expect(aJoinStartX).toBe(bLaneX);

    await page.keyboard.press("Escape");
    await expect(graphFilter).toHaveCount(0);
  } finally {
    await fs.rm(repo.fixtureRoot, { recursive: true, force: true });
    await fs.rm(repo.gitDir, { recursive: true, force: true });
  }
});

test("git graph assigns distinct colors to more than 8 lanes", async ({
  page,
}) => {
  const workspaceRoot = getWorkspaceRootOrThrow();
  const repo = await initializeDisposableGitRepo(workspaceRoot);
  const basePath = path.join(repo.fixtureRoot, "graph-color-base.txt");
  const topicPaths = Array.from({ length: 9 }, (_, idx) =>
    path.join(repo.fixtureRoot, `graph-color-topic-${idx + 1}.txt`),
  );
  const baseRepoPath = toRepoRelativePath(workspaceRoot, basePath);
  const commitEnv = (isoTime: string): Record<string, string> => ({
    GIT_AUTHOR_DATE: isoTime,
    GIT_COMMITTER_DATE: isoTime,
  });

  try {
    await fs.writeFile(basePath, "base\n", "utf8");
    runGit(workspaceRoot, ["add", baseRepoPath]);
    runGit(
      workspaceRoot,
      ["commit", "-m", "graph-color base"],
      commitEnv("2000-01-01T00:00:00Z"),
    );

    const defaultBranch = runGit(workspaceRoot, [
      "rev-parse",
      "--abbrev-ref",
      "HEAD",
    ]).trim();

    const topicBranches: string[] = [];
    for (let idx = 0; idx < topicPaths.length; idx += 1) {
      const branch = `graph-color-topic-${idx + 1}`;
      topicBranches.push(branch);

      runGit(workspaceRoot, ["checkout", "-b", branch]);
      await fs.writeFile(topicPaths[idx]!, `topic ${idx + 1}\n`, "utf8");
      runGit(workspaceRoot, [
        "add",
        toRepoRelativePath(workspaceRoot, topicPaths[idx]!),
      ]);
      runGit(
        workspaceRoot,
        ["commit", "-m", `graph-color T${idx + 1}`],
        commitEnv(`2000-01-01T00:0${idx + 1}:00Z`),
      );
      runGit(workspaceRoot, ["checkout", defaultBranch]);
    }

    runGit(
      workspaceRoot,
      ["merge", "-m", "graph-color M", ...topicBranches],
      commitEnv("2000-01-01T00:10:00Z"),
    );
    runGit(
      workspaceRoot,
      ["commit", "--amend", "--no-edit"],
      commitEnv("2000-01-01T00:10:00Z"),
    );

    await seedLocalStorage(page, { overviewTab: "Git", overviewVis: true });
    await ensureAppReady(page);

    await expect(page.getByRole("heading", { name: "Git" })).toBeVisible();

    await page.getByRole("button", { name: "Graph" }).click();
    const graphFilter = page.getByPlaceholder(/Filter commits/);
    await expect(graphFilter).toBeVisible();
    const graphOverlay = graphFilter.locator("xpath=ancestor::section[1]");

    await graphFilter.fill("graph-color M");
    const mergeRow = graphOverlay.getByRole("button", {
      name: /graph-color M/i,
    });
    await expect(mergeRow).toBeVisible();

    const { laneCount, uniqueColors } = await mergeRow.evaluate((row) => {
      const laneCountMatch = (row.textContent ?? "").match(/lanes\s*(\d+)/);
      const parsedLaneCount = laneCountMatch ? Number(laneCountMatch[1]) : null;
      const svg = row.querySelector("svg");
      if (!svg) {
        return { laneCount: parsedLaneCount, uniqueColors: null };
      }

      const colors = new Set<string>();
      for (const el of svg.querySelectorAll("line,path")) {
        const stroke = el.getAttribute("stroke");
        if (stroke) {
          colors.add(stroke);
        }
      }
      const fill = svg.querySelector("circle")?.getAttribute("fill");
      if (fill) {
        colors.add(fill);
      }

      return { laneCount: parsedLaneCount, uniqueColors: colors.size };
    });

    expect(laneCount).not.toBeNull();
    expect(laneCount).toBeGreaterThan(8);
    expect(uniqueColors).toBe(laneCount);
    const graphMessageResizeHandle = graphOverlay.getByTestId(
      "git-graph-col-resize-graph-message",
    );
    await expect(graphMessageResizeHandle).toBeVisible();

    const mergeSvg = mergeRow.locator("svg");
    const dotBeforeResize = await mergeSvg.evaluate((svg) => {
      const dot = svg.querySelector("circle");
      if (!dot) {
        return null;
      }
      const rect = dot.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    });
    if (!dotBeforeResize) {
      throw new Error(
        "Expected graph-color merge row to render a commit dot before resize.",
      );
    }

    const graphMessageHandleBefore =
      await graphMessageResizeHandle.boundingBox();
    if (!graphMessageHandleBefore) {
      throw new Error(
        "Expected graph-message resize handle to have a bounding box before narrow drag.",
      );
    }
    await page.mouse.move(
      graphMessageHandleBefore.x + graphMessageHandleBefore.width / 2,
      graphMessageHandleBefore.y + graphMessageHandleBefore.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      graphMessageHandleBefore.x + graphMessageHandleBefore.width / 2 - 180,
      graphMessageHandleBefore.y + graphMessageHandleBefore.height / 2,
      { steps: 10 },
    );
    const dotDuringNarrowResize = await mergeSvg.evaluate((svg) => {
      const dot = svg.querySelector("circle");
      if (!dot) {
        return null;
      }
      const rect = dot.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    });
    await page.mouse.up();
    if (!dotDuringNarrowResize) {
      throw new Error(
        "Expected graph-color merge row to render a commit dot during narrow resize drag.",
      );
    }
    const dotAfterNarrowResize = await mergeSvg.evaluate((svg) => {
      const dot = svg.querySelector("circle");
      if (!dot) {
        return null;
      }
      const rect = dot.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    });
    if (!dotAfterNarrowResize) {
      throw new Error(
        "Expected graph-color merge row to render a commit dot after narrow resize drag.",
      );
    }
    expect(
      Math.abs(dotBeforeResize.width - dotBeforeResize.height),
    ).toBeLessThanOrEqual(1.5);
    expect(
      Math.abs(dotDuringNarrowResize.width - dotDuringNarrowResize.height),
    ).toBeLessThanOrEqual(1.5);
    expect(
      Math.abs(dotAfterNarrowResize.width - dotAfterNarrowResize.height),
    ).toBeLessThanOrEqual(1.5);

    await page.keyboard.press("Escape");
    await expect(graphFilter).toHaveCount(0);
  } finally {
    await fs.rm(repo.fixtureRoot, { recursive: true, force: true });
    await fs.rm(repo.gitDir, { recursive: true, force: true });
  }
});

test("git graph keeps merge-to lanes continuous when the branch continues above the merge", async ({
  page,
}) => {
  const workspaceRoot = getWorkspaceRootOrThrow();
  const repo = await initializeDisposableGitRepo(workspaceRoot);
  const mainPath = path.join(repo.fixtureRoot, "graph-gap-main.txt");
  const sidePath1 = path.join(repo.fixtureRoot, "graph-gap-side-1.txt");
  const sidePath2 = path.join(repo.fixtureRoot, "graph-gap-side-2.txt");
  const mainRepoPath = toRepoRelativePath(workspaceRoot, mainPath);
  const sideRepoPath1 = toRepoRelativePath(workspaceRoot, sidePath1);
  const sideRepoPath2 = toRepoRelativePath(workspaceRoot, sidePath2);
  const commitEnv = (isoTime: string): Record<string, string> => ({
    GIT_AUTHOR_DATE: isoTime,
    GIT_COMMITTER_DATE: isoTime,
  });

  try {
    await fs.writeFile(mainPath, "A\n", "utf8");
    runGit(workspaceRoot, ["add", mainRepoPath]);
    runGit(
      workspaceRoot,
      ["commit", "-m", "graph-gap A"],
      commitEnv("2000-01-01T00:00:00Z"),
    );

    const defaultBranch = runGit(workspaceRoot, [
      "rev-parse",
      "--abbrev-ref",
      "HEAD",
    ]).trim();

    runGit(workspaceRoot, ["checkout", "-b", "graph-gap-side"]);
    await fs.writeFile(sidePath1, "S1\n", "utf8");
    runGit(workspaceRoot, ["add", sideRepoPath1]);
    runGit(
      workspaceRoot,
      ["commit", "-m", "graph-gap S1"],
      commitEnv("2000-01-01T00:01:00Z"),
    );

    // Merge the side branch into main.
    runGit(workspaceRoot, ["checkout", defaultBranch]);
    runGit(workspaceRoot, [
      "merge",
      "--no-ff",
      "graph-gap-side",
      "-m",
      "graph-gap M",
    ]);
    runGit(
      workspaceRoot,
      ["commit", "--amend", "--no-edit"],
      commitEnv("2000-01-01T00:02:00Z"),
    );

    // Continue the side branch after the merge so the side lane exists above the
    // merge commit when showing `--all` refs.
    runGit(workspaceRoot, ["checkout", "graph-gap-side"]);
    await fs.writeFile(sidePath2, "S2\n", "utf8");
    runGit(workspaceRoot, ["add", sideRepoPath2]);
    runGit(
      workspaceRoot,
      ["commit", "-m", "graph-gap S2"],
      commitEnv("2000-01-01T00:03:00Z"),
    );

    await seedLocalStorage(page, { overviewTab: "Git", overviewVis: true });
    await ensureAppReady(page);

    await expect(page.getByRole("heading", { name: "Git" })).toBeVisible();

    await page.getByRole("button", { name: "Graph" }).click();
    const graphFilter = page.getByPlaceholder(/Filter commits/);
    await expect(graphFilter).toBeVisible();

    const graphOverlay = graphFilter.locator("xpath=ancestor::section[1]");
    const showAllRefsButton = graphOverlay.getByRole("button", {
      name: "Show all refs",
    });
    await expect(showAllRefsButton).toBeVisible();
    await showAllRefsButton.click();
    await expect(
      graphOverlay.getByRole("button", { name: "Show current branch only" }),
    ).toBeVisible();

    await expect(
      graphOverlay.getByRole("button", { name: /graph-gap S2/i }),
    ).toBeVisible();

    await graphFilter.fill("graph-gap M");
    const mergeRow = graphOverlay.getByRole("button", {
      name: /graph-gap M/i,
    });
    await expect(mergeRow).toBeVisible();

    const svgGeometry = await mergeRow.locator("svg").evaluate((svg) => {
      const parseNum = (raw: string | null): number | null => {
        if (!raw) {
          return null;
        }
        const num = Number(raw);
        return Number.isFinite(num) ? num : null;
      };

      const height = parseNum(svg.getAttribute("height"));
      if (height === null) {
        return { error: "missing svg height" };
      }
      const centerY = height / 2;

      let mergeStroke: string | null = null;
      for (const path of Array.from(svg.querySelectorAll("path"))) {
        const stroke = path.getAttribute("stroke");
        if (!stroke) {
          continue;
        }
        const d = path.getAttribute("d") ?? "";
        const startMatch = d.match(/^M\s*([-\d.]+)[ ,]+([-\d.]+)\s*C/);
        const endMatch = d.match(/([-\d.]+)[ ,]+([-\d.]+)\s*$/);
        if (!startMatch || !endMatch) {
          continue;
        }
        const yStart = Number(startMatch[2]);
        const yEnd = Number(endMatch[2]);
        if (!Number.isFinite(yStart) || !Number.isFinite(yEnd)) {
          continue;
        }
        if (
          Math.abs(yStart - centerY) < 1e-6 &&
          Math.abs(yEnd - height) < 1e-6
        ) {
          mergeStroke = stroke;
          break;
        }
      }

      if (!mergeStroke) {
        return { error: "missing merge path", height };
      }

      const matchingLines = Array.from(svg.querySelectorAll("line")).filter(
        (line) => line.getAttribute("stroke") === mergeStroke,
      );
      let best: { minY: number; maxY: number } | null = null;
      for (const line of matchingLines) {
        const y1 = parseNum(line.getAttribute("y1"));
        const y2 = parseNum(line.getAttribute("y2"));
        if (y1 === null || y2 === null) {
          continue;
        }
        const minY = Math.min(y1, y2);
        const maxY = Math.max(y1, y2);
        if (!best || maxY > best.maxY) {
          best = { minY, maxY };
        }
      }

      if (!best) {
        return { error: "missing lane line", height, mergeStroke };
      }

      return {
        height,
        centerY,
        mergeStroke,
        minY: best.minY,
        maxY: best.maxY,
      };
    });

    expect(svgGeometry).not.toHaveProperty("error");
    expect(svgGeometry.minY).toBeCloseTo(0, 5);
    expect(svgGeometry.maxY).toBeCloseTo(svgGeometry.height, 5);

    await page.keyboard.press("Escape");
    await expect(graphFilter).toHaveCount(0);
  } finally {
    await fs.rm(repo.fixtureRoot, { recursive: true, force: true });
    await fs.rm(repo.gitDir, { recursive: true, force: true });
  }
});
