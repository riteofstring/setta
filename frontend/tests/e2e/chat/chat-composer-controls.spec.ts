import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  cleanupIsolatedProject,
  createChatSection,
  ensureAppReady,
  ensureManagedChatEngine,
  openIsolatedProject,
  setChatSectionState,
  setOverviewTab,
} from "../helpers";

test.describe.serial("chat composer controls", () => {
  test("chat sections keep a compact composer with permission-only footer controls", async ({
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
      await expect(section.getByRole("button", { name: "/new" })).toHaveCount(0);
      await expect(section.getByRole("button", { name: "/resume" })).toHaveCount(
        0,
      );
      await expect(
        section.getByRole("button", { name: "Summarize Codebase" }),
      ).toHaveCount(0);
      await expect(
        section.getByRole("button", { name: "Create Project" }),
      ).toHaveCount(0);

      const input = section.locator("textarea").first();
      await input.fill("/resume");
      const resumeSuggestion = section
        .locator("button")
        .filter({ hasText: "Resume the latest chat thread for this section." })
        .first();
      await expect(resumeSuggestion).toBeVisible();
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
      await expect(section.getByRole("button", { name: /^yolo/i })).toBeVisible();
      await expect(section.getByRole("button", { name: "Search" })).toHaveCount(0);
      await expect(section.getByRole("button", { name: "Skills" })).toHaveCount(0);
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("project chat shows starter/quick controls with visible slash menu and full execution footer", async ({
    page,
  }) => {
    await setOverviewTab(page, "ProjectAIChat");
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);
    const engineCleanup = await ensureManagedChatEngine(page);

    try {
      await page.reload();
      await page.waitForSelector(".react-flow__pane");

      const overviewPane = page.locator("#OverviewPane");
      await expect(
        overviewPane.getByRole("heading", { name: "Project AI Chat" }),
      ).toBeVisible();

      await expect(overviewPane.getByRole("button", { name: "/new" })).toBeVisible();
      await expect(
        overviewPane.getByRole("button", { name: "/resume" }),
      ).toBeVisible();
      await expect(
        overviewPane.getByRole("button", { name: "/model" }),
      ).toBeVisible();
      await expect(
        overviewPane.getByRole("button", { name: "Summarize Codebase" }),
      ).toBeVisible();
      await expect(
        overviewPane.getByRole("button", { name: "Plan Next Steps" }),
      ).toBeVisible();

      const input = overviewPane.getByPlaceholder("Type a message...");
      await expect(input).toBeVisible();
      await input.fill("/res");
      const resumeSuggestion = overviewPane
        .locator("button")
        .filter({ hasText: "Resume the latest chat thread for this section." })
        .first();
      await expect(resumeSuggestion).toBeVisible();
      const inputBox = await input.boundingBox();
      const suggestionBox = await resumeSuggestion.boundingBox();
      if (!inputBox || !suggestionBox) {
        throw new Error("Missing slash suggestion geometry.");
      }
      expect(suggestionBox.y + suggestionBox.height).toBeLessThan(inputBox.y + 2);

      await input.fill("/resume");
      await input.press("Enter");
      await expect
        .poll(async () => {
          const text = await overviewPane.textContent();
          return Boolean(
            text?.includes("No previous project chat found to resume.") ||
              text?.includes("Resumed the latest project chat."),
          );
        })
        .toBe(true);

      await expect(
        overviewPane.getByRole("button", { name: /^minimal/i }),
      ).toBeVisible();
      const searchButton = overviewPane.getByRole("button", { name: "Search" });
      const skillsButton = overviewPane.getByRole("button", { name: "Skills" });
      await expect(searchButton).toBeVisible();
      await expect(skillsButton).toBeVisible();
      await searchButton.click();
      await skillsButton.click();
      await expect(searchButton).toHaveAttribute("aria-pressed", "false");
      await expect(skillsButton).toHaveAttribute("aria-pressed", "false");
    } finally {
      await engineCleanup();
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
