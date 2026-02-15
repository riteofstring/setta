import { type Locator, type Page, expect, test } from "@playwright/test";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  cleanupIsolatedProject,
  getViewportBoundsForPlacement,
  openIsolatedProject,
  postBackend,
} from "../helpers";

const SELECT_ALL_SHORTCUT =
  process.platform === "darwin" ? "Meta+A" : "Control+A";

const ONE_BY_ONE_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO6pR5cAAAAASUVORK5CYII=";

function normalizePathForComparison(value: string): string {
  const withoutPrivate = value.startsWith("/private")
    ? value.slice("/private".length)
    : value;
  return withoutPrivate.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
}

async function readCodeMirrorValue(page: Page, id: string): Promise<string> {
  const value = await page.evaluate((targetId) => {
    const root = document.getElementById(targetId);
    if (!root) {
      return null;
    }
    const content =
      root.querySelector(".cm-content") ?? root.querySelector(".cm-line");
    return content?.textContent ?? root.textContent ?? "";
  }, id);
  return value ?? "";
}

async function setBrowserPath({
  page,
  sectionNode,
  sectionId,
  targetPath,
}: {
  page: Page;
  sectionNode: Locator;
  sectionId: string;
  targetPath: string;
}) {
  const pathInputId = `CodeMirror-${sectionId}-browser-path`;
  const pathInput = sectionNode.locator(`[id="${pathInputId}"]`);
  await expect(pathInput).toBeVisible();
  const cmContent = pathInput.locator(".cm-content");
  await expect(cmContent).toBeVisible();
  await cmContent.click();
  await cmContent.fill(targetPath);
  await page.keyboard.press("Enter");
  const normalizedTarget = normalizePathForComparison(targetPath);
  await expect
    .poll(async () =>
      normalizePathForComparison(await readCodeMirrorValue(page, pathInputId)),
    )
    .toContain(normalizedTarget);
}

async function setBrowserFilter({
  page,
  sectionNode,
  value,
}: {
  page: Page;
  sectionNode: Locator;
  value: string;
}) {
  const filterRoot = sectionNode
    .locator('[id^="CodeMirror-FileBrowserFilter-"]')
    .first();
  await expect(filterRoot).toBeVisible();
  const cmContent = filterRoot.locator(".cm-content");
  await expect(cmContent).toBeVisible();
  await cmContent.click();
  await page.keyboard.press(SELECT_ALL_SHORTCUT);
  await page.keyboard.type(value);
}

test("browser can save a search and re-apply it from the Filters column", async ({
  page,
}) => {
  const workspaceRoot = process.env.SETTA_WORKSPACE_ROOT;
  if (!workspaceRoot) {
    throw new Error("Missing SETTA_WORKSPACE_ROOT for e2e test.");
  }
  const projectContext = await openIsolatedProject(page);
  try {
    const projectConfigId = projectContext.projectConfigId;
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
          x: viewportBounds.x + viewportBounds.w * 0.25,
          y: viewportBounds.y + viewportBounds.h * 0.55,
        },
        viewportBounds,
      },
    );
    const sectionId = browserSection?.sectionId;
    if (!sectionId) {
      throw new Error("Missing sectionId when creating browser section.");
    }

    const parentDir = await fs.mkdtemp(
      path.join(workspaceRoot, "setta-browser-saved-search-"),
    );
    const imageName = "cat.png";
    const textName = "notes.txt";
    await fs.writeFile(
      path.join(parentDir, imageName),
      Buffer.from(ONE_BY_ONE_PNG_BASE64, "base64"),
    );
    await fs.writeFile(path.join(parentDir, textName), "hello");

    try {
      const sectionNode = page.locator(
        `.react-flow__node[data-id="${sectionId}"]`,
      );
      await expect(sectionNode).toBeVisible();

      await sectionNode.locator('button[aria-label="Carousel view"]').click();

      await setBrowserPath({
        page,
        sectionNode,
        sectionId,
        targetPath: parentDir,
      });

      const filtersColumn = sectionNode
        .locator("article")
        .filter({ hasText: "Filters" })
        .first();
      await expect(filtersColumn).toBeVisible();

      // Save a search for images.
      await setBrowserFilter({ page, sectionNode, value: "*.png" });
      const imageTile = sectionNode
        .locator("button")
        .filter({ hasText: imageName })
        .first();
      const textTile = sectionNode
        .locator("button")
        .filter({ hasText: textName })
        .first();

      await expect(imageTile).toBeVisible({ timeout: 15000 });
      await expect(textTile).toHaveCount(0, { timeout: 15000 });

      const saveButton = sectionNode.getByRole("button", { name: "Save search" });
      await expect(saveButton).toBeVisible();
      await saveButton.click();

      const savedSearch = filtersColumn.getByRole("button", { name: "*.png" });
      await expect(savedSearch).toBeVisible({ timeout: 15000 });

      // Switch the current search, then re-apply the saved one.
      await setBrowserFilter({ page, sectionNode, value: "*.txt" });
      await expect(textTile).toBeVisible({ timeout: 15000 });
      await expect(imageTile).toHaveCount(0, { timeout: 15000 });

      await savedSearch.click();
      await expect(imageTile).toBeVisible({ timeout: 15000 });
      await expect(textTile).toHaveCount(0, { timeout: 15000 });
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
