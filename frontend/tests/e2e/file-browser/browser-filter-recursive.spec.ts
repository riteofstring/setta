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

test("browser filter shows matches in subfolders (glob + fuzzy)", async ({
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
      path.join(workspaceRoot, "setta-filter-recursive-"),
    );
    const nestedDir = path.join(parentDir, "alpha", "child");
    await fs.mkdir(nestedDir, { recursive: true });
    const deepJpg = path.join(nestedDir, "cat.jpg");
    const deepReadme = path.join(nestedDir, "README.md");
    await fs.writeFile(deepJpg, "jpg");
    await fs.writeFile(deepReadme, "# Deep README\n");

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

      const deepJpgTile = sectionNode.locator('button[aria-label="cat.jpg"]').first();
      await expect(deepJpgTile).toHaveCount(0);

      await setBrowserFilter({ page, sectionNode, value: "*.jpg" });

      await expect(deepJpgTile).toHaveCount(1, { timeout: 15000 });
      await deepJpgTile.scrollIntoViewIfNeeded();
      await expect(deepJpgTile).toBeVisible();

      const deepReadmeTile = sectionNode
        .locator('button[aria-label="README.md"]')
        .first();

      await setBrowserFilter({ page, sectionNode, value: "rdme" });
      await expect(deepReadmeTile).toHaveCount(1, { timeout: 15000 });
      await deepReadmeTile.scrollIntoViewIfNeeded();
      await expect(deepReadmeTile).toBeVisible();
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
