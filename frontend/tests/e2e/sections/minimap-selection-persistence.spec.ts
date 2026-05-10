import { expect, test } from "@playwright/test";
import {
  cleanupIsolatedProject,
  createCallableSection,
  ensureAppReady,
  openIsolatedProject,
} from "../helpers";

test("minimap keeps selected styling after node geometry rerenders", async ({
  page,
}) => {
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  try {
    const sectionId = await createCallableSection(
      page,
      projectContext.projectConfigId,
    );

    const sectionNode = page.locator(
      `.react-flow__node[data-id="${sectionId}"]`,
    );
    await expect(sectionNode).toBeVisible();

    const sectionChrome = sectionNode
      .locator(`section[data-section-id="${sectionId}"]`)
      .first();
    await expect(sectionChrome).toBeVisible();
    await sectionChrome.dispatchEvent("click");

    const minimapNode = page.locator(`[data-minimap-node-id="${sectionId}"]`);
    await expect(minimapNode).toHaveClass(/selected/);

    const dragHandleBox = await sectionChrome.boundingBox();
    if (!dragHandleBox) {
      throw new Error("Missing section bounds for minimap drag test.");
    }
    const startX = dragHandleBox.x + dragHandleBox.width / 2;
    const startY = dragHandleBox.y + Math.min(24, dragHandleBox.height / 2);
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 120, startY + 80, {
      steps: 12,
    });
    await page.mouse.up();

    await expect(minimapNode).toHaveClass(/selected/);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});
