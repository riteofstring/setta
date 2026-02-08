import { promises as fs } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  cleanupIsolatedProject,
  getViewportBoundsForPlacement,
  openIsolatedProject,
  postBackend,
} from "../helpers";

const SELECT_ALL_SHORTCUT =
  process.platform === "darwin" ? "Meta+A" : "Control+A";

function normalizePathForComparison(value: string): string {
  const withoutPrivate = value.startsWith("/private")
    ? value.slice("/private".length)
    : value;
  return withoutPrivate.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
}

test("browser path input autocompletes folders", async ({ page }) => {
  const workspaceRoot = process.env.SETTA_WORKSPACE_ROOT;
  if (!workspaceRoot) {
    throw new Error("Missing SETTA_WORKSPACE_ROOT for e2e test.");
  }
  const normalizedWorkspaceRoot = normalizePathForComparison(workspaceRoot);
  const projectContext = await openIsolatedProject(page);
  try {
    const projectConfigId = projectContext.projectConfigId;
    const rootResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/getFileBrowserRoot") &&
        response.status() === 200,
    );
    const viewportBounds = await getViewportBoundsForPlacement(page);
    if (!viewportBounds) {
      throw new Error("Unable to resolve viewport bounds for section placement.");
    }

    const browserSection = await postBackend<{ sectionId?: string }>(
      page,
      "/createTopLevelSection",
      {
        projectConfigId,
        implType: "Browser",
        position: {
          x: viewportBounds.x + viewportBounds.w * 0.55,
          y: viewportBounds.y + viewportBounds.h * 0.25,
        },
        viewportBounds,
      },
    );
    const sectionId = browserSection?.sectionId;
    if (!sectionId) {
      throw new Error("Missing sectionId when creating browser section.");
    }

    const parentDir = await fs.mkdtemp(
      path.join(workspaceRoot, "setta-autocomplete-"),
    );
    const alphaDir = path.join(parentDir, "alpha");
    const betaDir = path.join(parentDir, "beta");
    const nestedDir = path.join(alphaDir, "child");
    await fs.mkdir(alphaDir);
    await fs.mkdir(betaDir);
    await fs.mkdir(nestedDir);
    await fs.writeFile(path.join(parentDir, "file.txt"), "content");

    try {
      const sectionNode = page.locator(
        `.react-flow__node[data-id="${sectionId}"]`,
      );
      await expect(sectionNode).toBeVisible();
      await rootResponsePromise;

      const pathInput = sectionNode.locator(
        `[id="CodeMirror-${sectionId}-browser-path"]`,
      );
      await expect(pathInput).toBeVisible();
      await expect
        .poll(() =>
          page.evaluate((id) => {
            const root = document.getElementById(id);
            if (!root) {
              return null;
            }
            const content =
              root.querySelector(".cm-content") ?? root.querySelector(".cm-line");
            return content?.textContent ?? root.textContent ?? "";
          }, `CodeMirror-${sectionId}-browser-path`),
        )
        .toContain(normalizedWorkspaceRoot);
      const tooltip = page.locator(".cm-tooltip-autocomplete");
      const cmContent = pathInput.locator(".cm-content");
      await expect(cmContent).toBeVisible();
      await cmContent.click();
      await page.keyboard.press(SELECT_ALL_SHORTCUT);
      await page.keyboard.type(`${parentDir}${path.sep}a`);

      await expect(tooltip).toBeVisible({ timeout: 15000 });
      const alphaOption = tooltip.locator("li", { hasText: "alpha" }).first();
      await expect(alphaOption).toBeVisible();
      // Regression guard: the completion popup should still show after backspace
      // and re-typing the same character sequence.
      await page.keyboard.press("Backspace");
      await page.keyboard.type("a");
      await expect(alphaOption).toBeVisible({ timeout: 15000 });
      // Wait until CodeMirror reports the completion tooltip as "enabled" before
      // accepting it. Otherwise `acceptCompletion` can return false even when the
      // tooltip is visible (the list can be temporarily disabled while results are
      // recomputing).
      await expect(tooltip).not.toHaveClass(/cm-tooltip-autocomplete-disabled/);
      // Ensure we have an active selection before accepting the completion.
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Tab");

      const normalizedExpected = normalizePathForComparison(
        `${parentDir}${path.sep}alpha${path.sep}`,
      );
      await expect
        .poll(() =>
          page.evaluate((id) => {
            const root = document.getElementById(id);
            if (!root) {
              return null;
            }
            const content =
              root.querySelector(".cm-content") ?? root.querySelector(".cm-line");
            return content?.textContent ?? root.textContent ?? "";
          }, `CodeMirror-${sectionId}-browser-path`),
        )
        .toContain(normalizedExpected);
    } finally {
      await fs.rm(parentDir, { recursive: true, force: true });
      await postBackend(page, "/deleteSections", {
        projectConfigId,
        sectionIds: [sectionId],
      });
    }
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});
