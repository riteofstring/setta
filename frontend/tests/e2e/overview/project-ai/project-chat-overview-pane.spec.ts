import { expect, test } from "@playwright/test";
import {
  cleanupIsolatedProject,
  ensureAppReady,
  ensureManagedChatEngine,
  openIsolatedProject,
  setOverviewTab,
} from "../../helpers";

test("project ai chat overview pane renders the chat surface while the dock manages windows", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await setOverviewTab(page, "ProjectAIChat");
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);
  const engineCleanup = await ensureManagedChatEngine(page);

  try {
    await page.reload();
    await page.waitForSelector(".canvas-flow__canvas");

    const overviewPane = page.locator("#OverviewPane");
    await expect(
      overviewPane.getByRole("heading", { name: "Project AI Chat" }),
    ).toBeVisible();
    await expect(
      overviewPane.getByRole("button", { name: "New Chat" }),
    ).toBeVisible();
    await expect(
      overviewPane.getByRole("button", { name: "View Threads" }),
    ).toBeVisible();
    await expect(
      overviewPane.getByPlaceholder("Type a message..."),
    ).toBeVisible();
    await expect(
      overviewPane.getByText(
        "Use the bottom dock to create, reopen, and arrange chat windows.",
      ),
    ).toHaveCount(0);
    await overviewPane.getByRole("button", { name: "View Threads" }).click();
    await expect(
      overviewPane.getByTestId("project-chat-threads-panel"),
    ).toBeVisible();

    await expect(
      page.getByTestId("project-chat-bottom-dock-create"),
    ).toBeVisible();
    await expect(
      page.getByTestId("project-chat-bottom-dock-menu-trigger"),
    ).toBeVisible();
  } finally {
    await engineCleanup();
    await cleanupIsolatedProject(page, projectContext);
  }
});
