import { expect, test } from "@playwright/test";
import {
  cleanupIsolatedProject,
  createCallableSection,
  ensureAppReady,
  hoverGpuFlowNode,
  loadProjectConfig,
  openIsolatedProject,
} from "../helpers";

test("delete section removes the section from the live canvas", async ({
  page,
}) => {
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);
  const sectionId = await createCallableSection(
    page,
    projectContext.projectConfigId,
  );

  try {
    const sectionNode = page
      .locator(`section[data-section-id="${sectionId}"]`)
      .first();
    await expect(sectionNode).toBeVisible();
    await hoverGpuFlowNode(page, sectionNode);

    const deleteButton = sectionNode
      .locator('button[aria-label="Delete section"]')
      .first();
    await expect(deleteButton).toBeVisible();
    await deleteButton.evaluate((element) => {
      element.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });

    // The delete route must both persist the removal and broadcast the fresh
    // project snapshot so the canvas drops the deleted section immediately.
    await expect
      .poll(async () => {
        const config = await loadProjectConfig(page);
        return config.projectConfig.sectionVariantMap[sectionId] ?? null;
      })
      .toBeNull();
    await expect(
      page.locator(`section[data-section-id="${sectionId}"]`),
    ).toHaveCount(0);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});
