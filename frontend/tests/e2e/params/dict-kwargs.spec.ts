import { expect, test } from "@playwright/test";
import {
  cleanupIsolatedProject,
  createTopLevelSectionFromFrontend,
  ensureAppReady,
  getViewportBoundsForPlacement,
  openIsolatedProject,
} from "../helpers";

test("dict kwargs render after clicking the add arg button", async ({
  page,
}) => {
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);
  const projectConfigId = projectContext.projectConfigId;
  const viewportBounds = await getViewportBoundsForPlacement(page);
  if (!viewportBounds) {
    throw new Error("Unable to resolve viewport bounds for section placement.");
  }
  const sectionResponse = await createTopLevelSectionFromFrontend(page, {
    projectConfigId,
    implType: "Dict",
    viewportBounds,
  });
  const sectionId = sectionResponse?.sectionId;
  if (!sectionId) {
    throw new Error("Missing sectionId when creating dict section.");
  }

  try {
    const sectionNode = page.getByTestId(`rf__node-${sectionId}`);
    await expect(sectionNode).toBeVisible();
    await sectionNode.getByRole("button", { name: "Add arg" }).click();

    const paramContainer = sectionNode.locator(
      `[id^="ParamContainer-${sectionId}-"]`,
    );
    const firstParam = paramContainer.first();
    await expect(firstParam).toBeVisible({ timeout: 20000 });
    await expect(firstParam).toContainText("Add Key");
    const box = await firstParam.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThan(10);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});
