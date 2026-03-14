import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  cleanupIsolatedProject,
  createTextBlockSection,
  ensureAppReady,
  ensureManagedChatEngine,
  openIsolatedProject,
  setOverviewTab,
} from "../../helpers";

async function expectQuickInfoMatchesAriaLabel(
  page: Page,
  control: Locator,
): Promise<void> {
  const tooltip = page.locator("#setta-tooltip-floating-box");
  const ariaLabel = await control.getAttribute("aria-label");
  if (!ariaLabel) {
    throw new Error("Expected control aria-label for quick info assertion.");
  }

  await page.keyboard.down("q");
  await control.hover();
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText(ariaLabel);
  await page.keyboard.up("q");
  await expect(tooltip).toBeHidden();
}

test("window controls expose q quick info via the shared floating tooltip", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await setOverviewTab(page, "ProjectAIChat");
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);
  await ensureManagedChatEngine(page);

  try {
    const createdSection = await createTextBlockSection(
      page,
      projectContext.projectConfigId,
      "window-tooltip-section",
    );
    await page.reload();
    await page.waitForSelector(".react-flow__pane");

    const sectionCard = page
      .locator(".react-flow__node")
      .filter({ hasText: createdSection.sectionName })
      .last();
    await expect(sectionCard).toBeVisible();

    await expectQuickInfoMatchesAriaLabel(
      page,
      sectionCard.getByTestId("section-window-toggle"),
    );

    const createButton = page.getByTestId("project-chat-bottom-dock-create");
    await expect(createButton).toBeVisible();
    await expectQuickInfoMatchesAriaLabel(page, createButton);

    await createButton.click();
    const dockedWindow = page
      .getByTestId("project-chat-bottom-dock-window-panel")
      .last();
    await expect(dockedWindow).toBeVisible();

    const undockButton = dockedWindow.getByTestId("project-chat-window-undock");
    await expectQuickInfoMatchesAriaLabel(page, undockButton);

    await undockButton.click();
    const floatingWindow = page.getByTestId("project-chat-floating-window").last();
    await expect(floatingWindow).toBeVisible();

    await expectQuickInfoMatchesAriaLabel(
      page,
      floatingWindow.getByTestId("project-chat-window-minimize"),
    );
    await expectQuickInfoMatchesAriaLabel(
      page,
      floatingWindow.getByTestId("project-chat-window-show-in-canvas"),
    );
  } finally {
    await cleanupIsolatedProject(page, projectContext.projectConfigId);
  }
});
