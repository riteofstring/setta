import { expect, test } from "@playwright/test";
import {
  cleanupIsolatedProject,
  createCallableSection,
  ensureAppReady,
  openIsolatedProject,
} from "../helpers";

test.describe.serial("agentic handles", () => {
  test("aligns callable handles with the callable input", async ({ page }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      const sectionId = await createCallableSection(
        page,
        projectContext.projectConfigId,
      );

      const node = page
        .locator(".react-flow__nodes")
        .getByTestId(`rf__node-${sectionId}`);
      await expect(node).toBeVisible();

      await page.getByRole("button", { name: "fit view" }).click();

      const sourceHandle = page.locator(
        `.react-flow__handle[data-nodeid="${sectionId}"][data-handleid="agentic-edge-source"]`,
      );
      const targetHandle = page.locator(
        `.react-flow__handle[data-nodeid="${sectionId}"][data-handleid="agentic-edge-target"]`,
      );
      const search = node.locator("search.section-search");

      await expect(search).toBeVisible();

      await node.hover();
      await expect(sourceHandle).toBeVisible();
      await expect(targetHandle).toBeVisible();

      await expect
        .poll(
          async () => {
            const [searchBox, sourceBox, targetBox] = await Promise.all([
              search.boundingBox(),
              sourceHandle.boundingBox(),
              targetHandle.boundingBox(),
            ]);
            if (!searchBox || !sourceBox || !targetBox) {
              return 999;
            }
            const searchCenterY = searchBox.y + searchBox.height / 2;
            const sourceCenterY = sourceBox.y + sourceBox.height / 2;
            const targetCenterY = targetBox.y + targetBox.height / 2;
            return Math.max(
              Math.abs(sourceCenterY - searchCenterY),
              Math.abs(targetCenterY - searchCenterY),
            );
          },
          { timeout: 3000 },
        )
        .toBeLessThanOrEqual(3);
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });
});
