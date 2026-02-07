import { expect, test } from "@playwright/test";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  ensureAppReady,
  getCurrentProjectConfigId,
  getViewportBoundsForPlacement,
  postBackend,
} from "../helpers";

test("carousel thumbnail strip scrolls with trackpad wheel", async ({
  page,
}) => {
  await ensureAppReady(page);
  const workspaceRoot = process.env.SETTA_WORKSPACE_ROOT;
  if (!workspaceRoot) {
    throw new Error("Missing SETTA_WORKSPACE_ROOT for e2e test.");
  }
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
    path.join(workspaceRoot, "setta-carousel-scroll-"),
  );
  try {
    for (let i = 0; i < 40; i += 1) {
      await fs.writeFile(path.join(parentDir, `file-${i}.txt`), `file ${i}\n`);
    }

    const sectionNode = page.locator(
      `.react-flow__node[data-id="${sectionId}"]`,
    );
    await expect(sectionNode).toBeVisible();

    await sectionNode.locator('button[aria-label="Carousel view"]').click();

    const pathInputId = `CodeMirror-${sectionId}-browser-path`;
    const pathInput = sectionNode.locator(`[id="${pathInputId}"]`);
    const cmContent = pathInput.locator(".cm-content");
    await expect(cmContent).toBeVisible();
    await cmContent.click();
    await cmContent.fill(parentDir);
    await page.keyboard.press("Enter");

    const thumbnailRow = sectionNode
      .locator('[class*="overflow-x-scroll"]')
      .first();
    await expect(thumbnailRow.locator("button")).toHaveCount(40, {
      timeout: 15000,
    });

    const initialScrollLeft = await thumbnailRow.evaluate(
      (el) => el.scrollLeft,
    );
    await thumbnailRow.hover();
    await page.mouse.wheel(0, 600);

    await expect
      .poll(() => thumbnailRow.evaluate((el) => el.scrollLeft))
      .toBeGreaterThan(initialScrollLeft);
  } finally {
    await fs.rm(parentDir, { recursive: true, force: true });
  }
});
