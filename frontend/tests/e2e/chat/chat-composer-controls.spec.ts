import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  cleanupIsolatedProject,
  createChatSection,
  ensureAppReady,
  openIsolatedProject,
  setChatSectionState,
} from "../helpers";

test.describe.serial("chat composer controls", () => {
  test("supports slash suggestions, starter prompts, and footer execution settings", async ({
    page,
  }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      const { sectionId, sectionName } = await createChatSection(
        page,
        projectContext.projectConfigId,
        "__pw_chat_composer__",
      );

      const section = findSectionByName(page, sectionName);
      await expect(section).toBeVisible();

      await setChatSectionState(page, {
        projectConfigId: projectContext.projectConfigId,
        sectionId,
        state: {
          messages: [
            {
              id: "msg-existing",
              role: "user",
              content: [{ type: "text", text: "Existing thread message" }],
              attachments: [],
            },
          ],
          inputText: "",
          waitingForResponse: false,
          toolCallArguments: {},
          activeBranchId: null,
          branches: {},
        },
      });

      await expect(section.getByText("Existing thread message")).toBeVisible();
      await expect(section.getByRole("button", { name: "/new" })).toBeVisible();
      await expect(
        section.getByRole("button", { name: "Summarize Codebase" }),
      ).toBeVisible();
      await expect(
        section.getByRole("button", { name: "Create Project" }),
      ).toHaveCount(0);

      const input = section.locator("textarea").first();
      await input.fill("/res");
      const resumeSuggestion = section
        .locator("button")
        .filter({ hasText: "Resume the latest chat thread for this section." })
        .first();
      await expect(resumeSuggestion).toBeVisible();
      await resumeSuggestion.click();
      await input.press("Enter");
      await expect
        .poll(async () => {
          const text = await section.textContent();
          return Boolean(
            text?.includes("No previous branch found to resume.") ||
              text?.includes("Resumed the latest branch."),
          );
        })
        .toBe(true);

      await section.getByRole("button", { name: /^minimal/i }).first().click();
      await page.getByRole("menuitem", { name: "yolo" }).click();
      const searchButton = section.getByRole("button", { name: "Search" });
      const skillsButton = section.getByRole("button", { name: "Skills" });
      await searchButton.click();
      await skillsButton.click();
      await expect(section.getByRole("button", { name: /^yolo/i })).toBeVisible();
      await expect(searchButton).toHaveAttribute("aria-pressed", "false");
      await expect(skillsButton).toHaveAttribute("aria-pressed", "false");

      await section.getByRole("button", { name: "Summarize Codebase" }).click();
      await expect(
        section.getByText("Summarize this codebase architecture", {
          exact: false,
        }),
      ).toBeVisible();
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
