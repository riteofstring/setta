import { promises as fs } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  ensureAppReady,
  getCurrentProjectConfigId,
  getViewportBoundsForPlacement,
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
  await ensureAppReady(page);
  const workspaceRoot = process.env.SETTA_WORKSPACE_ROOT;
  if (!workspaceRoot) {
    throw new Error("Missing SETTA_WORKSPACE_ROOT for e2e test.");
  }
  const normalizedWorkspaceRoot = normalizePathForComparison(workspaceRoot);
  const rootResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/getFileBrowserRoot") &&
      response.status() === 200,
  );
  const projectConfigId = await getCurrentProjectConfigId(page);
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

    await sectionNode
      .locator('button[aria-label="Carousel view"]')
      .click();

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
    const completionResponsePromise = page.waitForResponse((response) => {
      if (
        !response.url().includes("/api/getFolderContents") ||
        response.status() !== 200
      ) {
        return false;
      }
      const postData = response.request().postData() ?? "";
      try {
        const payload = JSON.parse(postData) as { folderPath?: unknown };
        if (typeof payload.folderPath !== "string" || !payload.folderPath) {
          return false;
        }
        return (
          normalizePathForComparison(payload.folderPath) ===
          normalizePathForComparison(parentDir)
        );
      } catch {
        return false;
      }
    });
    await pathInput.click();
    await page.keyboard.press(SELECT_ALL_SHORTCUT);
    await page.keyboard.type(`${parentDir}${path.sep}a`);
    await page.keyboard.press("Control+Space");
    await completionResponsePromise;

    const tooltip = page.locator(".cm-tooltip-autocomplete");
    await expect(tooltip).toBeVisible({ timeout: 15000 });
    const alphaOption = tooltip.locator("li", { hasText: "alpha" }).first();
    await expect(alphaOption).toBeVisible();
    const nestedResponsePromise = page.waitForResponse((response) => {
      if (
        !response.url().includes("/api/getFolderContents") ||
        response.status() !== 200
      ) {
        return false;
      }
      const postData = response.request().postData() ?? "";
      try {
        const payload = JSON.parse(postData) as { folderPath?: unknown };
        if (typeof payload.folderPath !== "string" || !payload.folderPath) {
          return false;
        }
        return (
          normalizePathForComparison(payload.folderPath) ===
          normalizePathForComparison(alphaDir)
        );
      } catch {
        return false;
      }
    });
    await alphaOption.click();
    await nestedResponsePromise;
    await expect(tooltip).toBeVisible({ timeout: 15000 });
    await expect(tooltip).toContainText("child");

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
  }
});
