import { expect, test } from "@playwright/test";
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
  test("sets tag color via Section Config and shows dot", async ({
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
        "__pw_section_color_tag__",
      );

      const node = page.locator(`.react-flow__node[data-id="${sectionId}"]`);
      await expect(node).toBeVisible();
      await node.click();

      const uiEditorPane = page.locator("#UiEditorPane");
      await expect(uiEditorPane).toBeVisible();

      const colorTagBlock = uiEditorPane
        .locator("div.rounded-xl")
        .filter({
          // `filter({ has: ... })` expects a selector that can be found *inside*
          // the candidate element; scoping it to `uiEditorPane` makes it impossible.
          has: page.getByRole("heading", { name: "Color Tag" }),
        })
        .first();
      await expect(colorTagBlock).toBeVisible();

      const colorPickerTrigger = colorTagBlock.locator(".colorpicker").first();
      await expect(colorPickerTrigger).toBeVisible();
      await colorPickerTrigger.click();

      await page
        .getByRole("menuitem")
        .filter({ hasText: "Blue" })
        .first()
        .click();

      await expect(colorTagBlock.getByText("#3b82f6").first()).toBeVisible();

      const headerDot = node
        .locator('header.section-title span[title="Color tag: #3b82f6"]')
        .first();
      await expect(headerDot).toBeVisible();

      const overviewPane = page.locator("#OverviewPane");
      const overviewTagFilter = overviewPane.getByLabel("Tag filter").first();
      await expect(overviewTagFilter).toBeVisible();

      await overviewTagFilter.click();
      await page.getByRole("menuitem", { name: "Untagged" }).click();
      await expect(
        overviewPane.locator(`[id="${sectionId}-OverviewListItem"]`),
      ).toHaveCount(0);

      await overviewTagFilter.click();
      await page.getByRole("menuitem").filter({ hasText: "Blue" }).first().click();
      const overviewItem = overviewPane.locator(
        `[id="${sectionId}-OverviewListItem"]`,
      );
      await expect(overviewItem).toBeVisible();
      await expect(
        overviewItem.locator('span[title="Color tag: #3b82f6"]'),
      ).toBeVisible();

      await overviewTagFilter.click();
      await page.getByRole("menuitem", { name: "All" }).click();
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
        nodeAfter.locator('header.section-title span[title="Color tag: #3b82f6"]'),
      ).toBeVisible();

      await colorTagBlock.getByRole("button", { name: "Reset" }).first().click();

      await expect(
        nodeAfter.locator('header.section-title span[title^="Color tag:"]'),
      ).toHaveCount(0);
      await expect(
        overviewPane.locator(
          `[id="${sectionId}-OverviewListItem"] span[title^="Color tag:"]`,
        ),
      ).toHaveCount(0);
      await expect(
        nodeAfter.locator(
          `section[data-section-id="${sectionId}"] div.absolute.left-0.top-0.h-full.w-1`,
        ),
      ).toHaveCount(0);
      await expect(colorTagBlock.getByText("None").first()).toBeVisible();
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });
});
