import { expect, test } from "@playwright/test";
import {
  cleanupIsolatedProject,
  createTextBlockSection,
  ensureAppReady,
  openIsolatedProject,
  seedLocalStorage,
} from "../helpers";

test.describe.serial("section config accordion hierarchy", () => {
  test("shows section settings expanded and appearance collapsed by default", async ({
    page,
  }) => {
    await seedLocalStorage(page, {
      overviewTab: "Overview",
      overviewVis: true,
      uiEditorVis: true,
      uiEditorTab: { TextBlock: "SectionConfig" },
    });
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      const { sectionId } = await createTextBlockSection(
        page,
        projectContext.projectConfigId,
        "__pw_section_config_accordion__",
      );

      const node = page.locator(`.react-flow__node[data-id="${sectionId}"]`);
      await expect(node).toBeVisible();
      await node.click();

      const uiEditorPane = page.locator("#UiEditorPane");
      await expect(uiEditorPane).toBeVisible();

      const mainAccordionTrigger = uiEditorPane.getByTestId(
        "section-config-accordion-main",
      );
      const appearanceAccordionTrigger = uiEditorPane.getByTestId(
        "section-config-accordion-appearance",
      );

      await expect(mainAccordionTrigger).toHaveAttribute("aria-expanded", "true");
      await expect(appearanceAccordionTrigger).toHaveAttribute(
        "aria-expanded",
        "false",
      );
      const triggerBounds = await mainAccordionTrigger.evaluate((triggerEl) => {
        const accordionItemEl = triggerEl.closest("h3")?.parentElement;
        if (accordionItemEl === null) {
          return null;
        }
        const triggerRect = triggerEl.getBoundingClientRect();
        const itemRect = accordionItemEl.getBoundingClientRect();
        return {
          triggerRight: triggerRect.right,
          itemRight: itemRect.right,
        };
      });
      expect(triggerBounds).not.toBeNull();
      expect(triggerBounds?.triggerRight ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(
        (triggerBounds?.itemRight ?? Number.NEGATIVE_INFINITY) + 0.5,
      );

      await appearanceAccordionTrigger.click();
      await expect(appearanceAccordionTrigger).toHaveAttribute(
        "aria-expanded",
        "true",
      );
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });
});
