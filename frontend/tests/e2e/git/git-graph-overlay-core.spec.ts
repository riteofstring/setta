import { expect, test } from "@playwright/test";
import { promises as fs } from "node:fs";
import path from "node:path";
import { allowExpectedApiError } from "../helpers";
import {
  cleanupGitOverlayFixture,
  getWorkspaceRootOrThrow,
  initializeDisposableGitRepo,
  openGitOverview,
  runGit,
  seedGitOverlayFixture,
  toRepoRelativePath,
} from "./helpers/gitOverlayFixture";

test("git graph clears stale rows when refresh fails", async ({ page }) => {
  const workspaceRoot = getWorkspaceRootOrThrow();
  const fixture = await seedGitOverlayFixture(workspaceRoot, {
    historyCommitCount: 20,
  });

  try {
    await openGitOverview(page);
    await page
      .getByTestId("overview-tab-content-shell")
      .getByRole("button", { name: "Graph" })
      .click();

    const graphFilter = page.getByPlaceholder(/Filter commits/);
    await expect(graphFilter).toBeVisible();
    const graphOverlay = graphFilter.locator("xpath=ancestor::section[1]");

    if (!fixture.latestHistoryLabel) {
      throw new Error(
        "Expected latest history label for stale graph refresh test.",
      );
    }
    const latestCommitButton = graphOverlay.getByRole("button", {
      name: new RegExp(fixture.latestHistoryLabel),
    });
    await expect(latestCommitButton).toBeVisible();

    let shouldFailRefresh = false;
    await page.route("**/git/log*", async (route) => {
      if (route.request().method() !== "POST" || !shouldFailRefresh) {
        await route.continue();
        return;
      }
      const body = route.request().postDataJSON() as {
        offset?: unknown;
      } | null;
      if (body?.offset !== 0) {
        await route.continue();
        return;
      }
      shouldFailRefresh = false;
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ detail: "intentional graph refresh failure" }),
      });
    });

    allowExpectedApiError(page, {
      path: "/api/git/log",
      statuses: [500],
      method: "POST",
      count: 1,
    });
    shouldFailRefresh = true;
    await graphOverlay.getByRole("button", { name: "Refresh" }).click();

    await expect(
      graphOverlay.getByText("intentional graph refresh failure"),
    ).toBeVisible();
    await expect(latestCommitButton).toHaveCount(0);
  } finally {
    await cleanupGitOverlayFixture(fixture);
  }
});

