import { expect, test, type Page } from "@playwright/test";
import {
  cleanupIsolatedProject,
  ensureAppReady,
  getViewportBoundsForPlacement,
  openIsolatedProject,
  postBackend,
} from "../helpers";

type CreateSectionResponse = { sectionId?: string };

async function createTopLevelSection(
  page: Page,
  projectConfigId: string,
  implType: string,
): Promise<string> {
  const viewportBounds = await getViewportBoundsForPlacement(page);
  if (!viewportBounds) {
    throw new Error("Unable to resolve viewport bounds for section placement.");
  }
  const response = await postBackend<CreateSectionResponse>(
    page,
    "/createTopLevelSection",
    {
      projectConfigId,
      implType,
      viewportBounds,
    },
  );
  const sectionId = response?.sectionId ?? null;
  if (!sectionId) {
    throw new Error(`Missing sectionId when creating section type ${implType}.`);
  }
  return sectionId;
}

test.describe.serial("agentic handles", () => {
  test("defaults to a centered handle position for non-callable sections", async ({
    page,
  }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      const sectionId = await createTopLevelSection(
        page,
        projectContext.projectConfigId,
        "Code",
      );

      const scope = page.locator(`[data-section-id="${sectionId}"]`);
      await expect(scope).toBeVisible();

      const top = await scope.evaluate((el) =>
        getComputedStyle(el).getPropertyValue("--agentic-handle-top").trim(),
      );

      expect(top).toBe("50%");
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("keeps text + prompt sections centered by default", async ({ page }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      const sectionId = await createTopLevelSection(
        page,
        projectContext.projectConfigId,
        "Prompt",
      );

      const scope = page.locator(`[data-section-id="${sectionId}"]`);
      await expect(scope).toBeVisible();

      const top = await scope.evaluate((el) =>
        getComputedStyle(el).getPropertyValue("--agentic-handle-top").trim(),
      );

      expect(top).toBe("50%");
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });
});
