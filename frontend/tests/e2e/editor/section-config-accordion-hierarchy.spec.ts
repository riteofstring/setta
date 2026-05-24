import { expect, test, type Page } from "@playwright/test";
import {
  cleanupIsolatedProject,
  clearProjectChatWindows,
  createTextBlockSection,
  createTopLevelSectionFromFrontend,
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
      await clearProjectChatWindows(page);
      const { sectionId } = await createTextBlockSection(
        page,
        projectContext.projectConfigId,
        "__pw_section_config_accordion__",
      );

      const node = page.locator(
        `.setta-gpu-flow__node[data-id="${sectionId}"]`,
      );
      await expect(node).toBeVisible();
      await activateSectionForEditor(page, sectionId);

      const uiEditorPane = page.locator("#UiEditorPane");
      await expect(uiEditorPane).toBeVisible();

      const mainAccordionTrigger = uiEditorPane.getByTestId(
        "section-config-accordion-main",
      );
      const appearanceAccordionTrigger = uiEditorPane.getByTestId(
        "section-config-accordion-appearance",
      );

      await expect(mainAccordionTrigger).toHaveAttribute(
        "aria-expanded",
        "true",
      );
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
      expect(
        triggerBounds?.triggerRight ?? Number.POSITIVE_INFINITY,
      ).toBeLessThanOrEqual(
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

  test("keeps appearance controls enabled for terminal sections", async ({
    page,
  }) => {
    await seedLocalStorage(page, {
      overviewTab: "Overview",
      overviewVis: true,
      uiEditorVis: true,
      uiEditorTab: { Terminal: "SectionConfig" },
    });
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      await clearProjectChatWindows(page);
      const created = await createTopLevelSectionFromFrontend(page, {
        projectConfigId: projectContext.projectConfigId,
        implType: "Terminal",
      });
      if (!created?.sectionId) {
        throw new Error("Missing sectionId when creating terminal section.");
      }

      const node = page.locator(
        `.setta-gpu-flow__node[data-id="${created.sectionId}"]`,
      );
      await expect(node).toBeVisible();
      await activateSectionForEditor(page, created.sectionId);

      const uiEditorPane = page.locator("#UiEditorPane");
      await expect(uiEditorPane).toBeVisible();

      const appearanceAccordionTrigger = uiEditorPane.getByTestId(
        "section-config-accordion-appearance",
      );
      await expect(appearanceAccordionTrigger).toBeEnabled();
      await appearanceAccordionTrigger.click();
      await expect(appearanceAccordionTrigger).toHaveAttribute(
        "aria-expanded",
        "true",
      );

      await expect(
        uiEditorPane.getByText("Style", { exact: true }),
      ).toBeVisible();
      await expect(
        uiEditorPane.getByText("Color Tag", { exact: true }),
      ).toBeVisible();
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("auto-collapses section settings when switching to a section type without main settings", async ({
    page,
  }) => {
    await seedLocalStorage(page, {
      overviewTab: "Overview",
      overviewVis: true,
      uiEditorVis: true,
      uiEditorTab: { TextBlock: "SectionConfig", Terminal: "SectionConfig" },
    });
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      await clearProjectChatWindows(page);
      const textBlock = await createTextBlockSection(
        page,
        projectContext.projectConfigId,
        "__pw_section_config_switch_text_block__",
      );
      const terminal = await createTopLevelSectionFromFrontend(page, {
        projectConfigId: projectContext.projectConfigId,
        implType: "Terminal",
      });
      if (!terminal?.sectionId) {
        throw new Error("Missing sectionId when creating terminal section.");
      }

      const textBlockNode = page.locator(
        `.setta-gpu-flow__node[data-id="${textBlock.sectionId}"]`,
      );
      const terminalNode = page.locator(
        `.setta-gpu-flow__node[data-id="${terminal.sectionId}"]`,
      );
      await expect(textBlockNode).toBeVisible();
      await expect(terminalNode).toBeVisible();

      await activateSectionForEditor(page, textBlock.sectionId);
      const uiEditorPane = page.locator("#UiEditorPane");
      await expect(uiEditorPane).toBeVisible();

      const mainAccordionTrigger = uiEditorPane.getByTestId(
        "section-config-accordion-main",
      );
      const appearanceAccordionTrigger = uiEditorPane.getByTestId(
        "section-config-accordion-appearance",
      );
      await expect(mainAccordionTrigger).toHaveAttribute(
        "aria-expanded",
        "true",
      );
      await appearanceAccordionTrigger.click();
      await expect(appearanceAccordionTrigger).toHaveAttribute(
        "aria-expanded",
        "true",
      );

      await activateSectionForEditor(page, terminal.sectionId);
      await expect(mainAccordionTrigger).toBeDisabled();
      await expect(mainAccordionTrigger).toHaveAttribute(
        "aria-expanded",
        "false",
      );
      await expect(mainAccordionTrigger).toHaveAttribute(
        "title",
        "No section settings available",
      );
      await expect(appearanceAccordionTrigger).toBeEnabled();
      await expect(appearanceAccordionTrigger).toHaveAttribute(
        "aria-expanded",
        "true",
      );
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });
});

async function activateSectionForEditor(
  page: Page,
  sectionId: string,
): Promise<void> {
  await page.evaluate(async (id) => {
    const { setActiveSectionIds } = await import(
      "/src/state/actions/activeSections"
    );
    setActiveSectionIds([id], { syncMode: "ui-only" });
  }, sectionId);
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const { getActiveSectionUIIds } = await import(
          "/src/state/activeSectionUI"
        );
        return getActiveSectionUIIds();
      }),
    )
    .toEqual([sectionId]);
}