test("git graph follows the overview pane until it leaves the tracked default state", async ({
  page,
}) => {
  const workspaceRoot = getWorkspaceRootOrThrow();
  const fixture = await seedGitOverlayFixture(workspaceRoot, {
    historyCommitCount: 8,
  });

  try {
    await openGitOverview(page);

    await page
      .getByTestId("overview-tab-content-shell")
      .getByRole("button", { name: "Graph" })
      .click();

    const trackedWindow = page.getByTestId("project-chat-maximized-window");
    await expect(trackedWindow).toBeVisible();
    await expect(trackedWindow).toHaveAttribute(
      "data-chat-window-tracked-pane-target",
      "git_overview",
    );
    await expect(
      trackedWindow.getByTestId("git-graph-toggle-embedded-git-pane"),
    ).toHaveCount(0);
    const firstInstanceId = await trackedWindow.getAttribute(
      "data-chat-window-instance-id",
    );
    if (!firstInstanceId) {
      throw new Error("Expected initial tracked git graph instance id.");
    }
    const layout = await page.evaluate(async () => {
      const { useLocalStorage } = await import("/src/state/definitions.ts");
      const state = useLocalStorage.getState();
      return {
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        overviewTrueWidth: state.overviewTrueWidth,
        uiEditorTrueWidth: state.uiEditorTrueWidth,
      };
    });
    const trackedWindowBox = await trackedWindow.boundingBox();
    if (!trackedWindowBox) {
      throw new Error("Expected tracked git graph window bounds.");
    }
    expect(
      Math.abs(trackedWindowBox.x - layout.overviewTrueWidth),
    ).toBeLessThanOrEqual(8);
    expect(
      Math.abs(
        trackedWindowBox.width -
          (layout.innerWidth -
            layout.overviewTrueWidth -
            layout.uiEditorTrueWidth),
      ),
    ).toBeLessThanOrEqual(12);

    await page.evaluate(async () => {
      const { openGitGraphOverlay } = await import("/src/state/actions/git.ts");
      await openGitGraphOverlay();
    });
    await expect(trackedWindow).toHaveAttribute(
      "data-chat-window-instance-id",
      firstInstanceId,
    );

    await trackedWindow.getByTestId("project-chat-window-restore").click();
    const firstFloatingWindow = page.locator(
      `[data-testid="project-chat-floating-window"][data-chat-window-instance-id="${firstInstanceId}"]`,
    );
    await expect(firstFloatingWindow).toBeVisible();
    const gitPaneToggle = firstFloatingWindow.getByTestId(
      "git-graph-toggle-embedded-git-pane",
    );
    await expect(gitPaneToggle).toBeVisible();
    await expect(gitPaneToggle).toHaveAttribute("aria-pressed", "false");
    await gitPaneToggle.click();
    await expect(gitPaneToggle).toHaveAttribute("aria-pressed", "true");

    const embeddedGitPane = firstFloatingWindow.getByTestId(
      "git-graph-left-sidebar",
    );
    await expect(embeddedGitPane).toBeVisible();
    await expect(
      embeddedGitPane.locator("div").filter({ hasText: /^Git$/ }).first(),
    ).toBeVisible();
    await expect(
      embeddedGitPane.getByRole("button", { name: "Graph" }),
    ).toHaveCount(0);
    const embeddedGitPaneBox = await embeddedGitPane.boundingBox();
    const historyPaneBox = await firstFloatingWindow
      .getByTestId("git-graph-history-pane")
      .boundingBox();
    if (!embeddedGitPaneBox || !historyPaneBox) {
      throw new Error("Expected embedded git pane and history pane bounds.");
    }
    expect(embeddedGitPaneBox.x + embeddedGitPaneBox.width).toBeLessThanOrEqual(
      historyPaneBox.x + 4,
    );

    await page.evaluate(async () => {
      const { openGitGraphOverlay } = await import("/src/state/actions/git.ts");
      await openGitGraphOverlay();
    });
    const replacementTrackedWindow = page.getByTestId(
      "project-chat-maximized-window",
    );
    await expect(replacementTrackedWindow).toBeVisible();
    const secondInstanceId = await replacementTrackedWindow.getAttribute(
      "data-chat-window-instance-id",
    );
    if (!secondInstanceId) {
      throw new Error("Expected replacement tracked git graph instance id.");
    }
    expect(secondInstanceId).not.toBe(firstInstanceId);
    await expect(firstFloatingWindow).toBeVisible();
    await expect(replacementTrackedWindow).toHaveAttribute(
      "data-chat-window-tracked-pane-target",
      "git_overview",
    );
    await expect(
      replacementTrackedWindow.getByTestId(
        "git-graph-toggle-embedded-git-pane",
      ),
    ).toHaveCount(0);
  } finally {
    await cleanupGitOverlayFixture(fixture);
  }
});

test("git graph does not expose a canvas move action", async ({ page }) => {
  const workspaceRoot = getWorkspaceRootOrThrow();
  const fixture = await seedGitOverlayFixture(workspaceRoot, {
    historyCommitCount: 8,
  });

  try {
    await openGitOverview(page);
    await page
      .getByTestId("overview-tab-content-shell")
      .getByRole("button", { name: "Graph" })
      .click();

    const maximizedWindow = page.getByTestId("project-chat-maximized-window");
    await expect(maximizedWindow).toBeVisible();
    await expect(
      maximizedWindow.getByTestId("project-chat-window-show-in-canvas"),
    ).toHaveCount(0);
    await expect(
      maximizedWindow.getByTestId("git-graph-overlay"),
    ).toBeVisible();
  } finally {
    await cleanupGitOverlayFixture(fixture);
  }
});

