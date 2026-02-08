import { expect, test, type Page, type Locator } from "@playwright/test";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  cleanupIsolatedProject,
  getViewportBoundsForPlacement,
  openIsolatedProject,
  postBackend,
} from "../helpers";

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
}): Promise<string> {
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
  return pathInputId;
}

test("carousel thumbnail strip is vertically resizable", async ({ page }) => {
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
          y: viewportBounds.y + viewportBounds.h * 0.5,
        },
        viewportBounds,
      },
    );
    const sectionId = browserSection?.sectionId;
    if (!sectionId) {
      throw new Error("Missing sectionId when creating browser section.");
    }

    const parentDir = await fs.mkdtemp(
      path.join(workspaceRoot, "setta-carousel-resize-"),
    );
    const fileName = "very_long_filename_for_resize_test.txt";
    await fs.writeFile(path.join(parentDir, fileName), "hello\n");

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

    const resizeHandle = sectionNode.locator(
      '[aria-label="Resize thumbnail strip"]',
    );
    await expect(resizeHandle).toBeVisible();

    const thumbnailRow = resizeHandle
      .locator("xpath=following-sibling::article")
      .first();
    await expect(thumbnailRow.locator("button")).toHaveCount(1, {
      timeout: 15000,
    });
    const firstTile = thumbnailRow.locator("button").first();
    await expect(firstTile).toBeVisible({ timeout: 15000 });

    const initialBox = await firstTile.boundingBox();
    if (!initialBox) {
      throw new Error("Missing bounding box for the first carousel thumbnail.");
    }

    const handleBox = await resizeHandle.boundingBox();
    if (!handleBox) {
      throw new Error("Missing bounding box for the carousel resize handle.");
    }
    await page.mouse.move(
      handleBox.x + handleBox.width / 2,
      handleBox.y + handleBox.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + 220);
    await page.mouse.up();

    await expect
      .poll(async () => (await firstTile.boundingBox())?.width ?? 0)
      .toBeLessThan(initialBox.width * 0.7);

    // In compact mode, the filename is truncated but the extension is preserved
    // as a separate span so it stays visible.
    await expect(
      firstTile.locator("span.shrink-0").filter({ hasText: ".txt" }),
    ).toHaveCount(1);
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
