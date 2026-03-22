import { expect, test } from "@playwright/test";
import {
  addKwargFromFrontend,
  createTopLevelSectionFromFrontend,
  ensureAppReady,
  getCurrentProjectConfigId,
  getViewportBoundsForPlacement,
  postBackend,
} from "../helpers";

test("dict kwargs render after add_kwarg", async ({ page }) => {
  await ensureAppReady(page);
  const projectConfigId = await getCurrentProjectConfigId(page);
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
    await addKwargFromFrontend(page, {
      projectConfigId,
      sectionId,
    });

    const sectionNode = page.getByTestId(`rf__node-${sectionId}`);
    await expect(sectionNode).toBeVisible();

    const paramContainer = sectionNode.locator(
      `[id^="ParamContainer-${sectionId}-"]`,
    );
    const firstParam = paramContainer.first();
    await expect(firstParam).toBeVisible({ timeout: 20000 });
    await expect(firstParam).toContainText("Add Key");
    const box = await firstParam.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThan(10);
  } finally {
    await postBackend(page, "/deleteSections", {
      projectConfigId,
      sectionIds: [sectionId],
    });
  }
});