test("git graph opens as a maximized window and can restore, dock, and minimize", async ({
  page,
}) => {
  const workspaceRoot = getWorkspaceRootOrThrow();
  const fixture = await seedGitOverlayFixture(workspaceRoot, {
    historyCommitCount: 8,
  });

  try {
    await openGitOverview(page);
    await page
      .getByTestId("overview-tab-content-shell")
      .getByRole("button", { name: "Graph" })
      .click();

    const maximizedWindow = page.getByTestId("project-chat-maximized-window");
    await expect(maximizedWindow).toBeVisible();
    await expect(
      maximizedWindow.getByTestId("project-chat-window-header-icon"),
    ).toHaveAttribute("data-chat-window-icon-mode", "git_graph_mode");
    await expect(
      maximizedWindow.getByTestId("git-graph-overlay"),
    ).toBeVisible();

    await maximizedWindow.getByTestId("project-chat-window-restore").click();
    const floatingWindow = page.getByTestId("project-chat-floating-window");
    await expect(floatingWindow).toBeVisible();
    await expect(floatingWindow.getByTestId("git-graph-overlay")).toBeVisible();

    await floatingWindow.getByTestId("project-chat-window-dock").click();
    const dockedWindow = page
      .getByTestId("project-chat-bottom-dock-window-panel")
      .filter({ has: page.getByTestId("git-graph-overlay") });
    await expect(dockedWindow).toBeVisible();

    await dockedWindow.getByTestId("project-chat-window-minimize").click();
    const minimizedPill = page.getByTestId("project-chat-bottom-dock-pill");
    await expect(minimizedPill).toHaveCount(1);
    await expect(
      minimizedPill.first().getByTestId("project-chat-bottom-dock-pill-icon"),
    ).toHaveAttribute("data-chat-window-icon-mode", "git_graph_mode");
  } finally {
    await cleanupGitOverlayFixture(fixture);
  }
});

test("git graph marks non-origin remote refs as remote chips", async ({
  page,
}) => {
  const workspaceRoot = getWorkspaceRootOrThrow();
  const fixture = await seedGitOverlayFixture(workspaceRoot, {
    historyCommitCount: 0,
  });

  try {
    runGit(workspaceRoot, ["update-ref", "refs/remotes/upstream/main", "HEAD"]);

    await openGitOverview(page);
    await page
      .getByTestId("overview-tab-content-shell")
      .getByRole("button", { name: "Graph" })
      .click();
    const graphFilter = page.getByPlaceholder(/Filter commits/);
    await expect(graphFilter).toBeVisible();

    const graphOverlay = graphFilter.locator("xpath=ancestor::section[1]");
    const upstreamChip = graphOverlay
      .locator('[data-decoration-kind="remote"]')
      .filter({ hasText: "upstream/main" });
    await expect(upstreamChip.first()).toBeVisible();
  } finally {
    await cleanupGitOverlayFixture(fixture);
  }
});

test("git graph keeps local slash branches as branch chips", async ({
  page,
}) => {
  const workspaceRoot = getWorkspaceRootOrThrow();
  const fixture = await seedGitOverlayFixture(workspaceRoot, {
    historyCommitCount: 0,
  });

  try {
    runGit(workspaceRoot, ["branch", "feature/main"]);

    await openGitOverview(page);
    await page
      .getByTestId("overview-tab-content-shell")
      .getByRole("button", { name: "Graph" })
      .click();
    const graphFilter = page.getByPlaceholder(/Filter commits/);
    await expect(graphFilter).toBeVisible();

    const graphOverlay = graphFilter.locator("xpath=ancestor::section[1]");
    const localBranchChip = graphOverlay
      .locator('[data-decoration-kind="branch"]')
      .filter({ hasText: "feature/main" });
    await expect(localBranchChip.first()).toBeVisible();

    const remoteChip = graphOverlay
      .locator('[data-decoration-kind="remote"]')
      .filter({ hasText: "feature/main" });
    await expect(remoteChip).toHaveCount(0);
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
    await fs.writeFile(
      path.join(migratedPath, "inside.txt"),
      "inside\n",
      "utf8",
    );
    runGit(workspaceRoot, ["add", "-A"]);
    runGit(workspaceRoot, ["commit", "-m", "replace migrated file with dir"]);

    await openGitOverview(page);
    await page
      .getByTestId("overview-tab-content-shell")
      .getByRole("button", { name: "Graph" })
      .click();
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
    const branchOnlyRepoPath = toRepoRelativePath(
      workspaceRoot,
      branchOnlyPath,
    );
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
    await page
      .getByTestId("overview-tab-content-shell")
      .getByRole("button", { name: "Graph" })
      .click();
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
    await page
      .getByTestId("overview-tab-content-shell")
      .getByRole("button", { name: "Graph" })
      .click();

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

    await page
      .getByTestId("overview-tab-content-shell")
      .getByRole("button", { name: "Graph" })
      .click();
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

    await page
      .getByTestId("overview-tab-content-shell")
      .getByRole("button", { name: "Graph" })
      .click();
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
    await page
      .getByTestId("overview-tab-content-shell")
      .getByRole("button", { name: "Graph" })
      .click();

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
