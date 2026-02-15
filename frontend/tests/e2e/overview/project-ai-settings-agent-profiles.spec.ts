import { expect, test } from "@playwright/test";
import {
  cleanupIsolatedProject,
  openIsolatedProject,
  setOverviewTab,
} from "../helpers";

test.describe.serial("project ai settings accordion layout", () => {
  test("defaults to essentials open and persists accordion state", async ({
    page,
  }) => {
    await setOverviewTab(page, "ProjectAISettings");
    const projectContext = await openIsolatedProject(page);
    try {
      const llmKeysTrigger = page.getByTestId(
        "project-ai-settings-accordion-llm-api-keys",
      );
      const agentProfilesTrigger = page.getByTestId(
        "project-ai-settings-accordion-agent-profiles",
      );
      const promptTemplatesTrigger = page.getByTestId(
        "project-ai-settings-accordion-prompt-templates",
      );
      const externalAgentsTrigger = page.getByTestId(
        "project-ai-settings-accordion-external-agents",
      );

      // Verify the default essential sections are open, with advanced sections minimized.
      await expect(llmKeysTrigger).toHaveAttribute("aria-expanded", "true");
      await expect(agentProfilesTrigger).toHaveAttribute(
        "aria-expanded",
        "true",
      );
      await expect(promptTemplatesTrigger).toHaveAttribute(
        "aria-expanded",
        "false",
      );
      await expect(externalAgentsTrigger).toHaveAttribute(
        "aria-expanded",
        "false",
      );

      await promptTemplatesTrigger.click();
      await agentProfilesTrigger.click();
      await expect(promptTemplatesTrigger).toHaveAttribute(
        "aria-expanded",
        "true",
      );
      await expect(agentProfilesTrigger).toHaveAttribute(
        "aria-expanded",
        "false",
      );

      await page.reload({ waitUntil: "domcontentloaded" });

      await expect(
        page.getByTestId("project-ai-settings-accordion-prompt-templates"),
      ).toHaveAttribute("aria-expanded", "true");
      await expect(
        page.getByTestId("project-ai-settings-accordion-agent-profiles"),
      ).toHaveAttribute("aria-expanded", "false");
      await expect(
        page.getByTestId("project-ai-settings-accordion-llm-api-keys"),
      ).toHaveAttribute("aria-expanded", "true");
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("agent profile toggles are visible and default off", async ({ page }) => {
    await setOverviewTab(page, "ProjectAISettings");
    const projectContext = await openIsolatedProject(page);
    try {
      const agentProfilesTrigger = page.getByTestId(
        "project-ai-settings-accordion-agent-profiles",
      );
      if (
        (await agentProfilesTrigger.getAttribute("aria-expanded")) !== "true"
      ) {
        await agentProfilesTrigger.click();
      }

      await page.getByRole("button", { name: "New Profile" }).click();

      const backgroundFillToggle = page.getByRole("checkbox", {
        name: "Enable Background Summary Fill",
      });
      await backgroundFillToggle.scrollIntoViewIfNeeded();
      await expect(backgroundFillToggle).toBeVisible();
      await expect(backgroundFillToggle).not.toBeChecked();

      const llmTitlesToggle = page.getByRole("checkbox", {
        name: "Enable LLM Chat Titles",
      });
      await llmTitlesToggle.scrollIntoViewIfNeeded();
      await expect(llmTitlesToggle).toBeVisible();
      await expect(llmTitlesToggle).not.toBeChecked();
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });
});
