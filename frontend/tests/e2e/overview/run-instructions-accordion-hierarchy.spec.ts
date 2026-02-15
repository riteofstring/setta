import { expect, test } from "@playwright/test";
import {
  cleanupIsolatedProject,
  ensureAppReady,
  getViewportBoundsForPlacement,
  openIsolatedProject,
  postBackend,
  seedLocalStorage,
  setOverviewTab,
} from "../helpers";

test.describe.serial("run instructions accordion hierarchy", () => {
  test("custom run sections are grouped in accordions with empty-state disable behavior", async ({
    page,
  }) => {
    await seedLocalStorage(page, {
      overviewTab: "RunInstructions",
      overviewVis: true,
    });
    await ensureAppReady(page);

    const projectContext = await openIsolatedProject(page);
    try {
      const viewportBounds = await getViewportBoundsForPlacement(page);
      if (!viewportBounds) {
        throw new Error("Unable to resolve viewport bounds for code section.");
      }
      await postBackend<{ sectionId?: string }>(page, "/createTopLevelSection", {
        projectConfigId: projectContext.projectConfigId,
        implType: "Code",
        viewportBounds,
      });

      await setOverviewTab(page, "RunInstructions");
      await page.reload({ waitUntil: "domcontentloaded" });
      await ensureAppReady(page);

      const customRunsTrigger = page.getByTestId(
        "run-instructions-accordion-custom-runs",
      );
      const addFromCodeBlocksTrigger = page.getByTestId(
        "run-instructions-accordion-add-from-code-blocks",
      );

      await expect(customRunsTrigger).toHaveAttribute("aria-expanded", "true");
      await expect(addFromCodeBlocksTrigger).toHaveAttribute(
        "aria-expanded",
        "false",
      );

      const addFromCodeBlocksDisabled =
        (await addFromCodeBlocksTrigger.getAttribute("disabled")) !== null;
      if (addFromCodeBlocksDisabled) {
        await expect(addFromCodeBlocksTrigger).toHaveAttribute(
          "title",
          "No runnable code blocks are available",
        );
      } else {
        await addFromCodeBlocksTrigger.click();
        await expect(addFromCodeBlocksTrigger).toHaveAttribute(
          "aria-expanded",
          "true",
        );
      }

      await customRunsTrigger.click();
      await expect(customRunsTrigger).toHaveAttribute("aria-expanded", "false");
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });
});
