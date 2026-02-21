import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  cleanupIsolatedProject,
  createChatSection,
  ensureAppReady,
  openIsolatedProject,
} from "../helpers";

test.describe.serial("chat queued drafts", () => {
  test("queues drafts with Tab, supports keyboard restore/edit, and dispatches when waiting is stopped", async ({
    page,
  }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      const { sectionId, sectionName } = await createChatSection(
        page,
        projectContext.projectConfigId,
        "__pw_chat_queued_drafts__",
      );

      const section = findSectionByName(page, sectionName);
      await expect(section).toBeVisible();
      const input = section.locator("textarea").first();
      const submitButton = section.locator('button[type="submit"]').first();
      await expect(input).toBeVisible();
      await expect(submitButton).toBeVisible();

      await input.fill("Initial running message");
      await input.press("Enter");
      await expect(
        section
          .locator("[data-message-id]")
          .filter({ hasText: "Initial running message" })
          .first(),
      ).toBeVisible();

      await input.fill("Queued first");
      await input.press("Tab");
      await expect(input).toHaveValue("");
      await expect(
        section.locator('[data-chat-queued-draft="true"]'),
      ).toHaveCount(1);

      await input.fill("Queued second");
      await input.press("Tab");
      const queuedDrafts = section.locator('[data-chat-queued-draft="true"]');
      await expect(queuedDrafts).toHaveCount(2);
      await expect(queuedDrafts.nth(0)).toContainText("Queued first");
      await expect(queuedDrafts.nth(1)).toContainText("Queued second");

      await input.press("ArrowUp");
      await input.press("Enter");
      await expect(input).toHaveValue("Queued first");
      await expect(queuedDrafts).toHaveCount(1);

      await input.fill("Queued first edited");
      await input.press("Tab");
      await expect(queuedDrafts).toHaveCount(2);
      await expect(queuedDrafts.nth(0)).toContainText("Queued second");
      await expect(queuedDrafts.nth(1)).toContainText("Queued first edited");

      await submitButton.click();
      await expect(
        section
          .locator("[data-message-id]")
          .filter({ hasText: "Queued second" })
          .first(),
      ).toBeVisible();
      await expect(queuedDrafts).toHaveCount(1);
      await expect(queuedDrafts.nth(0)).toContainText("Queued first edited");

      await submitButton.click();
      await expect(
        section
          .locator("[data-message-id]")
          .filter({ hasText: "Queued first edited" })
          .first(),
      ).toBeVisible();
      await expect(queuedDrafts).toHaveCount(0);
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });
});

function findSectionByName(page: Page, name: string): Locator {
  return page
    .locator('section[class*="card-section"]')
    .filter({ has: page.locator("header.section-title p", { hasText: name }) })
    .first();
}
