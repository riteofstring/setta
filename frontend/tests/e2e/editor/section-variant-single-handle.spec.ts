import { expect, test } from "@playwright/test";
import {
  cleanupIsolatedProject,
  clearProjectChatWindows,
  createTextBlockSection,
  ensureAppReady,
  openIsolatedProject,
  seedLocalStorage,
} from "../helpers";

test.describe.serial("section variants single-item handle", () => {
  test("keeps the drag handle visible when exactly one variant exists", async ({
    page,
  }) => {
    await seedLocalStorage(page, {
      overviewTab: "Overview",
      overviewVis: true,
      uiEditorVis: true,
      uiEditorTab: { TextBlock: "SectionVariantsConfig" },
    });

    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      await clearProjectChatWindows(page);
      const { sectionId } = await createTextBlockSection(
        page,
        projectContext.projectConfigId,
        "__pw_single_variant_handle__",
      );

      const node = page.locator(`.react-flow__node[data-id="${sectionId}"]`);
      await expect(node).toBeVisible();
      await node.click();

      const uiEditorPane = page.locator("#UiEditorPane");
      await expect(uiEditorPane).toBeVisible();
      await expect(
        uiEditorPane.getByRole("heading", { name: "Variants" }),
      ).toBeVisible();

      await expect(
        uiEditorPane.locator('[data-testid="section-variant-row"]'),
      ).toHaveCount(1);

      const handle = uiEditorPane
        .locator('[data-testid="section-variant-drag-handle"]')
        .first();
      await expect(handle).toBeVisible();

      // Single-variant rows are not sortable, but the handle glyph must stay visible.
      const handleClass = (await handle.getAttribute("class")) ?? "";
      expect(handleClass).toContain("w-4");
      expect(handleClass).toContain("opacity-60");
      expect(handleClass).not.toContain("text-transparent");
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("shows named variants and refreshes after adding a variant", async ({
    page,
  }) => {
    await seedLocalStorage(page, {
      overviewTab: "Overview",
      overviewVis: true,
      uiEditorVis: true,
      uiEditorTab: { TextBlock: "SectionVariantsConfig" },
    });

    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      await clearProjectChatWindows(page);
      const { sectionId } = await createTextBlockSection(
        page,
        projectContext.projectConfigId,
        "__pw_named_variant__",
      );

      const node = page.locator(`.react-flow__node[data-id="${sectionId}"]`);
      await expect(node).toBeVisible();
      await node.click();

      const uiEditorPane = page.locator("#UiEditorPane");
      await expect(uiEditorPane).toBeVisible();

      const rows = uiEditorPane.locator('[data-testid="section-variant-row"]');
      await expect(rows).toHaveCount(1);

      const firstLabel = rows.first().locator("p.section-key");
      await expect(firstLabel).toHaveText(/\S/);
      const initialName = await firstLabel.textContent();

      await uiEditorPane.getByRole("button", { name: "Add Variant" }).click();
      await expect(rows).toHaveCount(2);

      const secondLabel = rows.nth(1).locator("p.section-key");
      await expect(secondLabel).toHaveText(/\S/);
      const secondName = await secondLabel.textContent();
      expect(secondName).not.toBe(initialName);
      expect(secondName).not.toBe(`${initialName}_2`);
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });
});
