import { expect, test } from "@playwright/test";
import {
  cleanupIsolatedProject,
  ensureAppReady,
  ensureManagedChatEngine,
  openIsolatedProject,
  setOverviewTab,
} from "../../helpers";

test("project chat bottom dock shows a persistent manager menu beside create chat", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await setOverviewTab(page, "ProjectAIChat");
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);
  const engineCleanup = await ensureManagedChatEngine(page);

  try {
    await page.reload();
    await page.waitForSelector(".react-flow__pane");

    const strip = page.getByTestId("project-chat-bottom-dock-strip");
    await expect(strip).toBeVisible();
    await expect(page.getByTestId("project-chat-bottom-dock-create")).toBeVisible();

    const managerTrigger = page.getByTestId(
      "project-chat-bottom-dock-menu-trigger",
    );
    await expect(managerTrigger).toBeVisible();
    await managerTrigger.click();

    const menuContent = page.getByTestId("project-chat-bottom-dock-menu-content");
    await expect(menuContent).toBeVisible();
    await expect(
      page.getByTestId("project-chat-bottom-dock-menu-item"),
    ).toHaveCount(1);
    await expect(menuContent.getByText("Chat Window 1")).toBeVisible();
    await expect(
      menuContent.getByTestId("project-chat-manager-focus"),
    ).toBeVisible();
  } finally {
    await engineCleanup();
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("project chat bottom dock manager reopens minimized windows", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await setOverviewTab(page, "ProjectAIChat");
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);
  const engineCleanup = await ensureManagedChatEngine(page);

  try {
    await page.reload();
    await page.waitForSelector(".react-flow__pane");

    const dockPanel = page
      .getByTestId("project-chat-bottom-dock-window-panel")
      .first();
    const instanceId = await dockPanel.getAttribute(
      "data-chat-window-instance-id",
    );
    if (!instanceId) {
      throw new Error("Expected project chat instance id.");
    }

    await dockPanel.getByTestId("project-chat-window-minimize").click();
    await expect(
      page.locator(
        `[data-testid="project-chat-bottom-dock-window-panel"][data-chat-window-instance-id="${instanceId}"]`,
      ),
    ).toHaveCount(0);

    const managerTrigger = page.getByTestId(
      "project-chat-bottom-dock-menu-trigger",
    );
    await expect(managerTrigger).toBeVisible();
    await managerTrigger.click();

    const menuContent = page.getByTestId("project-chat-bottom-dock-menu-content");
    await expect(menuContent).toBeVisible();
    const reopenButton = menuContent.locator(
      `[data-testid="project-chat-manager-reopen"][data-chat-window-instance-id="${instanceId}"]`,
    );
    await expect(reopenButton).toBeVisible();
    await reopenButton.click();

    await expect(
      page.locator(
        `[data-testid="project-chat-bottom-dock-window-panel"][data-chat-window-instance-id="${instanceId}"]`,
      ),
    ).toBeVisible();
  } finally {
    await engineCleanup();
    await cleanupIsolatedProject(page, projectContext);
  }
});
