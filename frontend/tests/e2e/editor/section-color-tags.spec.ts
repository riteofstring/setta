import { expect, test, type Page } from "@playwright/test";
import {
  cleanupIsolatedProject,
  createTextBlockSection,
  ensureAppReady,
  openIsolatedProject,
  postBackend,
  seedLocalStorage,
} from "../helpers";

type LatestProjectStateResponse = {
  projectState?: {
    sections?: Record<
      string,
      { sharedModifier?: { tagColor?: string | null } }
    >;
  };
};

test.describe.serial("section color tags", () => {
  test("sets tag color via Section Config and shows dot", async ({ page }) => {
    await seedLocalStorage(page, {
      overviewTab: "Overview",
      overviewVis: true,
      uiEditorVis: true,
      uiEditorTab: { TextBlock: "SectionConfig" },
    });
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      await clearProjectChatWindows(page);
      const { sectionId } = await createTextBlockSection(
        page,
        projectContext.projectConfigId,
        "__pw_section_color_tag__",
      );

      const node = page.locator(`.react-flow__node[data-id="${sectionId}"]`);
      await expect(node).toBeVisible();
      await node.click();

      const uiEditorPane = page.locator("#UiEditorPane");
      await expect(uiEditorPane).toBeVisible();

      const appearanceAccordionTrigger = uiEditorPane.getByTestId(
        "section-config-accordion-appearance",
      );
      await expect(appearanceAccordionTrigger).toBeVisible();
      await appearanceAccordionTrigger.evaluate((element: HTMLButtonElement) =>
        element.click(),
      );
      await expect(appearanceAccordionTrigger).toHaveAttribute(
        "aria-expanded",
        "true",
      );

      const colorTagHeading = uiEditorPane.getByText("Color Tag", {
        exact: true,
      });
      await expect(colorTagHeading).toBeVisible();
      const colorTagBlock = colorTagHeading.locator(
        "xpath=ancestor::div[contains(@class,'rounded-lg') or contains(@class,'rounded-xl')][1]",
      );
      await expect(colorTagBlock).toBeVisible();

      const colorPickerTrigger = colorTagBlock.locator(".colorpicker").first();
      await expect(colorPickerTrigger).toBeVisible();

      const colorClassRead = await colorTagBlock.evaluate((block) => {
        const trigger = block.querySelector(".colorpicker");
        const wrapper =
          trigger instanceof HTMLElement ? trigger.parentElement : null;
        return {
          wrapperClassName:
            wrapper instanceof HTMLElement ? wrapper.className : null,
          triggerClassName:
            trigger instanceof HTMLElement ? trigger.className : null,
          blockMarkup: block.innerHTML,
        };
      });

      expect(colorClassRead.blockMarkup).not.toContain("single-cell-container");
      expect(colorClassRead.blockMarkup).not.toContain("single-cell-child");
      expect(colorClassRead.wrapperClassName).not.toContain(
        "single-cell-container",
      );
      expect(colorClassRead.triggerClassName).not.toContain(
        "single-cell-container",
      );
      expect(colorClassRead.triggerClassName).not.toContain(
        "single-cell-child",
      );

      await colorPickerTrigger.click();

      await page
        .getByRole("menuitem")
        .filter({ hasText: "Blue" })
        .first()
        .evaluate((element: HTMLElement) => element.click());

      await expect(colorTagBlock.getByText("#3b82f6").first()).toBeVisible();

      const headerDot = node
        .locator('header.section-title span[title="Color tag: #3b82f6"]')
        .first();
      await expect(headerDot).toBeVisible();

      const overviewPane = page.locator("#OverviewPane");
      const overviewTagFilter = overviewPane.getByLabel("Tag filter").first();
      await expect(overviewTagFilter).toBeVisible();

      await overviewTagFilter.click();
      await page
        .getByRole("menuitem", { name: "Untagged" })
        .evaluate((element: HTMLElement) => element.click());
      await expect(
        overviewPane.locator(`[id="${sectionId}-OverviewListItem"]`),
      ).toHaveCount(0);

      await overviewTagFilter.click();
      await page
        .getByRole("menuitem")
        .filter({ hasText: "Blue" })
        .first()
        .evaluate((element: HTMLElement) => element.click());
      const overviewItem = overviewPane.locator(
        `[id="${sectionId}-OverviewListItem"]`,
      );
      await expect(overviewItem).toBeVisible();
      await expect(
        overviewItem.locator('span[title="Color tag: #3b82f6"]'),
      ).toBeVisible();

      await overviewTagFilter.click();
      await page
        .getByRole("menuitem", { name: "All" })
        .evaluate((element: HTMLElement) => element.click());
      await expect(overviewItem).toBeVisible();

      await expect
        .poll(
          async () => {
            const response = await postBackend<LatestProjectStateResponse>(
              page,
              "/getLatestProjectState",
              { projectConfigId: projectContext.projectConfigId },
            );
            return (
              response?.projectState?.sections?.[sectionId]?.sharedModifier
                ?.tagColor ?? null
            );
          },
          { timeout: 8000 },
        )
        .toBe("#3b82f6");

      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForSelector(".react-flow__pane");

      const nodeAfter = page.locator(
        `.react-flow__node[data-id="${sectionId}"]`,
      );
      await expect(nodeAfter).toBeVisible();
      await nodeAfter.click();
      await expect(
        nodeAfter.locator(
          'header.section-title span[title="Color tag: #3b82f6"]',
        ),
      ).toBeVisible();

      const appearanceAccordionTriggerAfterReload = uiEditorPane.getByTestId(
        "section-config-accordion-appearance",
      );
      if (
        (await appearanceAccordionTriggerAfterReload.getAttribute(
          "aria-expanded",
        )) !== "true"
      ) {
        await appearanceAccordionTriggerAfterReload.evaluate(
          (element: HTMLButtonElement) => element.click(),
        );
      }

      const colorTagHeadingAfterReload = uiEditorPane.getByText("Color Tag", {
        exact: true,
      });
      const colorTagBlockAfterReload = colorTagHeadingAfterReload.locator(
        "xpath=ancestor::div[contains(@class,'rounded-lg') or contains(@class,'rounded-xl')][1]",
      );
      await colorTagBlockAfterReload
        .getByRole("button", { name: "Reset" })
        .first()
        .evaluate((element: HTMLButtonElement) => element.click());

      await expect(
        nodeAfter.locator('header.section-title span[title^="Color tag:"]'),
      ).toHaveCount(0);
      await expect(
        overviewPane.locator(
          `[id="${sectionId}-OverviewListItem"] span[title^="Color tag:"]`,
        ),
      ).toHaveCount(0);
      await expect(
        colorTagBlockAfterReload.getByText("None", { exact: true }).first(),
      ).toBeVisible();
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });
});

async function clearProjectChatWindows(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const { replaceProjectChatWindowingState } = await import(
      "/src/state/actions/projectChatWindowing.ts"
    );
    const { createProjectChatWindowingState } = await import(
      "/src/utils/generatedTypes.ts"
    );
    replaceProjectChatWindowingState(createProjectChatWindowingState());
  });
  await expect(page.getByTestId("project-chat-floating-window")).toHaveCount(0);
}
