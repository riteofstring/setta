import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { ensureAppReady, seedLocalStorage } from "../helpers";

function runGit(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.stat(target);
    return true;
  } catch {
    return false;
  }
}

test("git diff overlay and git graph overlay render between panes", async ({
  page,
}) => {
  const workspaceRoot = process.env.SETTA_WORKSPACE_ROOT;
  if (!workspaceRoot) {
    throw new Error("Missing SETTA_WORKSPACE_ROOT for e2e test.");
  }

  const gitDir = path.join(workspaceRoot, ".git");
  const gitIgnorePath = path.join(workspaceRoot, ".gitignore");
  const trackedPath = path.join(workspaceRoot, "tracked.txt");
  const untrackedPath = path.join(workspaceRoot, "new.txt");

  const createdRepo = !(await pathExists(gitDir));
  try {
    if (createdRepo) {
      runGit(workspaceRoot, ["init"]);
      runGit(workspaceRoot, ["config", "user.email", "e2e@example.com"]);
      runGit(workspaceRoot, ["config", "user.name", "E2E"]);
    }

    await fs.writeFile(gitIgnorePath, "setta_files/\n", "utf8");
    runGit(workspaceRoot, ["add", ".gitignore"]);
    runGit(workspaceRoot, ["commit", "-m", "init"]);

    await fs.writeFile(trackedPath, "one\n", "utf8");
    runGit(workspaceRoot, ["add", "tracked.txt"]);
    runGit(workspaceRoot, ["commit", "-m", "add tracked"]);

    // Create both staged + unstaged changes for the same file.
    await fs.writeFile(trackedPath, "two\n", "utf8");
    runGit(workspaceRoot, ["add", "tracked.txt"]);
    await fs.writeFile(trackedPath, "three\n", "utf8");
    await fs.writeFile(untrackedPath, "hello\n", "utf8");

    await seedLocalStorage(page, { overviewTab: "Git", overviewVis: true });
    await ensureAppReady(page);

    await expect(page.getByRole("heading", { name: "Git" })).toBeVisible();

    const stagedGroup = page
      .getByRole("heading", { name: "Staged Changes" })
      .locator("xpath=ancestor::section[1]");
    const stagedTracked = stagedGroup.getByRole("button", {
      name: /tracked\.txt/,
    });
    await expect(stagedTracked).toBeVisible();
    await stagedTracked.click();

    const closeDiffButton = page.getByRole("button", {
      name: "Close git diff",
    });
    await expect(closeDiffButton).toBeVisible();

    const diffOverlay = closeDiffButton.locator("xpath=ancestor::section[1]");
    const diffContent = diffOverlay.locator(".cm-content");
    await expect(diffContent).toContainText(
      "diff --git a/tracked.txt b/tracked.txt",
    );
    await expect(diffContent).toContainText("-one");
    await expect(diffContent).toContainText("+two");

    await diffOverlay.getByRole("button", { name: "Unstaged" }).click();
    await expect(diffContent).toContainText("-two");
    await expect(diffContent).toContainText("+three");

    await page.keyboard.press("Escape");
    await expect(closeDiffButton).toHaveCount(0);

    const untrackedGroup = page
      .getByRole("heading", { name: "Untracked" })
      .locator("xpath=ancestor::section[1]");
    await untrackedGroup.getByRole("button", { name: /new\.txt/ }).click();

    const closeDiffButton2 = page.getByRole("button", {
      name: "Close git diff",
    });
    await expect(closeDiffButton2).toBeVisible();
    const diffOverlay2 = closeDiffButton2.locator("xpath=ancestor::section[1]");
    const diffContent2 = diffOverlay2.locator(".cm-content");
    await expect(diffContent2).toContainText("new file mode");
    await expect(diffContent2).toContainText("+hello");

    await page.keyboard.press("Escape");
    await expect(closeDiffButton2).toHaveCount(0);

    await page.getByRole("button", { name: "Graph" }).click();
    const graphFilter = page.getByPlaceholder(/Filter commits/);
    await expect(graphFilter).toBeVisible();

    const graphOverlay = graphFilter.locator("xpath=ancestor::section[1]");
    await expect(
      graphOverlay.getByRole("button", { name: /add tracked/ }),
    ).toBeVisible();
    await expect(graphOverlay.locator(".cm-content")).toContainText("commit");

    await page.keyboard.press("Escape");
    await expect(graphFilter).toHaveCount(0);
  } finally {
    await fs.rm(untrackedPath, { force: true });
    await fs.rm(trackedPath, { force: true });
    await fs.rm(gitIgnorePath, { force: true });
    if (createdRepo) {
      await fs.rm(gitDir, { recursive: true, force: true });
    }
  }
});
