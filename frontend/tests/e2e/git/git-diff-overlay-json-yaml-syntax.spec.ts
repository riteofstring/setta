import { expect, test } from "@playwright/test";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  cleanupGitOverlayFixture,
  getWorkspaceRootOrThrow,
  openGitOverview,
  runGit,
  seedGitOverlayFixture,
  toRepoRelativePath,
} from "./helpers/gitOverlayFixture";

test("git diff overlay syntax-highlights staged json and yaml changes", async ({
  page,
}) => {
  const workspaceRoot = getWorkspaceRootOrThrow();
  const fixture = await seedGitOverlayFixture(workspaceRoot, {
    historyCommitCount: 0,
  });

  try {
    const jsonPath = path.join(fixture.repo.fixtureRoot, "syntax-config.json");
    const jsonRepoPath = toRepoRelativePath(workspaceRoot, jsonPath);
    await fs.writeFile(
      jsonPath,
      JSON.stringify({ name: "before", enabled: false }, null, 2) + "\n",
      "utf8",
    );
    runGit(workspaceRoot, ["add", jsonRepoPath]);
    runGit(workspaceRoot, ["commit", "-m", "add json syntax fixture"]);
    await fs.writeFile(
      jsonPath,
      JSON.stringify({ name: "after", enabled: true }, null, 2) + "\n",
      "utf8",
    );

    const yamlPath = path.join(fixture.repo.fixtureRoot, "syntax-config.yaml");
    const yamlRepoPath = toRepoRelativePath(workspaceRoot, yamlPath);
    await fs.writeFile(yamlPath, "name: before\nenabled: false\n", "utf8");
    runGit(workspaceRoot, ["add", yamlRepoPath]);
    runGit(workspaceRoot, ["commit", "-m", "add yaml syntax fixture"]);
    await fs.writeFile(yamlPath, "name: after\nenabled: true\n", "utf8");
    runGit(workspaceRoot, ["add", jsonRepoPath]);
    runGit(workspaceRoot, ["add", yamlRepoPath]);

    await openGitOverview(page);

    const stagedGroup = page
      .getByRole("heading", { name: "Staged Changes" })
      .locator("xpath=ancestor::section[1]");
    const closeDiffButton = page.getByRole("button", {
      name: "Close git diff",
    });

    await stagedGroup
      .getByRole("button", { name: /syntax-config\.json/ })
      .click();
    const jsonDiffOverlay = closeDiffButton.locator("xpath=ancestor::section[1]");
    await expect(jsonDiffOverlay.locator(".cm-content")).toContainText(
      `diff --git a/${jsonRepoPath} b/${jsonRepoPath}`,
    );
    await expect(
      jsonDiffOverlay.locator(".cm-gitdiff-syntax").first(),
    ).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(closeDiffButton).toHaveCount(0);

    await stagedGroup
      .getByRole("button", { name: /syntax-config\.yaml/ })
      .click();
    const closeDiffButton2 = page.getByRole("button", {
      name: "Close git diff",
    });
    const yamlDiffOverlay = closeDiffButton2.locator(
      "xpath=ancestor::section[1]",
    );
    await expect(yamlDiffOverlay.locator(".cm-content")).toContainText(
      `diff --git a/${yamlRepoPath} b/${yamlRepoPath}`,
    );
    await expect(
      yamlDiffOverlay.locator(".cm-gitdiff-syntax").first(),
    ).toBeVisible();
  } finally {
    await cleanupGitOverlayFixture(fixture);
  }
});
